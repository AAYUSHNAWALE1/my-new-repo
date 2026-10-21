import { useState } from "react";
import { parseProfile } from "../api/client";
import { DEFAULT_WEIGHTS, FACTOR_META, PRESET_PROFILES } from "../data/routes";

/**
 * Screen 1 – Plan & Profile
 * Free-text mobility profiling parsed by Local LLM into 5-factor weight matrix.
 * Includes 3 preset profiles: Wheelchair User, Senior Traveler, Standard Traveler.
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
      <div className="page-header">
        <h1>Plan & Profile</h1>
        <p>
          Select a preset traveler profile or describe your needs in plain language —
          our on-device Llama 3.1 8B model parses it into a personalised 5-factor priority matrix.
        </p>
      </div>

      {/* ── Preset profile selector ── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Quick-Start: Choose a Preset Profile</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.85rem" }}>
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
                  gap: "0.4rem",
                  padding: "1rem 1.1rem",
                  borderRadius: "var(--radius-md)",
                  border: `1.5px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: isActive
                    ? "rgba(108,99,255,0.10)"
                    : "var(--color-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                  fontFamily: "Inter, sans-serif",
                  boxShadow: isActive ? "0 0 0 1px var(--color-primary), var(--shadow-glow)" : "none",
                }}
              >
                <div style={{ fontSize: "1.75rem", lineHeight: 1 }}>{preset.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: isActive ? "var(--color-primary-light)" : "var(--color-text-primary)" }}>
                  {preset.label}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                  {preset.description}
                </div>
                {isActive && (
                  <span className="badge badge-primary" style={{ fontSize: "0.65rem", marginTop: "0.2rem" }}>
                    ✓ Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid-2" style={{ gap: "1.5rem" }}>
        {/* ── Left: Free-text input ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <h3 style={{ marginBottom: "0.75rem" }}>
              Or Describe in Plain Language
              <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                (parsed by Local LLM)
              </span>
            </h3>

            <textarea
              id="profile-input"
              className="textarea"
              rows={6}
              placeholder="e.g. 'I use a power wheelchair and cannot use stairs. Crowds are very hard for me. Safety on crossings matters most.'"
              value={profileText}
              onChange={(e) => setProfileText(e.target.value)}
              disabled={loading}
              aria-label="Mobility profile text"
            />

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button
                id="btn-parse-profile"
                className="btn btn-primary"
                onClick={handleParse}
                disabled={loading || !profileText.trim()}
              >
                {loading ? <><div className="spinner" /> Parsing with AI…</> : "✨ Parse with Local LLM"}
              </button>
              <button className="btn btn-ghost" onClick={handleReset}>↺ Reset to Default</button>
            </div>

            {error && (
              <div style={{
                marginTop: "0.75rem", padding: "0.65rem 0.85rem",
                background: "rgba(255,179,71,0.08)", border: "1px solid rgba(255,179,71,0.25)",
                borderRadius: "var(--radius-sm)", fontSize: "0.83rem", color: "var(--color-warning)"
              }}>
                ⚠️ {error}
              </div>
            )}

            {summary && (
              <div style={{
                marginTop: "0.75rem", padding: "0.75rem", background: "var(--color-surface-2)",
                borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--color-accent)",
                fontSize: "0.88rem", color: "var(--color-text-secondary)"
              }}>
                <strong style={{ color: "var(--color-accent)" }}>AI Summary: </strong>{summary}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="card" style={{ borderColor: "rgba(108,99,255,0.22)", background: "rgba(108,99,255,0.04)" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>💡 How It Works</h3>
            <ol style={{ paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.45rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              <li>Pick a preset profile <em>or</em> type your mobility situation in plain English.</li>
              <li>Our on-device <strong style={{ color: "var(--color-text-primary)" }}>Llama 3.1 8B</strong> (RTX 5070 Ti) parses the text.</li>
              <li>It outputs a strict JSON weight matrix where all 5 factors sum to exactly <strong style={{ color: "var(--color-text-primary)" }}>100%</strong>.</li>
              <li>All 3 Pune candidate routes are re-ranked instantly using your personalised weights.</li>
            </ol>
          </div>
        </div>

        {/* ── Right: Live weight matrix ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3>Active Priority Matrix</h3>
              <span className={`badge ${sourceBadge.cls}`}>{sourceBadge.label}</span>
            </div>

            <p style={{ fontSize: "0.83rem", marginBottom: "1.1rem", color: "var(--color-text-muted)" }}>
              Each weight determines how strongly a factor influences route ranking. All weights sum to 100%.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {FACTOR_META.map(({ key, label, color, icon, weight: defaultWeight }) => {
                const pct = displayWeights[key];
                const defaultPct = Math.round(defaultWeight * 100);
                const diff = pct - defaultPct;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.88rem" }}>
                        {icon} <strong>{label}</strong>
                        {diff !== 0 && (
                          <span style={{
                            marginLeft: "0.4rem", fontSize: "0.72rem",
                            color: diff > 0 ? "var(--color-success)" : "var(--color-danger)",
                            fontWeight: 600
                          }}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 800, color, fontSize: "1.05rem" }}>{pct}%</span>
                    </div>
                    <div className="score-bar-track">
                      <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sum check */}
            <div style={{
              marginTop: "1rem", padding: "0.5rem 0.75rem",
              background: "var(--color-surface-2)", borderRadius: "var(--radius-sm)",
              display: "flex", justifyContent: "space-between", fontSize: "0.82rem"
            }}>
              <span style={{ color: "var(--color-text-muted)" }}>Total</span>
              <span style={{ fontWeight: 700, color: "var(--color-success)" }}>
                {Object.values(displayWeights).reduce((s, v) => s + v, 0)}%
              </span>
            </div>
          </div>

          {/* Route accessibility legend */}
          <div className="card" style={{ borderColor: "rgba(255,107,107,0.2)", background: "rgba(255,107,107,0.03)" }}>
            <h3 style={{ marginBottom: "0.75rem" }}>🗺️ Pune Candidate Routes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {[
                { dot: "#6C63FF", name: "Route A — JM Road Direct",          note: "⚠️ Stairs & steep curbs. Not wheelchair-suitable." },
                { dot: "#00D4AA", name: "Route B — Accessible Main Corridor", note: "✓ Step-free: elevator overpasses & kerb ramps." },
                { dot: "#FFB347", name: "Route C — Quiet Backup (Model Colony)", note: "✓ Residential detour. Low crowd. Fully accessible." },
              ].map(({ dot, name, note }) => (
                <div key={name} style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: dot, marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{note}</div>
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
