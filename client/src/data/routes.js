// ── Scoring constants ──────────────────────────────────────────────────────────
// Default 5-factor weighted scoring matrix (weights sum to 1.0)
export const DEFAULT_WEIGHTS = {
  access:       0.35,  // Accessibility – ramps, lifts, kerb cuts
  safety:       0.25,  // Safety – lighting, pavement quality
  crowd:        0.15,  // Crowd avoidance
  convenience:  0.10,  // ETA, route simplicity
  cost:         0.15,  // Fare / extra cost
};

// ── Preset profiles ────────────────────────────────────────────────────────────
export const PRESET_PROFILES = [
  {
    id: "wheelchair",
    label: "Wheelchair User",
    icon: "♿",
    description: "Power/manual wheelchair. Needs step-free paths, kerb cuts, wide pavements.",
    weights: { access: 0.35, safety: 0.25, crowd: 0.15, convenience: 0.10, cost: 0.15 },
    sampleText:
      "I use a power wheelchair and cannot use stairs or steep ramps. I need kerb cuts everywhere, wide pavements and elevator overpasses. Crowds are very difficult for me. Safety on crossings matters a lot.",
  },
  {
    id: "senior",
    label: "Senior Traveler",
    icon: "🧓",
    description: "Slow walker, needs rest points, avoids busy crossings and poor lighting.",
    weights: { access: 0.30, safety: 0.35, crowd: 0.10, convenience: 0.15, cost: 0.10 },
    sampleText:
      "I am 78 years old and walk slowly with a cane. I need benches to rest every 10 minutes. Safety is my top priority — no busy crossings, good lighting at night. I prefer quiet streets even if slightly longer.",
  },
  {
    id: "standard",
    label: "Standard Traveler",
    icon: "🚶",
    description: "No significant mobility impairment. Prioritises speed and convenience.",
    weights: { access: 0.15, safety: 0.20, crowd: 0.15, convenience: 0.35, cost: 0.15 },
    sampleText:
      "I have no major mobility issues. I prefer the fastest route and don't mind a bit of a crowd. Cost is not a concern. I just want to reach Fergusson College as quickly as possible.",
  },
];

// ── Pune routes ────────────────────────────────────────────────────────────────
// Origin: Pune Railway Station  →  Destination: Fergusson College
export const PUNE_ORIGIN = { lat: 18.5282, lng: 73.8742, label: "Pune Railway Station" };
export const PUNE_DEST   = { lat: 18.5185, lng: 73.8412, label: "Fergusson College" };

