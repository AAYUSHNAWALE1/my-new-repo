import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { JOURNEY_STAGES, SEGMENTS } from "../data/segments";

// Fix Leaflet default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Tile Layer Configurations ──────────────────────────────────────────────────
const TILE_LAYERS = {
  osm: {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  esri: {
    id: "esri",
    name: "Streets (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom',
  },
};

// ── Google Maps Style Markers ─────────────────────────────────────────────────

// Start: Green/black circular pin
function startPinIcon() {
  return L.divIcon({
    className: "google-start-pin",
    html: `
      <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        <div style="width:20px;height:20px;border-radius:50%;background:#0F9D58;border:2.5px solid #000;box-shadow:0 3px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
          <div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// Destination: Red teardrop Google Maps pin
function destPinIcon() {
  return L.divIcon({
    className: "google-dest-pin",
    html: `
      <div style="position:relative;width:26px;height:34px;">
        <svg viewBox="0 0 24 32" width="26" height="34" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,0.45));">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#EA4335" stroke="#B31412" stroke-width="1.2"/>
          <circle cx="12" cy="11" r="4.5" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -32],
  });
}

// User live position: Blue dot with soft pulsing halo
function liveGpsAvatarIcon() {
  return L.divIcon({
    className: "google-live-gps",
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(66, 133, 244, 0.35);animation:pulse-ring 1.8s ease-out infinite;"></div>
        <div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:2.5px solid #ffffff;box-shadow:0 0 8px rgba(66, 133, 244, 0.8);z-index:2;"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// Hazard Marker
function hazardMarkerIcon(emoji) {
  return L.divIcon({
    className: "google-hazard-marker",
    html: `
      <div style="background:#ffffff;border:2px solid #EA4335;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(234,67,53,0.45);font-size:13px;">
        ${emoji}
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// ── Map Controller Helper Components ──────────────────────────────────────────

// Smooth fitBounds when routes update
function BoundsFitter({ routes, focusStepCoord }) {
  const map = useMap();

  useEffect(() => {
    if (focusStepCoord) {
      map.flyTo(focusStepCoord, 17, { duration: 0.8 });
      return;
    }

    const allCoords = (routes || []).flatMap((r) => r.waypoints || []);
    if (allCoords.length > 0) {
      map.fitBounds(allCoords, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 40],
        maxZoom: 16,
      });
    }
  }, [routes, focusStepCoord, map]);

  return null;
}

// Map Click / Long Press listener for "Directions from here / to here"
function MapClickContextListener({ onMapClickCoord }) {
  useMapEvents({
    click(e) {
      onMapClickCoord({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    contextmenu(e) {
      onMapClickCoord({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Round zoom buttons controller at bottom-right
function RoundZoomControls() {
  const map = useMap();
  return (
    <div
      style={{
        position: "absolute",
        bottom: "80px",
        right: "12px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <button
        type="button"
        onClick={() => map.zoomIn()}
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.15)",
          color: "#3c4043",
          fontSize: "1.3rem",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.15)",
          color: "#3c4043",
          fontSize: "1.3rem",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
        aria-label="Zoom out"
        title="Zoom out"
      >
        &minus;
      </button>
    </div>
  );
}

/**
 * Google Maps Styled Map Component
 */
export default function PuneMap({
  routes = [],
  selectedRouteId,
  weightedScores = {},
  onRouteClick,
  currentStageIndex = 0,
  activeDisruptions = [],
  fromCoord = { lat: 18.5282, lng: 73.8742, name: "Pune Railway Station" },
  toCoord = { lat: 18.5185, lng: 73.8412, name: "Fergusson College" },
  onSetFromLocation,
  onSetToLocation,
  focusStepCoord = null,
  height = "520px",
}) {
  const [activeTileId, setActiveTileId] = useState("osm");
  const [tileErrorCount, setTileErrorCount] = useState(0);
  const [clickedCoord, setClickedCoord] = useState(null);

  const currentStage = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];

  // Center between from and to
  const center = [
    (fromCoord.lat + toCoord.lat) / 2,
    (fromCoord.lng + toCoord.lng) / 2,
  ];

  // Completed segments for current stage
  const completedSegments = SEGMENTS.filter((s) =>
    currentStage.completedSegmentIds.includes(s.id)
  );

  // Fallback to OSM if alternative tile fails repeatedly
  function handleTileError() {
    setTileErrorCount((prev) => {
      const next = prev + 1;
      if (next >= 3 && activeTileId !== "osm") {
        console.warn("Tile layer error threshold reached, falling back to OpenStreetMap");
        setActiveTileId("osm");
      }
      return next;
    });
  }

  function handleSwitchTileLayer() {
    const nextId = activeTileId === "osm" ? "esri" : "osm";
    setActiveTileId(nextId);
    setTileErrorCount(0);
  }

  const currentTileConfig = TILE_LAYERS[activeTileId] || TILE_LAYERS.osm;

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <MapContainer
        center={center}
        zoom={14}
        zoomControl={false}
        style={{ height: "100%", width: "100%", borderRadius: "var(--radius-md)" }}
        scrollWheelZoom
      >
        {/* Dynamic Tile Layer with automatic fallback */}
        <TileLayer
          key={currentTileConfig.id}
          url={currentTileConfig.url}
          attribution={currentTileConfig.attribution}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />

        <BoundsFitter routes={routes} focusStepCoord={focusStepCoord} />
        <MapClickContextListener onMapClickCoord={(coord) => setClickedCoord(coord)} />
        <RoundZoomControls />

        {/* ── Start Marker (Green / Black circular pin) ── */}
        <Marker position={[fromCoord.lat, fromCoord.lng]} icon={startPinIcon()}>
          <Popup>
            <div style={{ fontSize: "0.84rem" }}>
              <div style={{ fontWeight: 800, color: "#0F9D58" }}>🟢 Start Point</div>
              <strong>{fromCoord.name || "Starting Point"}</strong>
            </div>
          </Popup>
        </Marker>

        {/* ── Destination Marker (Red teardrop Google pin) ── */}
        <Marker position={[toCoord.lat, toCoord.lng]} icon={destPinIcon()}>
          <Popup>
            <div style={{ fontSize: "0.84rem" }}>
              <div style={{ fontWeight: 800, color: "#EA4335" }}>📍 Destination</div>
              <strong>{toCoord.name || "Destination"}</strong>
            </div>
          </Popup>
        </Marker>

        {/* ── Completed Segments (Grey) ── */}
        {completedSegments.map((seg) => (
          <Polyline
            key={`completed-${seg.id}`}
            positions={seg.coordinates}
            pathOptions={{
              color: "#9AA0A6",
              weight: 5,
              opacity: 0.75,
              dashArray: "4 4",
            }}
          >
            <Popup>
              <strong>✓ {seg.name} (Traversed)</strong><br />
              <span style={{ fontSize: "0.75rem", color: "#666" }}>Segment locked behind traveler.</span>
            </Popup>
          </Polyline>
        ))}

        {/* ── Route Polylines (White Outline Underlay + Top Line) ── */}
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const routeColor = isSelected ? "#4285F4" : "#9AA0A6";
          const mainWeight = isSelected ? 6 : 4;
          const outlineWeight = mainWeight + 4; // White outline underneath

          return (
            <div key={route.id}>
              {/* White Outline Underlay */}
              <Polyline
                positions={route.waypoints}
                pathOptions={{
                  color: "#ffffff",
                  weight: outlineWeight,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              {/* Main Coloured Line */}
              <Polyline
                positions={route.waypoints}
                pathOptions={{
                  color: routeColor,
                  weight: mainWeight,
                  opacity: isSelected ? 1 : 0.65,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                eventHandlers={{
                  click: () => onRouteClick?.(route.id),
                }}
              >
                <Popup>
                  <div style={{ fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: 800, color: routeColor }}>
                      {route.shortName || route.name}
                    </div>
                    <div>Score: <strong>{weightedScores?.[route.id] ?? "—"}</strong></div>
                    {route.description && <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "3px" }}>{route.description}</div>}
                  </div>
                </Popup>
              </Polyline>
            </div>
          );
        })}

        {/* ── Problem Segments: Red and Dashed ── */}
        {activeDisruptions.map((d) => {
          const seg = SEGMENTS.find((s) => s.id === d.segmentId);
          if (!seg || !seg.coordinates || !seg.coordinates.length) return null;
          return (
            <Polyline
              key={`disrupted-line-${d.id}`}
              positions={seg.coordinates}
              pathOptions={{
                color: "#EA4335",
                weight: 5,
                opacity: 0.9,
                dashArray: "6 6",
              }}
            >
              <Popup>
                <strong style={{ color: "#EA4335" }}>🚨 Obstacle on {seg.name}</strong><br />
                {d.hazardLabel} ({d.source === "station_staff" ? "Staff Verified" : "Traveler Report"})
              </Popup>
            </Polyline>
          );
        })}

        {/* ── Active Hazard Icons on Segments ── */}
        {activeDisruptions.map((d) => {
          const seg = SEGMENTS.find((s) => s.id === d.segmentId);
          if (!seg || !seg.coordinates.length) return null;
          const midCoord = seg.coordinates[Math.floor(seg.coordinates.length / 2)];
          return (
            <Marker
              key={`hazard-icon-${d.id}`}
              position={midCoord}
              icon={hazardMarkerIcon(d.hazardEmoji)}
              zIndexOffset={900}
            >
              <Popup>
                <strong>{d.hazardEmoji} {d.hazardLabel}</strong><br />
                Segment: <em>{seg.name}</em><br />
                Reported by: <strong>{d.source === "station_staff" ? "👮 Station Staff" : "👤 Traveler"}</strong><br />
                {d.note && <div style={{ marginTop: "4px" }}>"{d.note}"</div>}
              </Popup>
            </Marker>
          );
        })}

        {/* ── Live Traveler GPS Position (Blue dot with pulsing halo) ── */}
        <Marker
          position={currentStage.coordinates}
          icon={liveGpsAvatarIcon()}
          zIndexOffset={1000}
        >
          <Popup>
            <div style={{ minWidth: "160px" }}>
              <div style={{ color: "#4285F4", fontWeight: 800, fontSize: "0.85rem" }}>
                📍 Live Position
              </div>
              <strong>{currentStage.name}</strong><br />
              <span style={{ fontSize: "0.75rem", color: "#666" }}>
                Progress: {currentStage.progressPct}% | {currentStage.landmark}
              </span>
            </div>
          </Popup>
        </Marker>

        {/* ── Click / Long-press Context Popup ── */}
        {clickedCoord && (
          <Popup
            position={[clickedCoord.lat, clickedCoord.lng]}
            onClose={() => setClickedCoord(null)}
          >
            <div style={{ padding: "0.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "150px" }}>
              <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#3c4043" }}>Dropped Pin</div>
              <button
                type="button"
                onClick={() => {
                  onSetFromLocation?.({
                    lat: clickedCoord.lat,
                    lng: clickedCoord.lng,
                    name: `Dropped Pin (${clickedCoord.lat.toFixed(4)}, ${clickedCoord.lng.toFixed(4)})`,
                  });
                  setClickedCoord(null);
                }}
                className="btn btn-ghost"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  minHeight: "44px",
                  color: "#0F9D58",
                }}
              >
                🟢 Directions from here
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetToLocation?.({
                    lat: clickedCoord.lat,
                    lng: clickedCoord.lng,
                    name: `Dropped Pin (${clickedCoord.lat.toFixed(4)}, ${clickedCoord.lng.toFixed(4)})`,
                  });
                  setClickedCoord(null);
                }}
                className="btn btn-ghost"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  textAlign: "left",
                  justifyContent: "flex-start",
                  minHeight: "44px",
                  color: "#EA4335",
                }}
              >
                📍 Directions to here
              </button>
            </div>
          </Popup>
        )}
      </MapContainer>

      {/* Layer Switcher Button (Bottom-Right, above attribution) */}
      <div
        style={{
          position: "absolute",
          bottom: "28px",
          right: "12px",
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={handleSwitchTileLayer}
          className="btn btn-ghost"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.18)",
            color: "#3c4043",
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "0.35rem 0.65rem",
            borderRadius: "18px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            cursor: "pointer",
          }}
          title={`Currently: ${currentTileConfig.name}. Click to switch basemap`}
          aria-label={`Current basemap: ${currentTileConfig.name}. Switch basemap`}
        >
          <span>🗺️</span>
          <span>{activeTileId === "osm" ? "Switch to Streets (Esri)" : "Switch to OSM"}</span>
        </button>
      </div>
    </div>
  );
}
