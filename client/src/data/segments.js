// ── Corridor Segments Definition ──────────────────────────────────────────────
// The corridor from Pune Railway Station to Fergusson College is partitioned
// into physical segments so mid-journey tracking and segment-level re-ranking can occur.

export const SEGMENTS = [
  {
    id: "seg-station-interchange",
    name: "Segment 1: Station → Shivajinagar Junction",
    shortName: "Station to Junction",
    stage: 0, // Starts at Stage 0
    routeIds: ["jm-road-direct", "accessible-main", "quiet-backup"],
    baseMinutes: 8,
    hasBarriers: false,
    description: "Shared initial leg from Pune Railway Station towards Sancheti / Shivajinagar interchange.",
    coordinates: [
      [18.5282, 73.8742],
      [18.5270, 73.8680],
      [18.5255, 73.8610],
    ],
  },
  {
    id: "seg-jm-corridor",
    name: "Segment 2A: JM Road Arterial Spine",
    shortName: "JM Road Spine",
    stage: 1, // Mid-journey branch
    routeIds: ["jm-road-direct"],
    baseMinutes: 6,
    hasBarriers: true,
    description: "Fast arterial road containing steep curbs and foot-over-bridge stairs. Not wheelchair-suitable.",
    coordinates: [
      [18.5255, 73.8610],
      [18.5240, 73.8620],
      [18.5215, 73.8530],
      [18.5195, 73.8450],
    ],
  },
  {
    id: "seg-metro-overpass",
    name: "Segment 2B: Shivajinagar Metro Elevator Overpass",
    shortName: "Metro Elevator Overpass",
    stage: 1, // Mid-journey branch
    routeIds: ["accessible-main"],
    baseMinutes: 12,
    hasBarriers: false,
    hasElevator: true,
    description: "Modern step-free skywalk with mechanical elevators & tactile paving. Impassable if lift fails.",
    coordinates: [
      [18.5255, 73.8610],
      [18.5230, 73.8545],
      [18.5205, 73.8475],
    ],
  },
  {
    id: "seg-model-colony",
    name: "Segment 2C: Model Colony Quiet Detour",
    shortName: "Model Colony Detour",
    stage: 1, // Mid-journey branch
    routeIds: ["quiet-backup"],
    baseMinutes: 9,
    hasBarriers: false,
    hasElevator: false,
    description: "Gentle residential street detour. Fully ground-level and step-free with zero mechanical lifts.",
    coordinates: [
      [18.5255, 73.8610],
      [18.5245, 73.8520],
      [18.5210, 73.8460],
    ],
  },
  {
    id: "seg-fc-approach",
    name: "Segment 3: FC Road Approach to College Gate",
    shortName: "FC Road → College Gate",
    stage: 2, // Final approach
    routeIds: ["jm-road-direct", "accessible-main", "quiet-backup"],
    baseMinutes: 4,
    hasBarriers: false,
    description: "Final shared entrance approach to Fergusson College Main Gate.",
    coordinates: [
      [18.5205, 73.8475],
      [18.5185, 73.8412],
    ],
  },
];

// ── Journey Stages (Traveler GPS Tracker) ──────────────────────────────────────
export const JOURNEY_STAGES = [
  {
    stage: 0,
    id: "stage-station",
    name: "Pune Railway Station",
    shortLabel: "Stage 0: Station (0%)",
    progressPct: 0,
    coordinates: [18.5282, 73.8742],
    landmark: "Pune Railway Station Concourse",
    completedSegmentIds: [],
    remainingSegmentIds: ["seg-station-interchange", "seg-metro-overpass", "seg-model-colony", "seg-jm-corridor", "seg-fc-approach"],
  },
  {
    stage: 1,
    id: "stage-junction",
    name: "Shivajinagar / Sancheti Junction",
    shortLabel: "Stage 1: Mid-Journey Junction (50%)",
    progressPct: 50,
    coordinates: [18.5255, 73.8610],
    landmark: "Sancheti Hospital Interchange & Metro Overpass",
    completedSegmentIds: ["seg-station-interchange"], // NEVER recommended or returned to
    remainingSegmentIds: ["seg-metro-overpass", "seg-model-colony", "seg-jm-corridor", "seg-fc-approach"],
  },
  {
    stage: 2,
    id: "stage-fc-road",
    name: "Fergusson College Road",
    shortLabel: "Stage 2: FC Approach (85%)",
    progressPct: 85,
    coordinates: [18.5205, 73.8475],
    landmark: "FC Road Pedestrian Plaza",
    completedSegmentIds: ["seg-station-interchange", "seg-metro-overpass", "seg-model-colony", "seg-jm-corridor"],
    remainingSegmentIds: ["seg-fc-approach"],
  },
  {
    stage: 3,
    id: "stage-destination",
    name: "Fergusson College Main Gate",
    shortLabel: "Stage 3: Destination (100%)",
    progressPct: 100,
    coordinates: [18.5185, 73.8412],
    landmark: "Fergusson College Campus Gate",
    completedSegmentIds: ["seg-station-interchange", "seg-metro-overpass", "seg-model-colony", "seg-jm-corridor", "seg-fc-approach"],
    remainingSegmentIds: [],
  },
];