// ── Three candidate routes ─────────────────────────────────────────────────────
// Scores are calibrated so that with DEFAULT_WEIGHTS:
//   Route A (JM Road)          → 58  (low Access: stairs & steep curbs)
//   Route B (Accessible Main)  → 85  (initially recommended)
//   Route C (Quiet Backup)     → 83  (promoted to #1 when elevator fails on B)
//
// Under "Elevator/Curb Blocked" scenario:
//   Route B Access: 96 → 38 (delta −58) → total score: 85 → 65
//   Route C score stays at 83 → becomes new #1
//
// ETA formula: updated_time = baseEtaMin × multiplier + fixedDelay
//   Route C baseEtaMin = 21 so that under barrier-blocked (×1.15 +10): 21×1.15+10 ≈ 34 min ✓
export const ROUTES = [
  {
    id: "jm-road-direct",
    name: "Route A — JM Road Direct",
    shortName: "JM Road Direct",
    color: "#6C63FF",
    baseEtaMin: 18,
    hasBarriers: true, // contains stairs and steep curbs — not wheelchair-suitable
    // Factor scores: Access deliberately low because of stairs
    scores: { access: 35, safety: 72, crowd: 40, convenience: 90, cost: 85 },
    // Weighted score = 35×0.35 + 72×0.25 + 40×0.15 + 90×0.10 + 85×0.15
    //                = 12.25 + 18 + 6 + 9 + 12.75 = 58 ✓
    waypoints: [
      [18.5282, 73.8742],
      [18.5265, 73.8695],
      [18.5240, 73.8620],
      [18.5215, 73.8530],
      [18.5195, 73.8450],
      [18.5185, 73.8412],
    ],
    description: "Fastest on paper but contains stairs and steep curbs — unsuitable for wheelchairs.",
    barrierWarning: "⚠️ Stairs & steep curbs detected on this route.",
  },
  {
    id: "accessible-main",
    name: "Route B — Accessible Main Corridor",
    shortName: "Accessible Main Corridor",
    color: "#00D4AA",
    baseEtaMin: 24,
    hasBarriers: false,
    // Factor scores: Access 96 (best) — elevator overpasses & tactile curb ramps
    scores: { access: 96, safety: 90, crowd: 70, convenience: 72, cost: 75 },
    // Weighted score = 96×0.35 + 90×0.25 + 70×0.15 + 72×0.10 + 75×0.15
    //                = 33.6 + 22.5 + 10.5 + 7.2 + 11.25 = 85.05 → 85 ✓
    // After elevator failure (Access drops 96→38):
    //   38×0.35 + 90×0.25 + 70×0.15 + 72×0.10 + 75×0.15
    //   = 13.3 + 22.5 + 10.5 + 7.2 + 11.25 = 64.75 → 65 ✓
    waypoints: [
      [18.5282, 73.8742],
      [18.5270, 73.8680],
      [18.5255, 73.8610],
      [18.5230, 73.8545],
      [18.5205, 73.8475],
      [18.5185, 73.8412],
    ],
    description: "Step-free route via elevator overpasses & tactile curb ramps. Initially recommended.",
  },
  {
    id: "quiet-backup",
    name: "Route C — Quiet Backup Route",
    shortName: "Quiet Backup (Model Colony)",
    color: "#FFB347",
    baseEtaMin: 21,
    hasBarriers: false,
    // Factor scores: high Crowd avoidance — residential detour through Model Colony
    scores: { access: 85, safety: 84, crowd: 88, convenience: 55, cost: 90 },
    // Weighted score = 85×0.35 + 84×0.25 + 88×0.15 + 55×0.10 + 90×0.15
    //                = 29.75 + 21 + 13.2 + 5.5 + 13.5 = 82.95 → 83 ✓
    // Under barrier-blocked: minimal ETA impact since no elevators used
    // baseEtaMin=21 → 21×1.15+10 = 34.15 → 34 min ✓
    waypoints: [
      [18.5282, 73.8742],
      [18.5290, 73.8670],
      [18.5275, 73.8600],
      [18.5245, 73.8520],
      [18.5210, 73.8460],
      [18.5185, 73.8412],
    ],
    description: "Low-crowd residential detour through Model Colony. Fully accessible. Becomes #1 when Route B fails.",
  },
];

// ── Disruption scenarios ───────────────────────────────────────────────────────
// ETA formula: updated_time = base_eta × multiplier + fixed_delay_min
export const SCENARIOS = [
  {
    id: "normal",
    label: "Normal",
    icon: "☀️",
    etaMultiplier: 1.0,
    fixedDelay: 0,
    scoreDeltas: { "jm-road-direct": {}, "accessible-main": {}, "quiet-backup": {} },
    description: "No disruptions. All routes operating at baseline.",
  },
  {
    id: "heavy-rain",
    label: "Heavy Rain",
    icon: "🌧️",
    etaMultiplier: 1.4,
    fixedDelay: 5,
    scoreDeltas: {
      "jm-road-direct":  { access: -20, safety: -25, crowd: -10, convenience: -15, cost: 0 },
      "accessible-main": { access: -10, safety: -15, crowd:  -5, convenience: -10, cost: 0 },
      "quiet-backup":    { access:  -8, safety: -12, crowd:   5, convenience: -12, cost: 0 },
    },
    description: "Heavy rain makes open roads slippery. JM Road flooding likely.",
  },
  {
    id: "crowd-surge",
    label: "Crowd Surge",
    icon: "👥",
    etaMultiplier: 1.25,
    fixedDelay: 8,
    scoreDeltas: {
      "jm-road-direct":  { access: -15, safety: -10, crowd: -40, convenience: -20, cost: 0 },
      "accessible-main": { access:  -8, safety:  -5, crowd: -20, convenience: -12, cost: 0 },
      "quiet-backup":    { access:   0, safety:   0, crowd:  10, convenience:  -5, cost: 0 },
    },
    description: "Festival/event crowd surge along JM Road. Quiet Backup benefits most.",
  },
  {
    id: "barrier-blocked",
    label: "Elevator / Curb Blocked",
    icon: "🚧",
    etaMultiplier: 1.15,
    fixedDelay: 10,
    scoreDeltas: {
      // Route A: baseline 58
      "jm-road-direct":  { access:   0, safety:   0, crowd:  0, convenience:   0, cost: 0 },
      // Route B: elevator failure → Access crashes from 96 to 38 (delta −58) → total score drops 85 → 65
      "accessible-main": { access: -58, safety:   0, crowd:  0, convenience:   0, cost: 0 },
      // Route C: no elevators used in Model Colony → score stays at 83, ETA = 21 × 1.15 + 10 = 34 min → becomes new #1
      "quiet-backup":    { access:   0, safety:   0, crowd:  0, convenience:   0, cost: 0 },
    },
    description: "Elevator failure & curb barrier reported on Route B. Access score drops 96→38. Route C promoted to #1.",
  },
];

