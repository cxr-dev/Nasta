<script lang="ts">
  import type { Page, Segment, SortMode, GroupingMode, TransportType } from "../types/page";
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
  import JourneyCard from "./JourneyCard.svelte";
  import { getSettings } from "../stores/settingsStore.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";
  import { chevronLeft, chevronRight, settingsGear, mapIcon, editPencil, chevronDown, cloudRain, cloudSnow, cloudLightning } from "../icons/departureIcons";
  import MapViewer from "./MapViewer.svelte";
  import { getDisruptionDisplay, isSegmentDisrupted } from "./segmentUtils";
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
    deviationLastUpdatedAt = 0,
    openFeatureSheet = null,
    onSwitchPage,
    onEditToggle,
    onOpenSettings,
    onQuickAdd,
    onJourneyStart,
    onJourneyStartLate,
    onJourneyStartMissed,
    onJourneyComplete,
    onJourneyCancel,
    onSavedCardAction,
    onMoveSegment,
    lastRefreshTime,
  }: {
    page: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationStationAlerts?: StationAlert[];
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    onSwitchPage?: (pageId: string) => void;
    onEditToggle?: () => void;
    onOpenSettings?: () => void;
    onQuickAdd?: () => void;
    onJourneyStart?: (segmentId: string) => void;
    onJourneyStartLate?: (segmentId: string) => void;
    onJourneyStartMissed?: (segmentId: string) => void;
    onJourneyComplete?: (segmentId: string) => void;
    onJourneyCancel?: (segmentId: string) => void;
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
  let lastSuccessfulFetch = $state(0);
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
  let isFresh = $derived(lastRefreshTime !== undefined && !isStale);

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



  // Haversine distance
  function haversineDistance(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function sortByNextDeparture(segs: Segment[]): Segment[] {
    return [...segs].sort((a, b) => {
      const keyA = `${a.fromStop.siteId}|${a.line}|${a.direction?.code ?? 0}`;
      const keyB = `${b.fromStop.siteId}|${b.line}|${b.direction?.code ?? 0}`;
      const depsA = departureData.get(keyA) ?? [];
      const depsB = departureData.get(keyB) ?? [];
      const timeA = depsA[0]?.expectedAt ?? Infinity;
      const timeB = depsB[0]?.expectedAt ?? Infinity;
      return timeA - timeB;
    });
  }

  const TRANSPORT_ORDER: Record<string, number> = {
    metro: 0, train: 1, bus: 2, tram: 3, boat: 4
  };

  function sortByTransportType(segs: Segment[]): Segment[] {
    return [...segs].sort((a, b) => {
      const orderA = TRANSPORT_ORDER[a.transportType] ?? 99;
      const orderB = TRANSPORT_ORDER[b.transportType] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return sortByNextDeparture([a, b]).indexOf(a) === 0 ? -1 : 1;
    });
  }

  function sortByLineNumber(segs: Segment[]): Segment[] {
    return [...segs].sort((a, b) => {
      const numA = parseInt(a.line, 10);
      const numB = parseInt(b.line, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return a.line.localeCompare(b.line);
    });
  }

  function sortByDistance(segs: Segment[], userLoc: [number, number] | null): Segment[] {
    if (!userLoc) return segs;
    return [...segs].sort((a, b) => {
      const distA = a.fromStop.coord ? haversineDistance(userLoc, a.fromStop.coord) : Infinity;
      const distB = b.fromStop.coord ? haversineDistance(userLoc, b.fromStop.coord) : Infinity;
      return distA - distB;
    });
  }

  let sortedSegments = $derived.by(() => {
    const segs = [...(page.segments ?? [])];
    const mode: SortMode = settings.sortMode ?? 'time';
    switch (mode) {
      case 'time': return sortByNextDeparture(segs);
      case 'station': return segs.sort((a, b) => a.fromStop.name.localeCompare(b.fromStop.name, 'sv'));
      case 'transport': return sortByTransportType(segs);
      case 'line': return sortByLineNumber(segs);
      case 'distance': return sortByDistance(segs, userLocation);
      default: return segs;
    }
  });



  function transportTypeLabel(type: TransportType): string {
    const map: Record<TransportType, string> = {
      bus: t.transportBus,
      train: t.transportTrain,
      metro: t.transportMetro,
      tram: t.transportTram,
      boat: t.transportBoat,
    };
    return map[type] ?? type;
  }

  function groupSegments(segs: Segment[]) {
    const mode: GroupingMode = settings.groupingMode ?? 'none';

    if (mode === 'none') {
      const items = segs.map((seg, i) => ({ segment: seg, originalIndex: i }));
      return { groups: [{ label: null as string | null, items }] };
    }

    if (mode === 'disrupted') {
      const all: Array<{ segment: Segment; originalIndex: number }> = [];
      const disrupted: Array<{ segment: Segment; originalIndex: number }> = [];
      segs.forEach((seg, i) => {
        const health = deviationHealthBySegment.get(seg.id);
        const siteDevsList = stopDeviationsMap.get(seg.fromStop.siteId) || [];
        const display = getDisruptionDisplay(siteDevsList, health, settings.disruptionSeverityThreshold, getLocale(), seg.line, undefined, seg.fromStop.siteId);
        const isDisrupted = display.messages.length > 0;
        (isDisrupted ? disrupted : all).push({ segment: seg, originalIndex: i });
      });
      const groups = [];
      if (all.length > 0) groups.push({ label: null as string | null, items: all });
      if (disrupted.length > 0) groups.push({ label: t.sectionDisrupted, items: disrupted });
      return { groups };
    }

    if (mode === 'station') {
      const map = new Map<string, Array<{ segment: Segment; originalIndex: number }>>();
      segs.forEach((seg, i) => {
        const key = seg.fromStop.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ segment: seg, originalIndex: i });
      });
      const groups = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'sv'))
        .map(([label, items]) => ({ label, items }));
      return { groups };
    }

    if (mode === 'transport') {
      const map = new Map<TransportType, Array<{ segment: Segment; originalIndex: number }>>();
      segs.forEach((seg, i) => {
        const key = seg.transportType;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ segment: seg, originalIndex: i });
      });
      const groups = [...map.entries()]
        .sort(([a], [b]) => (TRANSPORT_ORDER[a] ?? 99) - (TRANSPORT_ORDER[b] ?? 99))
        .map(([transportType, items]) => ({
          label: transportTypeLabel(transportType),
          items,
        }));
      return { groups };
    }

    const items = segs.map((seg, i) => ({ segment: seg, originalIndex: i }));
    return { groups: [{ label: null as string | null, items }] };
  }

  let segmentGroups = $derived.by(() => groupSegments(sortedSegments.filter((segment) => !segment.journeyMeta)));
  let journeyGroups = $derived.by(() => groupSegments(sortedSegments.filter((segment) => Boolean(segment.journeyMeta))));

  // Post-process: when groupSleeping enabled, split active/sleeping items
  let processedGroups = $derived.by(() => {
    const src = segmentGroups;
    if (!settings.groupSleeping) return src;

    const activeGroups: typeof src.groups = [];
    const sleepingItems: typeof src.groups[number]['items'] = [];

    for (const group of src.groups) {
      const groupActive: typeof sleepingItems = [];
      for (const item of group.items) {
        const sleep = segmentSleeping.get(item.segment.id);
        if (sleep?.isSleeping) {
          sleepingItems.push(item);
        } else {
          groupActive.push(item);
        }
      }
      if (groupActive.length > 0) {
        activeGroups.push({ label: group.label, items: groupActive });
      }
    }

    if (sleepingItems.length > 0) {
      activeGroups.push({ label: t.sleeping, items: sleepingItems });
    }

    return { groups: activeGroups };
  });

  async function loadSegmentDeps() {
    const generation = ++segmentDepsGeneration;
    const segs = [...(page.segments ?? [])];
    const results = await Promise.all(segs.map(async (seg) => {
      const segEntityId = toEntityId(seg.fromStop.siteId);
      let predicted: Departure[] = [];
      try {
        predicted = (await transitService.getPredictedDepartures(
          segEntityId,
          seg.fromStop.name,
          seg.line,
          seg.direction?.code ?? 0,
          5,
        )).map(toLegacyDeparture);
      } catch {
        // The live departure store remains the source of truth when the
        // lightweight prediction request is unavailable.
      }

      const compositeKey = `${seg.fromStop.siteId}|${seg.line}|${seg.direction?.code ?? 0}`;
      const live = departureData.get(compositeKey) ?? [];
      const merged = live.length > 0
        ? deduplicateDeparturesByKey(seg.fromStop.siteId, mergeDeparturesWithPredictions(live, predicted, 5))
        : deduplicateDeparturesByKey(seg.fromStop.siteId, predicted);

      if (merged.length > 0) {
        return { id: seg.id, departures: merged, sleeping: { isSleeping: false, nextTime: null } };
      }

      try {
        const nextTransit = await transitService.getNextScheduledDeparture(
          toEntityId(seg.fromStop.siteId),
          seg.fromStop.name,
          seg.line,
          seg.direction?.code ?? 0,
        );
        return {
          id: seg.id,
          departures: [],
          sleeping: { isSleeping: Boolean(nextTransit), nextTime: nextTransit?.scheduledTime ?? null },
        };
      } catch {
        return { id: seg.id, departures: [], sleeping: { isSleeping: false, nextTime: null } };
      }
    }));

    // A slower request started before the latest departure update must never
    // replace the newer snapshot and make cards jump backwards.
    if (generation !== segmentDepsGeneration) return;
    const deps = new Map<string, Departure[]>();
    const sleeping = new Map<string, { isSleeping: boolean; nextTime: string | null }>();
    for (const result of results) {
      deps.set(result.id, result.departures);
      sleeping.set(result.id, result.sleeping);
    }
    segmentDeps = deps;
    segmentSleeping = sleeping;
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
    UNSUBSCRIBERS.push(
      departureStore.lastSuccessfulFetch.subscribe((val) => (lastSuccessfulFetch = val)),
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
        { key: 'departures', title: t.departuresSection ?? 'Avgångar', description: '', groups: processedGroups.groups },
        { key: 'journeys', title: t.journeysSection ?? 'Resor', description: t.journeysSectionDesc ?? 'Visar nästa bästa resa till din destination.', groups: journeyGroups.groups },
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
              onStart={() => onJourneyStart?.(item.segment.id)}
              onStartLate={() => onJourneyStartLate?.(item.segment.id)}
              onStartMissed={() => onJourneyStartMissed?.(item.segment.id)}
              onComplete={() => onJourneyComplete?.(item.segment.id)}
              onCancel={() => onJourneyCancel?.(item.segment.id)}
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
