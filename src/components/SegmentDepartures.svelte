<script lang="ts">
  import type { Page, Segment } from "../types/page";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore.svelte";
  import { getPages, getActivePageId } from "../stores/pageStore.svelte";
  import { transitService } from "../providers/init";
  import { toEntityId, toLegacyDeparture } from "../lib/departureConverter";
  import { formatDepartureTime, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
  import { deduplicateDeparturesByKey } from "../lib/departureDeduplication";
  import { onMount, onDestroy } from "svelte";
  import { getQuickLocation } from "../services/geo";
  import { getT } from "../stores/localeStore.svelte";
  import gsap from 'gsap';

  import DepartureRow from "./DepartureRow.svelte";
  import { prefetchSegments } from "../services/prefetchService";
  import { getSettings } from "../stores/settingsStore.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";
  import { chevronLeft, chevronRight, settingsGear, mapIcon, editPencil } from "../icons/departureIcons";
  import MapViewer from "./MapViewer.svelte";
  import { getDisruptionDisplay, isSegmentDisrupted } from "./segmentUtils";
  import { disruptionType } from "../lib/disruptionType";
  import type { StationAlert } from "../types/deviation";
  import StationNoticeBar from "./StationNoticeBar.svelte";

  let {
    route,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationStationAlerts = [] as StationAlert[],
    deviationUsedCache = false,
    deviationLastUpdatedAt = 0,
    openFeatureSheet = null,
    onSwitchPage,
    onEditToggle,
    onOpenSettings,
    onQuickAdd,
    lastRefreshTime,
  }: {
    route: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationStationAlerts?: StationAlert[];
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    onSwitchPage?: (pageId: string) => void;
    onEditToggle?: () => void;
    onOpenSettings?: () => void;
    onQuickAdd?: () => void;
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
  let showMap = $state(false);
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
    if (mins === 0) return t.updatedJustNow;
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
  let segmentSleeping = $state<Array<{ isSleeping: boolean; nextTime: string | null }>>([]);

  let segmentGroups = $derived.by(() => {
    const segs = route.segments ?? [];
    const group = settings.groupDisruptedSegments ?? false;

    if (!group) {
      // Default: flat list in user-defined order
      const all: Array<{ segment: Segment; originalIndex: number }> = segs.map(
        (seg, i) => ({ segment: seg, originalIndex: i }),
      );
      return { all, disrupted: [] as typeof all, hasDisrupted: false };
    }

    // Grouped mode: normal first, disrupted below with section label
    const all: Array<{ segment: Segment; originalIndex: number }> = [];
    const disrupted: Array<{ segment: Segment; originalIndex: number }> = [];
    segs.forEach((seg, i) => {
      const health = deviationHealthBySegment.get(seg.id);
      const siteDevsList = stopDeviationsMap.get(seg.fromStop.siteId) || [];
      const display = getDisruptionDisplay(siteDevsList, health, settings.disruptionSeverityThreshold);
      const isDisrupted = display.messages.length > 0;
      (isDisrupted ? disrupted : all).push({ segment: seg, originalIndex: i });
    });
    return { all, disrupted, hasDisrupted: disrupted.length > 0 };
  });

  async function loadSegmentDeps() {
    const segs = route.segments ?? [];
    const deps: Departure[][] = [];
    const sleeping: Array<{ isSleeping: boolean; nextTime: string | null }> = [];

    for (const seg of segs) {
      const segEntityId = toEntityId(seg.fromStop.siteId);
      const predicted = (await transitService.getPredictedDepartures(
        segEntityId,
        seg.fromStop.name,
        seg.line,
        seg.direction?.code ?? 0,
        5,
      )).map(toLegacyDeparture);

      const allDeps = departureData.get(seg.fromStop.siteId) ?? [];
      // Filter primarily by line and direction_code. Destination is secondary because
      // API destination strings may vary slightly (abbreviations, extra stops) and
      // direction_code is the authoritative discriminator from SL.
      const live = allDeps.filter((dep) => {
        if (dep.line !== seg.line) return false;
        if ((dep.direction_code ?? -1) !== (seg.direction?.code ?? -1)) return false;
        return true;
      });

      // Dev diagnostics: log when live filtering yields no results
      if (import.meta.env.DEV && live.length === 0 && allDeps.length > 0) {
        const matchingLine = allDeps.filter(dep => dep.line === seg.line);
        const matchingDirection = matchingLine.filter(dep => (dep.direction_code ?? -1) === (seg.direction?.code ?? -1));
        console.warn('[SegmentDepartures] Live departures filtered to 0:', {
          stop: seg.fromStop.name,
          line: seg.line,
          direction_code: seg.direction?.code,
          totalApiDeps: allDeps.length,
          matchingLine: matchingLine.length,
          matchingDirection: matchingDirection.length,
          sampleApiDestinations: allDeps.slice(0, 3).map(d => d.destination),
        });
      }

      let merged: Departure[];
      if (live.length > 0) {
        merged = deduplicateDeparturesByKey(seg.fromStop.siteId, mergeDeparturesWithPredictions(live, predicted, 5));
      } else {
        merged = deduplicateDeparturesByKey(seg.fromStop.siteId, predicted);
      }

      if (merged.length > 0) {
        deps.push(merged);
        sleeping.push({ isSleeping: false, nextTime: null });
      } else {
        // No departures in the live/predicted window — look up next scheduled
        // departure from the timetable cache (no time-horizon cap).
        deps.push([]);
        try {
          const nextTransit = await transitService.getNextScheduledDeparture(
            toEntityId(seg.fromStop.siteId),
            seg.fromStop.name,
            seg.line,
            seg.direction?.code ?? 0,
          );
          if (nextTransit) {
            sleeping.push({ isSleeping: true, nextTime: nextTransit.scheduledTime });
          } else {
            sleeping.push({ isSleeping: false, nextTime: null });
          }
        } catch {
          sleeping.push({ isSleeping: false, nextTime: null });
        }
      }
    }
    segmentDeps = deps;
    segmentSleeping = sleeping;
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
    <div class="header-actions">
      <button class="header-icon-btn" onclick={() => showMap = true} aria-label={t.mapViewerLabel}>
        <svg viewBox="0 0 24 24" fill="none">
          {@html mapIcon}
        </svg>
      </button>
      {#if onEditToggle}
      <button class="header-icon-btn" onclick={onEditToggle} aria-label={t.tabSegments}>
        <svg viewBox="0 0 24 24" fill="none">
          {@html editPencil}
        </svg>
      </button>
      {/if}
      {#if onOpenSettings}
      <button class="header-icon-btn" onclick={onOpenSettings} aria-label={t.settings}>
        <svg viewBox="0 0 24 24" fill="none">
          {@html settingsGear}
        </svg>
      </button>
      {/if}
    </div>
  </header>

  <MapViewer isOpen={showMap} onClose={() => showMap = false} mapSrc="{import.meta.env.BASE_URL}SL_railway_map.svg" />

  {#if (route.segments ?? []).length === 0}
    <div class="empty-segments">
      <svg class="empty-illustration" viewBox="0 0 80 80" fill="none">
        <rect x="15" y="20" width="50" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
        <path d="M25 35h20M25 45h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2>{t.noSegments}</h2>
      <p>{t.noSegmentsDesc}</p>
      <button class="empty-cta" onclick={onQuickAdd ?? onEditToggle}>
        <span>{t.add}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 4v12M4 10h12"/>
        </svg>
      </button>
    </div>
  {:else}
    <!-- Freshness indicator -->
    <div class="freshness-row">
      <span class="fresh-dot" style="background: {freshnessDotColor()}"></span>
      <span class="fresh-label">{freshnessLabel()}</span>
    </div>

    <!-- Station facility notices: collapsed ambient bar, expands inline -->
    <StationNoticeBar alerts={deviationStationAlerts} {t} />

    <!-- Departure list: all segments in user-defined order -->
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
            <div class="skeleton-inner">
              <div class="skeleton-accent"></div>
              <div class="skeleton-body">
                <div class="skeleton-icon"></div>
                <div class="skeleton-meta">
                  <div class="sk-line sk-route"></div>
                  <div class="sk-line sk-stop"></div>
                  <div class="sk-line sk-dest"></div>
                </div>
                <div class="sk-countdown"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      {#each segmentGroups.all as item (item.segment.id)}
        {@const deps = segmentDeps[item.originalIndex] ?? []}
        {@const sleepInfo = segmentSleeping[item.originalIndex] ?? { isSleeping: false, nextTime: null }}
        {@const departure = deps[0]}
        {@const subsequent = formatSubsequent(deps)}
        {@const hasDeparture = deps.length > 0 && !!departure}
        {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
        {@const health = deviationHealthBySegment.get(item.segment.id)}
        {@const rawSiteDevs = stopDeviationsMap.get(item.segment.fromStop.siteId) || []}
        {@const disruptionDisplay = getDisruptionDisplay(rawSiteDevs, health, settings.disruptionSeverityThreshold)}
        {@const severity = disruptionDisplay.severity}
        {@const displayDevs = disruptionDisplay.messages}
        {@const hasDisruption = displayDevs.length > 0}
        {@const isExpanded = expandedSegmentId === item.segment.id}
        {@const isExpandable = hasDeparture || hasDisruption || sleepInfo.isSleeping}
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
          isSleeping={sleepInfo.isSleeping}
          nextDepartureTime={sleepInfo.nextTime}
          ontoggle={() => toggleExpanded(item.segment.id)}
          onprefetch={() => prefetchForSegment(item.segment)}
        />
      {/each}

      {#if segmentGroups.hasDisrupted}
        <div class="section-label">{t.sectionDisrupted}</div>
        {#each segmentGroups.disrupted as item (item.segment.id)}
          {@const deps = segmentDeps[item.originalIndex] ?? []}
          {@const sleepInfo = segmentSleeping[item.originalIndex] ?? { isSleeping: false, nextTime: null }}
          {@const departure = deps[0]}
          {@const subsequent = formatSubsequent(deps)}
          {@const hasDeparture = deps.length > 0 && !!departure}
          {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
          {@const health = deviationHealthBySegment.get(item.segment.id)}
          {@const rawSiteDevs = stopDeviationsMap.get(item.segment.fromStop.siteId) || []}
          {@const disruptionDisplay = getDisruptionDisplay(rawSiteDevs, health, settings.disruptionSeverityThreshold)}
          {@const severity = disruptionDisplay.severity}
          {@const displayDevs = disruptionDisplay.messages}
          {@const hasDisruption = displayDevs.length > 0}
          {@const isExpanded = expandedSegmentId === item.segment.id}
          {@const isExpandable = hasDeparture || hasDisruption || sleepInfo.isSleeping}
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
            isSleeping={sleepInfo.isSleeping}
            nextDepartureTime={sleepInfo.nextTime}
            ontoggle={() => toggleExpanded(item.segment.id)}
            onprefetch={() => prefetchForSegment(item.segment)}
          />
        {/each}
      {/if}

      {#if (route.segments ?? []).length > 0 && !isLoading && segmentDeps.every((d) => d.length === 0) && segmentSleeping.every(s => !s.isSleeping)}
        <div class="empty-state">
          <div class="no-departure">—</div>
          <p class="empty-text">{t.noDeparturesAvailable}</p>
        </div>
      {/if}
      {#if onQuickAdd}
        <button class="quick-add-card" onclick={onQuickAdd}>
          + {t.add}
        </button>
      {/if}
    {/if}
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
    padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 6px;
  }
  .header-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    border-radius: 50%;
    margin-right: -8px;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s, transform 0.12s ease;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .header-actions .header-icon-btn {
    margin-right: -4px;
  }
  .header-icon-btn:hover {
    background: var(--accent-subtle);
  }
  .header-icon-btn:active {
    transform: scale(0.965);
    opacity: 0.9;
  }
  .header-icon-btn svg {
    width: 24px;
    height: 24px;
  }
  .page-title {
    font-family: 'Neue Machina', sans-serif;
    font-size: 30px;
    font-weight: 900;
    color: var(--text);
    letter-spacing: -1px;
    margin: 0;
    line-height: 1.15;
    padding-bottom: 2px;
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
    padding: 0 14px calc(24px + env(safe-area-inset-bottom, 0px));
    flex: 1;
    overflow-y: auto;
  }

  .quick-add-card {
    width: 100%;
    padding: 14px 16px;
    border: 1.5px dashed var(--accent);
    border-radius: 14px;
    background: transparent;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 150ms ease;
    -webkit-tap-highlight-color: transparent;
    margin-top: 4px;
  }
  .quick-add-card:active {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
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
  .skeleton-inner {
    display: flex;
    flex-direction: column;
  }
  .skeleton-accent {
    width: 100%;
    height: 4px;
    background: var(--border);
  }
  .skeleton-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    min-height: 58px;
  }
  .skeleton-icon {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 8px;
    background: var(--border);
  }
  .skeleton-meta {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
    min-width: 0;
  }
  .sk-line {
    border-radius: 4px;
    background: linear-gradient(90deg, var(--border) 0%, var(--surface-emphasis, color-mix(in srgb, var(--surface) 92%, #000 8%)) 50%, var(--border) 100%);
    background-size: 200% 100%;
    animation: sk-shimmer 1.5s ease-in-out infinite;
  }
  .sk-route { width: 60px; height: 16px; }
  .sk-stop { width: 130px; height: 10px; }
  .sk-dest { width: 100px; height: 10px; }
  .sk-countdown {
    width: 60px;
    height: 28px;
    border-radius: 4px;
    flex-shrink: 0;
    background: linear-gradient(90deg, var(--border) 0%, var(--surface-emphasis, color-mix(in srgb, var(--surface) 92%, #000 8%)) 50%, var(--border) 100%);
    background-size: 200% 100%;
    animation: sk-shimmer 1.5s ease-in-out infinite;
  }
  @keyframes sk-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sk-line, .sk-countdown { animation: none; opacity: 0.4; }
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



  .section-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.09em;
    padding: 12px 14px 6px;
  }

  .empty-segments {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 20px;
    gap: 16px;
  }

  .empty-illustration {
    width: 64px;
    height: 64px;
    color: var(--text-ghost);
  }

  .empty-segments h2 {
    font-family: 'Neue Machina', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .empty-segments p {
    font-size: 15px;
    color: var(--text-secondary);
    max-width: 240px;
  }

  .empty-cta {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--accent);
    color: var(--text-on-accent);
    border: none;
    padding: 14px 24px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .empty-cta svg {
    width: 18px;
    height: 18px;
  }

  /* ── Tablet: multi-column segments ── */
  @media (min-width: 768px) {
    .card-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      align-content: start;
      align-items: start;
    }

    .card-list > .section-label,
    .card-list > .empty-state,
    .card-list > .error-bar,
    .card-list > .quick-add-card {
      grid-column: 1 / -1;
    }

    .loading-skeleton {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .page-title {
      font-size: clamp(30px, 4vw, 38px);
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    .page-chrome {
      padding: calc(8px + env(safe-area-inset-top, 0px)) 16px 4px;
    }

    .page-title {
      font-size: 24px;
    }

    .freshness-row {
      padding-bottom: 6px;
    }
  }
</style>
