<script lang="ts">
  import type { Route, Segment, TransportType } from "../types/route";
  import type { SegmentHealth } from "../types/deviation";
  import { departureStore, type Departure } from "../stores/departureStore";
  import { getPredictedDepartures } from "../services/timetableCache";
  import { formatDepartureTime, mergeDeparturesWithPredictions } from "../lib/departureDisplay";
  import { deduplicateDeparturesByKey } from "../lib/departureDeduplication";
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { transportIcons } from "../icons/transport";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { getQuickLocation, getMemoizedDistance, formatDistance, getWalkingTime } from "../services/geo";
  import { t } from "../stores/localeStore";
  import { settingsStore } from "../stores/settingsStore";
  import { fetchNearbyEvents } from "../services/eventService";
  import { fetchNearbyVenues } from "../services/venueService";

  let {
    route,
    deviationHealthBySegment = new Map<string, SegmentHealth>(),
    deviationUsedCache = false,
    deviationLastUpdatedAt = 0,
    openFeatureSheet = null,
  }: {
    route: Route;
    deviationHealthBySegment?: Map<string, SegmentHealth>;
    deviationUsedCache?: boolean;
    deviationLastUpdatedAt?: number;
    openFeatureSheet?: ((segment: Segment) => void) | null;
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
  let locationRequestInFlight = $state(false);
  let lastNearbyPrefetchKey = $state('');
  let settings = $derived($settingsStore);
  type MapApp = "default" | "google" | "apple" | "waze";
  const MAP_PREF_KEY = "nasta_map_app_preference";
  const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    route.id;
    expandedIndex = null;
  });

  $effect(() => {
    const locationEnabled = settings.locationServicesEnabled ?? false;
    const etaEnabled = settings.walkingEtaEnabled ?? true;
    const active = locationEnabled && etaEnabled;

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
        // denied or error — keep userLocation null
      })
      .finally(() => {
        if (!controller.signal.aborted) locationRequestInFlight = false;
      });
    return () => controller.abort();
  });

  function toggleExpanded(index: number) {
    expandedIndex = expandedIndex === index ? null : index;
  }

  function scrollExpandedIntoView(node: HTMLElement, isExpanded: boolean) {
    const scrollPanelAboveBottomBar = (panel: HTMLElement) => {
      const container = node.closest('.scroll-container') as HTMLElement | null;
      const bottomBar = document.querySelector('.bottom-bar') as HTMLElement | null;
      if (!container || !bottomBar) return;

      const panelRect = panel.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const bottomBarHeight = bottomBar.getBoundingClientRect().height;
      const gap = 16;

      const desiredBottom = containerRect.bottom - bottomBarHeight - gap;
      const currentBottom = panelRect.bottom;
      
      // If the panel bottom goes below the desired visible area (behind the bottom bar),
      // delta will be positive. We want to scroll container down by this positive amount.
      const delta = currentBottom - desiredBottom;

      if (delta > 0) {
        container.scrollBy({ top: delta, behavior: 'smooth' });
      }
    };

    const attachAndScroll = () => {
      const panel = node.querySelector('.expanded-panel') as HTMLElement | null;
      if (!panel) return;

      let handled = false;
      const onEnd = () => {
        if (handled) return;
        handled = true;
        panel.removeEventListener('introend', onEnd);
        panel.removeEventListener('transitionend', onEnd);
        panel.removeEventListener('animationend', onEnd);
        scrollPanelAboveBottomBar(panel);
      };

      panel.addEventListener('introend', onEnd, { once: true });
      panel.addEventListener('transitionend', onEnd, { once: true });
      panel.addEventListener('animationend', onEnd, { once: true });

      // Fallback: in case transition events do not fire (common with CSS transition/animation runtimes),
      // run the scroll logic after the transition duration (280ms) has completed.
      setTimeout(onEnd, 350);
    };

    if (isExpanded) {
      requestAnimationFrame(attachAndScroll);
    }

    return {
      update(nextExpanded: boolean) {
        if (nextExpanded) {
          requestAnimationFrame(attachAndScroll);
        }
      },
    };
  }

  // Prefetch tuning: keep conservative defaults to avoid too many requests
  const PREFETCH_SEGMENT_COUNT = 2;
  const PREFETCH_VENUE_RADIUS = 1200; // meters
  const PREFETCH_EVENT_RADIUS = 3000; // meters
  const PREFETCH_ROOT_MARGIN = '150px';
  const PREFETCH_THRESHOLD = 0.1;
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
      // fire-and-forget: services implement caching and timeouts
      try {
        if (settings.afterworkVenuesEnabled) {
          const types = settings.afterworkTypes && settings.afterworkTypes.length ? settings.afterworkTypes : ['beer'];
          // Prefetch individual groups separately to warm the exact cache keys that the UI tabs will query.
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
        // allow re-prefetch after short delay to keep cache warm if needed
        setTimeout(() => _prefetchInFlight.delete(key), 30 * 1000);
      }
    } catch (e) {
      // swallow errors — prefetch must not affect UI
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

  function prefetch(node: HTMLElement, params: { index: number; segment: Segment }) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          prefetchForSegment(params.segment);
          observer.unobserve(node);
        }
      }
    }, { root: null, rootMargin: PREFETCH_ROOT_MARGIN, threshold: PREFETCH_THRESHOLD });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
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
    // Resolve a concrete app: on iOS prefer apple, otherwise google
    if (pref === 'default') {
      const ua = navigator.userAgent.toLowerCase();
      const isiOS = /iphone|ipad|ipod/.test(ua);
      const app = isiOS ? 'apple' : 'google';
      openMapApp(app, lat, lng);
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

  type MapPreviewParams = {
    center: [number, number];
    userLocation: [number, number] | null;
  };

  function mapPreview(node: HTMLDivElement, params: MapPreviewParams) {
    let currentMap: maplibregl.Map | null = null;
    let stopMarker: maplibregl.Marker | null = null;
    let userMarker: maplibregl.Marker | null = null;

    const render = (next: MapPreviewParams) => {
      if (currentMap) {
        currentMap.remove();
      }

      currentMap = new maplibregl.Map({
        container: node,
        style: MAP_STYLE,
        center: next.center,
        zoom: 14.5,
        attributionControl: false,
        dragPan: false,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        keyboard: false,
      });

      currentMap.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      currentMap.on("load", () => {
        stopMarker = new maplibregl.Marker({ color: "#111111" })
          .setLngLat(next.center)
          .addTo(currentMap!);

        if (next.userLocation) {
          userMarker = new maplibregl.Marker({ color: "#2f80ed" })
            .setLngLat(next.userLocation)
            .addTo(currentMap!);
        }
      });
    };

    render(params);

    return {
      update(next: MapPreviewParams) {
        const shouldRebuild =
          next.center[0] !== params.center[0] ||
          next.center[1] !== params.center[1] ||
          next.userLocation?.[0] !== params.userLocation?.[0] ||
          next.userLocation?.[1] !== params.userLocation?.[1];
        params = next;
        if (shouldRebuild) render(next);
      },
      destroy() {
        stopMarker?.remove();
        userMarker?.remove();
        currentMap?.remove();
      },
    };
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
  
    // Request location actively when user has enabled walk ETA but permission is not granted
    async function requestLocation() {
      try {
        const controller = new AbortController();
        const loc = await getQuickLocation(controller.signal);
        if (loc) userLocation = loc;
      } catch (e) {
        // ignore; permission denied or timed out
      }
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

    // Prefetch first visible segments for snappy UI
    try {
      const initial = (route.segments ?? []).slice(0, PREFETCH_SEGMENT_COUNT);
      for (const seg of initial) prefetchForSegment(seg);
    } catch (e) {}

    // When features are already enabled, prefetch all segments in background immediately
    if (settings.afterworkVenuesEnabled || settings.eventsEnabled) {
      scheduleNearbyPrefetch();
    }

    // When user enables features, prefetch all segments in background and populate persistent cache
    let prevSettings: any = null;
    UNSUBSCRIBERS.push(
      settingsStore.subscribe((s) => {
        if (!prevSettings) { prevSettings = s; return; }
        const becameEnabled = (s.afterworkVenuesEnabled && !prevSettings.afterworkVenuesEnabled) || (s.eventsEnabled && !prevSettings.eventsEnabled);
        if (becameEnabled) {
          scheduleNearbyPrefetch();
        }
        prevSettings = s;
      })
    );
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
      {@const isExpandable = hasDeparture || siteDevs.length > 0}
      {@const topDevMessage = siteDevs[0]?.message ?? ""}
      {@const topDevType = topDevMessage ? disruptionType(topDevMessage) : "general"}

      <div class="departure-item" class:expanded={isExpanded} use:scrollExpandedIntoView={isExpanded}>
        <button
          class="departure-row"
          use:prefetch={{ index, segment }}
        data-testid="segment-row"
        class:expandable={isExpandable}
        class:expanded={isExpanded}
        type="button"
        aria-expanded={isExpanded}
        onclick={() => {
          if (isExpandable) toggleExpanded(index);
        }}
        style="--delay: {Math.min(index, 3) * 40}ms"
      >
        <div class="row-left">
          <div class="transport-badge" data-type={segment.transportType}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <g>{@html getTransportIcon(segment.transportType)}</g>
            </svg>
          </div>

          <div class="line-details">
            <span class="line-info" data-testid="segment-line" class:hidden={isExpanded}>{segment.line}</span>
            <div class="stop-route-container" class:hidden={isExpanded}>
              <span class="stop-route">{stopLabel(segment.fromStop.name)} → {stopLabel(segment.direction?.destination)}</span>
            </div>
          </div>
        </div>

        <div class="row-right">
          {#if hasDeparture}
            {#if !isExpanded}
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
                    <span>{topDevType === "general" ? $t.disruptionGeneral : topDevType}</span>
                  </div>
                {/if}
            </div>
            {/if}
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
        <div class="expanded-panel" transition:slide={{ duration: 280, easing: cubicOut }}>
          {#if hasDeparture}
            <div class="expanded-actions">
              {#if segment.fromStop.coord}
                {@const dist = userLocation ? getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1]) : null}
                {@const stopLat = segment.fromStop.coord[0]}
                {@const stopLon = segment.fromStop.coord[1]}
                <section class="journey-card">
                  <div class="journey-head">
                    <div class="journey-copy">
                      <span class="journey-route">{stopLabel(segment.fromStop.name)} → {stopLabel(segment.direction?.destination)}</span>
                    </div>
                    <div class="journey-badge" aria-label={primaryDepartureText}>
                      <span class="journey-minutes">{primaryDepartureText}</span>
                      <span class="journey-label">{$t.departing}</span>
                    </div>
                  </div>

                  <div class="journey-map-shell">
                    <div class="journey-map-label">
                      <span>{$t.walkToStop}</span>
                      {#if dist !== null}
                        <span>{formatDistance(dist)} · {getWalkingTime(dist)} min</span>
                      {:else if (settings.locationServicesEnabled && settings.walkingEtaEnabled && locationRequestInFlight)}
                        <span class="hint">{$t.waitingForLocation}</span>
                      {/if}
                    </div>

                    <div
                      class="mini-map"
                      use:mapPreview={{
                        center: [stopLon, stopLat],
                        userLocation,
                      }}
                    ></div>
                  </div>

                  <div class="journey-actions">
                    {#if settings.afterworkVenuesEnabled || settings.eventsEnabled}
                      <button
                        type="button"
                        class="map-link map-link-primary"
                        onclick={() => openFeatureSheet?.(segment)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                        </svg>
                        {$t.nearby}
                      </button>
                    {/if}

                    <button
                      type="button"
                      class="map-link map-link-secondary"
                      onclick={() => openMapWithPreference(stopLat, stopLon, false, index)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {$t.openInMaps}
                    </button>
                  </div>
                </section>
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
                  <span>{$t.disruptions}</span>
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
      </div>
    {/each}


    {#if (route.segments ?? []).length > 0 && !isLoading && segmentDeps.every((d) => d.length === 0)}
      <div class="empty-state">
        <div class="no-departure">—</div>
        <p class="empty-text">{$t.noDeparturesAvailable}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .departures-list { display: flex; flex-direction: column; padding: 12px 0 calc(220px + env(safe-area-inset-bottom)); }
  .departure-item {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 8px 0;
  }
  .departure-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 16px;
    border-radius: 22px;
    border: 1px solid transparent;
    animation: rowIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--delay, 0ms);
    contain: layout style;
    width: 100%;
    background: var(--surface);
    text-align: left;
    transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease;
  }
  .departure-item.expanded .departure-row {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    margin-bottom: 0;
    border-bottom: 1px solid var(--border);
  }
  .expanded-panel {
    border: 1px solid var(--border);
    border-top: none;
    border-bottom-left-radius: 22px;
    border-bottom-right-radius: 22px;
    background: var(--surface);
    overflow: hidden;
  }
  .expanded-panel > .expanded-actions {
    padding: 0 16px 16px;
  }
  .departure-row.expandable {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .departure-row.expandable:hover,
  .departure-row.expandable:focus-visible {
    background: var(--surface-emphasis);
    border-color: var(--border);
  }
  .departure-row.expandable:active {
    opacity: 0.95;
    transform: translateY(1px);
  }
  .departure-row.expanded {
    border-color: var(--accent-subtle);
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.13);
  }
  @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .row-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding-right: 12px; }
  .row-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-shrink: 0; text-align: right; min-width: fit-content; padding-left: 8px; }
  .expand-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent);
    transition: transform 180ms ease, background 180ms ease;
    flex-shrink: 0;
  }
  .departure-row.expanded .expand-marker { transform: rotate(180deg); }
  .expand-marker svg { width: 18px; height: 18px; }
  .transport-badge { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: var(--accent-subtle); color: var(--accent); }
  .transport-badge svg { width: 20px; height: 20px; }
  .line-details { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line-info { font-size: 15px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route { font-size: 13px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route-container { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .stop-route-container.hidden { display: none; }
  .expanded-actions { position: relative; }
  .journey-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 0 6px;
  }
  .journey-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .journey-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .journey-kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .journey-route {
    font-size: 18px;
    line-height: 1.1;
    font-weight: 700;
    color: var(--text);
  }
  .journey-sub {
    font-size: 13px;
    color: var(--text-secondary);
  }
  .journey-badge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .journey-minutes {
    font-family: "Neue Machina", sans-serif;
    font-size: clamp(34px, 10vw, 54px);
    line-height: 0.9;
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--accent);
  }
  .journey-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--text-muted);
  }
  .journey-map-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--surface);
  }
  .journey-map-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .journey-map-label span:last-child {
    color: var(--text-muted);
    font-weight: 600;
  }
  .mini-map {
    width: 100%;
    height: 120px;
    display: block;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(135deg, color-mix(in srgb, var(--surface) 88%, #000 12%), var(--surface));
  }
  .journey-actions {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
  }
  .map-link { 
    display: inline-flex; 
    align-items: center; 
    justify-content: center;
    gap: 8px; 
    padding: 10px 12px; 
    font-size: 13px; 
    font-weight: 700;
    border-radius: 12px;
    min-width: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .map-link:active { transform: scale(0.985); }
  .map-link svg { width: 16px; height: 16px; }
  .map-link-primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
    flex: 1 1 auto;
  }
  .map-link-secondary {
    color: var(--text-secondary);
    background: transparent;
    flex: 0 0 auto;
  }
  .map-link-tertiary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 700;
    border-radius: 12px;
  }
  .row-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-shrink: 0; text-align: right; min-width: fit-content; padding-left: 8px; }
  .expand-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent);
    transition: transform 180ms ease, background 180ms ease;
    flex-shrink: 0;
  }
  .departure-row.expanded .expand-marker { transform: rotate(180deg); }
  .expand-marker svg { width: 18px; height: 18px; }
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
    gap: 10px;
    padding: 14px 16px 16px;
    font-size: 13px;
    color: var(--text-secondary);
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent), var(--surface));
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
    gap: 10px;
  }
  .route-preview {
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--surface) 80%, #000 20%);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
  }
  .mini-map {
    width: 100%;
    height: 160px;
    display: block;
    background: linear-gradient(135deg, color-mix(in srgb, var(--surface) 88%, #000 12%), var(--surface));
  }
  .route-preview-labels {
    position: absolute;
    inset: auto 10px 10px 10px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    pointer-events: none;
  }
  .rp-stop {
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(14px);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
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
