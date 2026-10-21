const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

// ── Generic fetch helper ───────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// ── Weather ────────────────────────────────────────────────────────────────────
/** Fetch live Pune weather from Open-Meteo via server proxy. */
export async function fetchWeather() {
  return apiFetch("/api/weather");
}

// ── Routes ─────────────────────────────────────────────────────────────────────
/**
 * Fetch a wheelchair route from OpenRouteService via server proxy.
 * @param {[number, number]} start [lng, lat]
 * @param {[number, number]} end   [lng, lat]
 */
export async function fetchRoute(start, end) {
  return apiFetch("/api/routes", {
    method: "POST",
    body: JSON.stringify({ start, end }),
  });
}

// ── LLM ────────────────────────────────────────────────────────────────────────
/**
 * Parse free-text mobility profile into 5-factor weight matrix.
 * @param {string} profileText
 * @returns {{ access, safety, crowd, convenience, cost, summary }}
 */
export async function parseProfile(profileText) {
  return apiFetch("/api/llm/parse-profile", {
    method: "POST",
    body: JSON.stringify({ profileText }),
  });
}

/**
 * Get AI-generated plain-language recovery explanation.
 * @param {string|object} scenarioOrOptions
 * @param {string} [recommendedRoute]
 * @param {object} [beforeScores]
 * @param {object} [afterScores]
 * @param {string} [stageName]
 * @returns {Promise<{ explanation: string, provider: string }>}
 */
export async function fetchRecoveryExplanation(scenarioOrOptions, recommendedRoute, beforeScores, afterScores, stageName = "") {
  let body;
  if (typeof scenarioOrOptions === "object" && scenarioOrOptions !== null) {
    const opts = scenarioOrOptions;
    body = {
      scenario: opts.scenario || opts.scenarioName || "",
      recommendedRoute: opts.recommendedRoute || opts.recommendedRouteName || "",
      beforeScores: opts.beforeScores || {},
      afterScores: opts.afterScores || {},
      stageName: opts.stageName || opts.stage || "",
      disruptedRouteName: opts.disruptedRouteName || "",
      disruptionReason: opts.disruptionReason || "",
      timeout: opts.timeout || 16000,
    };
  } else {
    body = {
      scenario: scenarioOrOptions,
      recommendedRoute,
      beforeScores: beforeScores || {},
      afterScores: afterScores || {},
      stageName: stageName || "",
      timeout: 16000,
    };
  }

  return apiFetch("/api/llm/recovery-explanation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Health ─────────────────────────────────────────────────────────────────────
export async function fetchHealth() {
  return apiFetch("/api/health");
}

// ── Central Shared Disruption Store (Segments, Staff Overrides, Expiry) ───────
/**
 * Fetch all active central disruptions, optionally filtered by routeId or segmentId.
 * @param {string} [routeId]
 * @param {string} [segmentId]
 * @returns {Promise<{ disruptions: Array, overridden: Array, count: number }>}
 */
export async function fetchDisruptions(routeId, segmentId) {
  const params = new URLSearchParams();
  if (routeId) params.append("routeId", routeId);
  if (segmentId) params.append("segmentId", segmentId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/api/disruptions${q}`);
}

/**
 * Report a new disruption on a specific corridor segment.
 * @param {{
 *   segmentId: string,
 *   hazardType: string,
 *   source?: "station_staff" | "traveler",
 *   confidence?: "high" | "medium" | "low",
 *   status?: "active" | "cleared",
 *   note?: string,
 *   ttlMinutes?: number
 * }} data
 */
export async function reportDisruption(data) {
  return apiFetch("/api/disruptions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Station staff resolution override (marks obstacle repaired & suppresses traveler reports).
 * @param {{ segmentId: string, note?: string }} data
 */
export async function resolveSegmentStaff(data) {
  return apiFetch("/api/disruptions/resolve", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Remove a single disruption by ID.
 * @param {string} id
 */
export async function deleteDisruption(id) {
  return apiFetch(`/api/disruptions/${id}`, {
    method: "DELETE",
  });
}

/**
 * Clear all disruptions (for demo reset).
 */
export async function clearAllDisruptions() {
  return apiFetch("/api/disruptions", {
    method: "DELETE",
  });
}
