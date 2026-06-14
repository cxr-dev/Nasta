<script lang="ts">
  import type { Page, Segment } from "../types/page";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore.svelte";
  import { getPages, getActivePageId } from "../stores/pageStore.svelte";
  import { getPredictedDepartures } from "../services/timetableCache";
  import { formatDepartureTime, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
  import { deduplicateDeparturesByKey } from "../lib/departureDeduplication";
  import { onMount, onDestroy } from "svelte";
  import { getQuickLocation } from "../services/geo";
  import { getT } from "../stores/localeStore.svelte";
  import gsap from 'gsap';
  import Skeleton from './Skeleton.svelte';
  import DepartureRow from "./DepartureRow.svelte";
  import { prefetchSegments } from "../services/prefetchService";
  import { getSettings } from "../stores/settingsStore.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";
  import { chevronLeft, chevronRight, adjustmentsHorizontal } from "../icons/departureIcons";
  import { computeDisplayDevs, isSegmentDisrupted } from "./segmentUtils";

  let {
    route,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationUsedCache = false,
    deviationLastUpdatedAt = 0,
    openFeatureSheet = null,
    onSwitchPage,
    onEditToggle,
    lastRefreshTime,
  }: {
    route: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    onSwitchPage?: (pageId: string) => void;
    onEditToggle?: () => void;
    lastRefreshTime?: number;
  } = $props();

  let pages = $derived(getPages());
  let activePageId = $derived(getActivePageId());
  let currentPageIndex = $derived(pages.findIndex(p => p.id === activePageId));
  let hasPrev = $derived(currentPageIndex > 0);
  let hasNext = $derived(currentPageIndex < pages.length - 1);

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let stopDeviationsMap = $state<Map<string, any[]>>(new Map());
  let now = $state(Date.now());
  let expandedSegmentId = $state<string | null>(null);
  let isLoading = $state(false);
  let lastError = $state<string | null>(null);
  let lastSuccessfulFetch = $state(0);
  let userLocation = $state<[number, number] | null>(null);
  let locationRequestInFlight = $state(false);
  let lastNearbyPrefetchKey = $state('');
  let t = $derived(getT());
  let settings = $derived(getSettings());

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let depListEl: HTMLDivElement | undefined = $state();
  let hasAnimatedStagger = $state(false);

  let dataAge = $derived(lastRefreshTime ? Date.now() - lastRefreshTime : Infinity);
  let isStale = $derived(lastRefreshTime !== undefined && dataAge > 120000);
  let isFresh = $derived(lastRefreshTime !== undefined && !isStale);

  function freshnessDotColor(): string {
    if (lastRefreshTime === undefined) return 'var(--text-ghost)';
    if (isStale) return '#e8950a';
    return 'var(--color-accent, #27ae60)';
  }

  function freshnessLabel(): string {
    if (lastRefreshTime === undefined) return t.loading;
    if (isStale) return t.dataMayBeStale;
    const mins = Math.max(0, Math.floor(dataAge / 60000));
    if (mins === 0) return 'Uppdaterad nyss';
    return t.updatedMinutesAgo.replace('{minutes}', String(mins));
  }

  $effect(() => {
    route.id;
    expandedSegmentId = null;
  });

  $effect(() => {
    const etaEnabled = settings.walkingEtaEnabled ?? false;
    const active = etaEnabled;

    if (!active) {
      locationRequestInFlight = false;
      userLocation = null;
      return;
    }

    if (locationRequestInFlight || userLocation) return;

    const controller = new AbortController();
    locationRequestInFlight = true;
    getQuickLocation(controller.signal)
      .then(loc => {
        if (!controller.signal.aborted) userLocation = loc;
      })
      .catch(() => {
      })
      .finally(() => {
        if (!controller.signal.aborted) locationRequestInFlight = false;
      });
    return () => controller.abort();
  });

  function toggleExpanded(segmentId: string) {
    expandedSegmentId = expandedSegmentId === segmentId ? null : segmentId;
  }

  const PREFETCH_SEGMENT_COUNT = 2;
  const PREFETCH_VENUE_RADIUS = 1200;
  const PREFETCH_EVENT_RADIUS = 3000;

  const _prefetchInFlight = new Set<string>();

  async function prefetchForSegment(segment: Segment) {
    try {
      const coords = segment.fromStop.coord;
      if (!coords || coords.length < 2) return;
      const lat = coords[0];
      const lon = coords[1];
      const key = `${lat.toFixed(4)}:${lon.toFixed(4)}`;
      if (_prefetchInFlight.has(key)) return;
      _prefetchInFlight.add(key);
      try {
        if (settings.afterworkVenuesEnabled) {
          const types = settings.afterworkTypes && settings.afterworkTypes.length ? settings.afterworkTypes : ['beer'];
          if (types.includes('beer')) {
            void fetchNearbyVenues(lat, lon, PREFETCH_VENUE_RADIUS, ['beer']).catch(() => {});
          }
          if (types.includes('wine') || types.includes('cocktail')) {
            void fetchNearbyVenues(lat, lon, PREFETCH_VENUE_RADIUS, ['wine', 'cocktail']).catch(() => {});
          }
        }
        if (settings.eventsEnabled) {
          void fetchNearbyEvents(lat, lon, PREFETCH_EVENT_RADIUS).catch(() => {});
        }
      } finally {
        setTimeout(() => _prefetchInFlight.delete(key), 30 * 1000);
      }
    } catch (e) {
    }
  }

  function scheduleNearbyPrefetch() {
    const shouldPrefetch = settings.afterworkVenuesEnabled || settings.eventsEnabled;
    if (!shouldPrefetch || !(route.segments ?? []).length) return;

    const prefKey = `${route.id}:${settings.afterworkVenuesEnabled ? 1 : 0}:${settings.eventsEnabled ? 1 : 0}`;
    if (prefKey === lastNearbyPrefetchKey) return;
    lastNearbyPrefetchKey = prefKey;

    void import('../services/prefetchService')
      .then((m) => m.prefetchSegments(route.segments ?? [], settings, { concurrency: 4 }))
      .catch(() => {});
  }

  let segmentDeps = $state<Departure[][]>([]);

  let segmentGroups = $derived.by(() => {
    const segs = route.segments ?? [];
    const normal: Array<{ segment: Segment; originalIndex: number }> = [];
    const disrupted: Array<{ segment: Segment; originalIndex: number }> = [];

    segs.forEach((seg, i) => {
      const health = deviationHealthBySegment.get(seg.id);
      const siteDevsList = stopDeviationsMap.get(seg.fromStop.siteId) || [];
      const isDisrupted = isSegmentDisrupted(siteDevsList.length, health?.state);
      (isDisrupted ? disrupted : normal).push({ segment: seg, originalIndex: i });
    });

    return { normal, disrupted, hasDisrupted: disrupted.length > 0 };
  });

  async function loadSegmentDeps() {
    const segs = route.segments ?? [];
    const deps: Departure[][] = [];
    for (const seg of segs) {
      const predicted = await getPredictedDepartures(
        seg.fromStop.siteId,
        seg.line,
        seg.direction?.code ?? 0,
        5,
      );

      const allDeps = departureData.get(seg.fromStop.siteId) ?? [];
      const targetDest = stopLabel(seg.direction?.destination ?? seg.toStop.name).toLowerCase();
      const live = allDeps.filter((dep) => {
        if (dep.line !== seg.line) return false;
        if ((dep.direction_code ?? -1) !== (seg.direction?.code ?? -1)) return false;
        if (!dep.destination) return true;
        const d = stopLabel(dep.destination).toLowerCase();
        return d === targetDest || d.includes(targetDest) || targetDest.includes(d);
      });

      if (live.length > 0) {
        const merged = mergeDeparturesWithPredictions(live, predicted, 5);
        deps.push(deduplicateDeparturesByKey(seg.fromStop.siteId, merged));
      } else {
        deps.push(deduplicateDeparturesByKey(seg.fromStop.siteId, predicted));
      }
    }
    segmentDeps = deps;
  }

  $effect(() => {
    route.segments;
    if (settings.afterworkVenuesEnabled || settings.eventsEnabled) {
      scheduleNearbyPrefetch();
    }
  });

  $effect(() => {
    const count = segmentDeps.reduce((a, b) => a + b.length, 0);
    if (!depListEl || count === 0 || hasAnimatedStagger) return;
    hasAnimatedStagger = true;
    gsap.fromTo(
      depListEl.querySelectorAll('.departure-card'),
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04, clearProps: 'transform,opacity' },
    );
  });

  $effect(() => {
    route.id;
    departureData;
    loadSegmentDeps().catch((e) => console.error('loadSegmentDeps failed', e));
  });

  function disruptionType(message: string): "protest" | "technical" | "weather" | "general" {
    const m = message.toLowerCase();
    if (/(protest|demonstration|strejk|march|blockad)/i.test(m)) return "protest";
    if (/(signal|switch|technical|fault|fel|teknisk|power|el|track|spår)/i.test(m)) return "technical";
    if (/(snow|rain|storm|wind|väder|snö|regn|is|storm)/i.test(m)) return "weather";
    return "general";
  }

  function formatSubsequent(deps: Departure[]): string | null {
    const subsequent = deps.slice(1, 4);
    if (!subsequent.length) return null;
    return subsequent
      .map((d) => d.time)
      .filter(Boolean)
      .join(" · ");
  }

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
      departureStore.lastError.subscribe((val) => (lastError = val ? t.failedToFetchDepartures : null)),
    );
    UNSUBSCRIBERS.push(
      departureStore.lastSuccessfulFetch.subscribe((val) => (lastSuccessfulFetch = val)),
    );
    startClockTimer();

    try {
      const initial = (route.segments ?? []).slice(0, PREFETCH_SEGMENT_COUNT);
      for (const seg of initial) prefetchForSegment(seg);
    } catch (e) {}
  });

  onDestroy(() => {
    UNSUBSCRIBERS.forEach((fn) => fn());
    stopClockTimer();
  });
