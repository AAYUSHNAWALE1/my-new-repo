# PivotPath

<p align="center">
  <img src="client/public/logo.png" alt="PivotPath Logo" width="480" />
</p>

> Adaptive, explainable journey re-ranking and accessibility navigation for wheelchair users, seniors, and mobility-impaired travelers in **Pune**.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite, Leaflet / React Leaflet (OpenStreetMap) |
| Backend | Node.js, Express, CORS, Dotenv |
| AI Engine | Ollama → Llama 3.1 8B (local, on RTX 5070 Ti) |
| Routing API | OpenRouteService Wheelchair API (HeiGIT) |
| Weather API | Open-Meteo Live Pune Weather |

---

## Project Structure

```
pivotpath/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js           # Fetch wrapper for all server endpoints
│   │   ├── components/
│   │   │   ├── NavBar.jsx          # Sticky top nav with 3-screen tabs
│   │   │   ├── PuneMap.jsx         # Leaflet interactive map
│   │   │   ├── RouteCard.jsx       # Route card with score badge + bars
│   │   │   ├── ScoreBars.jsx       # 5-factor progress bars
│   │   │   └── WeatherWidget.jsx   # Live Open-Meteo Pune weather
│   │   ├── data/
│   │   │   └── routes.js           # Routes, scenarios, scoring formulas
│   │   ├── screens/
│   │   │   ├── PlanProfileScreen.jsx       # Screen 1: LLM profile parser
│   │   │   ├── JourneyMapScreen.jsx        # Screen 2: Map + route rankings
│   │   │   └── DisruptionRecoveryScreen.jsx # Screen 3: Scenarios + hazard feed
│   │   ├── App.jsx                 # Root component + shared state
│   │   ├── main.jsx                # Entry point
│   │   └── index.css               # Global design system
│   └── index.html
│
└── server/                         # Express backend
    ├── routes/
    │   ├── routes.js               # POST /api/routes → ORS wheelchair proxy
    │   ├── weather.js              # GET  /api/weather → Open-Meteo proxy
    │   └── llm.js                  # POST /api/llm/parse-profile & recovery-explanation
    ├── index.js                    # Express app entry
    └── .env.example
```

---

## Quick Start

### 1. Server

```bash
cd server
cp .env.example .env          # fill in ORS_API_KEY
npm install
npm run dev                   # runs on :3001
```

### 2. Client

```bash
cd client
cp .env.example .env          # VITE_API_BASE=http://localhost:3001
npm install
npm run dev                   # runs on :5173
```

### 3. Ollama (Local LLM)

```bash
ollama serve                  # starts on localhost:11434
ollama pull llama3.1:8b       # first-time model pull
```

---

## Scoring Formula

**Weighted score** = Σ (factor_score × factor_weight)

| Factor | Default Weight |
|--------|---------------|
| Access (accessibility) | **35%** |
| Safety | **25%** |
| Crowd avoidance | **15%** |
| Convenience | **10%** |
| Cost | **15%** |

**ETA formula**: `updated_time = baseline_time × scenario_multiplier + fixed_delay`

---

## Routes (Pune Railway Station → Fergusson College)

| Route | Colour | Base ETA |
|-------|--------|----------|
| JM Road Direct | Purple | 18 min |
| Accessible Main Corridor | Teal | 24 min |
| Quiet Backup Route | Amber | 30 min |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/weather` | Live Pune weather (Open-Meteo) |
| POST | `/api/routes` | Wheelchair route (ORS proxy) |
| POST | `/api/llm/parse-profile` | Parse mobility profile → weights |
| POST | `/api/llm/recovery-explanation` | AI disruption explanation |
