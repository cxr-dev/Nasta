<script lang="ts">
  import type { Page, Segment } from "../types/page";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, makeDepartureStatusKey, type Departure, type DepartureStatus } from "../stores/departureStore.svelte";
  import { getPages, getActivePageId } from "../stores/pageStore.svelte";
  import { transitService } from "../providers/init";
  import { toEntityId } from "../lib/departureConverter";
  import { formatDepartureTime } from "../lib/departureDisplay";
  import { buildDepartureBoardGroups, resolveDepartureBoardSnapshot } from "../lib/departureBoardModel";
  import { onMount, onDestroy, tick } from "svelte";
  import { loadGrantedLocation, subscribeToLocation } from "../services/geo";
  import { getT } from "../stores/localeStore.svelte";
  import gsap from 'gsap';

  import DepartureRow from "./DepartureRow.svelte";
  import JourneyCard from "./JourneyCard.svelte";
  import type { SavedJourneyAction } from "../lib/savedJourneyLifecycle";
  import { getSettings } from "../stores/settingsStore.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import { prefetchFeatureDiscovery } from "../services/featureDiscoverySession";
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
  import { getWeatherForStations } from "../services/weatherCache";

  let {
    page,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationStationAlerts = [] as StationAlert[],
    openFeatureSheet = null,
    onSwitchPage,
    onEditToggle,
    onOpenSettings,
    onQuickAdd,
    onScroll,
    onJourneyAction,
    onSavedCardAction,
    onMoveSegment,
  }: {
    page: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationStationAlerts?: StationAlert[];
    openFeatureSheet?: ((segment: Segment) => void) | null;
    onSwitchPage?: (pageId: string) => void;
    onEditToggle?: () => void;
    onOpenSettings?: () => void;
    onQuickAdd?: () => void;
    onScroll?: () => void;
    onJourneyAction?: (segmentId: string, action: SavedJourneyAction) => void;
    onSavedCardAction?: (segment: Segment, action: SavedCardActionId) => void;
    onMoveSegment?: (segment: Segment, pageId: string) => void;
  } = $props();

  let pages = $derived(getPages());
  let activePageId = $derived(getActivePageId());
  let currentPageIndex = $derived(pages.findIndex(p => p.id === activePageId));
  let hasPrev = $derived(currentPageIndex > 0);
  let hasNext = $derived(currentPageIndex < pages.length - 1);

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let departureStatuses = $state<Map<string, DepartureStatus>>(new Map());
  let stopDeviationsMap = $state<Map<string, any[]>>(new Map());
  let now = $state(Date.now());
  let expandedSegmentId = $state<string | null>(null);
  let expandedPageId = $state<string | null>(null);
  let isLoading = $state(false);
  let userLocation = $state<[number, number] | null>(null);
  let locationRequestInFlight = $state(false);
  let showMap = $state(false);
  let t = $derived(getT());
  let settings = $derived(getSettings());
  let walkingEtaActive = $derived(
    (settings.locationServicesEnabled ?? false) && (settings.walkingEtaEnabled ?? false),
  );
  let activeActionSegment = $state<Segment | null>(null);
  let actionTrigger = $state<HTMLElement | null>(null);

  // Weather per station (for station grouping header)
  let stationWeather = $state<Map<string, string | null>>(new Map());
  let segmentWeather = $state<Map<string, string | null>>(new Map());
  let weatherGeneration = 0;

  $effect(() => {
    const generation = ++weatherGeneration;
    const segmentsWithCoords = (page.segments ?? []).filter((segment) => segment.fromStop.coord);
    if (segmentsWithCoords.length === 0) {
      stationWeather = new Map();
      segmentWeather = new Map();
      return;
    }

    void getWeatherForStations(segmentsWithCoords.map((segment) => ({
      id: segment.id,
      lat: segment.fromStop.coord![0],
      lon: segment.fromStop.coord![1],
    }))).then((weather) => {
      if (generation !== weatherGeneration) return;
      segmentWeather = weather;
      const byStation = new Map<string, string | null>();
      for (const segment of segmentsWithCoords) {
        byStation.set(segment.fromStop.name, weather.get(segment.id) ?? null);
      }
      stationWeather = byStation;
    });
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

  let departureSegments = $derived((page.segments ?? []).filter((segment) => !segment.journeyMeta));
  let allDeparturesUnavailable = $derived(
    departureSegments.length > 0 && departureSegments.every((segment) => {
      const status = departureStatuses.get(makeDepartureStatusKey(
        segment.fromStop.siteId,
        segment.line,
        segment.direction.code,
      ));
      return status?.freshness === 'unavailable';
    }),
  );
  $effect(() => {
    const nextPageId = page.id;
    if (expandedPageId !== null && expandedPageId !== nextPageId) {
      expandedSegmentId = null;
    }
    expandedPageId = nextPageId;
  });

  function toggleExpanded(segmentId: string) {
    const opening = expandedSegmentId !== segmentId;
    expandedSegmentId = opening ? segmentId : null;
    if (!opening) return;

    void tick().then(() => {
      const card = Array.from(depListEl?.querySelectorAll<HTMLElement>('[data-segment-id]') ?? [])
        .find((element) => element.dataset.segmentId === segmentId);
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
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
      if (settings.afterworkVenuesEnabled) {
        const types = settings.afterworkTypes && settings.afterworkTypes.length ? settings.afterworkTypes : ['beer'];
        if (types.includes('beer')) {
          void prefetchFeatureDiscovery({ lat, lon, mode: 'beer' }).catch(() => {});
        }
        if (types.includes('wine') || types.includes('cocktail')) {
          void prefetchFeatureDiscovery({ lat, lon, mode: 'wineCocktail' }).catch(() => {});
        }
      }
      if (settings.eventsEnabled) {
        void prefetchFeatureDiscovery({ lat, lon, mode: 'events' }).catch(() => {});
      }
    } catch (e) {
    }
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
    const count = [...segmentDeps.values()].reduce((a, b) => a + b.length, 0);
    if (!depListEl || count === 0 || hasAnimatedStagger) return;
    const cards = depListEl.querySelectorAll('.departure-card, .journey-card');
    if (cards.length === 0) return;
    hasAnimatedStagger = true;
    gsap.fromTo(
      cards,
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
      subscribeToLocation((snapshot) => {
        userLocation = walkingEtaActive ? snapshot.position : null;
        locationRequestInFlight = walkingEtaActive && snapshot.isLoading;
      }),
    );
    if (walkingEtaActive) void loadGrantedLocation();
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
      departureStore.status.subscribe((data) => {
        departureStatuses = data;
      }),
    );
    UNSUBSCRIBERS.push(
      departureStore.isLoading.subscribe((val) => (isLoading = val)),
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

  <MapViewer isOpen={showMap} onOpen={() => showMap = true} onClose={() => showMap = false} mapSrc="{import.meta.env.BASE_URL}SL_railway_map.svg" />

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
    <!-- Station facility notices: collapsed ambient bar, expands inline -->
    <StationNoticeBar alerts={deviationStationAlerts} {t} />

    <!-- Departure list -->
    <div class="card-list" bind:this={depListEl} onscroll={onScroll} aria-busy={isLoading}>
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
          <section class="content-section" class:journey-section={section.key === 'journeys'} data-testid="content-section" aria-labelledby="section-{section.key}">
            <header class="content-section-heading">
              <div>
                <h2 id="section-{section.key}">{section.title}</h2>
                {#if section.description}<p>{section.description}</p>{/if}
              </div>
              <span class="section-count">{section.groups.reduce((count, group) => count + group.items.length, 0)}</span>
            </header>
      {#each section.groups as group (group.label ?? 'all')}
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
              segmentId={item.segment.id}
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
              segmentId={item.segment.id}
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
              locationRequestInFlight={walkingEtaActive ? locationRequestInFlight : false}
              walkingEtaEnabled={walkingEtaActive}
              {openFeatureSheet}
              {t}
              {severity}
              {disruptionScope}
              isSleeping={sleepInfo.isSleeping}
              nextDepartureTime={sleepInfo.nextTime}
              {now}
              weatherSymbol={segmentWeather.get(item.segment.id) ?? null}
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
          {#if allDeparturesUnavailable}
            <p class="empty-text">{t.departuresUnavailable ?? 'Departures unavailable'}</p>
          {:else}
            <p class="empty-text">{t.noDeparturesAvailable}</p>
          {/if}
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
    padding: calc(16px + env(safe-area-inset-top, 0px)) 0 6px;
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
    padding: 12px 0 4px;
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

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 0 calc(24px + env(safe-area-inset-bottom, 0px));
    flex: 1;
    overflow-y: auto;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .content-section + .content-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .content-section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 0 0 2px;
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
    padding: 12px 0 6px;
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
      position: relative;
    }

    .content-section + .content-section {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }

    .content-section + .content-section::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: -12px;
      width: 1px;
      background: var(--border);
    }

    .content-section-heading {
      min-height: 42px;
    }

    .card-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 24px;
      align-content: start;
      align-items: stretch;
    }

    /* Error and quick-add rows are siblings, so only-of-type keeps a lone
       visible section full width without changing the section data flow. */
    .card-list > .content-section:only-of-type {
      grid-column: 1 / -1;
    }

    .card-list > .empty-state,
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
      padding: calc(8px + env(safe-area-inset-top, 0px)) 0 4px;
    }

    .page-title {
      font-size: 24px;
    }

  }
</style>
