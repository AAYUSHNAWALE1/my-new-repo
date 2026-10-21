# PivotPath - Project Specification

## Overview
PivotPath is an adaptive, explainable journey re-ranking and accessibility navigation web application built for wheelchair users, seniors, and mobility-impaired travelers in Pune. It moves beyond static trip planning by continuously re-evaluating routes when urban disruptions occur[cite: 1].

## Tech Stack
* **Frontend:** React + Vite, Leaflet & React Leaflet (OpenStreetMap)
* **Backend:** Node.js, Express, CORS, Dotenv
* **AI Engine:** Local LLM (Ollama running Llama 3.1 8B on RTX 5070 Ti VRAM) for plain-language profile parsing and recovery explanations[cite: 1]
* **APIs:** OpenRouteService (HeiGIT) Wheelchair Routing API, Open-Meteo Live Pune Weather API

## Architecture & Core Screens (Version One Scope)
1. **Plan & Profile Screen:** Free-text mobility profiling parsed by Local LLM into a 5-factor weighted scoring matrix (Access 35%, Safety 25%, Crowd 15%, Convenience 10%, Cost 15%)[cite: 1].
2. **Journey & Map Screen:** Interactive Pune map (Railway Station to Fergusson College) displaying 3 candidate routes (JM Road Direct, Accessible Main Corridor, Quiet Backup Route) with real-time score badges and 5-factor progress bars.
3. **Disruption & Recovery Screen:** Scenario simulator (Normal, Heavy Rain, Crowd Surge, Elevator/Curb Barrier Blocked) and **Live Community Hazard Reporting** with instant Before-and-After score comparisons and AI-generated plain-language explanations[cite: 1].

## Key Formulas
* **ETA Formula:** `updated time = baseline time × scenario multiplier + fixed delay`
* **Scoring Formula:** `weighted score = sum of (factor score × factor weight)` (summing to 100%)[cite: 1]

## Folder Structure
- `client/` -> React frontend application
- `server/` -> Express backend proxy, OpenRouteService proxy, and Ollama Local LLM endpoints