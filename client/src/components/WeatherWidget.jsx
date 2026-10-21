import { useState, useEffect } from "react";
import { fetchWeather } from "../api/client";

const WMO_LABELS = {
  0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
  45: "Foggy 🌫️", 48: "Icy fog 🌫️",
  51: "Light drizzle 🌦️", 53: "Moderate drizzle 🌦️", 55: "Dense drizzle 🌧️",
  61: "Slight rain 🌧️", 63: "Moderate rain 🌧️", 65: "Heavy rain 🌧️",
  71: "Slight snow 🌨️", 73: "Moderate snow 🌨️", 75: "Heavy snow ❄️",
  80: "Rain showers 🌦️", 81: "Moderate showers 🌧️", 82: "Violent showers ⛈️",
  95: "Thunderstorm ⛈️", 96: "Thunderstorm w/ hail ⛈️",
};

/**
 * Compact live weather widget for Pune (fetches from Open-Meteo via proxy).
 */
export default function WeatherWidget() {
  const [weather, setWeather] = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeather()
      .then(setWeather)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Refresh every 10 minutes
    const id = setInterval(() => {
      fetchWeather().then(setWeather).catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return (
    <div className="skeleton" style={{ height: "48px", borderRadius: "var(--radius-sm)" }} />
  );

  if (error) return (
    <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <span>⚠️</span> Weather unavailable
    </div>
  );

  const cur = weather?.current;
  const code = cur?.weather_code ?? 0;
  const label = WMO_LABELS[code] || "Unknown";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "1.2rem",
      background: "var(--color-surface-2)", borderRadius: "var(--radius-sm)",
      padding: "0.5rem 1rem", border: "1px solid var(--color-border)",
      fontSize: "0.82rem", color: "var(--color-text-secondary)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <div className="live-dot" />
        <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>Pune Live</span>
      </div>
      <span>{label}</span>
      <span>🌡️ {cur?.temperature_2m ?? "—"}°C</span>
      <span>💧 {cur?.precipitation ?? 0} mm</span>
      <span>💨 {cur?.wind_speed_10m ?? "—"} km/h</span>
    </div>
  );
}