</script>

<div class="departures-view">
  <!-- Page nav header -->
  <header class="page-chrome">
    <h1 class="page-title">{route.name}</h1>
    <div class="nav-group">
      {#if pages.length > 1}
        <button
          class="nav-btn"
          class:inactive={!hasPrev}
          onclick={() => hasPrev && onSwitchPage?.(pages[currentPageIndex - 1].id)}
          aria-label={t.previousPage}
          disabled={!hasPrev}
        >
          <svg viewBox="0 0 24 24" fill="none">
            {@html chevronLeft}
          </svg>
        </button>

        <div class="page-dots">
          {#each pages as page, i (page.id)}
            <button
              type="button"
              class="dot"
              class:active={page.id === activePageId}
              onclick={() => page.id !== activePageId && onSwitchPage?.(page.id)}
              aria-label={page.id === activePageId ? page.name : `${t.switchTo} ${page.name}`}
            ></button>
          {/each}
        </div>

        <button
          class="nav-btn"
          class:inactive={!hasNext}
          onclick={() => hasNext && onSwitchPage?.(pages[currentPageIndex + 1].id)}
          aria-label={t.nextPage}
          disabled={!hasNext}
        >
          <svg viewBox="0 0 24 24" fill="none">
            {@html chevronRight}
          </svg>
        </button>
      {/if}
    </div>
  </header>

  <!-- Freshness indicator -->
  <div class="freshness-row">
    <span class="fresh-dot" style="background: {freshnessDotColor()}"></span>
    <span class="fresh-label">{freshnessLabel()}</span>
  </div>

  <!-- Departure list -->
  <div class="card-list" bind:this={depListEl}>
    {#if lastError}
      <div class="error-bar">
        <span>{lastError}</span>
        <button onclick={() => (lastError = null)}>×</button>
      </div>
    {/if}

    {#if isLoading}
      <div class="loading-skeleton">
        {#each Array(3) as _, i (i)}
          <div class="skeleton-card">
            <div class="skeleton-accent"></div>
            <div class="skeleton-body">
              <Skeleton width="32px" height="32px" borderRadius="8px" />
              <div class="skeleton-meta">
                <Skeleton width="80px" height="16px" borderRadius="4px" />
                <Skeleton width="120px" height="10px" borderRadius="3px" />
                <Skeleton width="90px" height="10px" borderRadius="3px" />
              </div>
              <Skeleton width="60px" height="28px" borderRadius="4px" />
            </div>
          </div>
        {/each}
      </div>
    {:else}
      {#each segmentGroups.normal as item, index (item.segment.id)}
        {@const deps = segmentDeps[item.originalIndex] ?? []}
        {@const departure = deps[0]}
        {@const subsequent = formatSubsequent(deps)}
        {@const hasDeparture = deps.length > 0 && !!departure}
        {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
        {@const health = deviationHealthBySegment.get(item.segment.id)}
        {@const severity = health?.state === 'critical' ? 'critical' : health?.state === 'affected' ? 'affected' : 'normal'}
        {@const rawSiteDevs = stopDeviationsMap.get(item.segment.fromStop.siteId) || []}
        {@const displayDevs = computeDisplayDevs(rawSiteDevs, health?.reason)}
        {@const hasDisruption = displayDevs.length > 0}
        {@const isExpanded = expandedSegmentId === item.segment.id}
        {@const isExpandable = hasDeparture || hasDisruption}
        {@const topDevMessage = displayDevs[0]?.message ?? ""}
        {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}

        <DepartureRow
          segment={item.segment}
          {departure}
          {subsequent}
          {hasDeparture}
          {primaryDepartureText}
          siteDevs={displayDevs}
          {isExpanded}
          {isExpandable}
          {topDevMessage}
          {topDevType}
          {userLocation}
          locationRequestInFlight={settings.walkingEtaEnabled ? locationRequestInFlight : false}
          walkingEtaEnabled={settings.walkingEtaEnabled ?? false}
          {openFeatureSheet}
          {t}
          {severity}
          ontoggle={() => toggleExpanded(item.segment.id)}
          onprefetch={() => prefetchForSegment(item.segment)}
        />
      {/each}

      {#if segmentGroups.hasDisrupted}
        <div class="section-label">{t.sectionDisrupted}</div>
        {#each segmentGroups.disrupted as item, index (item.segment.id)}
          {@const deps = segmentDeps[item.originalIndex] ?? []}
          {@const departure = deps[0]}
          {@const subsequent = formatSubsequent(deps)}
          {@const hasDeparture = deps.length > 0 && !!departure}
          {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
          {@const health = deviationHealthBySegment.get(item.segment.id)}
          {@const severity = health?.state === 'critical' ? 'critical' : health?.state === 'affected' ? 'affected' : 'normal'}
          {@const rawSiteDevs = stopDeviationsMap.get(item.segment.fromStop.siteId) || []}
          {@const healthDevs = health?.reason ? [{ message: health.reason }] : []}
          {@const displayDevs = rawSiteDevs.length > 0 ? rawSiteDevs : healthDevs}
        {@const hasDisruption = displayDevs.length > 0}
        {@const isExpanded = expandedSegmentId === item.segment.id}
          {@const isExpandable = hasDeparture || hasDisruption}
          {@const topDevMessage = displayDevs[0]?.message ?? ""}
          {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}

          <DepartureRow
            segment={item.segment}
            {departure}
            {subsequent}
            {hasDeparture}
            {primaryDepartureText}
            siteDevs={displayDevs}
            {isExpanded}
            {isExpandable}
            {topDevMessage}
            {topDevType}
            {userLocation}
            locationRequestInFlight={settings.walkingEtaEnabled ? locationRequestInFlight : false}
            walkingEtaEnabled={settings.walkingEtaEnabled ?? false}
            {openFeatureSheet}
            {t}
            {severity}
            ontoggle={() => toggleExpanded(item.segment.id)}
            onprefetch={() => prefetchForSegment(item.segment)}
          />
        {/each}
      {/if}

      {#if (route.segments ?? []).length > 0 && !isLoading && segmentDeps.every((d) => d.length === 0)}
        <div class="empty-state">
          <div class="no-departure">—</div>
          <p class="empty-text">{t.noDeparturesAvailable}</p>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Settings bar -->
  {#if onEditToggle}
    <div class="settings-bar">
      <button class="settings-btn" onclick={onEditToggle}>
        <svg viewBox="0 0 24 24" fill="none">
          {@html adjustmentsHorizontal}
        </svg>
        <span>{t.settings}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .departures-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page-chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 6px;
  }
  .nav-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .nav-btn:hover {
    background: var(--accent-subtle);
  }
  .nav-btn.inactive {
    opacity: 0.2;
    cursor: default;
  }
  .nav-btn svg {
    width: 20px;
    height: 20px;
  }
  .page-dots {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--text-ghost);
    cursor: pointer;
    border: 0;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .dot.active {
    background: var(--text);
    transform: scale(1.3);
  }
  .page-title {
    font-family: 'Neue Machina', sans-serif;
    font-size: 30px;
    font-weight: 900;
    color: var(--text);
    letter-spacing: -1px;
    margin: 0;
    line-height: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .freshness-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px 10px;
  }
  .fresh-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .fresh-label {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 14px 24px;
    flex: 1;
    overflow-y: auto;
  }

  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #991b1b;
    font-size: 13px;
  }
  .error-bar button {
    background: none;
    border: none;
    color: #991b1b;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }

  .loading-skeleton {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .skeleton-card {
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .skeleton-accent {
    width: 100%;
    height: 4px;
    background: var(--accent-subtle);
  }
  .skeleton-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    min-height: 58px;
  }
  .skeleton-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
  }
  .empty-text {
    margin: 16px 0 0;
    font-size: 14px;
    color: var(--text-muted);
  }
  .no-departure {
    font-family: 'Neue Machina', sans-serif;
    font-size: 48px;
    font-weight: 300;
    color: var(--text-ghost);
    letter-spacing: 0;
    line-height: 1;
  }

  .settings-bar {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    z-index: 5;
    margin: 0 14px 18px;
  }
  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 11px 16px;
    background: var(--accent);
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-on-accent);
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
  .settings-btn:hover {
    opacity: 0.9;
  }
  .settings-btn svg {
    width: 18px;
    height: 18px;
  }

  .section-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.09em;
    padding: 12px 14px 6px;
  }
</style>
