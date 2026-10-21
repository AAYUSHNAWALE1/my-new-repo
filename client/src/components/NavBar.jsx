/**
 * Navigation bar with screen tabs and PivotPath logo.
 * @param {{ activeScreen, onScreenChange }} props
 */
const TABS = [
  { id: "plan",       label: "① Plan & Profile" },
  { id: "journey",    label: "② Journey & Map" },
  { id: "disruption", label: "③ Disruption & Recovery" },
];

export default function NavBar({ activeScreen, onScreenChange, disruptionsCount = 0 }) {
  return (
    <nav className="nav" role="navigation" aria-label="Main navigation">
      {/* PivotPath Official Brand Logo */}
      <div
        className="nav-brand"
        style={{
          display: "flex",
          alignItems: "center",
          background: "#ffffff",
          padding: "4px 14px",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          cursor: "pointer",
        }}
        onClick={() => onScreenChange("plan")}
        title="PivotPath Home (Plan & Profile)"
      >
        <img
          src="/logo.png"
          alt="PivotPath"
          style={{
            height: "32px",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      <ul className="nav-tabs" role="tablist">
        {TABS.map((tab) => (
          <li key={tab.id} role="presentation">
            <button
              id={`tab-${tab.id}`}
              className={`nav-tab${activeScreen === tab.id ? " active" : ""}`}
              role="tab"
              aria-selected={activeScreen === tab.id}
              aria-controls={`screen-${tab.id}`}
              onClick={() => onScreenChange(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <span>{tab.label}</span>
              {tab.id === "disruption" && disruptionsCount > 0 && (
                <span
                  style={{
                    background: "var(--color-danger)",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0.1rem 0.45rem",
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                  title={`${disruptionsCount} active disruption(s)`}
                >
                  {disruptionsCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
