<script lang="ts">
  import type { Page, Segment } from "../types/page";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore.svelte";
  import { getPages, getActivePageId } from "../stores/pageStore.svelte";
  import { transitService } from "../providers/init";
  import { toEntityId } from "../lib/departureConverter";
  import { formatDepartureTime } from "../lib/departureDisplay";
  import { buildDepartureBoardGroups, resolveDepartureBoardSnapshot } from "../lib/departureBoardModel";
  import { onMount, onDestroy } from "svelte";
  import { getQuickLocation } from "../services/geo";
  import { getT } from "../stores/localeStore.svelte";
  import gsap from 'gsap';

  import DepartureRow from "./DepartureRow.svelte";
  import JourneyCard from "./JourneyCard.svelte";
  import type { SavedJourneyAction } from "../lib/savedJourneyLifecycle";
  import { getSettings } from "../stores/settingsStore.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";
  import { chevronLeft, chevronRight, settingsGear, mapIcon, editPencil, cloudRain, cloudSnow, cloudLightning } from "../icons/departureIcons";
  import MapViewer from "./MapViewer.svelte";
  import { getDisruptionDisplay } from "./segmentUtils";
  import { getLocale } from "../stores/localeStore.svelte";
  import { disruptionType } from "../lib/disruptionType";
  import type { StationAlert } from "../types/deviation";
  import type { SavedCardActionId } from "../lib/savedCardActions";
  import StationNoticeBar from "./StationNoticeBar.svelte";
  import SavedCardActionsSheet from './SavedCardActionsSheet.svelte';
  import { dismissedStore } from "../stores/dismissedStore.svelte";
  import { getWeatherForStation } from "../services/weatherCache";

  let {
    page,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationStationAlerts = [] as StationAlert[],
    deviationUsedCache = false,
    openFeatureSheet = null,
    onSwitchPage,
    onEditToggle,
    onOpenSettings,
    onQuickAdd,
    onJourneyAction,
    onSavedCardAction,
    onMoveSegment,
    lastRefreshTime,
  }: {
    page: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationStationAlerts?: StationAlert[];
    deviationUsedCache?: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    onSwitchPage?: (pageId: string) => void;
    onEditToggle?: () => void;
    onOpenSettings?: () => void;
    onQuickAdd?: () => void;
    onJourneyAction?: (segmentId: string, action: SavedJourneyAction) => void;
    onSavedCardAction?: (segment: Segment, action: SavedCardActionId) => void;
    onMoveSegment?: (segment: Segment, pageId: string) => void;
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
  let userLocation = $state<[number, number] | null>(null);
  let locationRequestInFlight = $state(false);
  let lastNearbyPrefetchKey = $state('');
  let showMap = $state(false);
  let t = $derived(getT());
  let settings = $derived(getSettings());
  let activeActionSegment = $state<Segment | null>(null);
  let actionTrigger = $state<HTMLElement | null>(null);

  // Weather per station (for station grouping header)
  let stationWeather = $state<Map<string, string | null>>(new Map());

  $effect(() => {
    // Only fetch when grouping by station
    if (settings.groupingMode !== 'station') return;
    for (const seg of page.segments ?? []) {
      const station = seg.fromStop.name;
      if (stationWeather.has(station)) continue;
      const coord = seg.fromStop.coord;
      if (!coord) continue;
      getWeatherForStation(coord[0], coord[1]).then((s) => {
        stationWeather.set(station, s);
      });
    }
  });

  function weatherIconForSymbol(symbol: string | null): string | null {
    if (symbol === 'rain') return cloudRain;
    if (symbol === 'snow') return cloudSnow;
    if (symbol === 'thunder') return cloudLightning;
    return null;
  }



  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let depListEl: HTMLDivElement | undefined = $state();
  let hasAnimatedStagger = $state(false);
  let segmentDepsGeneration = 0;

  let dataAge = $derived(lastRefreshTime ? Date.now() - lastRefreshTime : Infinity);
  let isStale = $derived(lastRefreshTime !== undefined && dataAge > 120000);

  function freshnessDotColor(): string {
    if (lastRefreshTime === undefined) return 'var(--text-ghost)';
    if (isStale) return '#e8950a';
    return 'var(--color-success, #27ae60)';
  }

  function freshnessLabel(): string {
    if (lastRefreshTime === undefined) return t.loading;
    if (isStale) return t.dataMayBeStale;
    const mins = Math.max(0, Math.floor(dataAge / 60000));
    if (mins === 0) return t.updatedJustNow;
    return t.updatedMinutesAgo.replace('{minutes}', String(mins));
  }

  $effect(() => {
    page.id;
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

  function openSavedCardActions(segment: Segment, trigger?: HTMLElement) {
    activeActionSegment = segment;
    actionTrigger = trigger ?? null;
  }

  function closeSavedCardActions() {
    activeActionSegment = null;
    actionTrigger = null;
  }

  function handleSavedCardAction(action: SavedCardActionId) {
    if (!activeActionSegment) return;
    const segment = activeActionSegment;
    closeSavedCardActions();
    onSavedCardAction?.(segment, action);
  }

  function handleMoveSegment(pageId: string) {
    if (!activeActionSegment) return;
    const segment = activeActionSegment;
    closeSavedCardActions();
    onMoveSegment?.(segment, pageId);
  }

  const PREFETCH_SEGMENT_COUNT = 2;
  const PREFETCH_VENUE_RADIUS = 1200;
  const PREFETCH_EVENT_RADIUS = 3000;

  const _prefetchInFlight = new Set<string>();

  async function prefetchForSegment(segment: Segment) {
    void transitService.prefetchStopSequence(
      toEntityId(segment.fromStop.siteId),
      segment.direction.destination,
      segment.line,
      segment.direction.code,
    ).catch(() => {});

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
    if (!shouldPrefetch || !(page.segments ?? []).length) return;

    const prefKey = `${page.id}:${settings.afterworkVenuesEnabled ? 1 : 0}:${settings.eventsEnabled ? 1 : 0}`;
    if (prefKey === lastNearbyPrefetchKey) return;
    lastNearbyPrefetchKey = prefKey;

    void import('../services/prefetchService')
      .then((m) => m.prefetchSegments(page.segments ?? [], settings, { concurrency: 4 }))
      .catch(() => {});
  }

  let segmentDeps = $state<Map<string, Departure[]>>(new Map());
  let segmentSleeping = $state<Map<string, { isSleeping: boolean; nextTime: string | null }>>(new Map());

  let boardGroups = $derived.by(() => buildDepartureBoardGroups({
    segments: page.segments ?? [],
    departureData,
    sleepingBySegment: segmentSleeping,
    sortMode: settings.sortMode ?? 'time',
    groupingMode: settings.groupingMode ?? 'none',
    groupSleeping: settings.groupSleeping,
    userLocation,
    deviationHealthBySegment,
    stopDeviationsMap,
    disruptionSeverityThreshold: settings.disruptionSeverityThreshold,
    locale: getLocale(),
    labels: {
      disrupted: t.sectionDisrupted,
      sleeping: t.sleeping,
      transport: {
        bus: t.transportBus,
        train: t.transportTrain,
        metro: t.transportMetro,
        tram: t.transportTram,
        boat: t.transportBoat,
      },
    },
  }));

  async function loadSegmentDeps() {
    const generation = ++segmentDepsGeneration;
    const segs = [...(page.segments ?? [])];
    const snapshot = await resolveDepartureBoardSnapshot({
      segments: segs,
      departureData,
      transit: transitService,
    });

    // A slower request started before the latest departure update must never
    // replace the newer snapshot and make cards jump backwards.
    if (generation !== segmentDepsGeneration) return;
    segmentDeps = snapshot.departuresBySegment;
    segmentSleeping = snapshot.sleepingBySegment;
  }

  $effect(() => {
    page.segments;
    if (settings.afterworkVenuesEnabled || settings.eventsEnabled) {
      scheduleNearbyPrefetch();
    }
  });

  $effect(() => {
    const count = [...segmentDeps.values()].reduce((a, b) => a + b.length, 0);
    if (!depListEl || count === 0 || hasAnimatedStagger) return;
    hasAnimatedStagger = true;
    gsap.fromTo(
      depListEl.querySelectorAll('.departure-card, .journey-card'),
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04, clearProps: 'transform,opacity' },
    );
  });

  $effect(() => {
    page.id;
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
    startClockTimer();

    try {
      const initial = (page.segments ?? []).slice(0, PREFETCH_SEGMENT_COUNT);
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
    <h1 class="page-title">{page.name}</h1>
    <div class="header-actions">
      <button class="header-icon-btn" onclick={() => showMap = true} aria-label={t.networkMap ?? t.mapViewerLabel}>
        <svg viewBox="0 0 24 24" fill="none">
          {@html mapIcon}
        </svg>
      </button>
      {#if onEditToggle}
      <button class="header-icon-btn" onclick={onEditToggle} aria-label={t.managePages ?? 'Manage pages'}>
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

  {#if (page.segments ?? []).length === 0}
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
    <!-- Surface freshness only when it changes the user's decision. Healthy,
         current data should feel trustworthy rather than self-reporting. -->
    {#if isStale || deviationUsedCache || lastError}
      <div class="freshness-row" class:cached={deviationUsedCache && !isStale}>
        <span class="fresh-dot" style="background: {freshnessDotColor()}"></span>
        <span class="fresh-label">
          {#if deviationUsedCache && !isStale}{t.usingCachedDisruptions}{:else}{freshnessLabel()}{/if}
        </span>
      </div>
    {/if}

    <!-- Station facility notices: collapsed ambient bar, expands inline -->
    <StationNoticeBar alerts={deviationStationAlerts} {t} />

    <!-- Departure list -->
    <div class="card-list" bind:this={depListEl} aria-busy={isLoading}>
    {#if lastError}
      <div class="error-bar">
        <span>{lastError}</span>
        <button onclick={() => (lastError = null)}>×</button>
      </div>
    {/if}

    {#if isLoading}
      <div class="loading-skeleton" aria-hidden="true">
        {#each Array(3) as _, i (i)}
          <div class="skeleton-card">
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
        {/each}
      </div>
    {:else}
      {@const sections = [
        { key: 'departures', title: t.departuresSection ?? 'Avgångar', description: '', groups: boardGroups.departures.groups },
        { key: 'journeys', title: t.journeysSection ?? 'Resor', description: t.journeysSectionDesc ?? 'Visar nästa bästa resa till din destination.', groups: boardGroups.journeys.groups },
      ]}
      {#each sections as section (section.key)}
        {#if section.groups.length > 0}
          <section class="content-section" class:journey-section={section.key === 'journeys'} aria-labelledby="section-{section.key}">
            <header class="content-section-heading">
              <div>
                <h2 id="section-{section.key}">{section.title}</h2>
                {#if section.description}<p>{section.description}</p>{/if}
              </div>
              <span class="section-count">{section.groups.reduce((count, group) => count + group.items.length, 0)}</span>
            </header>
      {#each section.groups as group}
        {#if group.label}
          <div class="section-label">
            {group.label}
            {#if section.key === 'departures' && settings.groupingMode === 'station'}
              {@const ws = stationWeather.get(group.label) ?? null}
              {@const wi = weatherIconForSymbol(ws)}
              {#if wi}
                <svg viewBox="0 0 24 24" fill="none" class="section-weather" aria-label={ws === 'rain' ? 'Rain' : ws === 'snow' ? 'Snow' : 'Thunder'}>
                  <g>{@html wi}</g>
                </svg>
              {/if}
            {/if}
          </div>
        {/if}
        {#each group.items as item (item.segment.id)}
          {@const deps = segmentDeps.get(item.segment.id) ?? []}
          {@const sleepInfo = segmentSleeping.get(item.segment.id) ?? { isSleeping: false, nextTime: null }}
          {@const departure = deps[0]}
          {@const subsequent = formatSubsequent(deps)}
          {@const hasDeparture = deps.length > 0 && !!departure}
          {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
          {@const health = deviationHealthBySegment.get(item.segment.id)}
          {@const rawSiteDevs = stopDeviationsMap.get(item.segment.fromStop.siteId) || []}
          {@const disruptionDisplay = getDisruptionDisplay(rawSiteDevs, health, settings.disruptionSeverityThreshold, getLocale(), item.segment.line, departure?.deviations, item.segment.fromStop.siteId)}
          {@const severity = disruptionDisplay.severity}
          {@const disruptionScope = disruptionDisplay.scope}
          {@const displayDevs = disruptionDisplay.messages.filter((d) => !dismissedStore.isMessageDismissed(d.message))}
          {@const hasDisruption = displayDevs.length > 0}
          {@const isExpanded = expandedSegmentId === item.segment.id}
          {@const isExpandable = hasDeparture || hasDisruption || sleepInfo.isSleeping}
          {@const topDevMessage = displayDevs[0]?.message ?? ""}
          {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}

          {#if item.segment.journeyMeta}
            <JourneyCard
              journeyMeta={item.segment.journeyMeta}
              now={now}
              isExpanded={isExpanded}
              ontoggle={() => toggleExpanded(item.segment.id)}
              onAction={(action) => onJourneyAction?.(item.segment.id, action)}
              onLongPress={(trigger) => openSavedCardActions(item.segment, trigger)}
              onMoreActions={(trigger) => openSavedCardActions(item.segment, trigger)}
              moreActionsLabel={t.moreActionsForJourney?.replace('{destination}', item.segment.journeyMeta.destLabel) ?? `More actions for journey to ${item.segment.journeyMeta.destLabel}`}
            />
          {:else}
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
              {disruptionScope}
              isSleeping={sleepInfo.isSleeping}
              nextDepartureTime={sleepInfo.nextTime}
              {now}
              ontoggle={() => toggleExpanded(item.segment.id)}
              onprefetch={() => prefetchForSegment(item.segment)}
              groupingMode={settings.groupingMode}
              onLongPress={(trigger) => openSavedCardActions(item.segment, trigger)}
              onMoreActions={(trigger) => openSavedCardActions(item.segment, trigger)}
              moreActionsLabel={(t.moreActionsForDeparture ?? 'More actions for departure {line} from {stop}')
                .replace('{line}', item.segment.line)
                .replace('{stop}', item.segment.fromStop.name)}
            />
          {/if}
        {/each}
      {/each}
          </section>
        {/if}
      {/each}

      {#if (page.segments ?? []).length > 0 && !isLoading && [...segmentDeps.values()].every((d) => d.length === 0) && [...segmentSleeping.values()].every(s => !s.isSleeping)}
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

  <SavedCardActionsSheet
    isOpen={Boolean(activeActionSegment)}
    segment={activeActionSegment}
    {pages}
    currentPageId={activePageId}
    trigger={actionTrigger}
    onClose={closeSavedCardActions}
    onAction={handleSavedCardAction}
    onMove={handleMoveSegment}
  />


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



  .section-label {
    padding: 12px 16px 4px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .section-weather {
    display: inline-flex;
    width: 14px;
    height: 14px;
    margin-left: 6px;
    vertical-align: middle;
    color: var(--text-secondary);
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
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
    position: relative;
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 14px calc(24px + env(safe-area-inset-bottom, 0px));
    flex: 1;
    overflow-y: auto;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .content-section + .content-section {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  .content-section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 0 2px 2px;
  }

  .content-section-heading h2 {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .content-section-heading p {
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 11px;
  }

  .section-count {
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
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
    background: color-mix(in oklch, var(--accent) 10%, transparent);
  }

  .error-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--color-error-bg, #fef2f2);
    border: 1px solid var(--color-error-subtle, #fecaca);
    border-radius: 8px;
    color: var(--color-error, #991b1b);
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
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .skeleton-card::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      110deg,
      transparent 22%,
      color-mix(in oklch, var(--surface) 68%, var(--text) 32%) 50%,
      transparent 78%
    );
    transform: translateX(-100%);
    animation: skeleton-shimmer 1.7s ease-in-out infinite;
  }
  .skeleton-body {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    min-height: 64px;
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
    background: var(--border);
  }
  .sk-route { width: 60px; height: 16px; }
  .sk-stop { width: 130px; height: 10px; }
  .sk-dest { width: 100px; height: 10px; }
  .sk-countdown {
    width: 60px;
    height: 28px;
    border-radius: 4px;
    flex-shrink: 0;
    background: var(--border);
  }
  @keyframes skeleton-shimmer {
    to { transform: translateX(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-card::after { display: none; }
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
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
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
    .content-section {
      min-width: 0;
    }

    .content-section + .content-section {
      margin-top: 0;
      padding-top: 0;
      padding-left: 12px;
      border-top: 0;
      border-left: 1px solid var(--border);
    }

    .content-section-heading {
      min-height: 42px;
    }

    .card-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-content: start;
      align-items: start;
    }

    /* Error and quick-add rows are siblings, so only-of-type keeps a lone
       visible section full width without changing the section data flow. */
    .card-list > .content-section:only-of-type {
      grid-column: 1 / -1;
    }

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

    .card-list > .loading-skeleton {
      grid-column: 1 / -1;
      width: 100%;
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
