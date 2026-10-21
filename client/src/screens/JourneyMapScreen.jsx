import { useMemo } from "react";
import PuneMap from "../components/PuneMap";
import WeatherWidget from "../components/WeatherWidget";
import ScoreBars from "../components/ScoreBars";
import {
  ROUTES, SCENARIOS,
} from "../data/routes";
import {
  JOURNEY_STAGES, SEGMENTS, SWITCHING_THRESHOLD, evaluateMidJourneyRoute
} from "../data/segments";

const NORMAL_SCENARIO = SCENARIOS.find((s) => s.id === "normal");

/**
 * Screen 2 – Journey & Map (Clean Split-Screen Dashboard)
 * Features:
 * - Side-by-side dashboard layout (zero unnecessary scrolling on desktop)
 * - Mid-journey position tracking with segment-level re-ranking
 * - Completed segments locked out (traveler never sent back to start)
 * - Shared central disruption alerts & staff override badges
 * - Anti-thrashing switching threshold
 */
export default function JourneyMapScreen({
  weights,
  disruptions = [],
  onClearDisruptions,
  currentStageIndex = 0,
  onStageChange,
  activeRouteId = "accessible-main",
  onSelectRoute,
}) {
  const currentStage = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Evaluate candidate routes only for remaining segments from current position
  const routeData = useMemo(() => {
    return ROUTES.map((route) => {
      const evaluation = evaluateMidJourneyRoute(
        route,
        currentStageIndex,
        disruptions,
        NORMAL_SCENARIO.scoreDeltas[route.id] || {},
        weights
      );
      return {
        route,
        factorScores: evaluation.factorScores,
        weightedScore: evaluation.weightedScore,
        remainingEtaMin: evaluation.remainingEtaMin,
        completedSegments: evaluation.completedSegments,
        remainingSegments: evaluation.remainingSegments,
        relevantDisruptions: evaluation.relevantDisruptions,
        hasActiveBlocker: evaluation.hasActiveBlocker,
      };
    });
  }, [weights, disruptions, currentStageIndex]);

  // Sorted by weighted score descending
  const ranked = useMemo(
    () => [...routeData].sort((a, b) => b.weightedScore - a.weightedScore),
    [routeData]
  );

  const weightedScoresMap = useMemo(() => {
    return Object.fromEntries(routeData.map(({ route, weightedScore }) => [route.id, weightedScore]));
  }, [routeData]);

  const selectedData = routeData.find((d) => d.route.id === activeRouteId) || routeData[0];

  // Completed segments for traveler's current stage
  const completedSegments = SEGMENTS.filter((s) =>
    currentStage.completedSegmentIds.includes(s.id)
  );

  return (
    <main className="page fade-in-up" id="screen-journey" role="tabpanel" aria-labelledby="tab-journey">
      {/* ── Compact Header & Stepper Bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.65rem" }}>
        <div>
          <h1 style={{ fontSize: "1.45rem", margin: 0, fontWeight: 800 }}>Journey & Map</h1>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
            🚉 <strong>Pune Railway Station</strong> ➔ 🎓 <strong>Fergusson College</strong> &bull; Mid-journey dynamic re-ranking & anti-backtracking lock
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {/* Central disruptions indicator */}
          {disruptions.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.3rem 0.65rem",
                borderRadius: "999px",
                background: "rgba(255, 179, 71, 0.15)",
                border: "1px solid rgba(255, 179, 71, 0.4)",
                fontSize: "0.75rem",
                color: "var(--color-warning)",
                fontWeight: 700,
              }}
            >
              <span>🚨 {disruptions.length} Obstacle{disruptions.length > 1 ? "s" : ""}</span>
              {onClearDisruptions && (
                <button
                  onClick={onClearDisruptions}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-warning)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    textDecoration: "underline",
                    padding: 0,
                    marginLeft: "0.2rem",
                  }}
                  title="Clear disruptions to baseline"
                >
                  Reset
                </button>
              )}
            </div>
          )}
          <WeatherWidget />
        </div>
      </div>

      {/* ── Mid-Journey Position Tracker Bar ── */}
      <div
        className="card"
        style={{
          padding: "0.5rem 0.85rem",
          marginBottom: "0.85rem",
          borderColor: "rgba(0, 212, 170, 0.3)",
          background: "rgba(0, 212, 170, 0.04)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.1rem" }}>📍</span>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Position: <span style={{ color: "var(--color-accent)" }}>{currentStage.name}</span> ({currentStage.progressPct}%)
          </span>
          {completedSegments.length > 0 && (
            <span style={{ fontSize: "0.74rem", color: "#34D399", background: "rgba(52, 211, 153, 0.12)", padding: "0.15rem 0.5rem", borderRadius: "4px" }}>
              🛡️ {completedSegments.map((s) => s.shortName).join(", ")} locked
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.35rem" }}>
          {JOURNEY_STAGES.map((stg) => {
            const isCurrent = stg.stage === currentStageIndex;
            const isPast = stg.stage < currentStageIndex;
            return (
              <button
                key={stg.id}
                onClick={() => onStageChange?.(stg.stage)}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  fontSize: "0.74rem",
                  fontWeight: isCurrent ? 700 : 500,
                  border: isCurrent
                    ? "1.5px solid #00D4AA"
                    : isPast
                      ? "1px solid rgba(52, 211, 153, 0.4)"
                      : "1px solid var(--color-border)",
                  background: isCurrent
                    ? "rgba(0, 212, 170, 0.2)"
                    : isPast
                      ? "rgba(52, 211, 153, 0.08)"
                      : "var(--color-surface-2)",
                  color: isCurrent ? "#00D4AA" : isPast ? "#34D399" : "var(--color-text-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {isPast ? "✓ " : ""}{stg.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Dashboard: Left (Routes & Inspector) | Right (Interactive Map) ── */}
      <div className="dashboard-layout">
        {/* Left Side Panel: Route Candidates & Selected Inspection */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted)" }}>
              Candidate Routes (Ranked)
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-accent)", fontWeight: 600 }}>
              ⚖️ Anti-Thrashing: +{SWITCHING_THRESHOLD} pts
            </span>
          </div>

          {/* 3 Candidate Routes in sleek list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {ranked.map(({ route, weightedScore, remainingEtaMin, relevantDisruptions, hasActiveBlocker }, rank) => {
              const isSelected = activeRouteId === route.id;

              return (
                <div
                  key={route.id}
                  onClick={() => onSelectRoute(route.id)}
                  style={{
                    background: isSelected ? "var(--color-surface-2)" : "var(--color-surface)",
                    border: isSelected
                      ? `1.5px solid ${route.color}`
                      : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.75rem 0.85rem",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                    boxShadow: isSelected ? `0 0 16px ${route.color}25` : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "1rem" }}>{rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}</span>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: route.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: isSelected ? "#fff" : "var(--color-text-primary)" }}>
                          {route.shortName}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                          ~{remainingEtaMin} min &bull; {route.hasBarriers ? "⚠️ Stairs" : "✓ Step-free"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {hasActiveBlocker && (
                        <span className="badge badge-danger" style={{ fontSize: "0.62rem", padding: "0.15rem 0.4rem" }}>
                          🚫 Blocked
                        </span>
                      )}
                      <div
                        style={{
                          background: `linear-gradient(135deg, ${route.color}cc, ${route.color})`,
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "var(--radius-sm)",
                          minWidth: "40px",
                          textAlign: "center",
                        }}
                      >
                        {weightedScore}
                      </div>
                    </div>
                  </div>

                  {/* Active disruption badge */}
                  {relevantDisruptions.length > 0 && (
                    <div style={{
                      marginTop: "0.35rem", fontSize: "0.72rem", color: "var(--color-warning)",
                      background: "rgba(255,179,71,0.1)", borderRadius: "4px", padding: "0.15rem 0.4rem"
                    }}>
                      🚨 {relevantDisruptions.map((d) => `${d.hazardEmoji} ${d.hazardLabel}`).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Route Inspector & Factor Bars */}
          {selectedData && (
            <div className="card" style={{ padding: "0.85rem", borderColor: `${selectedData.route.color}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: selectedData.route.color }}>
                  📊 {selectedData.route.shortName} Breakdown
                </span>
                <span className="badge badge-primary" style={{ fontSize: "0.65rem" }}>
                  ~{selectedData.remainingEtaMin} min rem.
                </span>
              </div>

              {/* Segment checklist */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.65rem", background: "var(--color-surface-2)", padding: "0.5rem", borderRadius: "var(--radius-sm)" }}>
                {selectedData.completedSegments.map((seg) => (
                  <div key={seg.id} style={{ fontSize: "0.73rem", color: "#34D399", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>✓</span>
                    <span style={{ textDecoration: "line-through", opacity: 0.8 }}>{seg.name}</span>
                    <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>(Locked)</span>
                  </div>
                ))}
                {selectedData.remainingSegments.map((seg) => {
                  const segDisruption = selectedData.relevantDisruptions.find((d) => d.segmentId === seg.id);
                  return (
                    <div key={seg.id} style={{ fontSize: "0.73rem", color: segDisruption ? "var(--color-danger)" : "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <span>{segDisruption ? "🚨" : "⏳"}</span>
                      <span><strong>{seg.name}</strong> (~{seg.baseMinutes}m)</span>
                      {segDisruption && (
                        <span style={{ fontSize: "0.65rem", color: "var(--color-danger)" }}>
                          ({segDisruption.hazardEmoji} {segDisruption.hazardLabel})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Score bars */}
              <ScoreBars scores={selectedData.factorScores} compact />
            </div>
          )}
        </div>

        {/* Right Panel: Interactive Map */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="card" style={{ padding: "0.35rem", overflow: "hidden" }}>
            <PuneMap
              routes={ROUTES}
              selectedRouteId={activeRouteId}
              weightedScores={weightedScoresMap}
              onRouteClick={onSelectRoute}
              currentStageIndex={currentStageIndex}
              activeDisruptions={disruptions}
              height="510px"
            />
          </div>

          {/* Map bottom legend info strip */}
          <div
            style={{
              padding: "0.4rem 0.85rem",
              background: "var(--color-surface-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
              <span>🚉 <strong>Origin:</strong> Station</span>
              <span>🎓 <strong>Destination:</strong> Fergusson College</span>
              <span>📍 <strong>GPS:</strong> Live Stage Marker</span>
            </div>
            <span>📐 <strong>Formula:</strong> Score = Σ (Factor × Weight)</span>
          </div>
        </div>
      </div>
    </main>
  );
}