// ── Scoring formula ────────────────────────────────────────────────────────────
/**
 * Compute the weighted score for a route given factor scores and weights.
 * Weighted Score = Σ (Factor Score × Active Weight)
 * @param {{ access, safety, crowd, convenience, cost }} factorScores
 * @param {{ access, safety, crowd, convenience, cost }} weights  (0–1, sum to 1)
 * @returns {number} weighted score 0–100 (rounded to nearest integer)
 */
export function computeWeightedScore(factorScores, weights = DEFAULT_WEIGHTS) {
  const keys = ["access", "safety", "crowd", "convenience", "cost"];
  const raw = keys.reduce((sum, k) => sum + (factorScores[k] ?? 0) * (weights[k] ?? 0), 0);
  return Math.round(raw);
}

// ── Community Hazards & Scoring Pipeline ──────────────────────────────────────
export const HAZARD_TYPES = [
  { id: "broken-ramp",  emoji: "🔧", label: "Broken Ramp",      deltas: { access: -20, safety: -10, convenience:  -8 } },
  { id: "flooded-path", emoji: "💧", label: "Flooded Path",     deltas: { access: -15, safety: -25, convenience: -12 } },
  { id: "construction", emoji: "🚧", label: "Construction",     deltas: { access: -25, safety: -15, convenience: -20 } },
  { id: "missing-curb", emoji: "⚠️", label: "Missing Curb Cut", deltas: { access: -18, safety:  -8, convenience:  -5 } },
  { id: "broken-lift",  emoji: "🛗", label: "Lift Out of Order", deltas: { access: -30, safety:  -5, convenience: -10 } },
  { id: "blocked-ramp", emoji: "🚫", label: "Ramp Blocked",     deltas: { access: -25, safety: -10, convenience:  -8 } },
];

/**
 * Filter active disruptions for a specific route.
 */
export function getRouteDisruptions(disruptions = [], routeId) {
  return disruptions.filter((d) => d.routeId === routeId);
}

/**
 * Compute factor scores by layering:
 *   Base Scores + Community Disruption Deltas + Scenario Deltas
 * Clamps all scores to [0, 100].
 */
export function computeAdjustedScores(baseScores, routeDisruptions = [], scenarioDeltas = {}) {
  const keys = ["access", "safety", "crowd", "convenience", "cost"];
  const communityDeltas = {};
  for (const k of keys) {
    communityDeltas[k] = routeDisruptions.reduce(
      (sum, d) => sum + (d.scoreDeltas?.[k] || 0),
      0
    );
  }
  return Object.fromEntries(
    keys.map((k) => {
      const base = baseScores[k] ?? 0;
      const comm = communityDeltas[k] ?? 0;
      const scen = scenarioDeltas[k] ?? 0;
      return [k, Math.max(0, Math.min(100, base + comm + scen))];
    })
  );
}

/**
 * Apply disruption scenario deltas to a route's base factor scores.
 * Clamps result to [0, 100].
 */
export function applyScenarioDeltas(baseScores, deltas = {}) {
  const keys = ["access", "safety", "crowd", "convenience", "cost"];
  return Object.fromEntries(
    keys.map((k) => [k, Math.max(0, Math.min(100, (baseScores[k] ?? 0) + (deltas[k] ?? 0)))])
  );
}

/**
 * Compute updated ETA given a disruption scenario.
 * Updated ETA = Baseline Time × Scenario Multiplier + Fixed Delay
 */
export function computeEta(baseEtaMin, scenario) {
  return Math.round(baseEtaMin * scenario.etaMultiplier + scenario.fixedDelay);
}

// ── Factor metadata ────────────────────────────────────────────────────────────
export const FACTOR_META = [
  { key: "access",      label: "Access",       color: "var(--color-access)",      weight: 0.35, icon: "♿" },
  { key: "safety",      label: "Safety",       color: "var(--color-safety)",      weight: 0.25, icon: "🛡️" },
  { key: "crowd",       label: "Crowd",        color: "var(--color-crowd)",       weight: 0.15, icon: "👥" },
  { key: "convenience", label: "Convenience",  color: "var(--color-convenience)", weight: 0.10, icon: "⚡" },
  { key: "cost",        label: "Cost",         color: "var(--color-cost)",        weight: 0.15, icon: "💰" },
];
