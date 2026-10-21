import { useState } from "react";
import { parseProfile } from "../api/client";
import { DEFAULT_WEIGHTS, FACTOR_META, PRESET_PROFILES } from "../data/routes";

/**
 * Screen 1 – Plan & Profile (Compact & Dropdown-Driven)
 * Free-text mobility profiling parsed by Local LLM into 5-factor weight matrix.
 * Clean, compact design using dropdown menu and minimal vertical scrolling.
 */
export default function PlanProfileScreen({ weights, onWeightsChange, onLogEvent }) {
  const [profileText, setProfileText]   = useState("");
  const [summary, setSummary]           = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [activeSource, setActiveSource] = useState("wheelchair"); // "wheelchair" | "senior" | "standard" | "custom"

  // Convert weight object (0–1 floats) to display percentages
  const displayWeights = Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, Math.round(v * 100)])
  );

  // Apply a preset profile instantly from dropdown or button
  function handlePresetChange(presetId) {
    if (presetId === "custom") {
      setActiveSource("custom");
      return;
    }
    const preset = PRESET_PROFILES.find((p) => p.id === presetId);
    if (!preset) return;

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
        Object.entries(raw).map(([k, v]) => [k, v / (total || 1)])
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
    const defaultPreset = PRESET_PROFILES[0];
    setProfileText(defaultPreset ? defaultPreset.sampleText : "");
    setSummary("");
    setError(null);
    setActiveSource("wheelchair");
    onLogEvent?.({
      type: "profile",
      icon: "↺",
      title: "Profile Reset",
      detail: "Restored default Wheelchair User weights (Access 35%, Safety 25%, Crowd 15%, Convenience 10%, Cost 15%).",
    });
  }

  // Active preset info
  const activePreset = PRESET_PROFILES.find((p) => p.id === activeSource);

  // Badge label for the weight matrix header
  const sourceBadge = (() => {
    if (activeSource === "ai") return { label: "✓ AI-Adjusted", cls: "badge-success" };
    if (activePreset) return { label: `${activePreset.icon} ${activePreset.label}`, cls: "badge-primary" };
    if (activeSource === "custom") return { label: "✍️ Custom Needs", cls: "badge-warning" };
    return { label: "Default", cls: "badge-primary" };
  })();

  return (
    <main className="page fade-in-up" id="screen-plan" role="tabpanel" aria-labelledby="tab-plan">
      {/* ── Compact Header & Toolbar ── */}
      <div className="compact-header">
        <div>
          <h1>Plan & Profile</h1>
          <p>
            Choose a preset traveler profile or describe your mobility needs in plain language.
          </p>
        </div>

        {/* ── Dropdown Menu: Traveler Profile ── */}
        <div className="compact-toolbar">
          <label htmlFor="profile-preset-select" style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            Profile:
          </label>
          <select
            id="profile-preset-select"
            className="select-dropdown"
            value={activeSource}
            onChange={(e) => handlePresetChange(e.target.value)}
            aria-label="Select traveler profile"
          >
            {PRESET_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.label}
              </option>
            ))}
            <option value="custom">✍️ Custom AI Needs Prompt</option>
            {activeSource === "ai" && <option value="ai">✓ AI-Generated Profile</option>}
          </select>
        </div>
      </div>

      {/* ── 2-Column Compact Main Grid ── */}
      <div className="grid-2">
        {/* Left Column: Profile Needs & AI Parser */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Active Preset Summary Banner */}
          {activePreset && (
            <div
              className="card"
              style={{
                background: "rgba(108, 99, 255, 0.06)",
                borderColor: "rgba(108, 99, 255, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.65rem 0.85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.4rem" }}>{activePreset.icon}</span>
                <div>
                  <strong style={{ fontSize: "0.88rem", color: "var(--color-primary-light)" }}>
                    {activePreset.label}
                  </strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {activePreset.description}
                  </div>
                </div>
              </div>
              <span className="badge badge-primary" style={{ fontSize: "0.7rem" }}>
                Active Preset
              </span>
            </div>
          )}

          {/* Plain-Language Mobility Input */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ fontSize: "0.92rem" }}>
                Describe Mobility Needs in Plain Language
              </h3>
              <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                Local Llama 3.1
              </span>
            </div>

            <textarea
              id="profile-input"
              className="textarea"
              rows={3}
              placeholder="e.g. 'I use an electric wheelchair, cannot navigate stairs or curbs, and prefer wide, uncrowded paths.'"
              value={profileText}
              onChange={(e) => {
                setProfileText(e.target.value);
                if (activeSource !== "custom" && activeSource !== "ai") {
                  setActiveSource("custom");
                }
              }}
              disabled={loading}
              aria-label="Mobility profile description"
              style={{ fontSize: "0.82rem", lineHeight: 1.4 }}
            />

            {/* Quick Prompt Chips */}
            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", alignSelf: "center" }}>
                Quick:
              </span>
              <button
                type="button"
                className="tag"
                style={{ cursor: "pointer", border: "1px solid var(--color-border)" }}
                onClick={() => {
                  setProfileText("I use a power wheelchair and need step-free, smooth pavements with dropped kerbs.");
                  setActiveSource("custom");
                }}
              >
                ♿ Power Wheelchair
              </button>
              <button
                type="button"
                className="tag"
                style={{ cursor: "pointer", border: "1px solid var(--color-border)" }}
                onClick={() => {
                  setProfileText("I am a senior citizen who walks slowly with a cane. Avoid stairs and steep ramps.");
                  setActiveSource("custom");
                }}
              >
                👴 Senior with Cane
              </button>
              <button
                type="button"
                className="tag"
                style={{ cursor: "pointer", border: "1px solid var(--color-border)" }}
                onClick={() => {
                  setProfileText("Commuter on foot with heavy luggage. Need wide paved walkways and low crowd.");
                  setActiveSource("custom");
                }}
              >
                🧳 Luggage Commuter
              </button>
            </div>

            {/* Action Row */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem", alignItems: "center" }}>
              <button
                id="btn-parse-profile"
                className="btn btn-primary"
                onClick={handleParse}
                disabled={loading || !profileText.trim()}
              >
                {loading ? <><div className="spinner" style={{ width: "16px", height: "16px" }} /> Parsing…</> : "✨ Parse Needs with AI"}
              </button>
              <button className="btn btn-ghost" onClick={handleReset} style={{ fontSize: "0.78rem" }}>
                ↺ Reset Default
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
                marginTop: "0.5rem", padding: "0.55rem 0.75rem", background: "var(--color-surface-2)",
                borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--color-accent)",
                fontSize: "0.8rem", color: "var(--color-text-secondary)"
              }}>
                <strong style={{ color: "var(--color-accent)" }}>AI Parsing Result: </strong>{summary}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 5-Factor Priority Matrix */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
              <div>
                <h3 style={{ fontSize: "0.95rem" }}>5-Factor Priority Matrix</h3>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  Dynamic route scoring weights (sum = 100%)
                </div>
              </div>
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
                        {icon} <strong style={{ color: "var(--color-text-primary)" }}>{label}</strong>
                        {diff !== 0 && (
                          <span style={{
                            marginLeft: "0.35rem", fontSize: "0.7rem",
                            color: diff > 0 ? "var(--color-success)" : "var(--color-danger)",
                            fontWeight: 700
                          }}>
                            {diff > 0 ? `+${diff}%` : `${diff}%`}
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 800, color, fontSize: "0.95rem" }}>{pct}%</span>
                    </div>
                    <div className="score-bar-track" style={{ height: "5px" }}>
                      <div
                        className="score-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Collapsible Info Toggle */}
            <details style={{ marginTop: "0.85rem", borderTop: "1px solid var(--color-border)", paddingTop: "0.6rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.76rem", color: "var(--color-primary-light)", fontWeight: 600 }}>
                💡 How the 5-Factor Scoring Model Works ▾
              </summary>
              <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)", marginTop: "0.45rem", lineHeight: 1.5 }}>
                Every Pune route factor score (0–100) is multiplied by its active weight:
                <br />
                <code style={{ fontSize: "0.74rem", color: "var(--color-accent)" }}>
                  Score = (Access × {displayWeights.access}%) + (Safety × {displayWeights.safety}%) + (Crowd × {displayWeights.crowd}%) + (Conv × {displayWeights.convenience}%) + (Cost × {displayWeights.cost}%)
                </code>
              </div>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
