import { useState, useMemo, useEffect, useCallback } from "react";
import PuneMap from "../components/PuneMap";
import WeatherWidget from "../components/WeatherWidget";
import ScoreBars from "../components/ScoreBars";
import GoogleSearchCard from "../components/GoogleSearchCard";
import {
  ROUTES, SCENARIOS,
} from "../data/routes";
import {
  JOURNEY_STAGES, SEGMENTS, SWITCHING_THRESHOLD, evaluateMidJourneyRoute
} from "../data/segments";
import { fetchOsrmFootRoutes } from "../services/routingService";

const NORMAL_SCENARIO = SCENARIOS.find((s) => s.id === "normal");

// Default turn-by-turn steps for Pune candidate corridors (fallback / offline)
const DEFAULT_CORRIDOR_STEPS = {
  "accessible-main": [
    { instruction: "Start at Pune Railway Station step-free accessible entrance", distance: 300, location: [18.5282, 73.8742] },
    { instruction: "Follow continuous tactile paving along Station Road", distance: 450, location: [18.5270, 73.8680] },
    { instruction: "Take Shivajinagar Junction elevator overpass (Line 1 / Step-Free)", distance: 650, location: [18.5255, 73.8610] },
    { instruction: "Cross at Sancheti Hospital with audio tactile signals", distance: 350, location: [18.5230, 73.8545] },
    { instruction: "Proceed along wide footpath on FC Road", distance: 400, location: [18.5205, 73.8475] },
    { instruction: "Arrive at Fergusson College Main Gate (Step-Free Entry)", distance: 0, location: [18.5185, 73.8412] },
  ],
  "quiet-backup": [
    { instruction: "Start at Pune Railway Station step-free entrance", distance: 300, location: [18.5282, 73.8742] },
    { instruction: "Head west toward Sancheti Junction", distance: 550, location: [18.5290, 73.8670] },
    { instruction: "Divert into Model Colony residential lanes (low crowd, zero lifts)", distance: 850, location: [18.5275, 73.8600] },
    { instruction: "Follow smooth kerb-cut sidewalks past Lakaki Lake", distance: 600, location: [18.5245, 73.8520] },
    { instruction: "Approach Fergusson College via tree-lined Model Colony path", distance: 500, location: [18.5210, 73.8460] },
    { instruction: "Arrive at Fergusson College Campus (Fully Accessible)", distance: 0, location: [18.5185, 73.8412] },
  ],
  "jm-road-direct": [
    { instruction: "Start at Pune Railway Station", distance: 300, location: [18.5282, 73.8742] },
    { instruction: "Head south onto direct arterial JM Road corridor", distance: 800, location: [18.5265, 73.8650] },
    { instruction: "⚠️ Caution: Overpass with 12 stairs (No elevator / barrier)", distance: 350, location: [18.5220, 73.8510] },
    { instruction: "Continue past Sambhaji Park along open JM Road", distance: 350, location: [18.5185, 73.8412] },
    { instruction: "Arrive at Fergusson College Main Gate", distance: 0, location: [18.5185, 73.8412] },
  ],
};

/**
 * Screen 2 – Journey & Map (Google Maps Style Navigation Dashboard)
 */
