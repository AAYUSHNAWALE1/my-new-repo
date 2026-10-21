import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "..", "data", "disruptions.json");

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Segment Definitions ────────────────────────────────────────────────────────
export const SEGMENT_CATALOG = [
  { id: "seg-station-interchange", name: "Station → Shivajinagar Junction", routeIds: ["jm-road-direct", "accessible-main", "quiet-backup"] },
  { id: "seg-jm-corridor",         name: "JM Road Arterial Spine",          routeIds: ["jm-road-direct"] },
  { id: "seg-metro-overpass",      name: "Shivajinagar Metro Elevator",     routeIds: ["accessible-main"] },
  { id: "seg-model-colony",        name: "Model Colony Quiet Detour",       routeIds: ["quiet-backup"] },
  { id: "seg-fc-approach",         name: "FC Road → College Gate",          routeIds: ["jm-road-direct", "accessible-main", "quiet-backup"] },
];

// Hazard type → base score penalties
export const HAZARD_IMPACTS = {
  "broken-lift":  { access: -58, safety:  -5, convenience: -10, label: "Elevator / Lift Failure", emoji: "🛗" },
  "broken-ramp":  { access: -25, safety: -10, convenience:  -8, label: "Damaged / Broken Ramp",  emoji: "🔧" },
  "flooded-path": { access: -20, safety: -25, convenience: -15, label: "Flooded / Waterlogged", emoji: "💧" },
  "construction": { access: -30, safety: -15, convenience: -20, label: "Construction Blockade", emoji: "🚧" },
  "missing-curb": { access: -20, safety: -10, convenience:  -5, label: "Missing Curb Ramp",      emoji: "⚠️" },
  "blocked-ramp": { access: -25, safety: -10, convenience:  -8, label: "Ramp Blocked by Vehicle", emoji: "🚫" },
};

// ── Persistence ───────────────────────────────────────────────────────────────
function loadDisruptions() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[disruptions] Failed to load disruptions from disk:", err.message);
  }
  return [];
}

const DISRUPTION_STORE = loadDisruptions();

function saveDisruptions() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DISRUPTION_STORE, null, 2), "utf-8");
  } catch (err) {
    console.error("[disruptions] Failed to save disruptions to disk:", err.message);
  }
}

// ── Expiration & Staff Override Evaluator ─────────────────────────────────────
/**
 * Prune and partition disruptions:
 * 1. Remove expired items (Date.now() > expiresAt).
 * 2. If a segment has a station_staff report:
 *    - If staff marked it "cleared" (repaired): all traveler reports on this segment are overridden/suppressed!
 *    - If staff marked it "active": staff report takes precedence with highest confidence.
 */
function evaluateActiveDisruptions() {
  const now = Date.now();
  const valid = DISRUPTION_STORE.filter((d) => d.expiresAt > now);

  if (valid.length !== DISRUPTION_STORE.length) {
    DISRUPTION_STORE.splice(0, DISRUPTION_STORE.length, ...valid);
    saveDisruptions();
  }

  // Group by segmentId
  const bySegment = {};
  for (const item of valid) {
    if (!bySegment[item.segmentId]) bySegment[item.segmentId] = [];
    bySegment[item.segmentId].push(item);
  }

  const effective = [];
  const overridden = [];

  for (const [segmentId, reports] of Object.entries(bySegment)) {
    // Check if there is a station_staff report
    const staffReport = reports.find((r) => r.source === "station_staff");

    if (staffReport) {
      if (staffReport.status === "cleared") {
        // Staff marked obstacle resolved → overrides all traveler reports on this segment
        reports.forEach((r) => {
          if (r.id !== staffReport.id) {
            overridden.push({ ...r, reason: "Overridden by verified station staff resolution" });
          }
        });
        // Cleared staff report is not penalizing scores
      } else {
        // Staff confirmed active obstacle → takes precedence
        effective.push(staffReport);
        reports.forEach((r) => {
          if (r.id !== staffReport.id) {
            overridden.push({ ...r, reason: "Subsumed by authoritative station staff report" });
          }
        });
      }
    } else {
      // Traveler reports only — add all active reports
      effective.push(...reports.filter((r) => r.status !== "cleared"));
    }
  }

  return { effective, overridden, rawCount: valid.length };
}

// Prune every 5 minutes in background
setInterval(() => {
  evaluateActiveDisruptions();
}, 5 * 60 * 1000);

// ── GET /api/disruptions ──────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const { routeId, segmentId } = req.query;
  const { effective, overridden } = evaluateActiveDisruptions();

  let filtered = effective;
  if (segmentId) {
    filtered = filtered.filter((d) => d.segmentId === segmentId);
  }
  if (routeId) {
    filtered = filtered.filter((d) => d.affectedRoutes.includes(routeId));
  }

  res.json({
    disruptions: filtered,
    overridden,
    count: filtered.length,
    serverTimestamp: Date.now(),
  });
});

