import { useState } from "react";
import { parseProfile } from "../api/client";
import { DEFAULT_WEIGHTS, FACTOR_META, PRESET_PROFILES } from "../data/routes";

/**
 * Screen 1 – Plan & Profile
 * Free-text mobility profiling parsed by Local LLM into 5-factor weight matrix.
 * Clean 2-column layout: Profile inputs on left, Priority Matrix & Routes on right.
 */
export default function PlanProfileScreen({ weights, onWeightsChange, onLogEvent }) {
  const [profileText, setProfileText]   = useState("");
  const [summary, setSummary]           = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [activeSource, setActiveSource] = useState("default"); // "default" | preset id | "ai"

  // Convert weight object (0–1 floats) to display percentages
  const displayWeights = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, Math.round(v * 100)])
  );

  // Apply a preset profile instantly (no LLM call)
  function applyPreset(preset) {
    onWeightsChange(preset.weights);
    setProfileText(preset.sampleText);
    setSummary("");
    setError(null);
    setActiveSource(preset.id);
    onLogEvent?.({
      type: "profile",
      icon: preset.icon,
      title: `Preset Applied: ${preset.label}`,
      detail: preset.description,
    });
  }

  async function handleParse() {
    if (!profileText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parseProfile(profileText);
      // Normalise weights to exactly sum 1.0
      const raw = {
        access:      result.access       / 100,
        safety:      result.safety       / 100,
        crowd:       result.crowd        / 100,
        convenience: result.convenience  / 100,
        cost:        result.cost         / 100,
      };
      const total = Object.values(raw).reduce((s, v) => s + v, 0);
      const newWeights = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, v / total])
      );
      onWeightsChange(newWeights);
      setSummary(result.summary || "");
      setActiveSource("ai");
      onLogEvent?.({
        type: "profile",
        icon: "🤖",
        title: "AI Profile Parsed",
        detail: result.summary || "Weights updated via Local LLM.",
      });
    } catch (e) {
      setError(`LLM unavailable: ${e.message}. Using current weights.`);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    onWeightsChange(DEFAULT_WEIGHTS);
    setProfileText("");
    setSummary("");
    setError(null);
    setActiveSource("default");
    onLogEvent?.({
      type: "profile",
      icon: "↺",
      title: "Profile Reset",
      detail: "Restored default Wheelchair User weights (Access 35%, Safety 25%, Crowd 15%, Convenience 10%, Cost 15%).",
    });
  }

  // Badge label for the weight matrix header
  const sourceBadge = (() => {
    if (activeSource === "ai") return { label: "✓ AI-Adjusted", cls: "badge-success" };
    const p = PRESET_PROFILES.find((p) => p.id === activeSource);
    if (p) return { label: `${p.icon} ${p.label}`, cls: "badge-primary" };
    return { label: "Default", cls: "badge-primary" };
  })();

  return (
    <main className="page fade-in-up" id="screen-plan" role="tabpanel" aria-labelledby="tab-plan">
      <div className="page-header" style={{ marginBottom: "0.75rem" }}>
        <h1 style={{ fontSize: "1.45rem", margin: 0, fontWeight: 800 }}>Plan & Profile</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
          Select a preset profile or enter plain English &mdash; on-device Llama 3.1 8B extracts a personalized 5-factor priority matrix.
        </p>
      </div>

      {/* ── 2-Column Responsive Layout ── */}
      <div className="grid-2" style={{ gap: "1.15rem", alignItems: "start" }}>
        {/* Left Column: Preset Selection & AI Plain Language Input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Presets card */}
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.6rem", color: "var(--color-text-primary)" }}>
              Step 1: Choose a Mobility Preset
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
              {PRESET_PROFILES.map((preset) => {
                const isActive = activeSource === preset.id;
                return (
                  <button
                    key={preset.id}
                    id={`preset-${preset.id}`}
                    onClick={() => applyPreset(preset)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "0.25rem",
                      padding: "0.6rem 0.65rem",
                      borderRadius: "var(--radius-md)",
                      border: `1.5px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: isActive ? "rgba(108,99,255,0.12)" : "var(--color-surface-2)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.18s",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    <div style={{ fontSize: "1.3rem" }}>{preset.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: isActive ? "var(--color-primary-light)" : "var(--color-text-primary)" }}>
                      {preset.label}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", lineHeight: 1.3 }}>
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI input card */}
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Step 2: Or Describe in Plain Language
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--color-accent)" }}>
                ✨ Local Llama 3.1 8B
              </span>
            </div>

            <textarea
              id="profile-input"
              className="textarea"
              rows={3}
              placeholder="e.g. 'I use an electric wheelchair and need step-free access and smooth ramps. Avoid heavy crowds.'"
              value={profileText}
              onChange={(e) => setProfileText(e.target.value)}
              disabled={loading}
              aria-label="Mobility profile text"
              style={{ fontSize: "0.85rem", padding: "0.6rem", minHeight: "75px" }}
            />

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              <button
                id="btn-parse-profile"
                className="btn btn-primary"
                onClick={handleParse}
                disabled={loading || !profileText.trim()}
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}
              >
                {loading ? <><div className="spinner" /> Parsing…</> : "✨ Parse with Local LLM"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleReset}
                style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem" }}
              >
                ↺ Reset
              </button>
            </div>

            {error && (
              <div style={{
                marginTop: "0.5rem", padding: "0.45rem 0.65rem",
                background: "rgba(255,179,71,0.08)", border: "1px solid rgba(255,179,71,0.25)",
                borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--color-warning)"
              }}>
                ⚠️ {error}
              </div>
            )}

            {summary && (
              <div style={{
                marginTop: "0.5rem", padding: "0.5rem 0.65rem", background: "var(--color-surface-2)",
                borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--color-accent)",
                fontSize: "0.8rem", color: "var(--color-text-secondary)"
              }}>
                <strong style={{ color: "var(--color-accent)" }}>AI Summary: </strong>{summary}
              </div>
            )}
          </div>

          {/* Quick How It Works summary strip */}
          <div className="card" style={{ padding: "0.65rem 0.85rem", background: "rgba(108,99,255,0.03)", borderColor: "rgba(108,99,255,0.18)" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
              💡 <strong>How it works:</strong> The AI extracts exact weights summing to 100%, dynamically adjusting route ranking scores across Access, Safety, Crowd, Convenience, and Cost.
            </div>
          </div>
        </div>

        {/* Right Column: Active Priority Matrix & Route Compatibility */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Active Priority Matrix
              </span>
              <span className={`badge ${sourceBadge.cls}`}>{sourceBadge.label}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {FACTOR_META.map(({ key, label, color, icon, weight: defaultWeight }) => {
                const pct = displayWeights[key];
                const defaultPct = Math.round(defaultWeight * 100);
                const diff = pct - defaultPct;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                      <span style={{ fontSize: "0.82rem" }}>
                        {icon} <strong>{label}</strong>
                        {diff !== 0 && (
                          <span style={{
                            marginLeft: "0.35rem", fontSize: "0.7rem",
                            color: diff > 0 ? "var(--color-success)" : "var(--color-danger)",
                            fontWeight: 600
                          }}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 800, color, fontSize: "0.95rem" }}>{pct}%</span>
                    </div>
                    <div className="score-bar-track" style={{ height: "6px" }}>
                      <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sum check */}
            <div style={{
              marginTop: "0.75rem", padding: "0.4rem 0.65rem",
              background: "var(--color-surface-2)", borderRadius: "var(--radius-sm)",
              display: "flex", justifyContent: "space-between", fontSize: "0.78rem"
            }}>
              <span style={{ color: "var(--color-text-muted)" }}>Total Priority Sum</span>
              <span style={{ fontWeight: 700, color: "var(--color-success)" }}>
                {Object.values(displayWeights).reduce((s, v) => s + v, 0)}% (Valid)
              </span>
            </div>
          </div>

          {/* Pune candidate routes compatibility overview */}
          <div className="card" style={{ padding: "0.85rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>
              🗺️ Pune Corridor Routes Compatibility
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                { dot: "#6C63FF", name: "Route A — JM Road Direct", note: "⚠️ Stairs & steep curbs. Not wheelchair-suitable." },
                { dot: "#00D4AA", name: "Route B — Accessible Main Corridor", note: "✓ Step-free: elevator overpasses & tactile paving." },
                { dot: "#FFB347", name: "Route C — Quiet Backup (Model Colony)", note: "✓ Low crowd residential detour. Fully step-free." },
              ].map(({ dot, name, note }) => (
                <div key={name} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", background: "var(--color-surface-2)", padding: "0.45rem 0.6rem", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: dot, marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
