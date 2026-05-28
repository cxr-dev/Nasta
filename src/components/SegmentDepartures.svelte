<script lang="ts">
  import type { Route, Segment, TransportType } from "../types/route";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore";
  import { getPredictedDepartures } from "../services/timetableCache";
  import { formatDepartureTime, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
  import { deduplicateDeparturesByKey } from "../lib/departureDeduplication";
  import { onMount, onDestroy } from "svelte";
  import { transportIcons } from "../icons/transport";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { getQuickLocation, getMemoizedDistance, formatDistance, getWalkingTime } from "../services/geo";
  import DepartureStrip from "./DepartureStrip.svelte";
  import { t } from "../stores/localeStore";
  import { settingsStore } from "../stores/settingsStore";

  let {
    route,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationUsedCache = false,
    deviationLastUpdatedAt = 0,
  }: {
    route: Route;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
  } = $props();

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let stopDeviationsMap = $state<Map<string, any[]>>(new Map());
  let now = $state(Date.now());
  let expandedIndex = $state<number | null>(null);
  let mapsSheetForIndex = $state<number | null>(null);
  let rememberMapChoice = $state(true);
  let isLoading = $state(false);
  let lastError = $state<string | null>(null);
  let lastSuccessfulFetch = $state(0);
  let userLocation = $state<[number, number] | null>(null);
  let settings = $derived($settingsStore);
  type MapApp = "default" | "google" | "apple" | "waze";
  const MAP_PREF_KEY = "nasta_map_app_preference";

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    route.id;
    expandedIndex = null;
  });

  $effect(() => {
    if (settings.walkingEtaEnabled ?? true) {
      const controller = new AbortController();
      getQuickLocation(controller.signal)
        .then(loc => { if (!controller.signal.aborted) userLocation = loc; })
        .catch(() => { /* denied or error — keep userLocation null */ });
      return () => controller.abort();
    } else {
      userLocation = null;
    }
  });

  function toggleExpanded(index: number) {
    expandedIndex = expandedIndex === index ? null : index;
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
    if (forcePick || pref === "default") {
      if (rowIndex !== null) mapsSheetForIndex = rowIndex;
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

  function lon2tile(lon: number, z: number): number {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  }

  function lat2tile(lat: number, z: number): number {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
    );
  }

  function tilePreviewUrl(lat: number, lon: number, zoom = 15): string {
    const x = lon2tile(lon, zoom);
    const y = lat2tile(lat, zoom);
    return `https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
  }

  function markerPercent(
    centerLat: number,
    centerLon: number,
    pointLat: number,
    pointLon: number,
    zoom = 15,
  ): { left: number; top: number } {
    const n = Math.pow(2, zoom);
    const worldX = ((pointLon + 180) / 360) * n * 256;
    const sinLat = Math.sin((pointLat * Math.PI) / 180);
    const worldY =
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * 256;
    const cX = ((centerLon + 180) / 360) * n * 256;
    const cSin = Math.sin((centerLat * Math.PI) / 180);
    const cY = (0.5 - Math.log((1 + cSin) / (1 - cSin)) / (4 * Math.PI)) * n * 256;
    const dx = worldX - cX;
    const dy = worldY - cY;
    const left = Math.max(6, Math.min(94, 50 + (dx / 256) * 100));
    const top = Math.max(6, Math.min(94, 50 + (dy / 256) * 100));
    return { left, top };
  }

  function disruptionType(message: string): "protest" | "technical" | "weather" | "general" {
    const m = message.toLowerCase();
    if (/(protest|demonstration|strejk|march|blockad)/i.test(m)) return "protest";
    if (/(signal|switch|technical|fault|fel|teknisk|power|el|track|spår)/i.test(m)) return "technical";
    if (/(snow|rain|storm|wind|väder|snö|regn|is|storm)/i.test(m)) return "weather";
    return "general";
  }

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  function formatSubsequent(deps: Departure[]): string | null {
    const subsequent = deps.slice(1, 4);
    if (!subsequent.length) return null;
    return subsequent
      .map((d) => d.time)
      .filter(Boolean)
      .join(" · ");
  }

  function stopLabel(name?: string): string {
    if (!name) return "";
    const cleaned = name.replace(/^[^,]+,\s*/u, "").trim();
    return cleaned || name;
  }

  function getDeparturesForSegment(segment: Segment): Departure[] {
    // Strategy: Timetable first (instant display), API verification (background update)
    // This ensures users see times immediately, with live data filling in when available
    
    // Get predicted from timetable (always available, cached locally)
    const predicted = getPredictedDepartures(
      segment.fromStop.siteId,
      segment.line,
      segment.direction?.code ?? 0,
      5,
    );

    // Get live from API (for real-time updates: delays, cancellations, early arrivals)
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];
    const targetDest = stopLabel(segment.direction?.destination ?? segment.toStop.name).toLowerCase();
    const live = allDeps.filter((dep) => {
      if (dep.line !== segment.line) return false;
      if ((dep.direction_code ?? -1) !== (segment.direction?.code ?? -1)) return false;
      if (!dep.destination) return true;
      const d = stopLabel(dep.destination).toLowerCase();
      return d === targetDest || d.includes(targetDest) || targetDest.includes(d);
    });

    // If we have live data, use it to update predicted times
    // Otherwise, predicted times are shown and updated when API responds
    if (live.length > 0) {
      const merged = mergeDeparturesWithPredictions(live, predicted, 5);
      return deduplicateDeparturesByKey(segment.fromStop.siteId, merged);
    }

    // No live data yet - show predicted, which will update when API responds
    return deduplicateDeparturesByKey(segment.fromStop.siteId, predicted);
  }

  let segmentDeps = $derived((route.segments ?? []).map((seg) => getDeparturesForSegment(seg)));

  function stopClockTimer() {
    if (!clockTimer) return;
    clearInterval(clockTimer);
    clockTimer = null;
  }

  function startClockTimer() {
    stopClockTimer();
    now = Date.now();
    clockTimer = setInterval(() => {
      now = Date.now();
    }, 5_000);
  }

  onMount(() => {
    UNSUBSCRIBERS.push(
      departureStore.subscribe((data) => {
        departureData = data;
      }),
    );
    UNSUBSCRIBERS.push(
      departureStore.stopDeviations.subscribe((data) => {
        stopDeviationsMap = data;
      }),
    );
    UNSUBSCRIBERS.push(
      departureStore.isLoading.subscribe((val) => (isLoading = val)),
    );
    UNSUBSCRIBERS.push(
      departureStore.lastError.subscribe((val) => (lastError = val ? $t.failedToFetchDepartures : null)),
    );
    UNSUBSCRIBERS.push(
      departureStore.lastSuccessfulFetch.subscribe((val) => (lastSuccessfulFetch = val)),
    );
    startClockTimer();
  });

  onDestroy(() => {
    UNSUBSCRIBERS.forEach((fn) => fn());
    stopClockTimer();
  });
</script>

<div class="departures-list">
  {#if lastError}
    <div class="error-bar">
      <span>{lastError}</span>
      <button onclick={() => (lastError = null)}>×</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-skeleton">
      {#each Array(3) as _}
        <div class="skeleton-row">
          <div class="skeleton-badge"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-time"></div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="departures-header">
      <h3 class="departures-title">{$t.departures}</h3>
    </div>

    {#each route.segments ?? [] as segment, index (segment.id)}
      {@const deps = segmentDeps[index] ?? []}
      {@const departure = deps[0]}
      {@const subsequent = formatSubsequent(deps)}
      {@const hasDeparture = deps.length > 0 && !!departure}
      {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
      {@const siteDevs = stopDeviationsMap.get(segment.fromStop.siteId) || []}
      {@const isExpanded = expandedIndex === index}
      {@const topDevMessage = siteDevs[0]?.message ?? ""}
      {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}

      <button
        class="departure-row"
        data-testid="segment-row"
        class:expandable={hasDeparture || siteDevs.length > 0}
        class:expanded={isExpanded}
        type="button"
        aria-expanded={isExpanded}
        onclick={() => (hasDeparture || siteDevs.length > 0) && toggleExpanded(index)}
        style="--delay: {Math.min(index, 3) * 40}ms"
      >
        <div class="row-left">
          <div class="transport-badge" data-type={segment.transportType}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <g>{@html getTransportIcon(segment.transportType)}</g>
            </svg>
          </div>

          <div class="line-details">
            <span class="line-info" data-testid="segment-line">{segment.line}</span>
            <div class="stop-route-container">
              <span class="stop-route">{stopLabel(segment.fromStop.name)} → {stopLabel(segment.direction?.destination)}</span>
            </div>
          </div>
        </div>

        <div class="row-right">
          {#if hasDeparture}
          <div class="time-stack">
            <div class="primary-time">
              <span class="minutes" data-testid="countdown-minutes">{primaryDepartureText}</span>
            </div>
            {#if subsequent}
              <div class="secondary-time"><span class="more">{subsequent}</span></div>
            {/if}
              {#if siteDevs.length > 0}
                <div class="event-chip event-{topDevType}">
                  {#if topDevType === "protest"}
                    <svg viewBox="0 0 24 24" class="event-icon protest-icon" aria-hidden="true">
                      <path d="M6 20v-5m0-6V4m0 5 8 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      <rect x="14" y="9" width="5" height="5" rx="1" fill="currentColor" />
                    </svg>
                  {:else if topDevType === "technical"}
                    <svg viewBox="0 0 24 24" class="event-icon tech-icon" aria-hidden="true">
                      <path d="M12 2v4m0 12v4m7-10h-4M9 12H5m10.5-5.5-3 3m-1 5-3 3m7 0-3-3m-1-5-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  {:else if topDevType === "weather"}
                    <svg viewBox="0 0 24 24" class="event-icon weather-icon" aria-hidden="true">
                      <path d="M8 16a4 4 0 1 1 .8-7.92A5 5 0 0 1 18 10a3 3 0 1 1 0 6H8Z" fill="none" stroke="currentColor" stroke-width="2"/>
                      <path d="M9 18v3m3-3v3m3-3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" class="event-icon" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
                      <path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  {/if}
                  <span>{topDevType === "general" ? "Disruption" : topDevType}</span>
                </div>
              {/if}
            </div>
          {:else}
            {#if siteDevs.length > 0}
              <div class="site-deviation-badge" class:active={isExpanded}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12" y2="17.01"/>
                </svg>
              </div>
            {:else}
              <div class="no-departure">—</div>
            {/if}
          {/if}
        </div>
      </button>

      {#if isExpanded}
        <div transition:slide={{ duration: 280, easing: cubicOut }}>
          {#if hasDeparture}
            <div class="expanded-actions">
              {#if segment.fromStop.coord}
                {@const dist = userLocation ? getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1]) : null}
                {@const stopLat = segment.fromStop.coord[0]}
                {@const stopLon = segment.fromStop.coord[1]}
                <div class="expanded-geo-info geo-map-card">
                  <div class="route-preview" aria-label={`Route preview to ${segment.fromStop.name}`}>
                    <img
                      class="mini-map"
                      src={tilePreviewUrl(stopLat, stopLon)}
                      alt={`Map preview for ${stopLabel(segment.fromStop.name)}`}
                      loading="lazy"
                      decoding="async"
                    />
                    <div class="map-marker map-marker-stop" style={`left:${markerPercent(stopLat, stopLon, stopLat, stopLon).left}%;top:${markerPercent(stopLat, stopLon, stopLat, stopLon).top}%`}>
                      <span class="sr-only">Stop</span>
                    </div>
                    {#if userLocation}
                      {@const userPos = markerPercent(stopLat, stopLon, userLocation[0], userLocation[1])}
                      <div class="map-marker map-marker-user" style={`left:${userPos.left}%;top:${userPos.top}%`}>
                        <span class="sr-only">You</span>
                      </div>
                    {/if}
                    <div class="route-preview-labels">
                      <span class="rp-you">You</span>
                      <span class="rp-stop">{stopLabel(segment.fromStop.name)}</span>
                    </div>
                  </div>
                  <span class="map-attrib">© OpenStreetMap · © CARTO</span>
                  {#if dist !== null}
                    <span>{formatDistance(dist)} · {getWalkingTime(dist)} min walk</span>
                  {:else if (settings.walkingEtaEnabled ?? true)}
                    <span class="location-hint">{$t.enableLocationForWalkEta || "Enable location for live walk ETA."}</span>
                  {/if}
                </div>
              {/if}
              <DepartureStrip {departure} {segment} onError={() => (expandedIndex = null)} />
              {#if segment.fromStop.coord}
                {@const coord = segment.fromStop.coord}
                <button
                  type="button"
                  class="map-link"
                  onclick={() => openMapWithPreference(coord[0], coord[1], false, index)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {$t.openInMaps || "Open in Maps"}
                </button>
                <button
                  type="button"
                  class="map-link map-link-subtle"
                  onclick={() => openMapWithPreference(coord[0], coord[1], true, index)}
                >
                  {$t.chooseMapApp || "Choose map app"}
                </button>
              {/if}
            </div>
          {:else}
            {@const siteDevs = stopDeviationsMap.get(segment.fromStop.siteId) || []}
            {#if siteDevs.length > 0}
              <div class="disruption-strip">
                <div class="disruption-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12" y2="16.01"/>
                  </svg>
                  <span>{$t.disruptions || "Disruptions"}</span>
                </div>
                <div class="disruption-content">
                  {#each siteDevs as dev}
                    <p>{dev.message}</p>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    {/each}

    {#if mapsSheetForIndex !== null}
      {@const seg = route.segments[mapsSheetForIndex]}
      {#if seg?.fromStop?.coord}
        {@const coord = seg.fromStop.coord}
        <div
          class="maps-sheet-backdrop"
          role="button"
          tabindex="0"
          aria-label="Close map app picker"
          onclick={() => (mapsSheetForIndex = null)}
          onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mapsSheetForIndex = null; } }}
        >
          <div
            class="maps-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={$t.chooseMapApp || "Choose map app"}
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
          >
            <div class="maps-sheet-title">{$t.chooseMapApp || "Choose map app"}</div>
            <label class="maps-sheet-remember-toggle">
              <input type="checkbox" bind:checked={rememberMapChoice} />
              <span>{$t.rememberMapChoice || "Remember my choice"}</span>
            </label>
            {#each mapAppOptions() as app}
              <button
                type="button"
                class="maps-sheet-option"
                onclick={() => openMapApp(app, coord[0], coord[1])}
              >
                {app === "google" ? "Google Maps" : app === "apple" ? "Apple Maps" : "Waze"}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    {#if (route.segments ?? []).length > 0 && !isLoading && segmentDeps.every((d) => d.length === 0)}
      <div class="empty-state">
        <div class="no-departure">—</div>
        <p class="empty-text">{$t.noDeparturesAvailable || "No departures available"}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .departures-list { display: flex; flex-direction: column; padding: 12px 0 20px; }
  .departure-row { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border); animation: rowIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: var(--delay, 0ms); contain: layout style; width: 100%; background: transparent; border-left: none; border-right: none; border-top: none; text-align: left; }
  .departure-row.expandable { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: opacity 120ms ease; }
  .departure-row.expandable:active { opacity: 0.7; }
  .departure-row.expanded { border-bottom: none; }
  @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .row-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding-right: 12px; }
  .transport-badge { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: var(--accent-subtle); color: var(--accent); }
  .transport-badge svg { width: 20px; height: 20px; }
  .line-details { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line-info { font-size: 15px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route { font-size: 13px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route-container { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .expanded-actions { position: relative; }
  .map-link { 
    display: flex; 
    align-items: center; 
    justify-content: center;
    gap: 6px; 
    padding: 12px 16px; 
    font-size: 13px; 
    color: var(--accent); 
    border: none;
    border-top: 1px solid var(--border); 
    background: var(--surface);
    transition: background 0.2s ease;
    width: 100%;
  }
  .map-link:active { background: var(--accent-subtle); }
  .map-link svg { width: 16px; height: 16px; }
  .map-link-subtle {
    color: var(--text-secondary);
    font-size: 12px;
  }
  .row-right { flex-shrink: 0; text-align: right; min-width: fit-content; padding-left: 8px; }
  .time-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .primary-time { display: flex; align-items: baseline; gap: 4px; line-height: 1; position: relative; }
  .clock-time { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 800; letter-spacing: -2px; color: var(--accent); }
  .minutes { font-family: "Neue Machina", sans-serif; font-size: clamp(56px, 14vw, 68px); font-weight: 800; letter-spacing: -2.5px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .secondary-time { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .more { color: var(--text-muted); font-size: 12px; }
  .no-departure { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 300; color: var(--text-ghost); letter-spacing: 0; line-height: 1; }
  .empty-state { text-align: center; padding: 48px 24px; }
  .empty-text { margin: 16px 0 0; font-size: 14px; color: var(--text-muted); }
  .departures-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 8px; border-bottom: 1px solid var(--border); gap: 8px; }
  .departures-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; }
  .error-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; margin-bottom: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; }
  .error-bar button { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
  .loading-skeleton { padding: 12px 0; }
  .skeleton-row { display: flex; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--border); }
  .skeleton-badge { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(90deg, var(--accent-subtle) 0%, var(--border) 50%, var(--accent-subtle) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  .skeleton-line { flex: 1; height: 14px; margin: 0 12px; border-radius: 4px; background: linear-gradient(90deg, var(--border) 0%, var(--surface) 50%, var(--border) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  .skeleton-time { width: 80px; height: 32px; border-radius: 4px; background: linear-gradient(90deg, var(--border) 0%, var(--surface) 50%, var(--border) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .site-deviation-badge { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; color: #f59e0b; background: color-mix(in srgb, #f59e0b 12%, transparent); border-radius: 12px; transition: transform 0.2s ease; }
  .site-deviation-badge.active { transform: scale(1.1) rotate(5deg); background: #f59e0b; color: #fff; }
  .site-deviation-badge svg { width: 22px; height: 22px; }

  .disruption-strip { padding: 16px; border-top: 1px solid var(--border); background: color-mix(in srgb, #f59e0b 4%, transparent); }
  .disruption-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #f59e0b; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
  .disruption-header svg { width: 18px; height: 18px; }
  .disruption-content { display: flex; flex-direction: column; gap: 12px; }
  .disruption-content p { font-size: 14px; line-height: 1.5; color: var(--text); }
  .expanded-geo-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    font-size: 13px;
    color: var(--text-secondary);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .geo-icon {
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }
  .geo-map-card {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .route-preview {
    position: relative;
  }
  .mini-map {
    width: 100%;
    height: 108px;
    display: block;
    object-fit: cover;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .map-marker {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    z-index: 2;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  }
  .map-marker-stop {
    width: 14px;
    height: 14px;
    background: #111;
    border: 2px solid #fff;
  }
  .map-marker-user {
    width: 10px;
    height: 10px;
    background: #2f80ed;
    border: 2px solid #fff;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .route-preview-labels {
    position: absolute;
    inset: auto 10px 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    pointer-events: none;
  }
  .rp-you,
  .rp-stop {
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px 8px;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location-hint {
    color: var(--text-muted);
    font-size: 12px;
  }
  .map-attrib {
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.8;
    margin-top: -2px;
  }
  .event-chip {
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
    opacity: 0.9;
  }
  .event-icon { width: 14px; height: 14px; }
  .protest-icon { animation: bob 1.8s ease-in-out infinite; transform-origin: 6px 18px; }
  .tech-icon { animation: spinSlow 2.6s linear infinite; transform-origin: 12px 12px; }
  .weather-icon { animation: drift 2.2s ease-in-out infinite; }
  .maps-sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.2);
    display: flex;
    align-items: flex-end;
    z-index: 350;
    border: none;
    padding: 0;
    margin: 0;
    width: 100%;
  }
  .maps-sheet {
    width: min(100%, 480px);
    margin: 0 auto;
    background: var(--surface);
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    border: 1px solid var(--border);
    border-bottom: none;
    padding: 12px 12px calc(14px + env(safe-area-inset-bottom));
    display: grid;
    gap: 8px;
  }
  .maps-sheet-title { font-size: 13px; font-weight: 700; color: var(--text); padding: 6px 4px; }
  .maps-sheet-option {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: 10px;
    padding: 11px 12px;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }
  .maps-sheet-remember-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 2px 2px;
  }
  @keyframes bob { 0%,100% { transform: rotate(-2deg) translateY(0); } 50% { transform: rotate(2deg) translateY(-1px); } }
  @keyframes spinSlow { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
  @keyframes drift { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-1px);} }
  @media (prefers-reduced-motion: reduce) {
    .protest-icon, .tech-icon, .weather-icon { animation: none !important; }
  }
</style>
