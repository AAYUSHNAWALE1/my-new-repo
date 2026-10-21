/**
 * Routing & Search Service for Google Maps Style Navigation
 * - Photon autocomplete API with Nominatim backup
 * - OSRM Foot Server routing with geometries=geojson and steps=true
 * - LocalStorage recent searches (last 5)
 * - HTML escaping helper
 */

const RECENT_SEARCHES_KEY = "pivotpath_recent_searches";

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Retrieve recent searches from localStorage.
 * @returns {Array<{ name: string, secondaryText: string, lat: number, lng: number }>}
 */
export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw).slice(0, 5) : [];
  } catch {
    return [];
  }
}

/**
 * Save a search to recent searches in localStorage.
 * @param {{ name: string, secondaryText: string, lat: number, lng: number }} item
 */
export function addRecentSearch(item) {
  if (!item || !item.name) return;
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter(
      (s) => Math.abs(s.lat - item.lat) > 0.0001 || Math.abs(s.lng - item.lng) > 0.0001
    );
    const updated = [{
      name: item.name,
      secondaryText: item.secondaryText || "",
      lat: Number(item.lat),
      lng: Number(item.lng)
    }, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // LocalStorage quota or access denied
  }
}

/**
 * Query autocomplete suggestions using Photon with Nominatim as backup.
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{ id: string, name: string, secondaryText: string, lat: number, lng: number }>>}
 */
export async function fetchPlaceSuggestions(query, signal) {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  // Try Photon first (fast, OSM-based)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`;
    const res = await fetch(photonUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        return data.features.map((f, i) => {
          const p = f.properties || {};
          const name = p.name || p.street || p.city || q;
          const parts = [p.district, p.city, p.state, p.country].filter(Boolean);
          const secondaryText = parts.length > 0 ? parts.join(", ") : "Location";
          const [lng, lat] = f.geometry.coordinates;
          return {
            id: `photon-${i}-${lat}-${lng}`,
            name,
            secondaryText,
            lat,
            lng,
          };
        });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    // Photon failed, proceed to Nominatim backup
  }

  // Backup: Nominatim OpenStreetMap
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: { "User-Agent": "PivotPath-Wayfarer/1.0" },
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item, i) => {
          const parts = item.display_name.split(", ");
          const name = parts[0] || item.name || q;
          const secondaryText = parts.slice(1, 4).join(", ");
          return {
            id: `nom-${item.place_id || i}`,
            name,
            secondaryText,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          };
        });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
  }

  return [];
}

/**
 * Fetch real walking route from the OSRM Foot server.
 * @param {{ lat: number, lng: number }} fromCoord
 * @param {{ lat: number, lng: number }} toCoord
 * @returns {Promise<{
 *   routes: Array<{
 *     waypoints: Array<[number, number]>,
 *     distanceMeters: number,
 *     durationSeconds: number,
 *     durationMinutes: number,
 *     etaClock: string,
 *     steps: Array<{ instruction: string, distance: number, location: [number, number] }>
 *   }>,
 *   isOfflineFallback?: boolean
 * }>}
 */
export async function fetchOsrmFootRoutes(fromCoord, toCoord) {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${fromCoord.lng},${fromCoord.lat};${toCoord.lng},${toCoord.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { "User-Agent": "PivotPath-Wayfarer/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.routes) && data.routes.length > 0) {
        const parsed = data.routes.map((r) => {
          // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
          const waypoints = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const distanceMeters = Math.round(r.distance);
          const durationSeconds = Math.round(r.duration);
          const durationMinutes = Math.max(1, Math.round(r.duration / 60));

          // Clock ETA string (e.g. "4:35 pm")
          const arrivalDate = new Date(Date.now() + durationSeconds * 1000);
          const etaClock = arrivalDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

          // Extract steps
          const steps = (r.legs?.[0]?.steps || []).map((st) => {
            const maneuver = st.maneuver || {};
            const type = maneuver.type || "step";
            const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : "";
            const streetName = st.name ? ` onto ${st.name}` : "";
            let instruction = st.name
              ? `${type.charAt(0).toUpperCase() + type.slice(1)}${modifier}${streetName}`
              : `Continue${modifier}`;
            if (type === "depart") instruction = `Start on ${st.name || "path"}`;
            if (type === "arrive") instruction = `Arrive at destination`;

            const loc = maneuver.location ? [maneuver.location[1], maneuver.location[0]] : waypoints[0];
            return {
              instruction,
              distance: Math.round(st.distance),
              location: loc,
            };
          });

          return {
            waypoints,
            distanceMeters,
            durationSeconds,
            durationMinutes,
            etaClock,
            steps,
          };
        });

        return { routes: parsed, isOfflineFallback: false };
      }
    }
  } catch (err) {
    console.warn("OSRM routing request failed or timed out, using fallback:", err.message);
  }

  // Fallback: straight line with approximate walking speed (4.5 km/h)
  const dLat = toCoord.lat - fromCoord.lat;
  const dLng = toCoord.lng - fromCoord.lng;
  // Approximate distance in km
  const approxKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  const distanceMeters = Math.round(approxKm * 1000);
  const durationMinutes = Math.max(2, Math.round((approxKm / 4.5) * 60));
  const arrivalDate = new Date(Date.now() + durationMinutes * 60 * 1000);
  const etaClock = arrivalDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const fallbackRoute = {
    waypoints: [
      [fromCoord.lat, fromCoord.lng],
      [(fromCoord.lat + toCoord.lat) / 2, (fromCoord.lng + toCoord.lng) / 2],
      [toCoord.lat, toCoord.lng],
    ],
    distanceMeters,
    durationSeconds: durationMinutes * 60,
    durationMinutes,
    etaClock,
    steps: [
      { instruction: "Head toward destination", distance: distanceMeters, location: [fromCoord.lat, fromCoord.lng] },
      { instruction: "Arrive at destination", distance: 0, location: [toCoord.lat, toCoord.lng] },
    ],
  };

  return { routes: [fallbackRoute], isOfflineFallback: true };
}
