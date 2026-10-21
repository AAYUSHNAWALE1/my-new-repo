import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const ORS_BASE = "https://api.openrouteservice.org/v2/directions/wheelchair";
const ORS_API_KEY = process.env.ORS_API_KEY;

/**
 * POST /api/routes
 * Body: { start: [lng, lat], end: [lng, lat] }
 * Proxies request to OpenRouteService Wheelchair Routing API and returns GeoJSON.
 */
router.post("/", async (req, res) => {
  try {
    const { start, end } = req.body;

    if (!start || !end) {
      return res.status(400).json({ error: "start and end coordinates are required" });
    }

    const orsPayload = {
      coordinates: [start, end],
      preference: "recommended",
      units: "m",
      language: "en",
      geometry: true,
      instructions: true,
      attributes: ["avgspeed", "detourfactor"],
    };

    const response = await fetch(ORS_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ORS_API_KEY,
      },
      body: JSON.stringify(orsPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("ORS error:", errText);
      return res.status(response.status).json({ error: "OpenRouteService API error", details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Route proxy error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

export default router;