// ── POST /api/disruptions ─────────────────────────────────────────────────────
// Body: {
//   segmentId: string,
//   hazardType: string,
//   source?: "station_staff" | "traveler",
//   confidence?: "high" | "medium" | "low",
//   status?: "active" | "cleared",
//   note?: string,
//   ttlMinutes?: number
// }
router.post("/", (req, res) => {
  const {
    segmentId,
    hazardType,
    source = "traveler",
    confidence = source === "station_staff" ? "high" : "medium",
    status = "active",
    note = "",
    ttlMinutes = source === "station_staff" ? 180 : 60, // 3h for staff, 1h for traveler
  } = req.body;

  if (!segmentId || !hazardType) {
    return res.status(400).json({ error: "segmentId and hazardType are required" });
  }

  const segment = SEGMENT_CATALOG.find((s) => s.id === segmentId);
  if (!segment) {
    return res.status(400).json({ error: `Unknown segmentId: ${segmentId}` });
  }

  const impact = HAZARD_IMPACTS[hazardType] || { access: -20, safety: -10, convenience: -5, label: hazardType, emoji: "⚠️" };

  const now = Date.now();
  const ttlMs = Math.max(1, ttlMinutes) * 60 * 1000;
  const expiresAt = now + ttlMs;

  const entry = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    segmentId,
    segmentName: segment.name,
    affectedRoutes: segment.routeIds,
    hazardType,
    hazardLabel: impact.label,
    hazardEmoji: impact.emoji,
    source, // "station_staff" | "traveler"
    confidence, // "high" | "medium" | "low"
    status, // "active" | "cleared"
    note: note.trim(),
    scoreDeltas: {
      access: impact.access,
      safety: impact.safety,
      convenience: impact.convenience,
    },
    reportedAt: new Date(now).toISOString(),
    reportedAtMs: now,
    expiresAt,
    expiresAtISO: new Date(expiresAt).toISOString(),
    ttlMinutes,
  };

  DISRUPTION_STORE.unshift(entry);
  saveDisruptions();

  console.log(`[disruptions] New report from ${source} (${confidence}): ${impact.emoji} on ${segment.name}`);

  const { effective, overridden } = evaluateActiveDisruptions();
  res.status(201).json({
    disruption: entry,
    activeDisruptions: effective,
    overridden,
  });
});

// ── POST /api/disruptions/resolve (Station Staff Override) ─────────────────────
// Body: { segmentId: string, note?: string }
// Station staff marks a segment obstacle as repaired/cleared, overriding traveler reports
router.post("/resolve", (req, res) => {
  const { segmentId, note = "Repaired and verified operational by station staff." } = req.body;

  if (!segmentId) {
    return res.status(400).json({ error: "segmentId is required" });
  }

  const segment = SEGMENT_CATALOG.find((s) => s.id === segmentId);
  const now = Date.now();
  const ttlMs = 180 * 60 * 1000; // 3 hours

  const resolutionEntry = {
    id: `resolve-${now}-${Math.random().toString(36).slice(2, 6)}`,
    segmentId,
    segmentName: segment ? segment.name : segmentId,
    affectedRoutes: segment ? segment.routeIds : [],
    hazardType: "cleared",
    hazardLabel: "Obstacle Resolved / Fixed",
    hazardEmoji: "✅",
    source: "station_staff",
    confidence: "high",
    status: "cleared",
    note: note.trim(),
    scoreDeltas: { access: 0, safety: 0, convenience: 0 },
    reportedAt: new Date(now).toISOString(),
    reportedAtMs: now,
    expiresAt: now + ttlMs,
    expiresAtISO: new Date(now + ttlMs).toISOString(),
    ttlMinutes: 180,
  };

  DISRUPTION_STORE.unshift(resolutionEntry);
  saveDisruptions();

  console.log(`[disruptions] Station staff resolved segment: ${segmentId}`);

  const { effective, overridden } = evaluateActiveDisruptions();
  res.json({
    resolution: resolutionEntry,
    activeDisruptions: effective,
    overridden,
    message: `Station staff override applied. Traveler reports on ${segmentId} suppressed.`,
  });
});

// ── DELETE /api/disruptions/:id ───────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const idx = DISRUPTION_STORE.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Disruption not found" });
  const removed = DISRUPTION_STORE.splice(idx, 1)[0];
  saveDisruptions();
  res.json({ removed });
});

// ── DELETE /api/disruptions (Demo Reset) ───────────────────────────────────────
router.delete("/", (_req, res) => {
  const count = DISRUPTION_STORE.length;
  DISRUPTION_STORE.length = 0;
  saveDisruptions();
  res.json({ cleared: count });
});

export default router;