// ── Hysteresis & Anti-Thrashing Configuration ─────────────────────────────────
// Requirement 3: When the elevator is marked as fixed, the system must avoid
// repeatedly switching routes. A new route is suggested only when it outperforms
// the currently active route by at least SWITCHING_THRESHOLD points.
export const SWITCHING_THRESHOLD = 5; // 5-point minimum improvement required to trigger re-route

// ── Mid-Journey Re-Ranking Evaluator ──────────────────────────────────────────
/**
 * Evaluates route scores only for segments that remain from current position onward.
 * Completed segments are never re-evaluated or recommended again.
 *
 * @param {object} route
 * @param {number} stageIndex (0 to 3)
 * @param {Array} activeDisruptions (central disruptions from server)
 * @param {object} scenarioDeltas (if simulating a scenario)
 * @param {object} weights
 * @returns {object} { factorScores, weightedScore, remainingEtaMin, completedSegments, remainingSegments, hasActiveBlocker }
 */
export function evaluateMidJourneyRoute(
  route,
  stageIndex,
  activeDisruptions = [],
  scenarioDeltas = {},
  weights
) {
  const currentStage = JOURNEY_STAGES[stageIndex] || JOURNEY_STAGES[0];
  const completedIds = currentStage.completedSegmentIds;

  // Filter segments belonging to this route
  const routeSegments = SEGMENTS.filter((s) => s.routeIds.includes(route.id));
  const completed = routeSegments.filter((s) => completedIds.includes(s.id));
  const remaining = routeSegments.filter((s) => !completedIds.includes(s.id));

  // Find active disruptions on the remaining segments of this route
  const remainingSegmentIds = remaining.map((s) => s.id);
  const relevantDisruptions = activeDisruptions.filter((d) =>
    remainingSegmentIds.includes(d.segmentId) && d.affectedRoutes.includes(route.id)
  );

  // Compute total penalties from disruptions on remaining segments
  const disruptionDeltas = { access: 0, safety: 0, crowd: 0, convenience: 0, cost: 0 };
  let hasActiveBlocker = false;

  for (const d of relevantDisruptions) {
    if (d.scoreDeltas) {
      disruptionDeltas.access += d.scoreDeltas.access || 0;
      disruptionDeltas.safety += d.scoreDeltas.safety || 0;
      disruptionDeltas.convenience += d.scoreDeltas.convenience || 0;
    }
    if (d.hazardType === "broken-lift" || d.scoreDeltas?.access <= -40) {
      hasActiveBlocker = true;
    }
  }

  // Combine with scenario deltas
  const keys = ["access", "safety", "crowd", "convenience", "cost"];
  const factorScores = Object.fromEntries(
    keys.map((k) => {
      const base = route.scores[k] ?? 0;
      const penalty = disruptionDeltas[k] || 0;
      const scen = scenarioDeltas[k] || 0;
      return [k, Math.max(0, Math.min(100, base + penalty + scen))];
    })
  );

  // Calculate weighted score
  const rawWeighted = keys.reduce(
    (sum, k) => sum + factorScores[k] * (weights[k] ?? 0),
    0
  );
  const weightedScore = Math.round(rawWeighted);

  // Compute remaining travel time (only remaining segments!)
  const baseRemainingMinutes = remaining.reduce((sum, s) => sum + s.baseMinutes, 0);

  return {
    factorScores,
    weightedScore,
    remainingEtaMin: baseRemainingMinutes,
    completedSegments: completed,
    remainingSegments: remaining,
    relevantDisruptions,
    hasActiveBlocker,
  };
}
