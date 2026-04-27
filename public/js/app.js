const API_BASE = `${window.location.origin}/api`;
const CDN_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODEL_URI = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

document.getElementById('baseUrlDisplay').textContent = API_BASE;

let running = false;
let mediaStream = null;
let animFrame = null;
let frameCount = 0;
let lastFpsTime = performance.now();
let fps = 0;
let faceApiLoaded = false;
let sessionId = null;
let sessionScans = [];
let localLog = [];
let historyFilter = 'all';
let historyPage = 1;
let batchBuffer = [];
let batchTimer = null;
let serverOnline = false;
let lastSaveTime = 0;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const formatTime = (isoString) => {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const resolveAgeGroup = (age) => {
  if (age < 13) return 'Child';
  if (age < 18) return 'Teen';
  if (age < 25) return 'Young Adult';
  if (age < 35) return 'Adult';
  if (age < 50) return 'Middle Age';
  if (age < 65) return 'Senior';
  return 'Elder';
};

const apiRequest = async (method, endpoint, payload = null) => {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (payload) options.body = JSON.stringify(payload);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return await res.json();
  } catch (err) {
    return null;
  }
};

window.showPage = (id, targetTab) => {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`page-${id}`).classList.add('active');
  if (targetTab) targetTab.classList.add('active');
  if (id === 'history') loadHistory();
  if (id === 'analytics') loadAnalytics();
};

const verifyBackend = async () => {
  const data = await apiRequest('GET', '/health');
  const dot = document.getElementById('srvDot');
  const txt = document.getElementById('srvTxt');
  const info = document.getElementById('serverInfoContent');

  if (data && data.status === 'ok') {
    serverOnline = true;
    dot.className = 'srv-dot ok';
    txt.textContent = 'online';
    info.innerHTML = `Status: <span style="color:var(--accent2)">Online</span><br>Uptime: ${data.uptime}s<br>Total Scans: ${data.totalScans}`;
  } else {
    serverOnline = false;
    dot.className = 'srv-dot err';
    txt.textContent = 'offline';
    info.innerHTML = `Status: <span style="color:var(--red)">Offline</span><br><span style="font-size:0.7rem">Start backend using npm start</span>`;
  }
};
verifyBackend();
setInterval(verifyBackend, 15000);

const initSession = async () => {
  const session = await apiRequest('POST', '/session');
  sessionId = session?.id || `sess_${Date.now()}`;
};

const processBatchSync = () => {
  if (!batchBuffer.length || !serverOnline) return;
  const payload = [...batchBuffer];
  batchBuffer = [];
  apiRequest('POST', '/scans/batch', { scans: payload, sessionId });
};

const triggerBatchSync = () => {
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(processBatchSync, 3000);
};

const updateStatus = (text, type = '') => {
  document.getElementById('statusTxt').textContent = text;
  const dot = document.getElementById('sdot');
  dot.className = `sdot ${type}`.trim();
};

const setOverlay = (message, isError = false) => {
  const overlay = document.getElementById('overlay');
  const msgEl = document.getElementById('overlayMsg');
  const spinner = document.getElementById('spinner');

  overlay.classList.add('show');
  msgEl.textContent = message;
  msgEl.className = isError ? 'err' : '';
  spinner.style.display = isError ? 'none' : 'block';
};

const clearOverlay = () => {
  document.getElementById('overlay').classList.remove('show');
};

const renderError = (msg) => {
  const box = document.getElementById('errorBox');
  box.innerHTML = msg;
  box.classList.add('show');
};

const resetDisplayCards = () => {
  ['Age', 'Gender', 'Fps'].forEach(card => {
    const val = document.getElementById(`v${card}`);
    val.textContent = '—';
    val.classList.remove('hi');
    document.getElementById(`b${card}`).style.width = '0%';
  });
  document.getElementById('badge').textContent = '0 FACES';
};

