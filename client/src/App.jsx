import { useState, useCallback, useEffect, useRef } from "react";
import NavBar from "./components/NavBar";
import PlanProfileScreen from "./screens/PlanProfileScreen";
import JourneyMapScreen from "./screens/JourneyMapScreen";
import DisruptionRecoveryScreen from "./screens/DisruptionRecoveryScreen";
import EventLog from "./components/EventLog";
import HandsFreePrompt from "./components/HandsFreePrompt";
import { DEFAULT_WEIGHTS, ROUTES, SCENARIOS } from "./data/routes";
import { JOURNEY_STAGES, SWITCHING_THRESHOLD, evaluateMidJourneyRoute } from "./data/segments";
import {
  fetchDisruptions,
  reportDisruption,
  resolveSegmentStaff,
  deleteDisruption,
  clearAllDisruptions,
} from "./api/client";

function ts() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Root Application Component
 * 1. Mid-journey re-ranking state & position tracking
 * 2. Shared central disruption state with 2.5s multi-window sync
 * 3. Conflicting & expiring reports handling (Staff overrides traveler)
 * 4. Replayable event log as formal source of truth
 * 5. Route change audio announcement & 1-tap recovery modal
 */
export default function App() {
  const [activeScreen, setActiveScreen]             = useState("plan");
  const [currentStageIndex, setCurrentStageIndex]   = useState(0); // 0: Station, 1: Junction, 2: FC Rd, 3: FC Gate
  const [activeRouteId, setActiveRouteId]           = useState("accessible-main");
  const [weights, setWeights]                       = useState(DEFAULT_WEIGHTS);
  const [eventLog, setEventLog]                     = useState([]);
  const [disruptions, setDisruptions]               = useState([]);
  const [activeScenarioId, setActiveScenarioId]     = useState("normal");

  // Active success toast notification (e.g. after accepting route)
  const [activeBanner, setActiveBanner]             = useState(null);

  // Hands-free recovery suggestion modal state
  const [handsFreeSuggestion, setHandsFreeSuggestion] = useState(null);

  // Time-machine replay state (Requirement 4)
  const [isReplaying, setIsReplaying]               = useState(false);
  const [replayIndex, setReplayIndex]               = useState(0);

  // Track dismissed route IDs to avoid re-prompting immediately if rejected
  const dismissedRouteRef = useRef(null);

  /**
   * Append an entry to the shared event log with a deterministic state snapshot.
   * Requirement 4: Replaying the log reproduces exact route rankings and state.
   */
  const handleLogEvent = useCallback(
    (entry) => {
      const fullSnapshot = {
        stageIndex: currentStageIndex,
        activeRouteId,
        weights: { ...weights },
        disruptions: [...disruptions],
        ...entry.snapshot,
      };

      setEventLog((prev) => [
        ...prev,
        {
          ...entry,
          id: Date.now() + Math.random(),
          timestamp: ts(),
          snapshot: fullSnapshot,
        },
      ]);
    },
    [currentStageIndex, activeRouteId, weights, disruptions]
  );

  // Fetch central disruptions from server
  const loadDisruptions = useCallback(async () => {
    try {
      const data = await fetchDisruptions();
      const newDisruptions = data.disruptions || [];
      setDisruptions((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(newDisruptions)) {
          return prev;
        }
        dismissedRouteRef.current = null;
        return newDisruptions;
      });
    } catch {
      // Server offline in dev
    }
  }, []);

  // Poll server for disruptions every 2.5 seconds for instant multi-window sync
  useEffect(() => {
    loadDisruptions();
    const timer = setInterval(loadDisruptions, 2500);
    return () => clearInterval(timer);
  }, [loadDisruptions]);

  const activeScenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  // ── Global Multi-Window Reroute Monitor (Requirement 2 & 5) ─────────────────
  // Whenever central disruptions or active scenario update, evaluate if the
  // traveler's active route is compromised and trigger Route Recovery Modal!
  useEffect(() => {
    if (isReplaying) return;

    const evaluations = ROUTES.map((r) => {
      const evalRes = evaluateMidJourneyRoute(
        r,
        currentStageIndex,
        disruptions,
        activeScenario.scoreDeltas[r.id] || {},
        weights
      );
      return { route: r, ...evalRes };
    });

    const activeEval = evaluations.find((e) => e.route.id === activeRouteId) || evaluations[1];
    const topEval = [...evaluations].sort((a, b) => b.weightedScore - a.weightedScore)[0];

    // If top route beats active route significantly or active route has an obstacle
    if (topEval && topEval.route.id !== activeRouteId) {
      const scoreDiff = topEval.weightedScore - activeEval.weightedScore;
      const isBlocked = activeEval.hasActiveBlocker;

      if (scoreDiff >= SWITCHING_THRESHOLD || isBlocked) {
        const suggestionKey = `${activeEval.route.id}->${topEval.route.id}`;
        if (dismissedRouteRef.current !== suggestionKey && (!handsFreeSuggestion || handsFreeSuggestion.newRoute.id !== topEval.route.id)) {
          const reason = isBlocked
            ? `Critical obstacle / lift failure detected on ${activeEval.route.shortName}. Score dropped to ${activeEval.weightedScore}.`
            : `${topEval.route.shortName} (Score: ${topEval.weightedScore}) outperforms ${activeEval.route.shortName} (Score: ${activeEval.weightedScore}) by ${scoreDiff} points.`;

          setHandsFreeSuggestion({
            currentRoute: activeEval.route,
            newRoute: topEval.route,
            reason,
            oldScore: activeEval.weightedScore,
            newScore: topEval.weightedScore,
          });
        }
      }
    } else {
      // If traveler is already on top route, dismiss any pending suggestion for this route
      if (handsFreeSuggestion && handsFreeSuggestion.newRoute.id === activeRouteId) {
        setHandsFreeSuggestion(null);
      }
    }
  }, [disruptions, currentStageIndex, activeRouteId, weights, isReplaying, activeScenario, handsFreeSuggestion]);

  // Handle mid-journey stage position changes
  const handleStageChange = useCallback(
    (newStageIndex) => {
      setCurrentStageIndex(newStageIndex);
      const stage = JOURNEY_STAGES[newStageIndex] || JOURNEY_STAGES[0];

      handleLogEvent({
        type: "navigation",
        icon: "📍",
        title: `Traveler Advanced: ${stage.name} (${stage.progressPct}%)`,
        detail: stage.completedSegmentIds.length > 0
          ? `Completed leg (${stage.completedSegmentIds.join(", ")}) locked out. Re-ranking evaluated only from ${stage.name} forward. Backtracking forbidden.`
          : `At journey origin.`,
        snapshot: { stageIndex: newStageIndex },
      });
    },
    [handleLogEvent]
  );

  // Report a disruption to central server
  const handleReportDisruption = useCallback(
    async (payload) => {
      const result = await reportDisruption(payload);
      const created = result.disruption;
      setDisruptions(result.activeDisruptions || [created, ...disruptions]);

      const isStaff = created.source === "station_staff";
      handleLogEvent({
        type: isStaff ? "staff" : "hazard",
        icon: created.hazardEmoji,
        title: isStaff
          ? `Station Staff Override: ${created.hazardLabel} on ${created.segmentName}`
          : `Traveler Hazard Logged: ${created.hazardLabel} on ${created.segmentName}`,
        detail: `${isStaff ? "High-confidence staff directive." : "Community traveler report."} Affected routes penalised. Expiry: ${created.ttlMinutes}m. Note: ${created.note || "None"}`,
      });

      return created;
    },
    [disruptions, handleLogEvent]
  );

  // Station staff resolution override (Requirement 3)
  const handleResolveStaff = useCallback(
    async (payload) => {
      const result = await resolveSegmentStaff(payload);
      setDisruptions(result.activeDisruptions || []);

      handleLogEvent({
        type: "staff",
        icon: "✅",
        title: `Station Staff Resolution: ${payload.segmentId} Fixed`,
        detail: `Verified operational by station staff. Conflicting traveler obstacle reports suppressed. Anti-thrashing threshold (+5 pts) applied to prevent oscillation.`,
      });
    },
    [handleLogEvent]
  );

  // Clear all disruptions (demo reset)
  const handleClearDisruptions = useCallback(async () => {
    try {
      await clearAllDisruptions();
      setDisruptions([]);
      setHandsFreeSuggestion(null);
      dismissedRouteRef.current = null;
      handleLogEvent({
        type: "scenario",
        icon: "🔄",
        title: "Central Disruption Store Cleared",
        detail: "All obstacles and reports removed. All Pune corridor segments restored to baseline.",
      });
    } catch (err) {
      console.error("Failed to clear disruptions:", err);
    }
  }, [handleLogEvent]);

  // Remove a single disruption
  const handleDeleteDisruption = useCallback(
    async (id) => {
      try {
        await deleteDisruption(id);
        setDisruptions((prev) => prev.filter((d) => d.id !== id));
        handleLogEvent({
          type: "scenario",
          icon: "🗑️",
          title: "Disruption Dismissed",
          detail: "Report was manually dismissed from the central server.",
        });
      } catch (err) {
        console.error("Failed to delete disruption:", err);
      }
    },
    [handleLogEvent]
  );

  // Handle profile / weights change cleanly
  const handleWeightsChange = useCallback((newWeights) => {
    setWeights(newWeights);
    // Find best baseline route for this new profile
    const bestRoute = ROUTES.reduce((best, r) => {
      const score = Math.round(
        Object.entries(newWeights).reduce((sum, [k, w]) => sum + (r.scores[k] ?? 0) * w, 0)
      );
      const bestScore = Math.round(
        Object.entries(newWeights).reduce((sum, [k, w]) => sum + (best.scores[k] ?? 0) * w, 0)
      );
      return score > bestScore ? r : best;
    }, ROUTES[0]);

    setActiveRouteId(bestRoute.id);
    setActiveScenarioId("normal");
    setHandsFreeSuggestion(null);
    dismissedRouteRef.current = null;
  }, []);

  // ── Hands-Free Recovery Actions (Requirement 5) ─────────────────────────────
  const handleAcceptSuggestion = useCallback(() => {
    if (!handsFreeSuggestion) return;
    const { newRoute, currentRoute } = handsFreeSuggestion;

    setActiveRouteId(newRoute.id);
    setHandsFreeSuggestion(null);
    dismissedRouteRef.current = null;

    // Automatically navigate to Journey & Map screen so user sees the new route highlighted!
    setActiveScreen("journey");

    setActiveBanner({
      type: "success",
      title: `✓ Switched to ${newRoute.shortName}!`,
      message: `Navigating step-free via Model Colony to Fergusson College. Your active path has updated on the map below.`,
    });

    handleLogEvent({
      type: "handsfree",
      icon: "⚡",
      title: `Route Recovery Accepted: ${newRoute.shortName}`,
      detail: `Traveler confirmed switch from ${currentRoute.shortName} to ${newRoute.shortName} via single-tap recovery button. Active journey updated.`,
      snapshot: { activeRouteId: newRoute.id },
    });
  }, [handsFreeSuggestion, handleLogEvent]);

  const handleRejectSuggestion = useCallback(() => {
    if (!handsFreeSuggestion) return;
    const { currentRoute, newRoute } = handsFreeSuggestion;

    dismissedRouteRef.current = `${currentRoute.id}->${newRoute.id}`;
    setHandsFreeSuggestion(null);

    handleLogEvent({
      type: "handsfree",
      icon: "✋",
      title: `Route Recovery Dismissed: Kept ${currentRoute.shortName}`,
      detail: `Traveler chose to remain on ${currentRoute.shortName} despite disruption alert. This alert will not reappear unless conditions change.`,
    });
  }, [handsFreeSuggestion, handleLogEvent]);

  // ── Time-Machine Replay Handlers (Requirement 4) ─────────────────────────────
  const activeReplaySnapshot = isReplaying && eventLog[replayIndex]?.snapshot
    ? eventLog[replayIndex].snapshot
    : null;

  // Active state fed to child screens (either replay snapshot or live values)
  const effectiveStageIndex = activeReplaySnapshot?.stageIndex ?? currentStageIndex;
  const effectiveRouteId    = activeReplaySnapshot?.activeRouteId ?? activeRouteId;
  const effectiveWeights    = activeReplaySnapshot?.weights ?? weights;
  const effectiveDisruptions= activeReplaySnapshot?.disruptions ?? disruptions;

  function handleStartReplay() {
    if (eventLog.length === 0) return;
    setIsReplaying(true);
    setReplayIndex(0);
  }

  function handleStepReplay(index) {
    setReplayIndex(index);
  }

  function handleExitReplay() {
    setIsReplaying(false);
  }

  return (
    <>
      <NavBar activeScreen={activeScreen} onScreenChange={setActiveScreen} />

      {/* Replay Mode Indicator Bar */}
      {isReplaying && (
        <div
          style={{
            background: "linear-gradient(90deg, #EC4899, #8B5CF6)",
            color: "#fff",
            padding: "0.45rem 1rem",
            fontSize: "0.82rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 10px rgba(236,72,153,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>📼</span>
            <span>REPLAY MODE ACTIVE &mdash; Event {replayIndex + 1} of {eventLog.length}</span>
            <span style={{ fontWeight: 400, opacity: 0.9 }}>
              (All rankings, position, and explanations match this exact historical tick)
            </span>
          </div>
          <button
            onClick={handleExitReplay}
            style={{
              background: "#fff",
              color: "#EC4899",
              border: "none",
              borderRadius: "4px",
              padding: "0.2rem 0.6rem",
              fontSize: "0.75rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Exit Replay
          </button>
        </div>
      )}

      {/* Active Route Switched Success Banner */}
      {activeBanner && (
        <div
          style={{
            maxWidth: "1240px",
            margin: "1rem auto 0 auto",
            padding: "0.85rem 1.25rem",
            background: "rgba(0, 212, 170, 0.12)",
            border: "1.5px solid #00D4AA",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-primary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            animation: "fadeInUp 0.3s ease both",
            boxShadow: "0 4px 16px rgba(0, 212, 170, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🎉</span>
            <div>
              <strong style={{ color: "#00D4AA" }}>{activeBanner.title}</strong>
              <div style={{ fontSize: "0.83rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
                {activeBanner.message}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveBanner(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#00D4AA",
              cursor: "pointer",
              fontSize: "1.1rem",
              padding: "0 0.5rem",
            }}
            title="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}

      {activeScreen === "plan" && (
        <PlanProfileScreen
          weights={effectiveWeights}
          onWeightsChange={handleWeightsChange}
          onLogEvent={handleLogEvent}
        />
      )}

      {activeScreen === "journey" && (
        <JourneyMapScreen
          weights={effectiveWeights}
          disruptions={effectiveDisruptions}
          onClearDisruptions={handleClearDisruptions}
          currentStageIndex={effectiveStageIndex}
          onStageChange={handleStageChange}
          activeRouteId={effectiveRouteId}
          onSelectRoute={setActiveRouteId}
        />
      )}

      {activeScreen === "disruption" && (
        <DisruptionRecoveryScreen
          weights={effectiveWeights}
          disruptions={effectiveDisruptions}
          activeScenarioId={activeScenarioId}
          onScenarioChange={(id) => {
            dismissedRouteRef.current = null;
            setActiveScenarioId(id);
          }}
          onReportDisruption={handleReportDisruption}
          onResolveStaff={handleResolveStaff}
          onClearDisruptions={handleClearDisruptions}
          onDeleteDisruption={handleDeleteDisruption}
          currentStageIndex={effectiveStageIndex}
          onStageChange={handleStageChange}
          activeRouteId={effectiveRouteId}
          onLogEvent={handleLogEvent}
        />
      )}

      {/* ── One-Tap Route Recovery Modal (Requirement 5) ── */}
      {handsFreeSuggestion && (
        <HandsFreePrompt
          suggestion={handsFreeSuggestion}
          onAccept={handleAcceptSuggestion}
          onReject={handleRejectSuggestion}
        />
      )}

      {/* ── Replayable Terminal-Style Journey Event Log (Requirement 4) ── */}
      <EventLog
        eventLog={eventLog}
        onClearLog={() => setEventLog([])}
        isReplaying={isReplaying}
        replayIndex={replayIndex}
        onStartReplay={handleStartReplay}
        onStepReplay={handleStepReplay}
        onExitReplay={handleExitReplay}
      />
    </>
  );
}
