/**
 * Navigation bar with screen tabs, dropdown menu for mobile, and PivotPath brand.
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
          padding: "3px 12px",
          borderRadius: "6px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <img
          src="/logo.png"
          alt="PivotPath"
          style={{
            height: "26px",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      {/* Desktop Screen Navigation Tabs */}
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

      {/* Mobile / Responsive Dropdown Menu */}
      <div className="nav-mobile-dropdown">
        <select
          id="screen-select-dropdown"
          className="select-dropdown"
          value={activeScreen}
          onChange={(e) => onScreenChange(e.target.value)}
          aria-label="Select screen"
          style={{ padding: "0.35rem 2rem 0.35rem 0.65rem", fontSize: "0.8rem" }}
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
