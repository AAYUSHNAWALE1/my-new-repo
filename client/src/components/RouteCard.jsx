import ScoreBars from "./ScoreBars";
import { computeEta } from "../data/routes";

/**
 * Route card showing name, weighted score badge, ETA, factor bars, and community hazard alerts.
 * @param {{ route, scenario, weightedScore, factorScores, selected, onSelect, disruptions }} props
 */
export default function RouteCard({
  route,
  scenario,
  weightedScore,
  factorScores,
  selected,
  onSelect,
  disruptions = [],
}) {
  const eta = computeEta(route.baseEtaMin, scenario);

  return (
    <div
      className={`route-card fade-in-up${selected ? " selected" : ""}`}
      onClick={() => onSelect(route.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(route.id)}
      aria-pressed={selected}
    >
      <div className="route-card-header">
        {/* Left: name + description + barrier warning */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="route-name">{route.shortName || route.name}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
            {route.description}
          </div>

          {/* Infrastructure barrier warning (e.g. Route A stairs) */}
          {route.hasBarriers && (
            <div style={{
              marginTop: "0.4rem", fontSize: "0.74rem", color: "var(--color-danger)",
              background: "rgba(255,107,107,0.1)", borderRadius: "var(--radius-sm)",
              padding: "0.2rem 0.5rem", display: "inline-block", marginRight: "0.35rem"
            }}>
              {route.barrierWarning}
            </div>
          )}

          {/* Live community hazard alerts logged by previous users */}
          {disruptions.length > 0 && (
            <div style={{
              marginTop: "0.4rem", fontSize: "0.74rem", color: "var(--color-warning)",
              background: "rgba(255,179,71,0.12)", border: "1px solid rgba(255,179,71,0.3)",
              borderRadius: "var(--radius-sm)", padding: "0.2rem 0.5rem", display: "inline-block"
            }}>
              🚨 Reported: {disruptions.map((d) => `${d.hazardEmoji} ${d.hazardLabel}`).join(", ")}
            </div>
          )}
        </div>

        {/* Right: score badge */}
        <div
          className="route-score-badge"
          style={{ background: `linear-gradient(135deg, ${route.color}cc, ${route.color})` }}
          title="Weighted accessibility score"
        >
          {weightedScore}
        </div>
      </div>

      <div className="route-meta">
        <div className="route-meta-item">
          <span>🕐</span>
          <span>~{eta} min</span>
        </div>
        <div className="route-meta-item">
          <span>♿</span>
          <span>Wheelchair</span>
        </div>
        {selected && (
          <div className="route-meta-item" style={{ color: "var(--color-primary-light)" }}>
            <span>✓</span>
            <span>Selected</span>
          </div>
        )}
      </div>

      <ScoreBars scores={factorScores} compact />
    </div>
  );
}
