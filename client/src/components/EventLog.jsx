import { useRef, useEffect, useState } from "react";

// Log-entry type → accent colour & badge
const TYPE_CONFIG = {
  scenario:   { color: "#A78BFA", label: "SCENARIO" },
  ai:         { color: "#2DD4BF", label: "AI_EXPLANATION" },
  hazard:     { color: "#F87171", label: "HAZARD" },
  staff:      { color: "#38BDF8", label: "STAFF_OVERRIDE" },
  profile:    { color: "#34D399", label: "PROFILE" },
  navigation: { color: "#FBBF24", label: "MID_JOURNEY" },
  rerank:     { color: "#EC4899", label: "RERANK" },
  handsfree:  { color: "#00D4AA", label: "HANDS_FREE" },
  error:      { color: "#FBBF24", label: "WARNING" },
};

/**
 * Replayable Terminal-Style Journey Event Log
 * Requirement 4: The event log is the formal source of truth.
 * Replaying the log reproduces exact route rankings, position, and explanations.
 */
export default function EventLog({
  eventLog = [],
  onClearLog,
  isReplaying = false,
  replayIndex = 0,
  onStartReplay,
  onStepReplay,
  onExitReplay,
}) {
  const [collapsed, setCollapsed] = useState(!isReplaying);
  const [isPlaying, setIsPlaying] = useState(false);
  const logEndRef = useRef(null);

  // Auto-expand during time-machine replay
  useEffect(() => {
    if (isReplaying) setCollapsed(false);
  }, [isReplaying]);

  // Auto-scroll on new entries if not replaying
  useEffect(() => {
    if (!collapsed && !isReplaying) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [eventLog, collapsed, isReplaying]);

  // Auto-play timer for replay mode
  useEffect(() => {
    let timer;
    if (isPlaying && isReplaying) {
      timer = setInterval(() => {
        if (replayIndex < eventLog.length - 1) {
          onStepReplay?.(replayIndex + 1);
        } else {
          setIsPlaying(false);
        }
      }, 1800);
    }
    return () => clearInterval(timer);
  }, [isPlaying, isReplaying, replayIndex, eventLog.length, onStepReplay]);

  const activeReplayEvent = isReplaying && eventLog[replayIndex] ? eventLog[replayIndex] : null;
  const latestEvent = eventLog[eventLog.length - 1];

  return (
    <footer
      id="dashboard-event-log"
      className="event-log-terminal"
      style={{
        maxWidth: "1360px",
        margin: "0.5rem auto 1rem auto",
        padding: "0 1.25rem",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#0d1117",
          border: isReplaying ? "2px solid #EC4899" : "1px solid rgba(108, 99, 255, 0.25)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          boxShadow: isReplaying
            ? "0 0 24px rgba(236, 72, 153, 0.3), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 4px 20px rgba(0,0,0,0.35)",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          transition: "border 0.25s ease",
        }}
      >
        {/* ── Terminal Header Bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.45rem 0.85rem",
            background: isReplaying ? "rgba(236, 72, 153, 0.15)" : "#161b22",
            borderBottom: collapsed ? "none" : "1px solid #21262d",
            userSelect: "none",
            gap: "0.5rem",
          }}
        >
          {/* Left: Window controls + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "5px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ff5f56", display: "inline-block" }} />
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ffbd2e", display: "inline-block" }} />
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#27c93f", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: isReplaying ? "#EC4899" : "#58a6ff", fontSize: "0.78rem", fontWeight: 700 }}>
                {isReplaying ? "replay://time-machine" : "terminal://journey-events"}
              </span>
              <span className="live-dot" style={{ width: "5px", height: "5px", background: isReplaying ? "#EC4899" : "#00D4AA" }} />
            </div>
          </div>

          {/* Center: Live Latest Event Ticker (when collapsed) */}
          {collapsed && latestEvent && (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.72rem",
                color: "#8b949e",
                padding: "0 0.5rem",
              }}
              title={`${latestEvent.timestamp} - ${latestEvent.title}: ${latestEvent.detail}`}
            >
              <span style={{ color: "#58a6ff" }}>[{latestEvent.timestamp}]</span> {latestEvent.icon}{" "}
              <strong style={{ color: "#c9d1d9" }}>{latestEvent.title}</strong> &mdash; {latestEvent.detail}
            </div>
          )}

          {/* Right: Controls & Replay toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* Replay Mode Toggle */}
            {eventLog.length > 0 && (
              <button
                onClick={() => {
                  if (isReplaying) {
                    setIsPlaying(false);
                    onExitReplay?.();
                  } else {
                    onStartReplay?.();
                  }
                }}
                style={{
                  background: isReplaying ? "#EC4899" : "rgba(236, 72, 153, 0.15)",
                  color: isReplaying ? "#fff" : "#EC4899",
                  border: "1px solid #EC4899",
                  borderRadius: "4px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.25rem 0.65rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>{isReplaying ? "✕ Exit Replay" : "📼 Replay Journey"}</span>
              </button>
            )}

            <span style={{ fontSize: "0.72rem", color: "#8b949e" }}>
              {eventLog.length} event{eventLog.length !== 1 ? "s" : ""}
            </span>

            {eventLog.length > 0 && !isReplaying && onClearLog && (
              <button
                onClick={onClearLog}
                style={{
                  background: "transparent",
                  border: "1px solid #30363d",
                  borderRadius: "4px",
                  color: "#8b949e",
                  fontSize: "0.7rem",
                  padding: "0.2rem 0.5rem",
                  cursor: "pointer",
                }}
                title="Clear event log"
              >
                Clear
              </button>
            )}

            <button
              onClick={() => setCollapsed((v) => !v)}
              style={{
                background: "transparent",
                border: "none",
                color: "#8b949e",
                cursor: "pointer",
                fontSize: "0.85rem",
                padding: "0 0.25rem",
              }}
              title={collapsed ? "Expand terminal log" : "Collapse terminal log"}
            >
              {collapsed ? "▲ Expand" : "▼ Collapse"}
            </button>
          </div>
        </div>

        {/* ── Replay Scrubber Controller Bar (Requirement 4) ── */}
        {isReplaying && !collapsed && (
          <div
            style={{
              padding: "0.6rem 1rem",
              background: "#12171f",
              borderBottom: "1px solid #21262d",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Playback Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <button
                onClick={() => onStepReplay?.(0)}
                disabled={replayIndex === 0}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  color: "#c9d1d9",
                  borderRadius: "3px",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: replayIndex === 0 ? "not-allowed" : "pointer",
                }}
                title="First event"
              >
                ⏮ First
              </button>

              <button
                onClick={() => onStepReplay?.(Math.max(0, replayIndex - 1))}
                disabled={replayIndex === 0}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  color: "#c9d1d9",
                  borderRadius: "3px",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: replayIndex === 0 ? "not-allowed" : "pointer",
                }}
                title="Previous event"
              >
                ◀ Step
              </button>

              <button
                onClick={() => setIsPlaying((p) => !p)}
                style={{
                  background: isPlaying ? "#ff5f56" : "#238636",
                  border: "none",
                  color: "#fff",
                  borderRadius: "3px",
                  padding: "0.25rem 0.65rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </button>

              <button
                onClick={() => onStepReplay?.(Math.min(eventLog.length - 1, replayIndex + 1))}
                disabled={replayIndex >= eventLog.length - 1}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  color: "#c9d1d9",
                  borderRadius: "3px",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: replayIndex >= eventLog.length - 1 ? "not-allowed" : "pointer",
                }}
                title="Next event"
              >
                Step ▶
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  onExitReplay?.();
                }}
                style={{
                  background: "#30363d",
                  border: "none",
                  color: "#00D4AA",
                  borderRadius: "3px",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                title="Exit replay to current live state"
              >
                ⏭ Live Mode
              </button>
            </div>

            {/* Scrubber slider */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: "200px" }}>
              <input
                type="range"
                min={0}
                max={Math.max(0, eventLog.length - 1)}
                value={replayIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  onStepReplay?.(Number(e.target.value));
                }}
                style={{ flex: 1, accentColor: "#EC4899", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.72rem", color: "#EC4899", fontWeight: 700, whiteSpace: "nowrap" }}>
                Step {replayIndex + 1}/{eventLog.length}
              </span>
            </div>

            {/* Current step preview */}
            {activeReplayEvent && (
              <div style={{ fontSize: "0.74rem", color: "#8b949e" }}>
                Active: <strong style={{ color: "#f0f6fc" }}>{activeReplayEvent.title}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── Terminal Body ── */}
        {!collapsed && (
          <div
            style={{
              padding: "0.85rem 1.1rem",
              maxHeight: "240px",
              overflowY: "auto",
              fontSize: "0.78rem",
              lineHeight: 1.6,
              color: "#c9d1d9",
              background: "#0d1117",
            }}
          >
            {eventLog.length === 0 ? (
              <div style={{ color: "#6e7681", fontStyle: "italic", padding: "0.75rem 0" }}>
                $ waiting for user actions (select a preset profile, advance position, trigger a disruption, or report a hazard)...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {eventLog.map((entry, idx) => {
                  const cfg = TYPE_CONFIG[entry.type] || { color: "#58a6ff", label: "INFO" };
                  const isCurrentReplayStep = isReplaying && replayIndex === idx;

                  return (
                    <div
                      key={entry.id}
                      onClick={() => {
                        if (isReplaying) {
                          setIsPlaying(false);
                          onStepReplay?.(idx);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.25rem 0.4rem",
                        borderRadius: "4px",
                        background: isCurrentReplayStep ? "rgba(236, 72, 153, 0.18)" : "transparent",
                        borderLeft: isCurrentReplayStep ? "3px solid #EC4899" : "3px solid transparent",
                        cursor: isReplaying ? "pointer" : "default",
                        animation: "fadeInUp 0.15s ease both",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Timestamp */}
                      <span style={{ color: "#6e7681", flexShrink: 0, fontSize: "0.72rem" }}>
                        [{entry.timestamp}]
                      </span>

                      {/* Type Badge */}
                      <span
                        style={{
                          color: cfg.color,
                          background: `${cfg.color}15`,
                          border: `1px solid ${cfg.color}35`,
                          borderRadius: "3px",
                          padding: "0 0.35rem",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {cfg.label}
                      </span>

                      {/* Icon */}
                      <span style={{ flexShrink: 0 }}>{entry.icon}</span>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: isCurrentReplayStep ? "#fff" : "#f0f6fc", marginRight: "0.5rem" }}>
                          {entry.title}
                        </span>
                        {entry.detail && (
                          <span style={{ color: "#8b949e" }}>
                            &mdash; {entry.detail}
                          </span>
                        )}
                      </div>

                      {isCurrentReplayStep && (
                        <span style={{ color: "#EC4899", fontSize: "0.68rem", fontWeight: 700 }}>
                          ◀ REPLAY HEAD
                        </span>
                      )}
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
