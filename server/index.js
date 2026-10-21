import "dotenv/config";
import express from "express";
import cors from "cors";

import routerRoutes from "./routes/routes.js";
import weatherRoutes from "./routes/weather.js";
import llmRoutes from "./routes/llm.js";
import disruptionRoutes from "./routes/disruptions.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Route groups ──────────────────────────────────────────────────────────────
// OpenRouteService wheelchair routing proxy
app.use("/api/routes", routerRoutes);

// Open-Meteo live Pune weather proxy
app.use("/api/weather", weatherRoutes);

// Ollama Local LLM proxy (profile parsing + recovery explanations)
app.use("/api/llm", llmRoutes);

// Community disruptions persistent store
app.use("/api/disruptions", disruptionRoutes);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PivotPath server running on http://localhost:${PORT}`);
});
