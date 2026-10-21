/**
 * Navigation bar with screen tabs and PivotPath logo.
 * @param {{ activeScreen, onScreenChange }} props
 */
const TABS = [
  { id: "plan",       label: "① Plan & Profile" },
  { id: "journey",    label: "② Journey & Map" },
  { id: "disruption", label: "③ Disruption & Recovery" },
];

export default function NavBar({ activeScreen, onScreenChange }) {
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
        }}
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
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
