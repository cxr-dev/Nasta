<script lang="ts">
  import type { Route, Segment, TransportType } from "../types/route";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore";
  import { getPredictedDepartures } from "../services/timetableCache";
  import { getLiveMinutes, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
  import { deduplicateDeparturesByKey } from "../lib/departureDeduplication";
  import { onMount, onDestroy } from "svelte";
  import { transportIcons } from "../icons/transport";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
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
  let now = $state(Date.now());
  let expandedIndex = $state<number | null>(null);
  let isLoading = $state(false);
  let lastError = $state<string | null>(null);
  let lastSuccessfulFetch = $state(0);
  let isRefreshing = $state(false);

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
      segment.directionText,
      5,
    );

    // Get live from API (for real-time updates: delays, cancellations, early arrivals)
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];
    const live = allDeps.filter(
      (dep) =>
        dep.line === segment.line &&
        (dep.directionText === segment.directionText ||
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
      segments.map((s) => [s.fromStop.siteId, { line: s.line, directionText: s.directionText }]),
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
      {@const liveMinutes = hasDeparture ? getLiveMinutes(departure, now) : 0}
      {@const isExpanded = expandedIndex === index}

      <button
        class="departure-row"
        class:expandable={hasDeparture}
        class:expanded={isExpanded}
        type="button"
        aria-expanded={isExpanded}
        onclick={() => toggleExpanded(index)}
        style="--delay: {Math.min(index, 3) * 40}ms"
      >
        <div class="row-left">
          <div class="transport-badge" data-type={segment.transportType}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <g>{@html getTransportIcon(segment.transportType)}</g>
            </svg>
          </div>

          <div class="line-details">
            <span class="line-info">{segment.lineName || segment.line}</span>
            <span class="stop-route">{segment.fromStop.name} → {segment.directionText}</span>
          </div>
        </div>

        <div class="row-right">
          {#if hasDeparture}
            <div class="time-stack">
              <div class="primary-time">
                <span class="minutes">{liveMinutes}</span>
                <span class="unit">{$t.minutesShort}</span>
              </div>
              {#if subsequent}
                <div class="secondary-time"><span class="more">{subsequent}</span></div>
              {/if}
            </div>
          {:else}
            <div class="no-departure">—</div>
          {/if}
        </div>
      </button>

      {#if isExpanded && hasDeparture}
        <div transition:slide={{ duration: 280, easing: cubicOut }}>
          <DepartureStrip {departure} {segment} onError={() => (expandedIndex = null)} />
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
  .row-right { flex-shrink: 0; text-align: right; }
  .time-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .primary-time { display: flex; align-items: baseline; gap: 4px; line-height: 1; }
  .minutes { font-family: "Neue Machina", sans-serif; font-size: 68px; font-weight: 800; letter-spacing: -4px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .unit { font-size: 16px; font-weight: 500; color: var(--accent); opacity: 0.5; padding-bottom: 10px; }
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
</style>
