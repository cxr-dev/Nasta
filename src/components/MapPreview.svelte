<script lang="ts">
  import type { Segment } from "../types/page";
  import { getMemoizedDistance, formatDistance, getWalkingTime } from "../services/geo";
  import { cleanStopName as stopLabel } from "../lib/stopName";

  const maplibreLoad = import('maplibre-gl').then(m => m.default);
  void import('maplibre-gl/dist/maplibre-gl.css');

  let {
    segment,
    userLocation,
    locationRequestInFlight,
    walkingEtaEnabled,
    openFeatureSheet,
    t,
  }: {
    segment: Segment;
    userLocation: [number, number] | null;
    locationRequestInFlight: boolean;
    walkingEtaEnabled: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    t: Record<string, string>;
  } = $props();

  type MapApp = "default" | "google" | "apple" | "waze";
  const MAP_PREF_KEY = "nasta_map_app_preference";
  const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

  let mapsSheetForIndex = $state<number | null>(null);
  let rememberMapChoice = $state(true);
  let maplibregl: any = $state(null);
  let mapDiv = $state<HTMLDivElement | undefined>(undefined);
  let mapInstance: any = null;
  let mapLoadError = $state(false);
  let isFullscreen = $state(false);
  let isClosing = $state(false);

  $effect(() => {
    maplibreLoad.then(m => {
      maplibregl = m;
    }).catch(() => {
      mapLoadError = true;
    });
  });

  $effect(() => {
    const coord = segment.fromStop.coord;
    const loc = userLocation;
    const mgl = maplibregl;
    const div = mapDiv;
    if (!coord || !mgl || !div) return;

    const center: [number, number] = [coord[1], coord[0]];

    if (mapInstance) mapInstance.remove();

    mapInstance = new mgl.Map({
      container: div,
      style: MAP_STYLE,
      center,
      zoom: 14.5,
      attributionControl: false,
      dragPan: true,
      scrollZoom: true,
      doubleClickZoom: false,
      touchZoomRotate: true,
      dragRotate: false,
      keyboard: false,
    });

    mapInstance.addControl(new mgl.AttributionControl({ compact: true }), "bottom-right");
    mapInstance.touchZoomRotate?.disableRotation();

    mapInstance.on("load", () => {
      new mgl.Marker({ color: "#FF4757" }).setLngLat(center).addTo(mapInstance);
      if (loc) {
        new mgl.Marker({ color: "#2f80ed" }).setLngLat(loc).addTo(mapInstance);
      }
    });

    return () => {
      mapInstance?.remove();
      mapInstance = null;
    };
  });

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

  function toggleFullscreen() {
    if (isFullscreen) {
      isClosing = true;
      setTimeout(() => {
        isFullscreen = false;
        isClosing = false;
        requestAnimationFrame(() => mapInstance?.resize());
      }, 150);
    } else {
      isFullscreen = true;
      requestAnimationFrame(() => mapInstance?.resize());
    }
  }
</script>

{#if segment.fromStop.coord}
  {@const dist = userLocation ? getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1]) : null}
  {@const stopLat = segment.fromStop.coord[0]}
  {@const stopLon = segment.fromStop.coord[1]}
  <section class="journey-card">
    <div class="journey-map-shell">
      {#if walkingEtaEnabled}
        <div class="journey-map-label">
          <span>{t.walkToStop}</span>
          {#if dist !== null}
            <span>{formatDistance(dist)} · {getWalkingTime(dist)} min</span>
          {:else if locationRequestInFlight}
            <span class="hint">{t.waitingForLocation}</span>
          {/if}
        </div>
      {/if}

      <div class="map-container" class:fullscreen={isFullscreen} class:closing={isClosing}>
        <div
          class="mini-map"
          bind:this={mapDiv}
        ></div>
        <button
          type="button"
          class="map-expand-btn no-scale"
          onclick={toggleFullscreen}
          aria-label={isFullscreen ? t.minimizeMap : t.expandMap}
        >
          {#if isFullscreen}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <div class="journey-actions">
      {#if openFeatureSheet}
        <button
          type="button"
          class="map-link map-link-primary"
          onclick={() => openFeatureSheet(segment)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" stroke-linejoin="round"/>
          </svg>
          {t.discoverNearby}
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
  .map-link-primary:active {
    transform: scale(0.96);
    background: color-mix(in srgb, var(--accent) 85%, #000);
  }
  .map-link-secondary {
    color: var(--text-secondary);
    background: transparent;
    flex: 0 0 auto;
  }
  .map-container {
    position: relative;
  }
  .map-container.fullscreen {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: #000;
    animation: fullscreen-in 200ms ease-out both;
  }
  .map-container.closing {
    animation: fullscreen-out 150ms ease-in both;
  }
  .map-container.fullscreen .mini-map {
    height: 100dvh;
    width: 100%;
    border-radius: 0;
  }
  .map-expand-btn {
    position: absolute;
    top: calc(8px + env(safe-area-inset-top, 0px));
    right: calc(8px + env(safe-area-inset-right, 0px));
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border: none;
    border-radius: 8px;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    color: rgba(255,255,255,0.85);
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;
  }
  .map-expand-btn:active {
    transform: scale(0.92);
    background: rgba(0,0,0,0.7);
  }
  .map-expand-btn svg {
    width: 18px;
    height: 18px;
  }
  @keyframes fullscreen-in {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes fullscreen-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.96); }
  }
  :global(.maplibregl-ctrl-attrib-button) {
    width: 20px !important;
    height: 20px !important;
    opacity: 0.45;
  }
  :global(.maplibregl-ctrl-attrib) {
    font-size: 9px !important;
  }
</style>
