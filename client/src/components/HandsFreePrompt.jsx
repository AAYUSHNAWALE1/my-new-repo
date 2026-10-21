import { useState, useEffect, useRef } from "react";
import { speak, stopSpeaking, startVoiceCommandListener, isVoiceSupported } from "../utils/speech";

/**
 * HandsFreePrompt
 * Requirement 5: Whenever a route change is suggested, announce the change
 * and its reason aloud. The traveler must be able to accept or reject the new
 * route either by voice or with one large, single-tap button, without needing
 * to read the screen.
 */
export default function HandsFreePrompt({
  suggestion, // { currentRoute, newRoute, reason, oldScore, newScore }
  onAccept,
  onReject,
}) {
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [heardCommand, setHeardCommand] = useState("");
  const stopListeningRef = useRef(null);

  const announcementText = `Attention: Route change suggested. ${suggestion.reason || "A hazard was detected ahead."} We recommend switching to ${suggestion.newRoute.name}. Say Accept, or tap the green button now.`;

  // Announce aloud on mount
  useEffect(() => {
    setVoiceSupported(isVoiceSupported());

    // Speak announcement
    speak(announcementText);

    // Start voice listener
    const cleanupVoice = startVoiceCommandListener({
      onAccept: (cmd) => {
        setHeardCommand(`Heard: "${cmd}"`);
        speak("New route accepted. Navigating now.");
        setTimeout(() => onAccept?.(), 1000);
      },
      onReject: (cmd) => {
        setHeardCommand(`Heard: "${cmd}"`);
        speak("Keeping current route.");
        setTimeout(() => onReject?.(), 1000);
      },
      onListeningStateChange: setIsListening,
      onError: (err) => console.log("Voice recognition:", err),
    });

    stopListeningRef.current = cleanupVoice;

    return () => {
      stopSpeaking();
      cleanupVoice();
    };
  }, [announcementText, onAccept, onReject]);

  function handleManualAccept() {
    stopSpeaking();
    stopListeningRef.current?.();
    speak("New route accepted.");
    onAccept?.();
  }

  function handleManualReject() {
    stopSpeaking();
    stopListeningRef.current?.();
    speak("Keeping current route.");
    onReject?.();
  }

  function handleReannounce() {
    speak(announcementText);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(94vw, 680px)",
        zIndex: 9999,
        background: "rgba(13, 17, 23, 0.98)",
        backdropFilter: "blur(12px)",
        border: "2px solid #00D4AA",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 16px 48px rgba(0, 212, 170, 0.35), 0 0 0 1px rgba(0, 212, 170, 0.5)",
        padding: "1.25rem 1.5rem",
        animation: "fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      {/* Top Banner: Status + Audio Replay */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.85rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.5rem" }}>🚨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#00D4AA", letterSpacing: "0.02em" }}>
              HANDS-FREE ROUTE RECOVERY
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
              Audio announced aloud &bull; Voice commands active
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={handleReannounce}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "999px",
              padding: "0.3rem 0.75rem",
              fontSize: "0.75rem",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span>🔊</span> Re-read Aloud
          </button>
        </div>
      </div>

      {/* Rationale Text */}
      <div
        style={{
          background: "rgba(0, 212, 170, 0.08)",
          borderRadius: "var(--radius-sm)",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          fontSize: "0.92rem",
          lineHeight: 1.5,
          color: "var(--color-text-primary)",
          borderLeft: "3px solid #00D4AA",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: "0.2rem", color: "#00D4AA" }}>
          Suggested Switch: {suggestion.currentRoute.shortName} → {suggestion.newRoute.shortName}
        </div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
          {suggestion.reason}
        </div>
      </div>

      {/* Voice Status Pill */}
      {voiceSupported && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontSize: "0.8rem",
            color: isListening ? "#34D399" : "#8b949e",
            marginBottom: "1rem",
            background: "rgba(255,255,255,0.04)",
            padding: "0.35rem 0.75rem",
            borderRadius: "999px",
            width: "fit-content",
            margin: "0 auto 1rem auto",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: isListening ? "#34D399" : "#8b949e",
              boxShadow: isListening ? "0 0 8px #34D399" : "none",
            }}
          />
          <span>
            {heardCommand || (isListening ? 'Say "Accept" or "Reject"' : "Voice listener ready")}
          </span>
        </div>
      )}

      {/* ── ONE LARGE, SINGLE-TAP BUTTON (Requirement 5) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <button
          id="btn-single-tap-accept"
          onClick={handleManualAccept}
          style={{
            width: "100%",
            height: "64px",
            background: "linear-gradient(135deg, #00D4AA 0%, #00a887 100%)",
            color: "#0a0d14",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: "1.2rem",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            letterSpacing: "0.03em",
            boxShadow: "0 6px 20px rgba(0, 212, 170, 0.45)",
            transition: "all 0.15s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <span style={{ fontSize: "1.5rem" }}>✓</span>
          <span>ACCEPT NEW ROUTE ({suggestion.newRoute.shortName})</span>
        </button>

        <button
          onClick={handleManualReject}
          style={{
            width: "100%",
            padding: "0.55rem",
            background: "transparent",
            color: "var(--color-text-muted)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.82rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          ✕ Keep Current Route ({suggestion.currentRoute.shortName})
        </button>
      </div>
    </div>
  );
}
