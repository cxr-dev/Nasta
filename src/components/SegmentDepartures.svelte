<script lang="ts">
  import type { Route, Segment, TransportType } from "../types/route";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure, type SiteConfidenceState } from "../stores/departureStore";
  import { getPredictedDepartures } from "../services/timetableCache";
  import { getLiveMinutes, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
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
  let confidenceBySite = $state<Map<string, SiteConfidenceState>>(new Map());
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
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];

    const live = allDeps.filter(
      (dep) =>
        dep.line === segment.line &&
        (dep.directionText === segment.directionText ||
          dep.destination === segment.toStop.name),
    );

    if (live.length >= 3) return live;

    const predicted = getPredictedDepartures(
      segment.fromStop.siteId,
      segment.line,
      segment.directionText,
      3,
    );
    if (!predicted.length) return live;

    return mergeDeparturesWithPredictions(live, predicted, 5);
  }

  function localConfidence(
    segment: Segment,
    firstDeparture: Departure | undefined,
  ): SiteConfidenceState {
    const base = confidenceBySite.get(segment.fromStop.siteId) ?? "stale";
    if (!firstDeparture) {
      return base === "live" ? "stale" : base;
    }
    if (firstDeparture.predicted === true) {
      return "predicted";
    }
    return base;
  }

  function confidenceLabel(state: SiteConfidenceState): string {
    if (state === "live") return $t.confidenceLive;
    if (state === "cached") return $t.confidenceCached;
    if (state === "predicted") return $t.confidencePredicted;
    return $t.confidenceStale;
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
      departureStore.confidenceBySite.subscribe((data) => {
        confidenceBySite = data;
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

  {#if isLoading && departureData.size === 0}
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

    {#if lastSuccessfulFetch > 0 && now - lastSuccessfulFetch > 90_000}
      <div class="stale-indicator">
        {$t.updatedMinutesAgo.replace("{minutes}", String(Math.floor((now - lastSuccessfulFetch) / 60000)))}
      </div>
      <div class="stale-note">{$t.staleDataNotice}</div>
    {/if}

    {#if deviationUsedCache && deviationLastUpdatedAt > 0}
      <div class="cached-note">{$t.usingCachedDisruptions}</div>
    {/if}

    {#each route.segments ?? [] as segment, index (segment.id)}
      {@const deps = segmentDeps[index] ?? []}
      {@const departure = deps[0]}
      {@const subsequent = formatSubsequent(deps)}
      {@const hasDeparture = deps.length > 0 && !!departure}
      {@const liveMinutes = hasDeparture ? getLiveMinutes(departure, now) : 0}
      {@const confidence = localConfidence(segment, departure)}
      {@const health = deviationHealthBySegment.get(segment.id)}
      {@const hasDisruption = health != null && health.state !== "ok"}
      {@const isExpanded = expandedIndex === index}

      <button
        class="departure-row"
        class:expandable={hasDeparture || hasDisruption}
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
            <div class="meta-row">
              <span class="confidence" data-state={confidence}>{confidenceLabel(confidence)}</span>
              {#if hasDisruption && health}
                <span class="disruption" data-severity={health.severity}>
                  {health.state === "critical" ? $t.disruptionCritical : $t.disruptionAffected}
                </span>
              {/if}
            </div>
          </div>
        </div>

        <div class="row-right">
          {#if hasDeparture}
            <div class="time-stack" class:predicted={departure.predicted === true}>
              <div class="primary-time">
                {#if departure.predicted === true}<span class="tilde">~</span>{/if}
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

      {#if isExpanded && (hasDeparture || hasDisruption)}
        <div transition:slide={{ duration: 280, easing: cubicOut }}>
          {#if hasDeparture}
            <DepartureStrip {departure} {segment} onError={() => (expandedIndex = null)} />
          {/if}
          {#if hasDisruption && health}
            <div class="disruption-panel">
              <h4>{$t.disruptions}</h4>
              <p>{health.reason ?? $t.noDisruptionDetails}</p>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
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
  .meta-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
  .confidence, .disruption { font-size: 11px; border-radius: 999px; padding: 2px 8px; border: 1px solid var(--border); }
  .confidence[data-state="live"] { color: #0f766e; border-color: #0f766e33; background: #ccfbf140; }
  .confidence[data-state="cached"] { color: #475569; }
  .confidence[data-state="predicted"] { color: #7c2d12; border-color: #7c2d1233; background: #ffedd540; }
  .confidence[data-state="stale"] { color: #991b1b; border-color: #991b1b33; background: #fee2e240; }
  .disruption[data-severity="info"] { color: #334155; }
  .disruption[data-severity="warning"] { color: #92400e; border-color: #92400e33; background: #fef3c740; }
  .disruption[data-severity="critical"] { color: #991b1b; border-color: #991b1b33; background: #fee2e240; }
  .row-right { flex-shrink: 0; text-align: right; }
  .time-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .primary-time { display: flex; align-items: baseline; gap: 4px; line-height: 1; }
  .minutes { font-family: "Neue Machina", sans-serif; font-size: 68px; font-weight: 800; letter-spacing: -4px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .unit { font-size: 16px; font-weight: 500; color: var(--accent); opacity: 0.5; padding-bottom: 10px; }
  .time-stack.predicted .minutes, .time-stack.predicted .unit { color: var(--text-secondary); opacity: 0.7; }
  .tilde { font-family: "Neue Machina", sans-serif; font-size: 32px; font-weight: 300; color: var(--text-secondary); opacity: 0.6; padding-bottom: 12px; margin-right: -4px; letter-spacing: 0; }
  .secondary-time { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .more { color: var(--text-muted); font-size: 12px; }
  .no-departure { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 300; color: var(--text-ghost); letter-spacing: 0; line-height: 1; }
  .departures-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 8px; border-bottom: 1px solid var(--border); gap: 8px; }
  .departures-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; }
  .refresh-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; border: none; background: var(--surface); color: var(--text); cursor: pointer; transition: all 200ms ease; font-size: 0; }
  .refresh-btn:hover { background: var(--accent); color: var(--bg); }
  .refresh-btn:active { transform: scale(0.95); }
  .stale-indicator, .stale-note, .cached-note { font-size: 12px; color: var(--text-muted); padding: 4px 0; }
  .error-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; margin-bottom: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; }
  .error-bar button { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
  .loading-skeleton { padding: 12px 0; }
  .skeleton-row { display: flex; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--border); }
  .skeleton-badge { width: 36px; height: 36px; border-radius: 8px; background: var(--accent-subtle); animation: pulse 1.5s ease-in-out infinite; }
  .skeleton-line { flex: 1; height: 14px; margin: 0 12px; border-radius: 4px; background: var(--border); animation: pulse 1.5s ease-in-out infinite; }
  .skeleton-time { width: 80px; height: 32px; border-radius: 4px; background: var(--border); animation: pulse 1.5s ease-in-out infinite; }
  .disruption-panel { margin-bottom: 8px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
  .disruption-panel h4 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; color: var(--text-muted); }
  .disruption-panel p { margin: 0; font-size: 13px; color: var(--text-secondary); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
