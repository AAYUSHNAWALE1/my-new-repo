import { FACTOR_META } from "../data/routes";

/**
 * A 5-factor progress bar showing each accessibility score.
 * @param {{ scores: object, compact?: boolean }} props
 */
export default function ScoreBars({ scores, compact = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? "0.5rem" : "0.75rem" }}>
      {FACTOR_META.map(({ key, label, color, weight, icon }) => {
        const val = Math.max(0, Math.min(100, scores?.[key] ?? 0));
        return (
          <div key={key} className="score-bar-wrap">
            <div className="score-bar-label">
              <span>
                {icon} {label}
                {!compact && (
                  <span style={{ marginLeft: "0.3rem", fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                    ({Math.round(weight * 100)}%)
                  </span>
                )}
              </span>
              <span>{val}</span>
            </div>
            <div className="score-bar-track">
              <div
                className="score-bar-fill"
                style={{ width: `${val}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
