import { useState, useEffect, useRef } from "react";
import {
  fetchPlaceSuggestions,
  getRecentSearches,
  addRecentSearch,
  escapeHtml
} from "../services/routingService";

/**
 * Google Maps-Style Direction Search Card
 * - Two inputs: From & To
 * - Debounced autocomplete (Photon with Nominatim backup)
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Full ARIA accessibility roles
 * - Recent searches when empty box is focused
 * - "Use my location" & Swap buttons
 * - High-contrast mode toggle
 */
export default function GoogleSearchCard({
  fromPlace,
  toPlace,
  onFromChange,
  onToChange,
  onSwap,
  onUseMyLocation,
  isHighContrast = false,
  onToggleHighContrast,
}) {
  const [activeField, setActiveField] = useState(null); // 'from' | 'to' | null
  const [fromQuery, setFromQuery] = useState(fromPlace?.name || "Pune Railway Station");
  const [toQuery, setToQuery] = useState(toPlace?.name || "Fergusson College");

  const [suggestions, setSuggestions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Sync state if props change externally
  useEffect(() => {
    if (fromPlace?.name) setFromQuery(fromPlace.name);
  }, [fromPlace?.name]);

  useEffect(() => {
    if (toPlace?.name) setToQuery(toPlace.name);
  }, [toPlace?.name]);

  // Load recent searches on focus
  function handleFocus(field) {
    setActiveField(field);
    setHighlightedIndex(-1);
    const recents = getRecentSearches();
    setRecentSearches(recents);

    const currentQuery = field === "from" ? fromQuery : toQuery;
    if (currentQuery.trim().length >= 2) {
      triggerSearch(currentQuery);
    } else {
      setSuggestions([]);
    }
  }

  function handleBlur() {
    // Small timeout to allow click on suggestion item to register
    setTimeout(() => {
      setActiveField(null);
      setSuggestions([]);
      setHighlightedIndex(-1);
    }, 220);
  }

  function triggerSearch(text) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const results = await fetchPlaceSuggestions(text, controller.signal);
        setSuggestions(results);
        setHighlightedIndex(-1);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Autocomplete search failed:", err);
        }
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);
  }

  function handleInputChange(field, val) {
    if (field === "from") {
      setFromQuery(val);
      triggerSearch(val);
    } else {
      setToQuery(val);
      triggerSearch(val);
    }
  }

  function handleSelectSuggestion(item) {
    addRecentSearch(item);
    if (activeField === "from") {
      setFromQuery(item.name);
      onFromChange?.(item);
    } else {
      setToQuery(item.name);
      onToChange?.(item);
    }
    setActiveField(null);
    setSuggestions([]);
  }

  function handleKeyDown(e) {
    const list = suggestions.length > 0 ? suggestions : recentSearches;
    if (!list.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < list.length) {
        e.preventDefault();
        handleSelectSuggestion(list[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActiveField(null);
      setSuggestions([]);
    }
  }

  const currentQuery = activeField === "from" ? fromQuery : toQuery;
  const showRecents = activeField && (!currentQuery || currentQuery.trim().length < 2) && recentSearches.length > 0;
  const showSuggestions = activeField && suggestions.length > 0;
  const isDropdownOpen = showRecents || showSuggestions;

  return (
    <div
      className={`card ${isHighContrast ? "high-contrast-card" : ""}`}
      style={{
        padding: "0.85rem",
        position: "relative",
        background: isHighContrast ? "#000000" : "var(--color-surface)",
        borderColor: isHighContrast ? "#ffff00" : "var(--color-border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}
      role="search"
      aria-label="Route direction search"
    >
      {/* Top Header: Title, Geolocation & High Contrast Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <span style={{ fontSize: "1rem" }}>🗺️</span>
          <span style={{ fontSize: "0.86rem", fontWeight: 700, color: isHighContrast ? "#ffff00" : "var(--color-text-primary)" }}>
            Google-Style Navigation & Search
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          {/* Use My Location button */}
          <button
            type="button"
            onClick={onUseMyLocation}
            className="btn btn-ghost"
            style={{
              padding: "0.25rem 0.55rem",
              fontSize: "0.74rem",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              minHeight: "44px",
              minWidth: "44px",
            }}
            title="Use current GPS location"
            aria-label="Use my location"
          >
            <span>🎯</span>
            <span className="hide-on-mobile">My Location</span>
          </button>

          {/* High Contrast Mode Toggle */}
          <button
            type="button"
            onClick={onToggleHighContrast}
            className="btn btn-ghost"
            style={{
              padding: "0.25rem 0.55rem",
              fontSize: "0.74rem",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              minHeight: "44px",
              minWidth: "44px",
              borderColor: isHighContrast ? "#ffff00" : "var(--color-border)",
              color: isHighContrast ? "#ffff00" : "var(--color-text-secondary)",
            }}
            title="Toggle Accessible High Contrast Mode"
            aria-label="Toggle High Contrast Mode"
            aria-pressed={isHighContrast}
          >
            <span>👁️</span>
            <span>{isHighContrast ? "High Contrast On" : "High Contrast"}</span>
          </button>
        </div>
      </div>

      {/* Direction inputs layout */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0.55rem", alignItems: "center" }}>
        {/* Left Google-style line connector icons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem", padding: "0.3rem 0" }}>
          {/* Green start circle */}
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#0F9D58",
              border: "2px solid #000",
            }}
            aria-hidden="true"
          />
          {/* Dotted vertical connector */}
          <div style={{ width: "2px", height: "18px", borderLeft: "2px dotted var(--color-text-muted)" }} aria-hidden="true" />
          {/* Red destination pin */}
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#EA4335",
              border: "2px solid #fff",
            }}
            aria-hidden="true"
          />
        </div>

        {/* Inputs stack */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", position: "relative" }}>
          {/* From Input */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              id="search-input-from"
              className="input"
              value={fromQuery}
              onChange={(e) => handleInputChange("from", e.target.value)}
              onFocus={() => handleFocus("from")}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Choose starting point or click map..."
              aria-label="Starting point"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={activeField === "from" && isDropdownOpen}
              aria-controls="search-suggestions-dropdown"
              aria-activedescendant={
                highlightedIndex >= 0 ? `suggestion-item-${highlightedIndex}` : undefined
              }
              style={{
                width: "100%",
                fontSize: "0.84rem",
                padding: "0.45rem 0.65rem",
                minHeight: "44px",
                borderColor: activeField === "from" ? "#4285F4" : undefined,
              }}
            />
          </div>

          {/* To Input */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              id="search-input-to"
              className="input"
              value={toQuery}
              onChange={(e) => handleInputChange("to", e.target.value)}
              onFocus={() => handleFocus("to")}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Choose destination or click map..."
              aria-label="Destination point"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={activeField === "to" && isDropdownOpen}
              aria-controls="search-suggestions-dropdown"
              aria-activedescendant={
                highlightedIndex >= 0 ? `suggestion-item-${highlightedIndex}` : undefined
              }
              style={{
                width: "100%",
                fontSize: "0.84rem",
                padding: "0.45rem 0.65rem",
                minHeight: "44px",
                borderColor: activeField === "to" ? "#4285F4" : undefined,
              }}
            />
          </div>
        </div>

        {/* Swap Button */}
        <div>
          <button
            type="button"
            id="btn-swap-locations"
            onClick={onSwap}
            className="btn btn-ghost"
            style={{
              minHeight: "44px",
              minWidth: "44px",
              padding: "0.5rem",
              borderRadius: "50%",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--color-border)",
            }}
            title="Swap start and destination locations"
            aria-label="Swap starting point and destination"
          >
            ⇅
          </button>
        </div>
      </div>

      {/* Autocomplete / Recent Searches Dropdown Panel */}
      {isDropdownOpen && (
        <ul
          id="search-suggestions-dropdown"
          role="listbox"
          aria-label="Place suggestions"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "12px",
            right: "12px",
            zIndex: 2500,
            background: isHighContrast ? "#000000" : "var(--color-surface)",
            border: isHighContrast ? "2px solid #ffff00" : "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            maxHeight: "260px",
            overflowY: "auto",
            margin: 0,
            padding: "0.3rem 0",
            listStyle: "none",
          }}
        >
          {showRecents && (
            <li
              style={{
                padding: "0.3rem 0.85rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              🕒 Recent Searches
            </li>
          )}

          {loadingSuggestions && (
            <li style={{ padding: "0.6rem 0.85rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              Searching places…
            </li>
          )}

          {(showSuggestions ? suggestions : recentSearches).map((item, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={item.id || `item-${index}`}
                id={`suggestion-item-${index}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={() => handleSelectSuggestion(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: "0.55rem 0.85rem",
                  cursor: "pointer",
                  background: isHighlighted
                    ? isHighContrast ? "#333300" : "rgba(66, 133, 244, 0.15)"
                    : "transparent",
                  borderLeft: isHighlighted ? "3px solid #4285F4" : "3px solid transparent",
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{showRecents ? "🕒" : "📍"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.84rem",
                      color: isHighContrast ? "#ffff00" : "var(--color-text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    dangerouslySetInnerHTML={{ __html: escapeHtml(item.name) }}
                  />
                  {item.secondaryText && (
                    <div
                      style={{
                        fontSize: "0.73rem",
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(item.secondaryText) }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
