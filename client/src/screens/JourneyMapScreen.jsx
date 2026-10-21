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
 * Screen 2 – Journey & Map (Compact & Dropdown-Driven)
 * Clean split-view layout:
 * - Mid-journey position tracking via compact dropdown
 * - Route focus via compact dropdown or 1-click switcher
 * - Side-by-side map and route intelligence with minimal scrolling
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

  // Ranked by weighted score descending
  const ranked = useMemo(
    () => [...routeData].sort((a, b) => b.weightedScore - a.weightedScore),
    [routeData]
  );

  const weightedScoresMap = useMemo(() => {
    return Object.fromEntries(routeData.map(({ route, weightedScore }) => [route.id, weightedScore]));
  }, [routeData]);

  const selectedData = routeData.find((d) => d.route.id === activeRouteId) || routeData[0];
  const topRouteData = ranked[0];

  // Completed segments for traveler's current stage
  const completedSegments = SEGMENTS.filter((s) =>
    currentStage.completedSegmentIds.includes(s.id)
  );

  return (
    <main className="page fade-in-up" id="screen-journey" role="tabpanel" aria-labelledby="tab-journey">
      {/* ── Compact Header & Toolbar ── */}
      <div className="compact-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1>Journey & Map</h1>
            <span className="badge badge-primary" style={{ fontSize: "0.72rem" }}>
              Pune Corridor
            </span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            🚉 Pune Railway Station → 🎓 Fergusson College &bull; Dynamic re-ranking from live position
          </p>
        </div>

        {/* ── Controls Toolbar: Position Dropdown + Route Focus Dropdown + Weather ── */}
        <div className="compact-toolbar">
          {/* Position Selector Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label htmlFor="journey-stage-select" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              📍 Position:
            </label>
            <select
              id="journey-stage-select"
              className="select-dropdown"
              value={currentStageIndex}
              onChange={(e) => onStageChange?.(Number(e.target.value))}
              aria-label="Mid-journey position"
            >
              {JOURNEY_STAGES.map((stg) => (
                <option key={stg.id} value={stg.stage}>
                  {stg.stage === 0 ? "🚉" : stg.stage === 3 ? "🎓" : "📍"} {stg.name} ({stg.progressPct}%)
                </option>
              ))}
            </select>
          </div>

          {/* Route Focus Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label htmlFor="route-focus-select" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Route:
            </label>
            <select
              id="route-focus-select"
              className="select-dropdown"
              value={activeRouteId}
              onChange={(e) => onSelectRoute?.(e.target.value)}
              aria-label="Active route focus"
            >
              {ranked.map(({ route, weightedScore, remainingEtaMin }, idx) => (
                <option key={route.id} value={route.id}>
                  #{idx + 1} {route.shortName} &mdash; Score: {weightedScore} ({remainingEtaMin}m)
                </option>
              ))}
            </select>
          </div>

          <WeatherWidget />
        </div>
      </div>

      {/* ── Central Disruption Store Alert Bar (if any) ── */}
      {disruptions.length > 0 && (
        <div
          style={{
            marginBottom: "0.65rem",
            padding: "0.45rem 0.85rem",
            background: "rgba(255, 179, 71, 0.10)",
            border: "1px solid rgba(255, 179, 71, 0.35)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🚨</span>
            <span style={{ fontWeight: 600, color: "var(--color-warning)" }}>
              {disruptions.length} Active Central Disruption{disruptions.length > 1 ? "s" : ""}:
            </span>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {disruptions.map((d) => `${d.hazardEmoji} ${d.segmentName}`).join(", ")}
            </span>
          </div>
          {onClearDisruptions && (
            <button
              onClick={onClearDisruptions}
              className="btn btn-ghost"
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}
            >
              🔄 Clear All
            </button>
          )}
        </div>
      )}

      {/* ── Side-by-Side Main Split View (Fits Viewport) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr", gap: "1rem", alignItems: "start" }}>
        {/* Left Column: Interactive Pune Map */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <PuneMap
              routes={ROUTES}
              selectedRouteId={activeRouteId}
              weightedScores={weightedScoresMap}
              onRouteClick={onSelectRoute}
              currentStageIndex={currentStageIndex}
              activeDisruptions={disruptions}
            />
          </div>

          {/* Completed Segment Guarantee Pill */}
          <div
            style={{
              padding: "0.4rem 0.75rem",
              background: "rgba(52, 211, 153, 0.08)",
              border: "1px solid rgba(52, 211, 153, 0.25)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.76rem",
              color: "#34D399",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span>🛡️</span>
              <span>
                {completedSegments.length > 0 ? (
                  <>
                    <strong>Locked legs:</strong> {completedSegments.map((s) => s.shortName).join(", ")}. Backtracking forbidden.
                  </>
                ) : (
                  <>
                    <strong>Origin:</strong> Full corridor ahead. Candidate routes ranked for complete journey.
                  </>
                )}
              </span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
              {currentStage.progressPct}% Complete
            </span>
          </div>
        </div>

        {/* Right Column: Active Route Detail & Fast Candidate Switcher */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* Active Selected Route Detail Card */}
          <div
            className="card"
            style={{
              borderColor: selectedData.route.color,
              background: `linear-gradient(180deg, ${selectedData.route.color}11, var(--color-surface))`,
              padding: "0.85rem 1rem",
            }}
          >
            {/* Header: Name, Rank & Score Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: selectedData.route.color }} />
                  <strong style={{ fontSize: "1rem", color: "var(--color-text-primary)" }}>
                    {selectedData.route.shortName}
                  </strong>
                  {selectedData.route.id === topRouteData.route.id && (
                    <span className="badge badge-success" style={{ fontSize: "0.68rem" }}>
                      ⭐ #1 Recommended
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                  {selectedData.route.via} &bull; {selectedData.remainingEtaMin} min remaining
                </div>
              </div>

              {/* Large Score Pill */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${selectedData.route.color}, var(--color-primary-light))`,
                  color: "#fff",
                  fontSize: "1.15rem",
                  fontWeight: 800,
                  padding: "0.3rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  minWidth: "52px",
                  textAlign: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                }}
              >
                {selectedData.weightedScore}
              </div>
            </div>

            {/* Accessibility Tags */}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
              <span className={`tag ${selectedData.route.hasBarriers ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.7rem" }}>
                {selectedData.route.hasBarriers ? "⚠️ Physical Barriers" : "♿ Step-Free Accessible"}
              </span>
              <span className="tag" style={{ fontSize: "0.7rem" }}>
                ⏱ ETA: {selectedData.remainingEtaMin} min
              </span>
              {selectedData.hasActiveBlocker && (
                <span className="badge badge-danger" style={{ fontSize: "0.7rem" }}>
                  🚫 Obstacle on Active Path
                </span>
              )}
            </div>

            {/* 5-Factor Score Breakdown */}
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.55rem" }}>
              <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
                5-Factor Score Matrix:
              </div>
              <ScoreBars factorScores={selectedData.factorScores} />
            </div>
          </div>

          {/* Quick-Switch Mini Rows for All 3 Candidate Routes */}
          <div className="card" style={{ padding: "0.65rem 0.85rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: "0.45rem", display: "flex", justifyContent: "space-between" }}>
              <span>Compare All Candidate Paths:</span>
              <span style={{ color: "var(--color-text-muted)" }}>Click to focus</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {ranked.map(({ route, weightedScore, remainingEtaMin, hasActiveBlocker }, idx) => {
                const isSelected = route.id === activeRouteId;
                return (
                  <button
                    key={route.id}
                    onClick={() => onSelectRoute?.(route.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${isSelected ? route.color : "var(--color-border)"}`,
                      background: isSelected ? `${route.color}1a` : "var(--color-surface-2)",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--color-text-primary)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.74rem", fontWeight: 800, color: idx === 0 ? "var(--color-success)" : "var(--color-text-muted)" }}>
                        #{idx + 1}
                      </span>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: route.color }} />
                      <div>
                        <div style={{ fontSize: "0.78rem", fontWeight: isSelected ? 700 : 500 }}>
                          {route.shortName}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>
                          {remainingEtaMin} min &bull; {route.hasBarriers ? "Stairs" : "Step-free"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      {hasActiveBlocker && <span style={{ fontSize: "0.75rem" }}>🚨</span>}
                      <span style={{ fontWeight: 800, fontSize: "0.88rem", color: route.color }}>
                        {weightedScore}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Anti-Thrashing Policy Info */}
          <div
            style={{
              padding: "0.4rem 0.65rem",
              background: "var(--color-surface-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              fontSize: "0.72rem",
              color: "var(--color-text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>⚖️ <strong>Anti-Thrashing Rule:</strong> ≥ +{SWITCHING_THRESHOLD} pts required to reroute</span>
            <span style={{ color: "var(--color-accent)" }}>Active Route Locked</span>
          </div>
        </div>
      </div>
    </main>
  );
}
