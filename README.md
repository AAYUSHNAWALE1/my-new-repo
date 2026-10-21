# PivotPath

<p align="center">
  <img src="client/public/logo.png" alt="PivotPath Logo" width="480" />
</p>

> **Adaptive, explainable journey re-ranking and accessibility navigation for wheelchair users, seniors, and mobility-impaired travelers in Pune.**

---

## 📋 Table of Contents
- [Prerequisites & Required Tools](#-prerequisites--required-tools)
- [Tech Stack](#-tech-stack)
- [Project Architecture](#-project-architecture)
- [Installation & Quick Start](#-installation--quick-start)
- [How to Run (Step-by-Step)](#-how-to-run-step-by-step)
- [Testing & Demo Guide](#-testing--demo-guide)
- [Scoring Formula](#-scoring-formula)
- [Pune Corridor Candidate Routes](#-pune-corridor-candidate-routes)
- [API Reference](#-api-reference)

---

## 🛠 Prerequisites & Required Tools

Before running PivotPath locally, ensure you have the following tools installed on your system:

### 1. Node.js & npm (Required)
- **Minimum Version:** Node.js v18+ (Node.js v20+ LTS recommended)
- **Download:** [https://nodejs.org/](https://nodejs.org/)
- **Verify Installation:**
  ```bash
  node -v
  npm -v
  ```

### 2. Ollama & Llama 3.1 8B (Required for Local AI)
Ollama runs the local Large Language Model used to parse plain-language accessibility needs into a normalized 5-factor scoring matrix and generate explainable disruption recovery briefings.
- **Download Ollama:** [https://ollama.com/download](https://ollama.com/download) (available for Windows, macOS, and Linux)
- **Pull the Model (8B parameters):**
  ```bash
  ollama pull llama3.1:8b
  ```
- **Start the Ollama Server:**
  ```bash
  ollama serve
  ```
  *(Default endpoint: `http://localhost:11434`)*

### 3. Git (Required for Version Control)
- **Download:** [https://git-scm.com/](https://git-scm.com/)
- **Verify Installation:**
  ```bash
  git --version
  ```

### 4. OpenRouteService (ORS) API Key (Optional / Recommended)
PivotPath integrates with the OpenRouteService Wheelchair Routing API for real-world wheelchair accessible pedestrian routing.
- **Sign up for a free key:** [https://openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup)
- *Note: If no API key is provided in `server/.env`, the app seamlessly falls back to pre-calculated high-fidelity Pune geometries.*

---

## 💻 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, Vite | Dynamic, reactive UI and state management |
| **Styling** | Vanilla CSS Design System | Custom dark-mode theme, glassmorphic HUDs, accessibility badges |
| **Maps & Geospatial** | Leaflet, React-Leaflet | OpenStreetMap rendering, Pune transit corridor layers, route polyline overlays |
| **Voice & Accessibility** | Web Speech API | Hands-free TTS alerts and voice recognition (`"Accept"` / `"Decline"`) |
| **Backend** | Node.js, Express, CORS | Disruption state machine, proxy APIs, scoring calculation |
| **Local LLM** | Ollama (`llama3.1:8b`) | Plain-language mobility parsing & disruption recovery explanations |
| **APIs** | OpenRouteService & Open-Meteo | Wheelchair pedestrian routing and live Pune meteorological data |

---

## 📂 Project Architecture

```
pivotpath/
├── client/                                 # React + Vite frontend
│   ├── public/
│   │   ├── logo.png                        # Brand logo & favicon
│   │   └── icons.svg                       # Accessible UI icons
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js                   # Client HTTP fetch wrapper
│   │   ├── components/
│   │   │   ├── NavBar.jsx                  # Sticky top navigation with status indicators
│   │   │   ├── PuneMap.jsx                 # Leaflet map with Pune corridor & segment pins
│   │   │   ├── RouteCard.jsx               # Route scoring card with factor breakdown
│   │   │   ├── ScoreBars.jsx               # Visual progress bars for the 5 factors
│   │   │   ├── HandsFreePrompt.jsx         # Voice prompt HUD & 10s auto-accept countdown
│   │   │   ├── WeatherWidget.jsx           # Live Pune temperature & rain probability
│   │   │   └── EventLog.jsx                # Disruption timeline & event replay inspector
│   │   ├── data/
│   │   │   ├── routes.js                   # Candidate routes, scenarios, scoring math
│   │   │   └── segments.js                 # Micro-segments & Pune interchange coordinates
│   │   ├── screens/
│   │   │   ├── PlanProfileScreen.jsx       # Screen 1: Mobility profile parser
│   │   │   ├── JourneyMapScreen.jsx        # Screen 2: Real-time map & route rankings
│   │   │   └── DisruptionRecoveryScreen.jsx# Screen 3: Live disruption management
│   │   ├── utils/
│   │   │   └── speech.js                   # Speech synthesis & voice recognition helper
│   │   ├── App.jsx                         # Global state & multi-screen coordinator
│   │   ├── index.css                       # Modern dark-mode styling tokens
│   │   └── main.jsx                        # React root entry
│   └── package.json
│
└── server/                                 # Express backend
    ├── data/
    │   └── disruptions.json                # Centralized persistent disruption store
    ├── routes/
    │   ├── disruptions.js                  # Shared disruption CRUD & active segments
    │   ├── llm.js                          # Ollama profile parsing & recovery explanations
    │   ├── routes.js                       # ORS wheelchair routing proxy
    │   └── weather.js                      # Open-Meteo live Pune weather proxy
    ├── index.js                            # Express server entry point (Port 3001)
    ├── package.json
    └── .env.example
```

---

## 🚀 Installation & Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/AAYUSHNAWALE1/my-new-repo.git
cd my-new-repo
```

### 2. Configure Backend Environment
```bash
cd server
cp .env.example .env
npm install
```
*(Optional: Open `server/.env` and paste your `ORS_API_KEY` from OpenRouteService).*

### 3. Configure Frontend Environment
```bash
cd ../client
cp .env.example .env
npm install
```
*(Default `VITE_API_BASE=http://localhost:3001` works out of the box).*

---

## 🏃 How to Run (Step-by-Step)

To run the full stack, open **3 terminal tabs/windows**:

### Terminal 1: Local AI Engine (Ollama)
Ensure your Ollama daemon is running with the Llama 3.1 model:
```bash
ollama run llama3.1:8b
```
*(Or `ollama serve` if already pulled).*

### Terminal 2: Backend API Server
```bash
cd server
npm run dev
```
> Server runs at **`http://localhost:3001`** (Health check: `http://localhost:3001/api/health`)

### Terminal 3: Frontend Web Application
```bash
cd client
npm run dev
```
> Client runs at **`http://localhost:5173`**

Open **`http://localhost:5173`** in your browser to start using PivotPath.

---

## 🧪 Testing & Demo Guide

PivotPath includes built-in scenario simulators and cross-client synchronization to demonstrate all accessibility capabilities:

### Test Case 1: Plain-Language AI Profiling
1. Navigate to the **Plan & Profile** screen.
2. Select a preset (e.g., **Wheelchair User**) or type a custom prompt:
   > *"I use an electric wheelchair, cannot navigate stairs or steep ramps, and prefer uncrowded paths."*
3. Click **"Parse Mobility Needs with AI"**.
4. The local Ollama model extracts weighted preferences (Access, Safety, Crowd, Convenience, Cost) summing to exactly 100%.

### Test Case 2: Multi-Window Shared Disruption Store
1. Open `http://localhost:5173` in **two separate browser windows** (Window A and Window B).
2. In Window A, advance the traveler along Route A to the **Interchange** segment.
3. In Window B (or via the Disruption tab), report a disruption (e.g., *"Elevator Out of Service at Metro Station"*).
4. **Result:** Window A instantly detects the disruption via the central disruption store (`server/data/disruptions.json`) without requiring a manual refresh.

### Test Case 3: Hands-Free Voice Recovery
1. When a disruption impacts the traveler's active path, the **Hands-Free Recovery HUD** pops up.
2. The browser announces the audible alert using Text-to-Speech (TTS).
3. Say **"Accept"** into your microphone, or let the **10-second countdown** auto-accept the safer route.
4. The system switches to the recommended alternative without requiring tactile phone interaction.

### Test Case 4: Staff Authority & Expiry Override
1. Report a traveler disruption (Confidence: 70%).
2. Report a conflicting **Station Staff** report (Confidence: 100%).
3. Staff reports automatically override conflicting reports and apply authoritative weights.
4. Stale reports automatically expire based on their defined TTL (Time-to-Live).

---

## ⚖️ Scoring Formula

Each route's dynamic score is calculated on a 0–100 scale:

$$\text{Weighted Score} = \sum_{i=1}^{5} (\text{Factor Score}_i \times \text{Factor Weight}_i)$$

| Factor | Default Weight | Description |
|--------|----------------|-------------|
| **Access** | **35%** | Ramps, elevators, surface smoothness, curb-cuts |
| **Safety** | **25%** | Dedicated pedestrian pathways, crossing signals, lighting |
| **Crowd** | **15%** | Avoidance of crowded bazaars, festivals, and transit choke points |
| **Convenience** | **10%** | Rest stops, shaded corridors, directness |
| **Cost** | **15%** | Free pedestrian routes vs. paid metro/transit fees |

---

## 🗺 Pune Corridor Candidate Routes

The fixed demo journey connects **Pune Railway Station** to **Fergusson College (FC Road)**:

| Route | Route Name | Colour | Base ETA | Characteristics |
|:-----:|------------|:------:|:--------:|-----------------|
| **A** | **JM Road Direct** | Purple | 18 min | Fast arterial route, high traffic, elevator-dependent crossing |
| **B** | **Accessible Main Corridor** | Teal | 24 min | Step-free wide pavements, tactile paving, grade-separated ramps |
| **C** | **Quiet Backup Route** | Amber | 30 min | Low crowd density, residential bylaws, gentle gradients |

---

## 📡 API Reference

| Method | Endpoint | Description |
|:------:|----------|-------------|
| `GET` | `/api/health` | Backend and disruption store health check |
| `GET` | `/api/weather` | Live Pune weather, precipitation, and mobility advisories |
| `POST` | `/api/routes` | Wheelchair pedestrian routing (ORS proxy with fallback) |
| `POST` | `/api/llm/parse-profile` | Ollama parser: Plain language → 5-Factor weights |
| `POST` | `/api/llm/recovery-explanation` | Ollama generator: Human-readable disruption briefing |
| `GET` | `/api/disruptions` | Fetch active shared disruptions and overrides |
| `POST` | `/api/disruptions` | Report a new disruption (Traveler or Staff) |
| `POST` | `/api/disruptions/reset` | Reset all disruptions to default clean state |

---

## 📄 License
This project was built for accessible transit innovation.
