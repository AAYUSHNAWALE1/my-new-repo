import { useState, useMemo } from "react";
import ScoreBars from "../components/ScoreBars";
import {
  ROUTES, SCENARIOS, HAZARD_TYPES, computeEta
} from "../data/routes";
import {
  SEGMENTS, JOURNEY_STAGES, SWITCHING_THRESHOLD, evaluateMidJourneyRoute
} from "../data/segments";
import { fetchRecoveryExplanation } from "../api/client";

/**
 * Screen 3 – Disruption & Recovery (Compact & Dropdown-Driven)
 * Clean, compact design with:
 * - Scenario selector dropdown
 * - Mid-journey position dropdown
 * - Route impact inspector dropdown
 * - Compact community disruption reporting drawer & active list
 * - Minimal vertical scrolling
 */
export default function DisruptionRecoveryScreen({
  weights,
  onLogEvent,
  disruptions = [],
  onReportDisruption,
  onResolveStaff,
  onClearDisruptions,
  onDeleteDisruption,
  currentStageIndex = 0,
  onStageChange,
  activeRouteId = "accessible-main",
  activeScenarioId = "normal",
  onScenarioChange,
}) {
  const [explanation, setExplanation]           = useState("");
  const [loadingAI, setLoadingAI]               = useState(false);
  const [aiError, setAiError]                   = useState(null);
  const [selectedImpactRouteId, setSelectedImpactRouteId] = useState("accessible-main");

  // Hazard reporting form state
  const [showReportForm, setShowReportForm]     = useState(false);
  const [targetSegmentId, setTargetSegmentId]   = useState("seg-metro-overpass");
  const [hazardType, setHazardType]             = useState("broken-lift");
  const [reportSource, setReportSource]         = useState("station_staff");
  const [confidence, setConfidence]             = useState("high");
  const [ttlMinutes, setTtlMinutes]             = useState(60);
  const [hazardNote, setHazardNote]             = useState("");
  const [submittingHazard, setSubmittingHazard] = useState(false);

  const activeScenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];
  const currentStage   = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Baseline data: clean route BEFORE disruptions evaluated from current position
  const beforeData = useMemo(() => {
    return Object.fromEntries(
      ROUTES.map((r) => {
        const evalRes = evaluateMidJourneyRoute(
          r,
          currentStageIndex,
          [],
          {},
          weights
        );
        return [r.id, evalRes];
      })
    );
  }, [weights, currentStageIndex]);

  // After data: active scenario deltas + central disruptions
  const afterData = useMemo(() => {
    return Object.fromEntries(
      ROUTES.map((r) => {
        const evalRes = evaluateMidJourneyRoute(
          r,
          currentStageIndex,
          disruptions,
          activeScenario.scoreDeltas[r.id] || {},
          weights
        );
        return [r.id, evalRes];
      })
    );
  }, [activeScenario, weights, disruptions, currentStageIndex]);

  // Best route after disruption
  const bestRouteAfter = useMemo(() => {
    return ROUTES.reduce((best, r) =>
      afterData[r.id].weightedScore > afterData[best.id].weightedScore ? r : best
    , ROUTES[0]);
  }, [afterData]);

  async function handleScenarioChange(id) {
    onScenarioChange?.(id);
    setExplanation("");
    setAiError(null);

    const scenario = SCENARIOS.find((s) => s.id === id);

    onLogEvent?.({
      type: "scenario",
      icon: scenario.icon,
      title: `Scenario: ${scenario.label}`,
      detail: `${scenario.description} (Evaluated from ${currentStage.name})`,
      snapshot: {
        stageIndex: currentStageIndex,
        activeRouteId,
        recommendedRouteId: bestRouteAfter.id,
        weights,
        disruptions,
        scenarioId: id,
      },
    });

    if (id === "normal") return;

    setLoadingAI(true);
    try {
      const beforeScores = Object.fromEntries(
        ROUTES.map((r) => [r.shortName, beforeData[r.id].weightedScore])
      );
      const freshAfterEvaluations = Object.fromEntries(
        ROUTES.map((r) => [
          r.id,
          evaluateMidJourneyRoute(
            r,
            currentStageIndex,
            disruptions,
            scenario.scoreDeltas[r.id] || {},
            weights
          )
        ])
      );
      const freshAfterScores = Object.fromEntries(
        ROUTES.map((r) => [r.shortName, freshAfterEvaluations[r.id].weightedScore])
      );
      const freshBestRoute = ROUTES.reduce((best, r) =>
        freshAfterEvaluations[r.id].weightedScore > freshAfterEvaluations[best.id].weightedScore ? r : best
      , ROUTES[0]);

      const result = await fetchRecoveryExplanation(
        scenario.label,
        freshBestRoute.shortName,
        beforeScores,
        freshAfterScores,
        currentStage.name
      );
      const expl = result.explanation || "";
      setExplanation(expl);
      onLogEvent?.({
        type: "ai",
        icon: "🤖",
        title: `AI Recovery Explanation`,
        detail: expl,
        snapshot: {
          stageIndex: currentStageIndex,
          activeRouteId,
          recommendedRouteId: freshBestRoute.id,
          weights,
          disruptions,
          explanation: expl,
        },
      });
    } catch (e) {
      setAiError(`AI explanation unavailable (${e.message}).`);
    } finally {
      setLoadingAI(false);
    }
  }

  async function handleHazardReport(e) {
    e.preventDefault();
    if (!targetSegmentId || !hazardType) return;

    setSubmittingHazard(true);
    try {
      await onReportDisruption?.({
        segmentId: targetSegmentId,
        hazardType,
        source: reportSource,
        confidence,
        status: "active",
        note: hazardNote || (reportSource === "station_staff" ? "Official station staff directive" : "Traveler community report"),
        ttlMinutes: Number(ttlMinutes),
      });
      setHazardNote("");
      setShowReportForm(false);
    } catch (err) {
      console.error("Failed to report hazard:", err);
    } finally {
      setSubmittingHazard(false);
    }
  }

  async function handleQuickStaffResolve() {
    try {
      await onResolveStaff?.({
        segmentId: "seg-metro-overpass",
        note: "Elevator at Shivajinagar Metro Overpass verified operational by Pune Metro technical team.",
      });
    } catch (err) {
      console.error("Failed to resolve staff:", err);
    }
  }

  const inspectedRoute = ROUTES.find((r) => r.id === selectedImpactRouteId) || ROUTES[1];
  const inspectedBefore = beforeData[inspectedRoute.id];
  const inspectedAfter = afterData[inspectedRoute.id];
  const inspectedDelta = inspectedAfter.weightedScore - inspectedBefore.weightedScore;

  return (
    <main className="page fade-in-up" id="screen-disruption" role="tabpanel" aria-labelledby="tab-disruption">
      {/* ── Compact Header & Toolbar ── */}
      <div className="compact-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1>Disruption & Recovery</h1>
            <span className={`badge ${activeScenarioId !== "normal" ? "badge-danger" : "badge-primary"}`} style={{ fontSize: "0.72rem" }}>
              {activeScenario.label}
            </span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Simulate obstacles, observe mathematical PPT slide deltas, and test station staff overrides.
          </p>
        </div>

        {/* ── Dropdown Menus: Scenario + Position + Quick Actions ── */}
        <div className="compact-toolbar">
          {/* Scenario Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label htmlFor="disruption-scenario-select" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Scenario:
            </label>
            <select
              id="disruption-scenario-select"
              className="select-dropdown"
              value={activeScenarioId}
              onChange={(e) => handleScenarioChange(e.target.value)}
              aria-label="Active disruption scenario"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mid-Journey Position Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label htmlFor="disruption-stage-select" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              📍 Position:
            </label>
            <select
              id="disruption-stage-select"
              className="select-dropdown"
              value={currentStageIndex}
              onChange={(e) => onStageChange?.(Number(e.target.value))}
              aria-label="Mid-journey evaluation position"
            >
              {JOURNEY_STAGES.slice(0, 3).map((stg) => (
                <option key={stg.id} value={stg.stage}>
                  {stg.name} ({stg.progressPct}%)
                </option>
              ))}
            </select>
          </div>

          {/* Quick Staff Repair Button */}
          <button
            onClick={handleQuickStaffResolve}
            className="btn btn-primary"
            style={{ fontSize: "0.76rem", padding: "0.38rem 0.75rem" }}
            title="Station Staff mark Shivajinagar Metro Elevator operational"
          >
            ✅ Staff Fix Lift
          </button>

          {/* Reset All Disruptions */}
          {disruptions.length > 0 && onClearDisruptions && (
            <button
              onClick={onClearDisruptions}
              className="btn btn-ghost"
              style={{ fontSize: "0.76rem", padding: "0.38rem 0.65rem" }}
              title="Clear all active disruptions"
            >
              🔄 Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── Scenario Alert Info Bar ── */}
      <div
        style={{
          marginBottom: "0.65rem",
          padding: "0.45rem 0.85rem",
          background: activeScenarioId !== "normal" ? "rgba(255, 107, 107, 0.08)" : "var(--color-surface-2)",
          border: `1px solid ${activeScenarioId !== "normal" ? "rgba(255, 107, 107, 0.3)" : "var(--color-border)"}`,
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.78rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>{activeScenario.icon}</span>
          <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>
            {activeScenario.description} (Evaluated from {currentStage.name})
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", color: "var(--color-text-muted)" }}>
          {activeScenarioId !== "normal" && (
            <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>
              ETA Multiplier: ×{activeScenario.etaMultiplier} +{activeScenario.fixedDelay}m
            </span>
          )}
          <span>Recommended Alternative: <strong style={{ color: "var(--color-accent)" }}>{bestRouteAfter.shortName}</strong></span>
        </div>
      </div>

      {/* ── 2-Column Main Split View (Fits Viewport) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "1rem", alignItems: "start" }}>
        {/* Left Column: Route Impact Inspection & AI Briefing */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* Route Impact Card with Route Selector Dropdown */}
          <div className="card" style={{ borderColor: inspectedRoute.color }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <label htmlFor="impact-route-select" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  Inspect Route Impact:
                </label>
                <select
                  id="impact-route-select"
                  className="select-dropdown"
                  value={selectedImpactRouteId}
                  onChange={(e) => setSelectedImpactRouteId(e.target.value)}
                  style={{ padding: "0.35rem 2rem 0.35rem 0.65rem", fontSize: "0.8rem" }}
                >
                  {ROUTES.map((r) => {
                    const bScore = beforeData[r.id].weightedScore;
                    const aScore = afterData[r.id].weightedScore;
                    const d = aScore - bScore;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.shortName}: {bScore} → {aScore} ({d >= 0 ? `+${d}` : d})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Delta Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  {inspectedBefore.weightedScore} →
                </span>
                <span
                  style={{
                    background: inspectedDelta < 0 ? "rgba(255,107,107,0.18)" : "rgba(76,175,130,0.18)",
                    color: inspectedDelta < 0 ? "var(--color-danger)" : "var(--color-success)",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 800,
                    fontSize: "0.95rem",
                  }}
                >
                  {inspectedAfter.weightedScore} ({inspectedDelta >= 0 ? `+${inspectedDelta}` : inspectedDelta})
                </span>
              </div>
            </div>

            {/* Before vs After Factor Comparison */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", borderTop: "1px solid var(--color-border)", paddingTop: "0.6rem" }}>
              <div>
                <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "0.35rem" }}>
                  Pre-Disruption Baseline:
                </div>
                <ScoreBars factorScores={inspectedBefore.factorScores} />
              </div>
              <div>
                <div style={{ fontSize: "0.74rem", fontWeight: 700, color: inspectedDelta < 0 ? "var(--color-danger)" : "var(--color-accent)", marginBottom: "0.35rem" }}>
                  After Disruption Applied:
                </div>
                <ScoreBars factorScores={inspectedAfter.factorScores} />
              </div>
            </div>
          </div>

          {/* Quick Comparison of All 3 Routes */}
          <div className="card" style={{ padding: "0.65rem 0.85rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: "0.4rem" }}>
              Corridor Route Rankings from {currentStage.name}:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {ROUTES.map((route) => {
                const bScore = beforeData[route.id].weightedScore;
                const aScore = afterData[route.id].weightedScore;
                const d = aScore - bScore;
                const isTop = route.id === bestRouteAfter.id;
                const isBlocked = afterData[route.id].hasActiveBlocker;
                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedImpactRouteId(route.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${selectedImpactRouteId === route.id ? route.color : "var(--color-border)"}`,
                      background: selectedImpactRouteId === route.id ? `${route.color}15` : "var(--color-surface-2)",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: route.color }} />
                      <strong>{route.shortName}</strong>
                      {isTop && <span className="badge badge-success" style={{ fontSize: "0.65rem" }}>#1 Best</span>}
                      {isBlocked && <span className="badge badge-danger" style={{ fontSize: "0.65rem" }}>Blocked</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.74rem" }}>{bScore} →</span>
                      <strong style={{ color: d < 0 ? "var(--color-danger)" : route.color, fontSize: "0.85rem" }}>
                        {aScore}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Plain-Language Recovery Explanation */}
          <div
            className="card"
            style={{
              borderColor: "rgba(0, 212, 170, 0.35)",
              background: "rgba(0, 212, 170, 0.04)",
              padding: "0.75rem 0.95rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>🤖</span>
                <strong style={{ fontSize: "0.86rem", color: "var(--color-accent)" }}>
                  AI Detour Explanation
                </strong>
                {loadingAI && <div className="spinner" style={{ width: "14px", height: "14px" }} />}
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                Llama 3.1
              </span>
            </div>

            {loadingAI ? (
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Generating plain-language traveler advisory…
              </p>
            ) : explanation ? (
              <p style={{ fontSize: "0.82rem", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
                {explanation}
              </p>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Select a disruption scenario above to see the AI recovery briefing.
              </p>
            )}

            {aiError && (
              <div style={{ fontSize: "0.76rem", color: "var(--color-warning)", marginTop: "0.3rem" }}>
                ⚠️ {aiError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Central Disruption Store & Reporting Drawer */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* Active Central Disruptions Card */}
          <div className="card" style={{ padding: "0.75rem 0.95rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.55rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>🚨</span>
                <strong style={{ fontSize: "0.88rem" }}>
                  Central Disruption Store ({disruptions.length})
                </strong>
              </div>
              <button
                onClick={() => setShowReportForm(!showReportForm)}
                className="btn btn-primary"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}
              >
                {showReportForm ? "✕ Close Form" : "➕ Report Hazard"}
              </button>
            </div>

            {/* Active List */}
            {disruptions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.2rem 0.5rem", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                ✅ All Pune corridor segments clear. No active disruptions.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: "240px", overflowY: "auto" }}>
                {disruptions.map((d) => {
                  const isStaff = d.source === "station_staff";
                  const isCleared = d.status === "cleared";
                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: "0.45rem 0.65rem",
                        background: isCleared ? "rgba(52, 211, 153, 0.08)" : "var(--color-surface-2)",
                        border: `1px solid ${isStaff ? "rgba(56, 189, 248, 0.4)" : "var(--color-border)"}`,
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.78rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span>{d.hazardEmoji}</span>
                          <strong>{d.segmentName}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.62rem",
                              padding: "0.15rem 0.45rem",
                              background: isStaff ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 179, 71, 0.18)",
                              color: isStaff ? "#38BDF8" : "var(--color-warning)",
                            }}
                          >
                            {isStaff ? "STAFF (100%)" : "COMMUNITY (70%)"}
                          </span>
                          {onDeleteDisruption && (
                            <button
                              onClick={() => onDeleteDisruption(d.id)}
                              style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "0.8rem" }}
                              title="Delete report"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                        {d.hazardLabel} &bull; {d.note || "No notes"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Compact Dropdown-Driven Hazard Report Form */}
          {showReportForm && (
            <div
              className="card fade-in-up"
              style={{
                borderColor: "rgba(108, 99, 255, 0.4)",
                background: "var(--color-surface-2)",
                padding: "0.75rem 0.95rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.55rem" }}>
                Report New Disruption:
              </div>

              <form onSubmit={handleHazardReport} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {/* Segment Dropdown */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <label htmlFor="report-segment-select" style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                    Affected Corridor Segment:
                  </label>
                  <select
                    id="report-segment-select"
                    className="select-dropdown"
                    value={targetSegmentId}
                    onChange={(e) => setTargetSegmentId(e.target.value)}
                    style={{ fontSize: "0.78rem", padding: "0.35rem 2rem 0.35rem 0.65rem" }}
                  >
                    {SEGMENTS.map((seg) => (
                      <option key={seg.id} value={seg.id}>
                        {seg.name} ({seg.routeIds.join(", ")})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hazard Type Dropdown */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <label htmlFor="report-hazard-select" style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                    Hazard / Obstacle Type:
                  </label>
                  <select
                    id="report-hazard-select"
                    className="select-dropdown"
                    value={hazardType}
                    onChange={(e) => setHazardType(e.target.value)}
                    style={{ fontSize: "0.78rem", padding: "0.35rem 2rem 0.35rem 0.65rem" }}
                  >
                    {HAZARD_TYPES.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.emoji} {h.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source Authority & TTL in 2 Columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <label htmlFor="report-source-select" style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                      Reporting Source:
                    </label>
                    <select
                      id="report-source-select"
                      className="select-dropdown"
                      value={reportSource}
                      onChange={(e) => {
                        const src = e.target.value;
                        setReportSource(src);
                        setConfidence(src === "station_staff" ? "high" : "medium");
                        setTtlMinutes(src === "station_staff" ? 180 : 60);
                      }}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 2rem 0.35rem 0.65rem" }}
                    >
                      <option value="station_staff">Station Staff (Overrides)</option>
                      <option value="traveler">Community Traveler</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <label htmlFor="report-ttl-input" style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                      Expiry (Minutes):
                    </label>
                    <input
                      id="report-ttl-input"
                      type="number"
                      className="input"
                      value={ttlMinutes}
                      onChange={(e) => setTtlMinutes(e.target.value)}
                      min={5}
                      max={720}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
                    />
                  </div>
                </div>

                {/* Note */}
                <input
                  type="text"
                  className="input"
                  placeholder="Optional note / landmark details…"
                  value={hazardNote}
                  onChange={(e) => setHazardNote(e.target.value)}
                  style={{ fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
                />

                {/* Submit Row */}
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingHazard}
                    style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                  >
                    {submittingHazard ? "Posting…" : "🚨 Submit to Server Store"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReportForm(false)}
                    className="btn btn-ghost"
                    style={{ fontSize: "0.75rem", padding: "0.35rem 0.55rem" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
