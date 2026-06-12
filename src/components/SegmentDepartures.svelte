<script lang="ts">
  import type { Page, Segment, TransportType } from "../types/page";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore.svelte";
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
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";

  let {
    route,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationUsedCache = false,
    deviationLastUpdatedAt = 0,
    openFeatureSheet = null,
  }: {
    route: Page;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
    openFeatureSheet?: ((segment: Segment) => void) | null;
  } = $props();

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let stopDeviationsMap = $state<Map<string, any[]>>(new Map());
  let now = $state(Date.now());
  let expandedIndex = $state<number | null>(null);
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

  $effect(() => {
    route.id;
    expandedIndex = null;
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

  function toggleExpanded(index: number) {
    expandedIndex = expandedIndex === index ? null : index;
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

  function stopLabel(name?: string): string {
    if (!name) return "";
    const cleaned = name.replace(/^[^,]+,\s*/u, "").trim();
    return cleaned || name;
  }

  let segmentDeps = $state<Departure[][]>([]);
  
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
    if (settings.afterworkVenuesEnabled || settings.eventsEnabled) {
      scheduleNearbyPrefetch();
    }
  });

  $effect(() => {
    const count = segmentDeps.reduce((a, b) => a + b.length, 0);
    if (!depListEl || count === 0 || hasAnimatedStagger) return;
    hasAnimatedStagger = true;
    gsap.fromTo(
      depListEl.querySelectorAll('.departure-item'),
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04, clearProps: 'transform,opacity' },
    );
  });

  let healthPulseInited = false;
  $effect(() => {
    if (!depListEl || healthPulseInited) return;
    const dots = depListEl.querySelectorAll('.health-dot');
    if (dots.length === 0) return;
    healthPulseInited = true;
    dots.forEach((dot) => {
      const el = dot as HTMLElement;
      if (el.classList.contains('critical')) {
        gsap.to(el, { scale: 1.3, opacity: 0.7, duration: 0.8, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      } else if (el.classList.contains('affected')) {
        gsap.to(el, { scale: 1.2, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
    });
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

<div class="departures-list" bind:this={depListEl}>
  {#if lastError}
    <div class="error-bar">
      <span>{lastError}</span>
      <button onclick={() => (lastError = null)}>×</button>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-skeleton">
      {#each Array(3) as _, i (i)}
        <div class="skeleton-row">
          <Skeleton width="36px" height="36px" borderRadius="8px" />
          <div class="skeleton-line-fill"><Skeleton width="100%" height="14px" borderRadius="4px" /></div>
          <Skeleton width="80px" height="32px" borderRadius="4px" />
        </div>
      {/each}
    </div>
  {:else}
    <div class="departures-header">
      <h3 class="departures-title">{t.departures}</h3>
    </div>

    {#each route.segments ?? [] as segment, index (segment.id)}
      {@const deps = segmentDeps[index] ?? []}
      {@const departure = deps[0]}
      {@const subsequent = formatSubsequent(deps)}
      {@const hasDeparture = deps.length > 0 && !!departure}
      {@const primaryDepartureText = hasDeparture ? formatDepartureTime(departure, now) : ""}
      {@const siteDevs = stopDeviationsMap.get(segment.fromStop.siteId) || []}
      {@const isExpanded = expandedIndex === index}
      {@const isExpandable = hasDeparture || siteDevs.length > 0}
      {@const topDevMessage = siteDevs[0]?.message ?? ""}
      {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}
      {@const health = deviationHealthBySegment.get(segment.id)}

      <div
        class="segment-wrapper"
        class:affected={health?.state === 'affected'}
        class:critical={health?.state === 'critical'}
      >
        {#if health && health.state !== 'ok'}
          <div class="health-dot" class:affected={health.state === 'affected'} class:critical={health.state === 'critical'} aria-label={health.reason ?? ''}></div>
        {/if}
        <DepartureRow
          {segment}
          {departure}
          {subsequent}
          {hasDeparture}
          {primaryDepartureText}
          {siteDevs}
          {isExpanded}
          {isExpandable}
          {topDevMessage}
          {topDevType}
          {index}
          {userLocation}
          locationRequestInFlight={settings.walkingEtaEnabled ? locationRequestInFlight : false}
          walkingEtaEnabled={settings.walkingEtaEnabled ?? false}
          {openFeatureSheet}
          {t}
          ontoggle={toggleExpanded}
          onprefetch={() => prefetchForSegment(segment)}
        />
      </div>
    {/each}

    {#if (route.segments ?? []).length > 0 && !isLoading && segmentDeps.every((d) => d.length === 0)}
      <div class="empty-state">
        <div class="no-departure">—</div>
        <p class="empty-text">{t.noDeparturesAvailable}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .departures-list { display: flex; flex-direction: column; padding: 12px 0; }
  .departures-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 8px; border-bottom: 1px solid var(--border); gap: 8px; }
  .departures-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; }
  .error-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; margin-bottom: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 13px; }
  .error-bar button { background: none; border: none; color: #991b1b; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
  .loading-skeleton { padding: 12px 0; }
  .skeleton-row { display: flex; align-items: center; gap: 12px; padding: 18px 0; border-bottom: 1px solid var(--border); }
  .skeleton-line-fill { flex: 1; }
  .empty-state { text-align: center; padding: 48px 24px; }
  .empty-text { margin: 16px 0 0; font-size: 14px; color: var(--text-muted); }
  .no-departure { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 300; color: var(--text-ghost); letter-spacing: 0; line-height: 1; }
  .segment-wrapper { position: relative; margin: 8px 0; padding-left: 10px; }
  .health-dot { position: absolute; left: 0; top: 24px; width: 5px; height: 5px; border-radius: 999px; }
  .health-dot.affected { background: #f59e0b; }
  .health-dot.critical { background: #ef4444; }
</style>
