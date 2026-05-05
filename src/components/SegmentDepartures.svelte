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
  let isLoading = $state(false);
  let lastError = $state<string | null>(null);
  let lastSuccessfulFetch = $state(0);
  let isRefreshing = $state(false);
  let userLocation = $state<[number, number] | null>(null);

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    route.id;
    expandedIndex = null;
  });

  function toggleExpanded(index: number) {
    expandedIndex = expandedIndex === index ? null : index;
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
    const live = allDeps.filter(
      (dep) =>
        dep.line === segment.line &&
        (dep.destination === segment.direction?.destination ||
          dep.destination === segment.toStop.name),
    );

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

  async function handleRefreshClick() {
    const segments = route.segments ?? [];
    const siteIds = segments.map((s) => s.fromStop.siteId).filter(Boolean);
    const stopNames = new Map(segments.map((s) => [s.fromStop.siteId, s.fromStop.name]));
    const segmentMetaBySiteId = new Map(
      segments.map((s) => [s.fromStop.siteId, { line: s.line, direction_code: s.direction?.code ?? 0 }]),
    );
    isRefreshing = true;
    await departureStore.refresh(siteIds, stopNames, segmentMetaBySiteId, false);
    isRefreshing = false;
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
    getQuickLocation().then(loc => userLocation = loc);
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
      <button
        class="refresh-btn"
        class:spinning={isRefreshing}
        onclick={handleRefreshClick}
        title={$t.refreshDepartures}
        aria-label={$t.refreshDepartures}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
        </svg>
      </button>
    </div>

    {#each route.segments ?? [] as segment, index (segment.id)}
      {@const deps = segmentDeps[index] ?? []}
      {@const departure = deps[0]}
      {@const subsequent = formatSubsequent(deps)}
      {@const hasDeparture = deps.length > 0 && !!departure}
      {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
      {@const siteDevs = stopDeviationsMap.get(segment.fromStop.siteId) || []}
      {@const isExpanded = expandedIndex === index}

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
            <span class="line-info" data-testid="segment-line">{segment.lineName || segment.line}</span>
            <div class="stop-route-container">
              <span class="stop-route">{segment.fromStop.name} → {segment.direction?.destination}</span>
            </div>
          </div>
        </div>

        <div class="row-right">
          {#if hasDeparture}
            <div class="time-stack">
              <div class="primary-time">
                {#if departure.isFirstMorning}
                  <span class="planned-label" data-testid="planned-badge">{$t.morningFirst || "Morning first"}</span>
                  <span class="clock-time">{departure.time}</span>
                {:else}
                  {#if departure.predicted}
                    <span class="planned-label" data-testid="planned-badge">{$t.planned || "Planned"}</span>
                  {/if}
                  <span class="minutes" data-testid="countdown-minutes">{primaryDepartureText}</span>
                {/if}
              </div>
              {#if subsequent && !departure.isFirstMorning}
                <div class="secondary-time"><span class="more">{subsequent}</span></div>
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
              {#if userLocation && segment.fromStop.coord}
                {@const dist = getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1])}
                <div class="expanded-geo-info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="geo-icon">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span>{formatDistance(dist)} ({getWalkingTime(dist)}m till hållplatsen)</span>
                </div>
              {/if}
              <DepartureStrip {departure} {segment} onError={() => (expandedIndex = null)} />
              {#if segment.fromStop.coord}
                <a 
                  href="https://www.google.com/maps/search/?api=1&query={segment.fromStop.coord[0]},{segment.fromStop.coord[1]}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="map-link"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {$t.openInMaps || "Open in Maps"}
                </a>
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
  .departure-row { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid var(--border); animation: rowIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: var(--delay, 0ms); contain: layout paint style; width: 100%; background: transparent; border-left: none; border-right: none; border-top: none; text-align: left; }
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
    gap: 6px; 
    padding: 12px 16px; 
    font-size: 13px; 
    color: var(--accent); 
    text-decoration: none; 
    border-top: 1px solid var(--border); 
    background: var(--surface);
    transition: background 0.2s ease;
  }
  .map-link:active { background: var(--accent-subtle); }
  .map-link svg { width: 16px; height: 16px; }
  .row-right { flex-shrink: 0; text-align: right; }
  .time-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .primary-time { display: flex; align-items: baseline; gap: 4px; line-height: 1; position: relative; }
  .planned-label { position: absolute; top: -14px; right: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; opacity: 0.8; }
  .clock-time { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 800; letter-spacing: -2px; color: var(--accent); }
  .minutes { font-family: "Neue Machina", sans-serif; font-size: 68px; font-weight: 800; letter-spacing: -4px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .secondary-time { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .more { color: var(--text-muted); font-size: 12px; }
  .no-departure { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 300; color: var(--text-ghost); letter-spacing: 0; line-height: 1; }
  .empty-state { text-align: center; padding: 48px 24px; }
  .empty-text { margin: 16px 0 0; font-size: 14px; color: var(--text-muted); }
  .departures-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 8px; border-bottom: 1px solid var(--border); gap: 8px; }
  .departures-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; }
  .refresh-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; border: none; background: var(--surface); color: var(--text); cursor: pointer; transition: all 200ms ease; font-size: 0; }
  .refresh-btn:hover { background: var(--accent); color: var(--bg); }
  .refresh-btn:active { transform: scale(0.95); }
  .error-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; margin-bottom: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; }
  .error-bar button { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
  .loading-skeleton { padding: 12px 0; }
  .skeleton-row { display: flex; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--border); }
  .skeleton-badge { width: 36px; height: 36px; border-radius: 8px; background: var(--accent-subtle); animation: pulse 1.5s ease-in-out infinite; }
  .skeleton-line { flex: 1; height: 14px; margin: 0 12px; border-radius: 4px; background: var(--border); animation: pulse 1.5s ease-in-out infinite; }
  .skeleton-time { width: 80px; height: 32px; border-radius: 4px; background: var(--border); animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
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
</style>
