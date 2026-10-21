import { useState, useMemo } from "react";
import ScoreBars from "../components/ScoreBars";
import {
  ROUTES, SCENARIOS,
  computeEta
} from "../data/routes";
import {
  SEGMENTS, JOURNEY_STAGES, evaluateMidJourneyRoute
} from "../data/segments";
import { fetchRecoveryExplanation } from "../api/client";

/**
 * Screen 3 – Disruption & Recovery (Compact Dashboard Layout)
 * Requirements:
 * 1. Mid-journey re-ranking from current position onward (no backtracking)
 * 2. Shared central disruption store on server
 * 3. Conflicting & expiring reports (Staff overrides traveler, auto-expiry, anti-thrashing threshold)
 * 4. Replayable event log as source of truth
 * 5. One-tap accept/reject route recovery
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

  // Hazard reporting form state
  const [targetSegmentId, setTargetSegmentId]   = useState("seg-metro-overpass");
  const [hazardType, setHazardType]             = useState("broken-lift");
  const [reportSource, setReportSource]         = useState("station_staff");
  const [confidence, setConfidence]             = useState("high");
  const [ttlMinutes, setTtlMinutes]             = useState(60);
  const [hazardNote, setHazardNote]             = useState("");
  const [submittingHazard, setSubmittingHazard] = useState(false);

  const activeScenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];
  const currentStage   = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Baseline data: clean route BEFORE any disruptions evaluated from current position
  const beforeData = useMemo(() => {
    return Object.fromEntries(
      ROUTES.map((r) => {
        const evalRes = evaluateMidJourneyRoute(
          r,
          currentStageIndex,
          [], // Clean pre-disruption baseline: 0 disruptions
          {}, // Clean pre-disruption baseline: 0 scenario deltas
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
      title: `Scenario Triggered: ${scenario.label}`,
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
      const recommendedRoute = ROUTES.reduce((best, r) =>
        freshAfterEvaluations[r.id].weightedScore > freshAfterEvaluations[best.id].weightedScore ? r : best
      , ROUTES[0]);

      const data = await fetchRecoveryExplanation({
        scenarioName: scenario.label,
        disruptedRouteName: "Accessible Main Corridor",
        recommendedRouteName: recommendedRoute.shortName,
        beforeScores,
        afterScores: freshAfterScores,
        userWeights: weights,
        disruptionReason: `${scenario.description} Evaluated from position: ${currentStage.name}.`,
      });

      setExplanation(data.explanation || "");

      onLogEvent?.({
        type: "ai",
        icon: "🤖",
        title: "AI Recovery Explanation Generated",
        detail: data.explanation?.slice(0, 120) + "…",
        snapshot: {
          stageIndex: currentStageIndex,
          scenarioId: id,
          explanation: data.explanation,
        },
      });
    } catch (e) {
      setAiError(e.message || "Failed to reach Ollama AI engine.");
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
        note: hazardNote,
        ttlMinutes,
      });
      setHazardNote("");
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
        note: "Elevator at Shivajinagar Metro Overpass verified repaired and operational by Pune Metro staff.",
      });
    } catch (err) {
      console.error("Failed to resolve staff:", err);
    }
  }

  return (
    <main className="page fade-in-up" id="screen-disruption" role="tabpanel" aria-labelledby="tab-disruption">
      {/* ── Compact Header & Controller ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.65rem" }}>
        <div>
          <h1 style={{ fontSize: "1.45rem", margin: 0, fontWeight: 800 }}>Disruption & Recovery</h1>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
            Simulate live obstacles &bull; Test dynamic mid-journey rerouting &bull; Station staff overrides
          </div>
        </div>

        {/* Mid-journey stage selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "var(--color-surface-2)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-sm)" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Position:</span>
          {JOURNEY_STAGES.slice(0, 3).map((stg) => (
            <button
              key={stg.id}
              onClick={() => onStageChange?.(stg.stage)}
              style={{
                padding: "0.2rem 0.55rem",
                borderRadius: "4px",
                fontSize: "0.74rem",
                fontWeight: stg.stage === currentStageIndex ? 700 : 500,
                border: "none",
                background: stg.stage === currentStageIndex ? "var(--color-primary)" : "transparent",
                color: stg.stage === currentStageIndex ? "#fff" : "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              {stg.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scenario Simulator Strip ── */}
      <div
        className="card"
        style={{
          padding: "0.6rem 0.85rem",
          marginBottom: "0.85rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Simulate Scenario:
        </span>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          {SCENARIOS.map((s) => {
            const isActive = activeScenarioId === s.id;
            return (
              <button
                key={s.id}
                id={`scenario-btn-${s.id}`}
                onClick={() => handleScenarioChange(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: `1.5px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: isActive ? "rgba(108,99,255,0.18)" : "var(--color-surface-2)",
                  color: isActive ? "var(--color-primary-light)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  fontWeight: isActive ? 700 : 500,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── AI Recovery Explanation (if active) ── */}
      {activeScenarioId !== "normal" && (
        <div
          className="card"
          style={{
            padding: "0.75rem 0.95rem",
            marginBottom: "0.85rem",
            borderColor: "rgba(0,212,170,0.3)",
            background: "rgba(0,212,170,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
            <span>🤖</span>
            <strong style={{ fontSize: "0.85rem", color: "var(--color-accent)" }}>
              AI Recovery Explanation (Llama 3.1 8B):
            </strong>
            {loadingAI && <div className="spinner" style={{ width: "16px", height: "16px" }} />}
          </div>
          {loadingAI ? (
            <div className="skeleton" style={{ height: "14px", width: "80%" }} />
          ) : explanation ? (
            <p style={{ fontSize: "0.84rem", lineHeight: 1.5, color: "var(--color-text-secondary)", margin: 0 }}>
              {explanation}
            </p>
          ) : aiError ? (
            <p style={{ fontSize: "0.78rem", color: "var(--color-warning)", margin: 0 }}>⚠️ {aiError}</p>
          ) : null}
        </div>
      )}

      {/* ── 2-Column Responsive Split Layout ── */}
      <div className="grid-2" style={{ gap: "1.15rem", alignItems: "start" }}>
        {/* Left Column: Route Comparison (Before -> After) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted)" }}>
              Route Evaluation from {currentStage.name}
            </span>
            {activeScenarioId !== "normal" ? (
              <span className="badge badge-danger" style={{ fontSize: "0.65rem" }}>{activeScenario?.label}</span>
            ) : disruptions.length > 0 ? (
              <span className="badge badge-warning" style={{ fontSize: "0.65rem" }}>{disruptions.length} Central Disruption(s)</span>
            ) : (
              <span className="badge badge-primary" style={{ fontSize: "0.65rem" }}>Normal Baseline</span>
            )}
          </div>

          {/* 3 Routes Before vs After */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {ROUTES.map((route) => {
              const before = beforeData[route.id];
              const after  = afterData[route.id];
              const delta  = after.weightedScore - before.weightedScore;
              const isBest = route.id === bestRouteAfter.id;
              const eta    = computeEta(route.baseEtaMin, activeScenario);

              return (
                <div
                  key={route.id}
                  className="card"
                  style={{
                    padding: "0.75rem 0.85rem",
                    borderColor: isBest ? `${route.color}99` : undefined,
                    background: isBest ? "var(--color-surface-2)" : "var(--color-surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: route.color, flexShrink: 0 }} />
                      <strong style={{ fontSize: "0.88rem" }}>{route.shortName}</strong>
                      {isBest && <span className="badge badge-success" style={{ fontSize: "0.62rem" }}>✓ #1 Recommended</span>}
                      {after.hasActiveBlocker && <span className="badge badge-danger" style={{ fontSize: "0.62rem" }}>🚫 Blocked</span>}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "0.76rem", color: "var(--color-text-muted)" }}>
                        ~{after.remainingEtaMin}m ({eta}m total)
                      </span>
                      {delta !== 0 && (
                        <span
                          style={{
                            fontWeight: 800, fontSize: "0.9rem",
                            color: delta < 0 ? "var(--color-danger)" : "var(--color-success)"
                          }}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Compact score transition bar */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: "0.35rem 0.55rem", borderRadius: "4px" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Before</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>{before.weightedScore}</div>
                    </div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>➔</div>
                    <div style={{
                      background: after.weightedScore < before.weightedScore ? "rgba(255,107,107,0.1)" : "rgba(76,175,130,0.1)",
                      padding: "0.35rem 0.55rem", borderRadius: "4px"
                    }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>After</div>
                      <div style={{
                        fontSize: "1.2rem", fontWeight: 800,
                        color: after.weightedScore < before.weightedScore ? "var(--color-danger)" : after.weightedScore > before.weightedScore ? "var(--color-success)" : "inherit"
                      }}>
                        {after.weightedScore}
                      </div>
                    </div>
                  </div>

                  {/* Slide 8 Math Callout */}
                  {route.id === "accessible-main" && activeScenarioId === "barrier-blocked" && (
                    <div
                      style={{
                        marginTop: "0.45rem", padding: "0.4rem 0.65rem",
                        background: "rgba(255,107,107,0.08)", borderRadius: "var(--radius-sm)",
                        borderLeft: "3px solid var(--color-danger)", fontSize: "0.76rem", color: "var(--color-danger)"
                      }}
                    >
                      🛗 <strong>Slide 8 PPT Match:</strong> Elevator failure dropped Route B Access <strong>96 → 38</strong>. Total score dropped <strong>85 → 65</strong>. Route C (Quiet Backup, <strong>Score: 83, 34 min</strong>) promoted to 🥇 #1.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Central Disruption Store Console */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* Disruption Report Form */}
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>🚨 Central Disruption Store Console</span>
              <span className="badge badge-primary" style={{ fontSize: "0.65rem" }}>Server-Synced</span>
            </div>

            <form onSubmit={handleHazardReport} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.2rem" }}>
                  Corridor Segment
                </label>
                <select
                  className="input"
                  value={targetSegmentId}
                  onChange={(e) => setTargetSegmentId(e.target.value)}
                  style={{ fontSize: "0.82rem", padding: "0.4rem 0.6rem" }}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.hasElevator ? "Elevator" : s.hasBarriers ? "Stairs" : "Step-Free"})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.2rem" }}>
                    Source Authority
                  </label>
                  <select
                    className="input"
                    value={reportSource}
                    onChange={(e) => {
                      const src = e.target.value;
                      setReportSource(src);
                      setConfidence(src === "station_staff" ? "high" : "medium");
                      setTtlMinutes(src === "station_staff" ? 180 : 60);
                    }}
                    style={{ fontSize: "0.82rem", padding: "0.4rem 0.6rem" }}
                  >
                    <option value="station_staff">👮 Staff (Authoritative)</option>
                    <option value="traveler">👤 Traveler Community</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.2rem" }}>
                    Hazard Type
                  </label>
                  <select
                    className="input"
                    value={hazardType}
                    onChange={(e) => setHazardType(e.target.value)}
                    style={{ fontSize: "0.82rem", padding: "0.4rem 0.6rem" }}
                  >
                    <option value="broken-lift">🛗 Broken Lift (-58)</option>
                    <option value="broken-ramp">🔧 Broken Ramp (-25)</option>
                    <option value="flooded-path">💧 Flooded Footpath (-20)</option>
                    <option value="construction">🚧 Construction (-30)</option>
                    <option value="missing-curb">⚠️ Missing Curb (-20)</option>
                    <option value="blocked-ramp">🚫 Blocked Ramp (-25)</option>
                  </select>
                </div>
              </div>

              <div>
                <input
                  className="input"
                  placeholder="Optional note: e.g. 'Elevator undergoing electrical inspection'..."
                  value={hazardNote}
                  onChange={(e) => setHazardNote(e.target.value)}
                  style={{ fontSize: "0.82rem", padding: "0.4rem 0.6rem" }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.2rem" }}>
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={submittingHazard}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                >
                  {submittingHazard ? "Publishing…" : "📍 Report Obstacle"}
                </button>
                <button
                  type="button"
                  onClick={handleQuickStaffResolve}
                  className="btn btn-primary"
                  style={{ background: "#238636", borderColor: "#2ea043", fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                  title="Station staff marks elevator operational"
                >
                  🛠️ Staff Fix
                </button>
              </div>
            </form>
          </div>

          {/* Active Disruptions List */}
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>Active Central Reports</span>
                <div className="live-dot" />
                <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                  ({disruptions.length})
                </span>
              </div>
              {disruptions.length > 0 && onClearDisruptions && (
                <button
                  onClick={onClearDisruptions}
                  style={{
                    background: "none", border: "none", color: "var(--color-warning)",
                    cursor: "pointer", fontSize: "0.72rem", textDecoration: "underline"
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {disruptions.length === 0 ? (
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", textAlign: "center", padding: "1rem 0" }}>
                No active obstacles. All segments operating normally. ✨
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "190px", overflowY: "auto" }}>
                {disruptions.map((h) => {
                  const isStaff = h.source === "station_staff";
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.4rem 0.6rem",
                        background: isStaff ? "rgba(56, 189, 248, 0.08)" : "var(--color-surface-2)",
                        borderRadius: "4px",
                        border: isStaff ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid var(--color-border)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                        <span style={{ fontSize: "1.1rem" }}>{h.hazardEmoji}</span>
                        <div>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: isStaff ? "#38BDF8" : "inherit" }}>
                            {h.hazardLabel} &bull; <span style={{ fontWeight: 400, opacity: 0.8 }}>{h.segmentName || h.segmentId}</span>
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>
                            {isStaff ? "👮 Staff Verified" : "👤 Traveler"} &bull; Exp: {new Date(h.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>

                      {onDeleteDisruption && (
                        <button
                          onClick={() => onDeleteDisruption(h.id)}
                          style={{
                            background: "none", border: "none", color: "var(--color-text-muted)",
                            cursor: "pointer", fontSize: "0.75rem", padding: "0.2rem"
                          }}
                          title="Dismiss report"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