export default function JourneyMapScreen({
  weights,
  disruptions = [],
  onClearDisruptions,
  currentStageIndex = 0,
  onStageChange,
  activeRouteId = "accessible-main",
  onSelectRoute,
  onNavigate,
}) {
  const currentStage = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Search locations state (defaults to Pune corridor)
  const [fromPlace, setFromPlace] = useState({
    name: "Pune Railway Station",
    lat: 18.5282,
    lng: 73.8742,
  });
  const [toPlace, setToPlace] = useState({
    name: "Fergusson College",
    lat: 18.5185,
    lng: 73.8412,
  });

  // High contrast mode state
  const [isHighContrast, setIsHighContrast] = useState(false);

  // OSRM Real Walking Routes & Steps
  const [osrmRoutes, setOsrmRoutes] = useState([]);
  const [isOfflineRouting, setIsOfflineRouting] = useState(false);
  const [expandedStepsRouteId, setExpandedStepsRouteId] = useState(null);
  const [focusStepCoord, setFocusStepCoord] = useState(null);

  // Screen reader announcements
  const [announcement, setAnnouncement] = useState("");

  // Toggle high-contrast class on document body
  useEffect(() => {
    if (isHighContrast) {
      document.body.classList.add("high-contrast");
    } else {
      document.body.classList.remove("high-contrast");
    }
  }, [isHighContrast]);

  // Fetch real walking routes from OSRM foot server
  const loadWalkingRoutes = useCallback(async (fromCoord, toCoord) => {
    try {
      const res = await fetchOsrmFootRoutes(fromCoord, toCoord);
      setOsrmRoutes(res.routes || []);
      setIsOfflineRouting(Boolean(res.isOfflineFallback));
    } catch {
      setIsOfflineRouting(true);
    }
  }, []);

  useEffect(() => {
    loadWalkingRoutes(fromPlace, toPlace);
  }, [fromPlace, toPlace, loadWalkingRoutes]);

  // Location search handlers
  function handleFromChange(place) {
    setFromPlace(place);
    setAnnouncement(`Starting location set to ${place.name}`);
  }

  function handleToChange(place) {
    setToPlace(place);
    setAnnouncement(`Destination set to ${place.name}`);
  }

  function handleSwap() {
    setFromPlace(toPlace);
    setToPlace(fromPlace);
    setAnnouncement("Swapped starting point and destination");
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLoc = {
          name: "My Live Location (GPS)",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setFromPlace(userLoc);
        setAnnouncement("Using your live GPS location as the starting point");
      },
      (err) => {
        alert("Unable to retrieve your location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  // Calculate arrival clock time
  function getEtaClockTime(minutes) {
    const arrivalDate = new Date(Date.now() + minutes * 60 * 1000);
    return arrivalDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  }

  // Evaluate candidate routes only for remaining segments from current position
  const routeData = useMemo(() => {
    return ROUTES.map((route, idx) => {
      const evaluation = evaluateMidJourneyRoute(
        route,
        currentStageIndex,
        disruptions,
        NORMAL_SCENARIO.scoreDeltas[route.id] || {},
        weights
      );

      // Associate real OSRM route data if available
      const osrm = osrmRoutes[idx] || osrmRoutes[0] || null;
      const distanceKm = osrm ? (osrm.distanceMeters / 1000).toFixed(1) : (route.baseEtaMin * 0.08).toFixed(1);
      const steps = (osrm && osrm.steps && osrm.steps.length > 0)
        ? osrm.steps
        : (DEFAULT_CORRIDOR_STEPS[route.id] || DEFAULT_CORRIDOR_STEPS["accessible-main"]);

      return {
        route,
        factorScores: evaluation.factorScores,
        weightedScore: evaluation.weightedScore,
        remainingEtaMin: evaluation.remainingEtaMin,
        completedSegments: evaluation.completedSegments,
        remainingSegments: evaluation.remainingSegments,
        relevantDisruptions: evaluation.relevantDisruptions,
        hasActiveBlocker: evaluation.hasActiveBlocker,
        distanceKm,
        steps,
        etaClock: getEtaClockTime(evaluation.remainingEtaMin),
      };
    });
  }, [weights, disruptions, currentStageIndex, osrmRoutes]);

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

  function handleSelectRouteInternal(routeId) {
    onSelectRoute?.(routeId);
    const r = ROUTES.find((x) => x.id === routeId);
    if (r) {
      setAnnouncement(`Selected ${r.shortName}. Score: ${weightedScoresMap[routeId] || "—"}`);
    }
  }

  return (
    <main
      className={`page fade-in-up ${isHighContrast ? "high-contrast" : ""}`}
      id="screen-journey"
      role="tabpanel"
      aria-labelledby="tab-journey"
    >
      {/* ── Screen Reader Announcement Region ── */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* ── Compact Header & Stepper Bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.65rem" }}>
        <div>
          <h1 style={{ fontSize: "1.45rem", margin: 0, fontWeight: 800 }}>Journey & Map</h1>
          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
            Google Maps-style navigation &bull; Mid-journey dynamic re-ranking & anti-backtracking lock
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {disruptions.length > 0 ? (
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
              <button
                type="button"
                onClick={() => onNavigate?.("disruption")}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  minHeight: "44px",
                }}
                title="Open Disruption & Recovery Screen"
              >
                <span>🚨 {disruptions.length} Obstacle{disruptions.length > 1 ? "s" : ""}</span>
                <span style={{ textDecoration: "underline", opacity: 0.9 }}>View in Disruption Screen ➔</span>
              </button>
              {onClearDisruptions && (
                <button
                  type="button"
                  onClick={onClearDisruptions}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-warning)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    textDecoration: "underline",
                    padding: "0 0 0 0.4rem",
                    marginLeft: "0.2rem",
                    borderLeft: "1px solid rgba(255, 179, 71, 0.4)",
                    minHeight: "44px",
                  }}
                  title="Clear disruptions to baseline"
                >
                  Reset
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate?.("disruption")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.3rem 0.75rem",
                borderRadius: "999px",
                background: "rgba(108,99,255,0.12)",
                border: "1px solid rgba(108,99,255,0.3)",
                fontSize: "0.75rem",
                color: "var(--color-primary-light)",
                cursor: "pointer",
                fontWeight: 600,
                transition: "all 0.15s ease",
                minHeight: "44px",
              }}
              title="Test & Simulate Corridor Disruptions"
            >
              <span>🚧 Disruption Lab ➔</span>
            </button>
          )}
          <WeatherWidget />
        </div>
      </div>

      {/* ── Mid-Journey Position Tracker Bar ── */}
      <div
        className="card"
        style={{
          padding: "0.5rem 0.85rem",
          marginBottom: "0.75rem",
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
                type="button"
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
                  minHeight: "44px",
                }}
              >
                {isPast ? "✓ " : ""}{stg.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Google Maps Direction Search Card ── */}
      <div style={{ marginBottom: "0.85rem" }}>
        <GoogleSearchCard
          fromPlace={fromPlace}
          toPlace={toPlace}
          onFromChange={handleFromChange}
          onToChange={handleToChange}
          onSwap={handleSwap}
          onUseMyLocation={handleUseMyLocation}
          isHighContrast={isHighContrast}
          onToggleHighContrast={() => setIsHighContrast((prev) => !prev)}
        />
      </div>

      {/* Offline Notice if OSRM was unavailable */}
      {isOfflineRouting && (
        <div
          style={{
            padding: "0.35rem 0.75rem",
            background: "rgba(255,179,71,0.12)",
            border: "1px solid rgba(255,179,71,0.3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.75rem",
            color: "var(--color-warning)",
            marginBottom: "0.85rem",
          }}
        >
          ℹ️ Offline preview: Showing pre-computed Pune corridor accessibility paths.
        </div>
      )}

      {/* ── Main Dashboard: Left (Routes & Turn-by-Turn) | Right (Interactive Map) ── */}
      <div className="dashboard-layout">
        {/* Left Side Panel: Route Candidates (Google Maps card layout) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted)" }}>
              Recommended Routes ({ranked.length})
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-accent)", fontWeight: 600 }}>
              ⚖️ Anti-Thrashing: +{SWITCHING_THRESHOLD} pts
            </span>
          </div>

          {/* 3 Candidate Routes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {ranked.map(({ route, weightedScore, remainingEtaMin, distanceKm, etaClock, steps, relevantDisruptions, hasActiveBlocker }, rank) => {
              const isSelected = activeRouteId === route.id;
              const isExpanded = expandedStepsRouteId === route.id;

              return (
                <div
                  key={route.id}
                  onClick={() => handleSelectRouteInternal(route.id)}
                  style={{
                    background: isSelected ? "var(--color-surface-2)" : "var(--color-surface)",
                    border: isSelected
                      ? `2px solid #4285F4`
                      : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.75rem 0.85rem",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                    boxShadow: isSelected ? `0 0 16px rgba(66, 133, 244, 0.25)` : "none",
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectRouteInternal(route.id);
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                      <span style={{ fontSize: "1.1rem" }}>{rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                          <strong style={{ fontSize: "0.92rem", color: isSelected ? "#4285F4" : "var(--color-text-primary)" }}>
                            {route.shortName}
                          </strong>
                          {rank === 0 && (
                            <span className="badge badge-success" style={{ fontSize: "0.6rem", padding: "0.1rem 0.4rem" }}>
                              Best Route
                            </span>
                          )}
                        </div>
                        {/* Google Maps format: "26 min, 2.1 km, arrives 4:35 pm" */}
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                          <strong style={{ color: isSelected ? "var(--color-text-primary)" : "inherit" }}>
                            {remainingEtaMin} min
                          </strong>
                          {" "}({distanceKm} km) &bull; arrives {etaClock} &bull; {route.hasBarriers ? "⚠️ Stairs" : "✓ Step-free"}
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
                          background: isSelected ? "#4285F4" : "var(--color-surface-2)",
                          color: isSelected ? "#ffffff" : "var(--color-text-primary)",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          minWidth: "42px",
                          textAlign: "center",
                          border: isSelected ? "none" : "1px solid var(--color-border)",
                        }}
                      >
                        {weightedScore}
                      </div>
                    </div>
                  </div>

                  {/* Active disruption alert banner */}
                  {relevantDisruptions.length > 0 && (
                    <div style={{
                      marginTop: "0.4rem", fontSize: "0.72rem", color: "var(--color-danger)",
                      background: "rgba(255,107,107,0.12)", borderRadius: "4px", padding: "0.2rem 0.45rem"
                    }}>
                      🚨 {relevantDisruptions.map((d) => `${d.hazardEmoji} ${d.hazardLabel}`).join(", ")}
                    </div>
                  )}

                  {/* Expandable Turn-by-Turn Steps Toggle */}
                  <div style={{ marginTop: "0.5rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.4rem" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedStepsRouteId(isExpanded ? null : route.id);
                      }}
                      className="btn btn-ghost"
                      style={{
                        padding: "0.2rem 0.5rem",
                        fontSize: "0.72rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        color: "var(--color-text-secondary)",
                        minHeight: "44px",
                      }}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? "▲" : "▼"}</span>
                      <span>{isExpanded ? "Hide Turn-by-Turn Steps" : `Turn-by-Turn Directions (${steps.length} steps)`}</span>
                    </button>

                    {/* Step-by-Step Instructions */}
                    {isExpanded && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.35rem",
                          marginTop: "0.4rem",
                          background: "var(--color-surface-2)",
                          padding: "0.55rem",
                          borderRadius: "var(--radius-sm)",
                          maxHeight: "220px",
                          overflowY: "auto",
                        }}
                      >
                        <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>
                          Click any step to inspect on map:
                        </div>
                        {steps.map((st, sIdx) => (
                          <div
                            key={sIdx}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusStepCoord(st.location);
                              setAnnouncement(`Inspecting step: ${st.instruction}`);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.45rem",
                              fontSize: "0.73rem",
                              padding: "0.35rem 0.45rem",
                              borderRadius: "4px",
                              cursor: "pointer",
                              background: "rgba(255,255,255,0.03)",
                              minHeight: "44px",
                            }}
                            title="Click to zoom to this step on map"
                          >
                            <span style={{ fontSize: "0.85rem" }}>🚶</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{st.instruction}</div>
                              {st.distance > 0 && (
                                <div style={{ fontSize: "0.67rem", color: "var(--color-text-muted)" }}>
                                  {st.distance < 1000 ? `${st.distance} m` : `${(st.distance / 1000).toFixed(1)} km`}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Route Inspector & Factor Bars */}
          {selectedData && (
            <div className="card" style={{ padding: "0.85rem", borderColor: `rgba(66, 133, 244, 0.35)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#4285F4" }}>
                  📊 {selectedData.route.shortName} Accessibility Breakdown
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

        {/* Right Panel: Interactive Google-Style Map */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="card" style={{ padding: "0.35rem", overflow: "hidden" }}>
            <PuneMap
              routes={ROUTES}
              selectedRouteId={activeRouteId}
              weightedScores={weightedScoresMap}
              onRouteClick={handleSelectRouteInternal}
              currentStageIndex={currentStageIndex}
              activeDisruptions={disruptions}
              fromCoord={fromPlace}
              toCoord={toPlace}
              onSetFromLocation={handleFromChange}
              onSetToLocation={handleToChange}
              focusStepCoord={focusStepCoord}
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
              <span>🟢 <strong>From:</strong> {fromPlace.name}</span>
              <span>📍 <strong>To:</strong> {toPlace.name}</span>
              <span>🗺️ <strong>Style:</strong> Google Maps Layer</span>
            </div>
            <span>📐 <strong>Formula:</strong> Score = Σ (Factor × Weight)</span>
          </div>
        </div>
      </div>
    </main>
  );
}
