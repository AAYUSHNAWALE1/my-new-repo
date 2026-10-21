import { useState, useMemo, useEffect } from "react";
import ScoreBars from "../components/ScoreBars";
import {
  ROUTES, SCENARIOS, HAZARD_TYPES, computeWeightedScore,
  computeEta
} from "../data/routes";
import {
  SEGMENTS, JOURNEY_STAGES, SWITCHING_THRESHOLD, evaluateMidJourneyRoute
} from "../data/segments";
import { fetchRecoveryExplanation } from "../api/client";

/**
 * Screen 3 – Disruption & Recovery
 * Requirements:
 * 1. Mid-journey re-ranking from current position onward (no backtracking)
 * 2. Shared central disruption store on server
 * 3. Conflicting & expiring reports (Staff overrides traveler, auto-expiry, anti-thrashing threshold)
 * 4. Replayable event log as source of truth
 * 5. Hands-free audio announcement + 1-tap accept/reject
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
  onSuggestRouteChange,
}) {
  const [activeScenarioId, setActiveScenarioId] = useState("normal");
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

  const activeScenario = SCENARIOS.find((s) => s.id === activeScenarioId);
  const currentStage   = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Baseline data: evaluated from current position
  const beforeData = useMemo(() => {
    return Object.fromEntries(
      ROUTES.map((r) => {
        const evalRes = evaluateMidJourneyRoute(
          r,
          currentStageIndex,
          disruptions,
          {},
          weights
        );
        return [r.id, evalRes];
      })
    );
  }, [weights, disruptions, currentStageIndex]);

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

  // Check if route recommendation changed and exceeds switching threshold
  useEffect(() => {
    if (activeScenarioId === "normal") return;

    const currentRoute = ROUTES.find((r) => r.id === activeRouteId) || ROUTES[1];
    const newTopRoute = bestRouteAfter;

    // Check if new route beats current route significantly (or current route is blocked)
    const scoreDiff = afterData[newTopRoute.id].weightedScore - afterData[currentRoute.id].weightedScore;
    const currentIsBlocked = afterData[currentRoute.id].hasActiveBlocker;

    if (newTopRoute.id !== currentRoute.id && (scoreDiff >= SWITCHING_THRESHOLD || currentIsBlocked)) {
      const reason = currentIsBlocked
        ? `Physical blocker / lift failure detected on ${currentRoute.shortName}. Score dropped to ${afterData[currentRoute.id].weightedScore}.`
        : `${newTopRoute.shortName} score (${afterData[newTopRoute.id].weightedScore}) outperforms ${currentRoute.shortName} (${afterData[currentRoute.id].weightedScore}) by ${scoreDiff} points (threshold: ${SWITCHING_THRESHOLD}).`;

      onSuggestRouteChange?.({
        currentRoute,
        newRoute: newTopRoute,
        reason,
        oldScore: afterData[currentRoute.id].weightedScore,
        newScore: afterData[newTopRoute.id].weightedScore,
      });
    }
  }, [activeScenarioId, bestRouteAfter, afterData, activeRouteId, onSuggestRouteChange]);

  async function handleScenarioChange(id) {
    setActiveScenarioId(id);
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
      const freshAfterScores = Object.fromEntries(
        ROUTES.map((r) => [r.shortName, afterData[r.id].weightedScore])
      );
      const result = await fetchRecoveryExplanation(
        scenario.label,
        bestRouteAfter.shortName,
        beforeScores,
        freshAfterScores,
        currentStage.name
      );
      const expl = result.explanation || "";
      setExplanation(expl);
      onLogEvent?.({
        type: "ai",
        icon: "🤖",
        title: `AI Plain-Language Recovery (${result.provider || "local"})`,
        detail: expl,
        snapshot: {
          stageIndex: currentStageIndex,
          activeRouteId,
          recommendedRouteId: bestRouteAfter.id,
          weights,
          disruptions,
          explanation: expl,
        },
      });
    } catch (e) {
      const msg = `AI explanation unavailable (${e.message}).`;
      setAiError(msg);
    } finally {
      setLoadingAI(false);
    }
  }

  async function handleHazardReport(e) {
    e.preventDefault();
    if (!targetSegmentId || !hazardType) return;

    setSubmittingHazard(true);
    try {
      const segment = SEGMENTS.find((s) => s.id === targetSegmentId);
      const res = await onReportDisruption?.({
        segmentId: targetSegmentId,
        hazardType,
        source: reportSource,
        confidence,
        status: "active",
        note: hazardNote || (reportSource === "station_staff" ? "Official station staff notice" : "Traveler report"),
        ttlMinutes: Number(ttlMinutes),
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
        note: "Elevator at Shivajinagar Metro Overpass verified operational by Pune Metro technical team.",
      });
    } catch (err) {
      console.error("Failed to resolve staff:", err);
    }
  }

  return (
    <main className="page fade-in-up" id="screen-disruption" role="tabpanel" aria-labelledby="tab-disruption">
      <div className="page-header">
        <h1>Disruption & Recovery</h1>
        <p>
          Simulate urban disruptions, test mid-journey re-ranking without backtracking,
          and witness central station staff overrides and one-tap route recovery.
        </p>
      </div>

      {/* ── Mid-Journey Position & Stage Selection (Requirement 1) ── */}
      <div
        className="card"
        style={{
          marginBottom: "1.25rem",
          borderColor: "rgba(108,99,255,0.3)",
          background: "rgba(108,99,255,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🚶</span>
            <div>
              <strong style={{ fontSize: "0.95rem" }}>Simulate Mid-Journey Disruption Point:</strong>
              <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                Current traveler position: <strong>{currentStage.name}</strong> ({currentStage.progressPct}%)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.4rem" }}>
            {JOURNEY_STAGES.slice(0, 3).map((stg) => (
              <button
                key={stg.id}
                onClick={() => onStageChange?.(stg.stage)}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  fontWeight: stg.stage === currentStageIndex ? 700 : 500,
                  border: stg.stage === currentStageIndex ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                  background: stg.stage === currentStageIndex ? "var(--color-primary)" : "var(--color-surface-2)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {stg.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scenario selector ── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Disruption Scenario Simulator</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              id={`scenario-btn-${s.id}`}
              className={`scenario-btn${activeScenarioId === s.id ? " active" : ""}`}
              onClick={() => handleScenarioChange(s.id)}
            >
              <span className="scenario-icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {activeScenario && (
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.6rem 0.85rem",
              background: "var(--color-surface-2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              color: "var(--color-text-secondary)",
              borderLeft: "3px solid var(--color-primary)",
            }}
          >
            {activeScenario.icon} {activeScenario.description}
            {activeScenarioId !== "normal" && (
              <span style={{ marginLeft: "1rem", color: "var(--color-warning)", fontWeight: 600 }}>
                ⏱ ETA Multiplier: ×{activeScenario.etaMultiplier} +{activeScenario.fixedDelay} min
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── AI Recovery Explanation ── */}
      {activeScenarioId !== "normal" && (
        <div className="card" style={{ marginBottom: "1.5rem", borderColor: "rgba(0,212,170,0.3)", background: "rgba(0,212,170,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <span>🤖</span>
            <h3>AI Recovery Explanation (From Current Position)</h3>
            {loadingAI && <div className="spinner" />}
          </div>
          {loadingAI && (
            <>
              <div className="skeleton" style={{ height: "16px", marginBottom: "0.5rem", width: "90%" }} />
              <div className="skeleton" style={{ height: "16px", width: "70%" }} />
            </>
          )}
          {!loadingAI && explanation && (
            <p style={{ fontSize: "0.92rem", lineHeight: 1.75, color: "var(--color-text-secondary)" }}>
              {explanation}
            </p>
          )}
          {!loadingAI && aiError && (
            <p style={{ fontSize: "0.85rem", color: "var(--color-warning)" }}>⚠️ {aiError}</p>
          )}
        </div>
      )}

      {/* ── Before / After score comparison (Slide 8 Math) ── */}
      <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        Route Evaluation from {currentStage.name}
        {activeScenarioId !== "normal" ? (
          <span className="badge badge-danger">{activeScenario?.label}</span>
        ) : (
          <span className="badge badge-primary">Baseline + Central Disruptions</span>
        )}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
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
              style={{ borderColor: isBest ? `${route.color}88` : undefined }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: route.color, flexShrink: 0 }} />
                  <strong style={{ fontSize: "0.97rem" }}>{route.name}</strong>
                  {isBest && <span className="badge badge-success">✓ Recommended</span>}
                  {route.hasBarriers && <span className="badge badge-danger" style={{ fontSize: "0.65rem" }}>⚠️ Stairs/Curbs</span>}
                  {after.hasActiveBlocker && <span className="badge badge-danger" style={{ fontSize: "0.65rem" }}>🚫 Blocked Leg</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                    Remaining: ~{after.remainingEtaMin} min (Total: ~{eta} min)
                  </span>
                  {activeScenarioId !== "normal" && (
                    <span
                      style={{
                        fontWeight: 800, fontSize: "1rem",
                        color: delta < 0 ? "var(--color-danger)" : delta > 0 ? "var(--color-success)" : "var(--color-text-muted)"
                      }}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              </div>

              {/* Before / After columns */}
              <div className="compare-grid">
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Before Disruption
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
                    {before.weightedScore}
                  </div>
                  <ScoreBars scores={before.factorScores} compact />
                </div>
                <div className="compare-arrow">→</div>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    After Disruption
                  </div>
                  <div
                    style={{
                      fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem",
                      color: after.weightedScore < before.weightedScore
                        ? "var(--color-danger)"
                        : after.weightedScore > before.weightedScore
                          ? "var(--color-success)"
                          : "var(--color-text-primary)"
                    }}
                  >
                    {after.weightedScore}
                  </div>
                  <ScoreBars scores={after.factorScores} compact />
                </div>
              </div>

              {/* Slide 8 Exact Math Callout */}
              {route.id === "accessible-main" && activeScenarioId === "barrier-blocked" && (
                <div
                  style={{
                    marginTop: "0.85rem", padding: "0.6rem 0.85rem",
                    background: "rgba(255,107,107,0.08)", borderRadius: "var(--radius-sm)",
                    borderLeft: "3px solid var(--color-danger)", fontSize: "0.82rem", color: "var(--color-danger)"
                  }}
                >
                  🛗 <strong>Slide 8 PPT Match:</strong> Elevator failure on Metro Overpass dropped Route B Access from <strong>96 → 38</strong>. Total score dropped from <strong>85 → 65</strong>. Route C (Quiet Backup, <strong>Score: 83, 34 min</strong>) promoted to 🥇 #1.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Central Disruption Reporting & Staff Override Console (Requirements 2 & 3) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "1.25rem", marginBottom: "2rem" }}>
        {/* Report Form */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>🚨 Central Disruption Store Console</h3>
            <span className="badge badge-primary">Requirements 2 & 3</span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "1rem" }}>
            Reports are stored centrally on the Express server. <strong>Station staff reports strictly override traveler reports</strong>, and expired reports automatically cease affecting route scores.
          </p>

          <form onSubmit={handleHazardReport} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Target Segment */}
            <div>
              <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                Target Corridor Segment
              </label>
              <select
                className="input"
                value={targetSegmentId}
                onChange={(e) => setTargetSegmentId(e.target.value)}
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", cursor: "pointer" }}
              >
                {SEGMENTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.hasElevator ? "Has Elevator" : s.hasBarriers ? "Stairs/Curbs" : "Step-Free"})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {/* Report Source (Requirement 3: Staff vs Traveler) */}
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                  Report Source (Staff Overrides)
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
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <option value="station_staff">👮 Station Staff (Authoritative)</option>
                  <option value="traveler">👤 Traveler Community</option>
                </select>
              </div>

              {/* Hazard Type */}
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                  Hazard Type
                </label>
                <select
                  className="input"
                  value={hazardType}
                  onChange={(e) => setHazardType(e.target.value)}
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <option value="broken-lift">🛗 Elevator / Lift Failure (-58 Access)</option>
                  <option value="broken-ramp">🔧 Broken Ramp (-25 Access)</option>
                  <option value="flooded-path">💧 Flooded Footpath (-20 Access)</option>
                  <option value="construction">🚧 Construction Blockade (-30 Access)</option>
                  <option value="missing-curb">⚠️ Missing Curb Cut (-20 Access)</option>
                  <option value="blocked-ramp">🚫 Ramp Blocked (-25 Access)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {/* Expiration TTL */}
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                  Report Expiry TTL
                </label>
                <select
                  className="input"
                  value={ttlMinutes}
                  onChange={(e) => setTtlMinutes(Number(e.target.value))}
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <option value={15}>15 Minutes (Temporary)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour (Standard)</option>
                  <option value={180}>3 Hours (Extended)</option>
                </select>
              </div>

              {/* Confidence */}
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                  Confidence Level
                </label>
                <select
                  className="input"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <option value="high">High Confidence</option>
                  <option value="medium">Medium Confidence</option>
                  <option value="low">Low Confidence</option>
                </select>
              </div>
            </div>

            {/* Note input */}
            <div>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Specific operational note or location detail..."
                value={hazardNote}
                onChange={(e) => setHazardNote(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="submit"
                className="btn btn-accent"
                disabled={submittingHazard}
                style={{ flex: 1 }}
              >
                {submittingHazard ? "Publishing to Central Server…" : "📍 Publish Central Disruption"}
              </button>

              {/* Station Staff Quick Resolution Button */}
              <button
                type="button"
                onClick={handleQuickStaffResolve}
                className="btn btn-primary"
                style={{ background: "#238636", borderColor: "#2ea043" }}
                title="Station staff marks the Shivajinagar elevator repaired, overriding traveler reports"
              >
                🛠️ Staff: Mark Elevator Fixed
              </button>
            </div>
          </form>
        </div>

        {/* Live Central Store Disruption Feed */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h3>Active Central Reports</h3>
              <div className="live-dot" />
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {disruptions.length} active
              </span>
            </div>
            {disruptions.length > 0 && onClearDisruptions && (
              <button
                onClick={onClearDisruptions}
                className="btn btn-secondary"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              >
                Clear All
              </button>
            )}
          </div>

          {disruptions.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textAlign: "center", padding: "2.5rem 0" }}>
              No active disruptions on the central server.<br />
              All corridor segments are running at baseline! ✨
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "320px", overflowY: "auto" }}>
              {disruptions.map((h) => {
                const isStaff = h.source === "station_staff";
                const isCleared = h.status === "cleared";

                return (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      gap: "0.65rem",
                      alignItems: "flex-start",
                      padding: "0.65rem",
                      background: isStaff ? "rgba(56, 189, 248, 0.08)" : "var(--color-surface-2)",
                      borderRadius: "var(--radius-sm)",
                      border: isStaff ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid var(--color-border)",
                    }}
                  >
                    <span style={{ fontSize: "1.3rem" }}>{h.hazardEmoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <strong style={{ fontSize: "0.85rem", color: isStaff ? "#38BDF8" : "inherit" }}>
                          {h.hazardLabel}
                        </strong>
                        <span className={`badge ${isStaff ? "badge-primary" : "badge-secondary"}`} style={{ fontSize: "0.65rem" }}>
                          {isStaff ? "👮 Staff Override" : "👤 Traveler"}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.76rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                        Segment: <strong>{h.segmentName || h.segmentId}</strong> &bull; Confidence: {h.confidence}
                      </div>

                      {h.note && (
                        <div style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.25rem", fontStyle: "italic" }}>
                          "{h.note}"
                        </div>
                      )}

                      <div style={{ fontSize: "0.72rem", color: "#8b949e", marginTop: "0.3rem" }}>
                        Expires at: {new Date(h.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ({h.ttlMinutes}m TTL)
                      </div>
                    </div>

                    {onDeleteDisruption && (
                      <button
                        onClick={() => onDeleteDisruption(h.id)}
                        className="btn btn-secondary"
                        style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                        title="Dismiss"
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
    </main>
  );
}
