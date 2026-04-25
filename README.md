# FaceScan — Real-Time Face, Age & Gender Detection System

An interactive full-stack computer vision application featuring browser-based real-time facial feature extraction, age estimation, and gender classification integrated with an Express.js analytics backend.

---

## Overview

FaceScan runs deep learning inference directly on the client side using TensorFlow.js (`face-api.js`), tracking facial landmarks and estimating demographic attributes in real time without sending raw video feeds over the network. Detection logs and session statistics are aggregated and served via an Express REST API.

---

## Features

* **Client-Side Real-Time Inference:** Continuous webcam stream tracking with bounding box overlays and age/gender confidence percentages.
* **Multi-Face Tracking:** Detects and labels multiple individuals within the same frame simultaneously.
* **REST API & Analytics:** Express backend routes for logging scans, querying paginated session history, and compiling demographic breakdowns.
* **Privacy-First Design:** Video frames never leave the browser; only lightweight analytical metadata is transferred to the server.
* **CDN Model Fallbacks:** Configured network fallbacks to load pre-trained neural network weights reliably.

---

## Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript (ES6+), face-api.js / TensorFlow.js
* **Backend:** Node.js, Express.js
* **Data Layer:** File-based JSON datastore (`data/scans.json`)

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/scan` | Log a single detection record |
| `POST` | `/api/scans/batch` | Batch upload multiple detected faces |
| `GET` | `/api/scans` | Retrieve paginated history with date/gender filters |
| `GET` | `/api/stats` | Return aggregated demographic distribution metrics |
| `POST` | `/api/session` | Create and initialize a new tracking session |
| `GET` | `/api/health` | Service uptime and health check |
| `DELETE` | `/api/scans` | Clear scan records |

---

## Getting Started

### 1. Clone & Install Dependencies
```bash
git clone [https://github.com/khushikadway143-star/facescan.git](https://github.com/khushikadway143-star/facescan.git)
cd facescan
npm install```

> **Important:** Open via `http://localhost:3000`, not directly as a file.  
> Camera access requires either `localhost` or `https://`.

## Project Structure

```
facescan/
├── server.js          # Express backend
├── package.json       # Dependencies
├── data/
│   └── scans.json     # Scan history (auto-created)
├── public/
│   └── index.html     # Full frontend app
└── README.md
```

## How It Works

1. Click **Start Camera** in the browser
2. The app requests your webcam via the browser's MediaDevices API
3. face-api.js models are downloaded from CDN (cached after first load)
4. Every 2 seconds, detected face data (age, gender, confidence) is sent to the backend API in batches
5. All history is stored in `data/scans.json` and viewable in the History and Analytics tabs

## Requirements

- Node.js v16+
- Chrome, Firefox, or Edge (latest)
- Webcam
- Internet connection (for loading AI models on first use)

## Privacy

All face detection runs **locally in your browser** using TensorFlow.js.  
No images or video frames are ever sent to the server — only the detected age/gender numbers.

## Troubleshooting

| Problem | Fix |
|---|---|
| Camera permission denied | Click the lock icon in address bar → Allow camera → Reload |
| Models fail to load | Disable ad-blocker/VPN for localhost, check internet |
| Server shows offline | Run `npm start` and open via `http://localhost:3000` |
| Camera in use | Close Zoom, Teams, or other camera apps |
