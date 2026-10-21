import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// Open-Meteo API for live Pune weather (no API key required)
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

// Pune coordinates
const PUNE_LAT = 18.5204;
const PUNE_LNG = 73.8567;

/**
 * GET /api/weather
 * Returns current Pune weather: precipitation, wind speed, temperature, weather code.
 */
router.get("/", async (_req, res) => {
  try {
    const params = new URLSearchParams({
      latitude: PUNE_LAT,
      longitude: PUNE_LNG,
      current: [
        "temperature_2m",
        "precipitation",
        "wind_speed_10m",
        "weather_code",
        "relative_humidity_2m",
      ].join(","),
      timezone: "Asia/Kolkata",
    });

    const response = await fetch(`${OPEN_METEO_BASE}?${params}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Open-Meteo error:", errText);
      return res.status(response.status).json({ error: "Open-Meteo API error", details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Weather proxy error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

export default router;