const updateMetrics = () => {
  document.getElementById('sessScans').textContent = sessionScans.length;
  if (!sessionScans.length) {
    document.getElementById('sessAvgAge').textContent = '—';
    return;
  }
  const avg = Math.round(sessionScans.reduce((acc, curr) => acc + curr.age, 0) / sessionScans.length);
  document.getElementById('sessAvgAge').textContent = avg;
  document.getElementById('sessMale').textContent = sessionScans.filter(s => s.gender === 'male').length;
  document.getElementById('sessFemale').textContent = sessionScans.filter(s => s.gender === 'female').length;
};

const recordScanLog = (age, gender) => {
  localLog.unshift({ age, gender, time: new Date().toISOString() });
  if (localLog.length > 50) localLog.pop();

  const container = document.getElementById('liveLog');
  container.innerHTML = localLog.slice(0, 8).map(item => `
    <div class="log-item">
      <div class="log-gender ${item.gender === 'male' ? 'm' : 'f'}">${item.gender === 'male' ? '♂' : '♀'}</div>
      <div><strong>${item.age}y</strong> · ${item.gender} <span style="color:var(--text3); font-size:0.65rem;">${formatTime(item.time)}</span></div>
    </div>
  `).join('');
};

window.clearHistory = () => {
  localLog = [];
  sessionScans = [];
  document.getElementById('liveLog').innerHTML = '<div class="log-empty">No scans yet</div>';
  updateMetrics();
};

window.toggle = () => {
  if (running) haltInference();
  else bootInference();
};

const loadDependencies = () => {
  return new Promise((resolve, reject) => {
    if (faceApiLoaded) return resolve();
    const script = document.createElement('script');
    script.src = CDN_URL;
    script.onload = () => {
      faceApiLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load face-api script.'));
    document.head.appendChild(script);
  });
};

const bootInference = async () => {
  const startBtn = document.getElementById('btnStart');
  startBtn.disabled = true;

  try {
    if (!faceApiLoaded) {
      updateStatus('Loading runtime…');
      setOverlay('Fetching deep learning libraries…');
      await loadDependencies();
    }

    updateStatus('Connecting webcam…');
    setOverlay('Initializing hardware camera feed…');
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });

    video.srcObject = mediaStream;
    await new Promise(res => { video.onloadedmetadata = res; });
    await video.play();

    updateStatus('Loading weights…');
    setOverlay('Loading pre-trained network models…');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URI),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URI)
    ]);

    clearOverlay();
    document.getElementById('ph').style.display = 'none';
    document.getElementById('scanLine').style.display = 'block';
    running = true;

    startBtn.disabled = false;
    startBtn.className = 'btn btn-stop';
    startBtn.textContent = 'Stop Session';

    updateStatus('Running', 'go');
    await initSession();
    requestAnimationFrame(inferencePipeline);
  } catch (error) {
    setOverlay('Inference engine failed', true);
    renderError(`<strong>Hardware / Network Exception:</strong> ${error.message}`);
    updateStatus('Error', 'err');
    startBtn.disabled = false;
    haltInference();
  }
};

const haltInference = () => {
  running = false;
  processBatchSync();
  if (animFrame) cancelAnimationFrame(animFrame);
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById('ph').style.display = 'flex';
  document.getElementById('scanLine').style.display = 'none';
  clearOverlay();

  const startBtn = document.getElementById('btnStart');
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = 'Start Camera';

  resetDisplayCards();
  updateStatus('Standby');
};

