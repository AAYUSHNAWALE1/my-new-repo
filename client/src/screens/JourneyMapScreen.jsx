import { useState, useMemo } from "react";
import PuneMap from "../components/PuneMap";
import RouteCard from "../components/RouteCard";
import WeatherWidget from "../components/WeatherWidget";
import ScoreBars from "../components/ScoreBars";
import {
  ROUTES, SCENARIOS, DEFAULT_WEIGHTS,
} from "../data/routes";
import {
  JOURNEY_STAGES, SEGMENTS, SWITCHING_THRESHOLD, evaluateMidJourneyRoute
} from "../data/segments";

const NORMAL_SCENARIO = SCENARIOS.find((s) => s.id === "normal");

/**
 * Screen 2 – Journey & Map
 * Features:
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
  const topRoute = ranked[0];

  // Completed segments for traveler's current stage
  const completedSegments = SEGMENTS.filter((s) =>
    currentStage.completedSegmentIds.includes(s.id)
  );

  return (
    <main className="page fade-in-up" id="screen-journey" role="tabpanel" aria-labelledby="tab-journey">
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1>Journey & Map</h1>
            <p>
              🚉 <strong>Pune Railway Station</strong> → 🎓 <strong>Fergusson College</strong> &mdash;
              Track your live position and re-rank candidate paths only from where you are onward.
            </p>
          </div>
          <WeatherWidget />
        </div>
      </div>

      {/* ── Mid-Journey Position Tracker & Segment Controller (Requirement 1) ── */}
      <div
        className="card"
        style={{
          marginBottom: "1.25rem",
          borderColor: "rgba(0, 212, 170, 0.3)",
          background: "rgba(0, 212, 170, 0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.3rem" }}>📍</span>
            <div>
              <strong style={{ fontSize: "0.95rem", color: "var(--color-text-primary)" }}>
                Mid-Journey Position Tracker: {currentStage.name}
              </strong>
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                {currentStage.progressPct}% complete &bull; {currentStage.landmark}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {JOURNEY_STAGES.map((stg) => {
              const isCurrent = stg.stage === currentStageIndex;
              const isPast = stg.stage < currentStageIndex;
              return (
                <button
                  key={stg.id}
                  onClick={() => onStageChange?.(stg.stage)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "999px",
                    fontSize: "0.76rem",
                    fontWeight: isCurrent ? 700 : 500,
                    border: isCurrent
                      ? "1.5px solid #00D4AA"
                      : isPast
                        ? "1px solid rgba(52, 211, 153, 0.4)"
                        : "1px solid var(--color-border)",
                    background: isCurrent
                      ? "rgba(0, 212, 170, 0.18)"
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

        {/* Completed Segment Guarantee Banner */}
        {completedSegments.length > 0 && (
          <div
            style={{
              padding: "0.5rem 0.85rem",
              background: "rgba(52, 211, 153, 0.08)",
              borderLeft: "3px solid #34D399",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8rem",
              color: "#34D399",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>🛡️</span>
            <span>
              <strong>Completed segment locked:</strong>{" "}
              {completedSegments.map((s) => s.shortName).join(", ")}. Candidate routes re-ranked only from your current position onward &mdash; you will <strong>never</strong> be routed back to the start!
            </span>
          </div>
        )}
      </div>

      {/* ── Central Disruption Store Banner (Requirement 2 & 3) ── */}
      {disruptions.length > 0 && (
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            background: "rgba(255, 179, 71, 0.10)",
            border: "1px solid rgba(255, 179, 71, 0.35)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🚨</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-warning)" }}>
                Central Disruption Store ({disruptions.length} active report{disruptions.length > 1 ? "s" : ""})
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
                Stored centrally on server. Station staff reports override conflicting traveler logs, and expired reports auto-clear.
              </div>
            </div>
          </div>
          {onClearDisruptions && (
            <button
              onClick={onClearDisruptions}
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
              title="Reset all community disruptions for demo"
            >
              🔄 Clear All (Reset Demo)
            </button>
          )}
        </div>
      )}

      {/* Map */}
      <div style={{ marginBottom: "1.5rem" }}>
        <PuneMap
          routes={ROUTES}
          selectedRouteId={activeRouteId}
          weightedScores={weightedScoresMap}
          onRouteClick={onSelectRoute}
          currentStageIndex={currentStageIndex}
          activeDisruptions={disruptions}
        />
      </div>

      {/* Scoring formula & Anti-Thrashing Legend */}
      <div
        style={{
          marginBottom: "1rem",
          padding: "0.6rem 1rem",
          background: "var(--color-surface-2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          fontSize: "0.8rem",
          color: "var(--color-text-muted)",
          display: "flex",
          gap: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <span>📐 <strong style={{ color: "var(--color-text-primary)" }}>Weighted Score</strong> = Σ (Factor Score × Active Weight)</span>
        <span>⏱ <strong style={{ color: "var(--color-text-primary)" }}>Remaining ETA</strong> = Sum of unfinished segments</span>
        <span>⚖️ <strong style={{ color: "var(--color-accent)" }}>Anti-Thrashing Threshold</strong>: +{SWITCHING_THRESHOLD} pts improvement required to flip route</span>
      </div>

      {/* Route rankings */}
      <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Route Rankings from Current Position</h2>
        <span className="badge badge-primary">Mid-Journey Re-Ranked</span>
        <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>Sorted by weighted score ↓</span>
      </div>

      <div className="grid-3" style={{ marginBottom: "1.5rem" }}>
        {ranked.map(({ route, factorScores, weightedScore, remainingEtaMin, relevantDisruptions, hasActiveBlocker }, rank) => {
          const isTop = rank === 0;
          const isSelected = activeRouteId === route.id;

          return (
            <div key={route.id} style={{ position: "relative" }}>
              {isTop && (
                <div
                  style={{
                    position: "absolute",
                    top: "-10px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(135deg,#FFB347,#FF6B6B)",
                    color: "#fff",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.75rem",
                    borderRadius: "999px",
                    zIndex: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  🥇 Recommended Pick
                </div>
              )}
              <RouteCard
                route={route}
                scenario={{ etaMultiplier: 1.0, fixedDelay: 0 }}
                weightedScore={weightedScore}
                factorScores={factorScores}
                selected={isSelected}
                onSelect={onSelectRoute}
                disruptions={relevantDisruptions}
              />
            </div>
          );
        })}
      </div>

      {/* Selected route detail */}
      {selectedData && (
        <div className="card" style={{ borderColor: `${selectedData.route.color}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ color: selectedData.route.color }}>
              📊 {selectedData.route.name} &mdash; Segment Evaluation & Factor Scores
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {selectedData.route.hasBarriers && (
                <span className="badge badge-danger">⚠️ Contains Stairs & Steep Curbs</span>
              )}
              {selectedData.relevantDisruptions.length > 0 && (
                <span className="badge badge-warning">
                  🚨 {selectedData.relevantDisruptions.length} Segment Disruption Active
                </span>
              )}
              <span className="badge badge-primary">
                Remaining Leg: ~{selectedData.remainingEtaMin} min
              </span>
            </div>
          </div>

          {/* Segment breakdown for selected route */}
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              background: "var(--color-surface-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-secondary)" }}>
              Segment Breakdown from Pune Station to Fergusson College:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {selectedData.completedSegments.map((seg) => (
                <div key={seg.id} style={{ fontSize: "0.78rem", color: "#34D399", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>✓</span>
                  <span style={{ textDecoration: "line-through" }}>{seg.name} ({seg.baseMinutes} min)</span>
                  <span className="badge badge-success" style={{ fontSize: "0.62rem" }}>Completed &bull; Locked</span>
                </div>
              ))}
              {selectedData.remainingSegments.map((seg) => {
                const segDisruption = selectedData.relevantDisruptions.find((d) => d.segmentId === seg.id);
                return (
                  <div key={seg.id} style={{ fontSize: "0.78rem", color: segDisruption ? "var(--color-danger)" : "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>{segDisruption ? "🚨" : "⏳"}</span>
                    <span><strong>{seg.name}</strong> (~{seg.baseMinutes} min)</span>
                    {segDisruption && (
                      <span className="badge badge-danger" style={{ fontSize: "0.62rem" }}>
                        {segDisruption.hazardEmoji} {segDisruption.hazardLabel} ({segDisruption.source === "station_staff" ? "Staff Verified" : "Traveler Report"})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <ScoreBars scores={selectedData.factorScores} />
        </div>
      )}
    </main>
  );
}
