/**
 * FaceScan AI - Backend Server
 * Express REST API for scan history, analytics, and session management
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory store (persisted to data/scans.json) ──────────────────────────
const DATA_FILE = path.join(__dirname, 'data', 'scans.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { scans: [], sessions: [] };
}

function saveData(db) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) { /* ignore */ }
}

let db = loadData();

// ─── Helper ───────────────────────────────────────────────────────────────────
function getStats(scans) {
  if (!scans.length) return null;
  const ages = scans.map(s => s.age);
  const avgAge = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const maleCount = scans.filter(s => s.gender === 'male').length;
  const femaleCount = scans.filter(s => s.gender === 'female').length;
  const ageGroups = { child: 0, teen: 0, youngAdult: 0, adult: 0, middleAge: 0, senior: 0, elder: 0 };
  scans.forEach(s => {
    const a = s.age;
    if (a < 13) ageGroups.child++;
    else if (a < 18) ageGroups.teen++;
    else if (a < 25) ageGroups.youngAdult++;
    else if (a < 35) ageGroups.adult++;
    else if (a < 50) ageGroups.middleAge++;
    else if (a < 65) ageGroups.senior++;
    else ageGroups.elder++;
  });
  return { totalScans: scans.length, avgAge, minAge, maxAge, maleCount, femaleCount, ageGroups };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'FaceScan AI Backend',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    totalScans: db.scans.length
  });
});

// Log a single scan result
app.post('/api/scan', (req, res) => {
  const { age, gender, genderConfidence, facesDetected, sessionId } = req.body;
  if (typeof age !== 'number' || !gender) {
    return res.status(400).json({ error: 'age (number) and gender (string) are required' });
  }
  const scan = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    age: Math.round(age),
    gender,
    genderConfidence: genderConfidence || null,
    facesDetected: facesDetected || 1,
    sessionId: sessionId || null,
    timestamp: new Date().toISOString()
  };
  db.scans.push(scan);
  if (db.scans.length > 5000) db.scans = db.scans.slice(-5000); // cap at 5000
  saveData(db);
  res.status(201).json({ success: true, scan });
});

// Log multiple scan results in batch
app.post('/api/scans/batch', (req, res) => {
  const { scans, sessionId } = req.body;
  if (!Array.isArray(scans) || !scans.length) {
    return res.status(400).json({ error: 'scans array is required' });
  }
  const saved = scans.map(s => ({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    age: Math.round(s.age),
    gender: s.gender,
    genderConfidence: s.genderConfidence || null,
    facesDetected: s.facesDetected || 1,
    sessionId: sessionId || null,
    timestamp: new Date().toISOString()
  }));
  db.scans.push(...saved);
  if (db.scans.length > 5000) db.scans = db.scans.slice(-5000);
  saveData(db);
  res.status(201).json({ success: true, count: saved.length });
});

// Get scan history (paginated)
app.get('/api/scans', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const gender = req.query.gender;
  const sessionId = req.query.sessionId;

  let results = [...db.scans].reverse(); // newest first
  if (gender) results = results.filter(s => s.gender === gender);
  if (sessionId) results = results.filter(s => s.sessionId === sessionId);

  const total = results.length;
  const pages = Math.ceil(total / limit);
  const data = results.slice((page - 1) * limit, page * limit);

  res.json({ total, page, pages, limit, scans: data });
});

// Get analytics / stats
app.get('/api/stats', (req, res) => {
  const stats = getStats(db.scans);
  const recentScans = db.scans.slice(-50);
  const recentStats = getStats(recentScans);
  res.json({
    all: stats,
    recent: recentStats,
    sessionCount: new Set(db.scans.map(s => s.sessionId).filter(Boolean)).size
  });
});

// Session management — start session
app.post('/api/session', (req, res) => {
  const session = {
    id: 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    startedAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || 'unknown'
  };
  db.sessions.push(session);
  if (db.sessions.length > 1000) db.sessions = db.sessions.slice(-1000);
  saveData(db);
  res.status(201).json(session);
});

// Get session summary
app.get('/api/session/:id', (req, res) => {
  const { id } = req.params;
  const sessionScans = db.scans.filter(s => s.sessionId === id);
  const session = db.sessions.find(s => s.id === id);
  res.json({
    session: session || { id, note: 'session metadata not found' },
    stats: getStats(sessionScans),
    scans: sessionScans
  });
});

// Clear all scan history
app.delete('/api/scans', (req, res) => {
  const count = db.scans.length;
  db.scans = [];
  saveData(db);
  res.json({ success: true, deleted: count });
});

// Catch-all — serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║     FaceScan AI Backend Running      ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  Local:  http://localhost:${PORT}        ║`);
  console.log(`║  API:    http://localhost:${PORT}/api    ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
