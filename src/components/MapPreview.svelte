<script lang="ts">
  import type { Segment } from "../types/page";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { getMemoizedDistance, formatDistance, getWalkingTime } from "../services/geo";

  function stopLabel(name?: string): string {
    if (!name) return "";
    const cleaned = name.replace(/^[^,]+,\s*/u, "").trim();
    return cleaned || name;
  }

  let {
    segment,
    primaryDepartureText,
    userLocation,
    locationRequestInFlight,
    walkingEtaEnabled,
    openFeatureSheet,
    t,
  }: {
    segment: Segment;
    primaryDepartureText: string;
    userLocation: [number, number] | null;
    locationRequestInFlight: boolean;
    walkingEtaEnabled: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    t: Record<string, string>;
  } = $props();

  type MapApp = "default" | "google" | "apple" | "waze";
  const MAP_PREF_KEY = "nasta_map_app_preference";
  const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

  let mapsSheetForIndex = $state<number | null>(null);
  let rememberMapChoice = $state(true);

  type MapPreviewParams = {
    center: [number, number];
    userLocation: [number, number] | null;
  };

  function mapPreview(node: HTMLDivElement, params: MapPreviewParams) {
    let currentMap: maplibregl.Map | null = null;
    let stopMarker: maplibregl.Marker | null = null;
    let userMarker: maplibregl.Marker | null = null;

    const render = (next: MapPreviewParams) => {
      if (currentMap) {
        currentMap.remove();
      }

      currentMap = new maplibregl.Map({
        container: node,
        style: MAP_STYLE,
        center: next.center,
        zoom: 14.5,
        attributionControl: false,
        dragPan: false,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false,
      });

      currentMap.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      currentMap.on("load", () => {
        stopMarker = new maplibregl.Marker({ color: "#111111" })
          .setLngLat(next.center)
          .addTo(currentMap!);

        if (next.userLocation) {
          userMarker = new maplibregl.Marker({ color: "#2f80ed" })
            .setLngLat(next.userLocation)
            .addTo(currentMap!);
        }
      });
    };

    render(params);

    return {
      update(next: MapPreviewParams) {
        const shouldRebuild =
          next.center[0] !== params.center[0] ||
          next.center[1] !== params.center[1] ||
          next.userLocation?.[0] !== params.userLocation?.[0] ||
          next.userLocation?.[1] !== params.userLocation?.[1];
        params = next;
        if (shouldRebuild) render(next);
      },
      destroy() {
        stopMarker?.remove();
        userMarker?.remove();
        currentMap?.remove();
      },
    };
  }

  function loadMapPreference(): MapApp {
    try {
      const stored = localStorage.getItem(MAP_PREF_KEY);
      if (stored === "google" || stored === "apple" || stored === "waze" || stored === "default") {
        return stored;
      }
    } catch {}
    return "default";
  }

  function saveMapPreference(app: MapApp) {
    try {
      localStorage.setItem(MAP_PREF_KEY, app);
    } catch {}
  }

  function openMapWithPreference(lat: number, lng: number, forcePick = false, rowIndex: number | null = null) {
    const pref = loadMapPreference();
    if (pref === 'default') {
      const ua = navigator.userAgent.toLowerCase();
      const isiOS = /iphone|ipad|ipod/.test(ua);
      const app = isiOS ? 'apple' : 'google';
      openMapApp(app, lat, lng);
      return;
    }
    openMapApp(pref, lat, lng);
  }

  function openMapApp(app: Exclude<MapApp, "default">, lat: number, lng: number) {
    const enc = `${lat},${lng}`;
    const urls = {
      google: `https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=walking`,
      apple: `https://maps.apple.com/?daddr=${enc}&dirflg=w`,
      waze: `https://waze.com/ul?ll=${enc}&navigate=yes`,
    };
    if (rememberMapChoice) saveMapPreference(app);
    window.open(urls[app], "_blank", "noopener,noreferrer");
    mapsSheetForIndex = null;
  }

  function mapAppOptions() {
    const ua = navigator.userAgent.toLowerCase();
    const isiOS = /iphone|ipad|ipod/.test(ua);
    return isiOS ? (["apple", "google", "waze"] as const) : (["google", "waze", "apple"] as const);
  }
</script>

{#if segment.fromStop.coord}
  {@const dist = userLocation ? getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1]) : null}
  {@const stopLat = segment.fromStop.coord[0]}
  {@const stopLon = segment.fromStop.coord[1]}
  <section class="journey-card">
    <div class="journey-head">
      <div class="journey-copy">
        <span class="journey-route">{stopLabel(segment.fromStop.name)} → {stopLabel(segment.direction?.destination)}</span>
      </div>
      <div class="journey-badge" aria-label={primaryDepartureText}>
        <span class="journey-minutes">{primaryDepartureText}</span>
        <span class="journey-label">{t.departing}</span>
      </div>
    </div>

    <div class="journey-map-shell">
      <div class="journey-map-label">
        <span>{t.walkToStop}</span>
        {#if dist !== null}
          <span>{formatDistance(dist)} · {getWalkingTime(dist)} min</span>
        {:else if walkingEtaEnabled && locationRequestInFlight}
          <span class="hint">{t.waitingForLocation}</span>
        {/if}
      </div>

      <div
        class="mini-map"
        use:mapPreview={{
          center: [stopLon, stopLat],
          userLocation,
        }}
      ></div>
    </div>

    <div class="journey-actions">
      {#if openFeatureSheet}
        <button
          type="button"
          class="map-link map-link-primary"
          onclick={() => openFeatureSheet(segment)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" stroke-linejoin="round"/>
            <path d="M9 22V12h6v10" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {t.nearbyVenues}
        </button>
      {/if}

      <button
        type="button"
        class="map-link map-link-secondary"
        onclick={() => openMapWithPreference(stopLat, stopLon, false, null)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {t.openInMaps}
      </button>
    </div>
  </section>
{/if}

<style>
  .journey-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 0 6px;
  }
  .journey-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .journey-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .journey-route {
    font-size: 18px;
    line-height: 1.1;
    font-weight: 700;
    color: var(--text);
  }
  .journey-badge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .journey-minutes {
    font-family: "Neue Machina", sans-serif;
    font-size: clamp(34px, 10vw, 54px);
    line-height: 0.9;
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--accent);
  }
  .journey-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--text-muted);
  }
  .journey-map-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--surface);
  }
  .journey-map-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .journey-map-label span:last-child {
    color: var(--text-muted);
    font-weight: 600;
  }
  .mini-map {
    width: 100%;
    height: 120px;
    display: block;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(135deg, color-mix(in srgb, var(--surface) 88%, #000 12%), var(--surface));
  }
  .journey-actions {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
  }
  .map-link { 
    display: inline-flex; 
    align-items: center; 
    justify-content: center;
    gap: 8px; 
    padding: 10px 12px; 
    font-size: 13px; 
    font-weight: 700;
    border-radius: 12px;
    min-width: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .map-link:active { transform: scale(0.985); }
  .map-link svg { width: 16px; height: 16px; }
  .map-link-primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--text-on-accent, #fff);
    flex: 1 1 auto;
  }
  .map-link-secondary {
    color: var(--text-secondary);
    background: transparent;
    flex: 0 0 auto;
  }
</style>