const inferencePipeline = async () => {
  if (!running) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  try {
    const detections = await faceapi.detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
    ).withFaceLandmarks(true).withAgeAndGender();

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      document.getElementById('vFps').textContent = fps;
      document.getElementById('bFps').style.width = `${Math.min(100, fps * 4)}%`;
    }

    ctx.clearRect(0, 0, w, h);

    if (!detections || !detections.length) {
      resetDisplayCards();
      if (running) animFrame = requestAnimationFrame(inferencePipeline);
      return;
    }

    const resized = faceapi.resizeResults(detections, { width: w, height: h });
    document.getElementById('badge').textContent = `${detections.length} ${detections.length === 1 ? 'FACE' : 'FACES'}`;

    resized.forEach((face, index) => {
      const { box } = face.detection;
      const { age, gender, genderProbability } = face;
      const color = gender === 'male' ? '#6c63ff' : '#00e5c3';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      const label = `${Math.round(age)}y · ${gender} (${Math.round(genderProbability * 100)}%)`;
      ctx.fillStyle = 'rgba(9, 9, 15, 0.85)';
      ctx.fillRect(box.x, box.y - 20, ctx.measureText(label).width + 10, 18);
      ctx.fillStyle = color;
      ctx.fillText(label, box.x + 5, box.y - 6);

      if (index === 0) {
        const estAge = Math.round(age);
        document.getElementById('vAge').textContent = estAge;
        document.getElementById('sAge').textContent = resolveAgeGroup(estAge);
        document.getElementById('bAge').style.width = `${Math.min(100, estAge * 1.25)}%`;

        document.getElementById('vGender').textContent = gender.toUpperCase();
        document.getElementById('sGender').textContent = `${Math.round(genderProbability * 100)}% confidence`;
        document.getElementById('bGender').style.width = `${Math.round(genderProbability * 100)}%`;

        const timestamp = Date.now();
        if (timestamp - lastSaveTime > 2000) {
          lastSaveTime = timestamp;
          const entry = {
            age: estAge,
            gender,
            genderConfidence: Math.round(genderProbability * 100) / 100,
            facesDetected: detections.length
          };
          sessionScans.push(entry);
          recordScanLog(estAge, gender);
          updateMetrics();
          batchBuffer.push(entry);
          triggerBatchSync();
        }
      }
    });
  } catch (err) {
    console.error('Inference step failed:', err);
  }

  if (running) animFrame = requestAnimationFrame(inferencePipeline);
};

window.filterHistory = (filter, element) => {
  historyFilter = filter;
  historyPage = 1;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  if (element) element.classList.add('active');
  loadHistory();
};

const loadHistory = async () => {
  const query = `/scans?page=${historyPage}&limit=15${historyFilter !== 'all' ? `&gender=${historyFilter}` : ''}`;
  const data = await apiRequest('GET', query);

  const container = document.getElementById('historyBody');
  if (!data || !data.scans?.length) {
    container.innerHTML = '<tr><td colspan="7"><div class="empty-state">No telemetry records located.</div></td></tr>';
    return;
  }

  container.innerHTML = data.scans.map((s, idx) => `
    <tr>
      <td>${data.total - (historyPage - 1) * 15 - idx}</td>
      <td><strong>${s.age}</strong></td>
      <td><span class="badge ${s.gender === 'male' ? 'badge-m' : 'badge-f'}">${s.gender}</span></td>
      <td>${s.genderConfidence ? `${Math.round(s.genderConfidence * 100)}%` : '—'}</td>
      <td>${s.facesDetected}</td>
      <td>${s.sessionId ? s.sessionId.slice(0, 10) : '—'}</td>
      <td>${new Date(s.timestamp).toLocaleDateString()}</td>
    </tr>
  `).join('');
};

window.deleteAllScans = async () => {
  if (!confirm('Flush recorded telemetry history?')) return;
  await apiRequest('DELETE', '/scans');
  loadHistory();
  loadAnalytics();
};

const loadAnalytics = async () => {
  const data = await apiRequest('GET', '/stats');
  if (!data?.all) return;

  const { all, sessionCount } = data;
  document.getElementById('mTotal').textContent = all.totalScans;
  document.getElementById('mAvgAge').textContent = all.avgAge || '—';
  document.getElementById('mRange').textContent = all.totalScans ? `${all.minAge}–${all.maxAge}y` : '—';
  document.getElementById('mSessions').textContent = sessionCount || 0;
};