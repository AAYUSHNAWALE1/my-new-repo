import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { PUNE_ORIGIN, PUNE_DEST } from "../data/routes";
import { JOURNEY_STAGES, SEGMENTS } from "../data/segments";

// Fix Leaflet default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom coloured dot marker
function dotIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Traveler GPS Position Marker with animated pulse ring
function travelerAvatarIcon(label) {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(0,212,170,0.35);animation:pulse-ring 1.8s ease-out infinite;"></div>
        <div style="width:16px;height:16px;border-radius:50%;background:#00D4AA;border:2.5px solid #fff;box-shadow:0 0 10px #00D4AA;z-index:2;"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Hazard Obstacle Marker
function hazardMarkerIcon(emoji) {
  return L.divIcon({
    className: "",
    html: `
      <div style="background:#161b22;border:2px solid #ff5f56;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(255,95,86,0.5);font-size:14px;">
        ${emoji}
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Fit map bounds to all route waypoints on mount/update
function BoundsFitter({ routes }) {
  const map = useMap();
  useEffect(() => {
    const all = routes.flatMap((r) => r.waypoints);
    if (all.length) map.fitBounds(all, { padding: [40, 40] });
  }, [routes, map]);
  return null;
}

/**
 * Interactive Leaflet map showing Pune corridor, candidate routes,
 * live traveler GPS position, and active segment obstacles.
 */
export default function PuneMap({
  routes,
  selectedRouteId,
  weightedScores,
  onRouteClick,
  currentStageIndex = 0,
  activeDisruptions = [],
  height = "520px",
}) {
  const currentStage = JOURNEY_STAGES[currentStageIndex] || JOURNEY_STAGES[0];
  const center = [
    (PUNE_ORIGIN.lat + PUNE_DEST.lat) / 2,
    (PUNE_ORIGIN.lng + PUNE_DEST.lng) / 2,
  ];

  // Completed segments for the current stage (never returned to)
  const completedSegments = SEGMENTS.filter((s) =>
    currentStage.completedSegmentIds.includes(s.id)
  );

  return (
    <div style={{ position: "relative" }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height, width: "100%", borderRadius: "var(--radius-md)" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <BoundsFitter routes={routes} />

        {/* Origin & Destination markers */}
        <Marker position={[PUNE_ORIGIN.lat, PUNE_ORIGIN.lng]} icon={dotIcon("#6C63FF")}>
          <Popup>
            <strong>🚉 {PUNE_ORIGIN.label}</strong><br />
            Journey Start Point
          </Popup>
        </Marker>
        <Marker position={[PUNE_DEST.lat, PUNE_DEST.lng]} icon={dotIcon("#00D4AA")}>
          <Popup>
            <strong>🎓 {PUNE_DEST.label}</strong><br />
            Journey Destination
          </Popup>
        </Marker>

        {/* ── Completed Segments (Muted green/grey dashed lines) ── */}
        {completedSegments.map((seg) => (
          <Polyline
            key={`completed-${seg.id}`}
            positions={seg.coordinates}
            pathOptions={{
              color: "#34D399",
              weight: 5,
              opacity: 0.65,
              dashArray: "6 6",
            }}
          >
            <Popup>
              <strong style={{ color: "#34D399" }}>✓ {seg.name}</strong><br />
              Segment completed. Will never be recommended or returned to!
            </Popup>
          </Polyline>
        ))}

        {/* ── Active Route Polylines from Current Stage Onward ── */}
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          return (
            <Polyline
              key={route.id}
              positions={route.waypoints}
              pathOptions={{
                color: route.color,
                weight: isSelected ? 6.5 : 3.5,
                opacity: isSelected ? 1 : 0.45,
                dashArray: isSelected ? undefined : "8 6",
              }}
              eventHandlers={{ click: () => onRouteClick(route.id) }}
            >
              <Popup>
                <strong style={{ color: route.color }}>{route.name}</strong><br />
                Score: <strong>{weightedScores?.[route.id] ?? "—"}</strong><br />
                {route.description}
              </Popup>
            </Polyline>
          );
        })}

        {/* ── Live Traveler GPS Position Avatar ── */}
        <Marker
          position={currentStage.coordinates}
          icon={travelerAvatarIcon(currentStage.name)}
          zIndexOffset={1000}
        >
          <Popup>
            <div style={{ minWidth: "160px" }}>
              <div style={{ color: "#00D4AA", fontWeight: 800, fontSize: "0.85rem" }}>
                📍 You Are Here
              </div>
              <strong>{currentStage.name}</strong><br />
              <span style={{ fontSize: "0.75rem", color: "#666" }}>
                Progress: {currentStage.progressPct}% | {currentStage.landmark}
              </span>
            </div>
          </Popup>
        </Marker>

        {/* ── Active Hazard Markers on Segments ── */}
        {activeDisruptions.map((d) => {
          const seg = SEGMENTS.find((s) => s.id === d.segmentId);
          if (!seg || !seg.coordinates.length) return null;
          // Place marker in the middle of the segment
          const midCoord = seg.coordinates[Math.floor(seg.coordinates.length / 2)];
          return (
            <Marker
              key={d.id}
              position={midCoord}
              icon={hazardMarkerIcon(d.hazardEmoji)}
              zIndexOffset={900}
            >
              <Popup>
                <strong>{d.hazardEmoji} {d.hazardLabel}</strong><br />
                Segment: <em>{seg.name}</em><br />
                Reported by: <strong>{d.source === "station_staff" ? "👮 Station Staff (Verified)" : "👤 Traveler"}</strong><br />
                {d.note && <div style={{ marginTop: "4px" }}>"{d.note}"</div>}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map Overlay: Traveler Progress Banner */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "rgba(22, 27, 34, 0.92)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "var(--radius-sm)",
          padding: "0.45rem 0.8rem",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          fontSize: "0.8rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00D4AA" }} />
        <span>
          <strong>Traveler GPS:</strong> {currentStage.name} ({currentStage.progressPct}%)
        </span>
      </div>
    </div>
  );
}
