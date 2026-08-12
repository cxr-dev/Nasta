<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TransitDeparture, TransitStopSearchResult } from '../providers/types';
  import { transitService } from '../providers/init';
  import { formatDistance, getWalkingTime, loadGrantedLocation, requestLocation, subscribeToLocation, type LocationSnapshot } from '../services/geo';
  import { getSettings } from '../stores/settingsStore.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import { resolveTheme } from '../themes';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

  const maplibreLoad = import('maplibre-gl');
  void import('maplibre-gl/dist/maplibre-gl.css');

  let { onBack }: { onBack: () => void } = $props();
  let t = $derived(getT());
  let settings = $derived(getSettings());
  let location = $state<LocationSnapshot>({ position: null, isLoading: false, access: 'unknown' });
  let nearbyStops = $state<TransitStopSearchResult[]>([]);
  let searchResults = $state<TransitStopSearchResult[]>([]);
  let query = $state('');
  let loading = $state(false);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let mapError = $state(false);
  let mapCompact = $state(false);
  let selectedId = $state<string | null>(null);
  let boardStop = $state<TransitStopSearchResult | null>(null);
  let boardDepartures = $state<TransitDeparture[]>([]);
  let boardLoading = $state(false);
  let boardError = $state(false);
  let previews = $state<Map<string, TransitDeparture[]>>(new Map());
  let catalogGeneration = 0;
  let previewGeneration = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setInterval> | null = null;
  let boardHistoryActive = false;
  let listEl = $state<HTMLDivElement | undefined>(undefined);
  let mapEl = $state<HTMLDivElement | undefined>(undefined);
  let maplibregl: any = $state(null);
  let mapInstance: any = null;
  let markers: any[] = [];
  let locationUnsubscribe: (() => void) | null = null;

  let displayedStops = $derived(query.trim().length >= 2 ? searchResults : nearbyStops);
  let hasLocation = $derived(Boolean(location.position));

  function stopDistance(stop: TransitStopSearchResult): string {
    if (stop.distance == null) return '';
    return formatDistance(stop.distance / 1000);
  }

  function walkingLabel(stop: TransitStopSearchResult): string {
    if (!settings.walkingEtaEnabled || stop.distance == null) return '';
    return `${getWalkingTime(stop.distance / 1000)} min`;
  }

  function departureLabel(departure: TransitDeparture): string {
    if (departure.minutes <= 0) return t.departureNow ?? 'Now';
    return `${departure.minutes} ${t.minutesShort ?? 'min'}`;
  }

  function isSearchMode(): boolean {
    return query.trim().length >= 2;
  }

  async function loadNearby(position: [number, number]) {
    const generation = ++catalogGeneration;
    loading = true;
    error = null;
    try {
      const stops = await transitService.getNearbyStops({ origin: position, radiusMeters: 2000, limit: 12 });
      if (generation !== catalogGeneration) return;
      nearbyStops = stops;
      selectedId = stops[0]?.id ?? null;
      if (stops.length === 0) error = t.noNearbyStops ?? 'No stops found within 2 km.';
    } catch {
      if (generation !== catalogGeneration) return;
      error = t.nearbyLoadError ?? t.loadError ?? "Couldn't load nearby stops.";
      nearbyStops = [];
    } finally {
      if (generation === catalogGeneration) loading = false;
    }
  }

  async function useLocation() {
    await requestLocation();
  }

  async function runSearch() {
    const value = query.trim();
    if (value.length < 2) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      searchResults = await transitService.searchStops(value);
      selectedId = searchResults[0]?.id ?? null;
    } finally {
      searching = false;
    }
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(), 220);
  }

  async function loadDepartures(stop: TransitStopSearchResult, forBoard = false) {
    if (forBoard) boardLoading = true;
    try {
      const result = await transitService.getDepartures(stop.id, stop.name);
      const departures = result.departures
        .filter((departure) => departure.minutes >= 0)
        .sort((a, b) => a.minutes - b.minutes);
      if (forBoard) {
        boardDepartures = departures;
        boardError = false;
      }
      return departures.slice(0, 2);
    } catch {
      if (forBoard) boardError = true;
      return [];
    } finally {
      if (forBoard) boardLoading = false;
    }
  }

  async function loadPreviews(stops: TransitStopSearchResult[]) {
    const generation = ++previewGeneration;
    const next = new Map(previews);
    const pending = stops.filter((stop) => !next.has(stop.id));
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const stop = pending[cursor++];
        const departures = await loadDepartures(stop);
        if (generation !== previewGeneration) return;
        next.set(stop.id, departures);
        previews = new Map(next);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  }

  function openBoard(stop: TransitStopSearchResult) {
    boardStop = stop;
    void loadDepartures(stop, true);
    if (boardTimer) clearInterval(boardTimer);
    boardTimer = setInterval(() => {
      if (boardStop) void loadDepartures(boardStop, true);
    }, 30000);
    history.pushState({ nastaNearbyBoard: stop.id }, '', window.location.href);
    boardHistoryActive = true;
  }

  function closeBoard() {
    if (!boardStop) return;
    boardStop = null;
    boardDepartures = [];
    if (boardTimer) clearInterval(boardTimer);
    boardTimer = null;
    boardHistoryActive = false;
  }

  function requestBoardBack() {
    if (boardHistoryActive) history.back();
    else closeBoard();
  }

  function handlePopState() {
    if (boardStop) closeBoard();
    else onBack();
  }

  function handleNearbyKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'Escape') return;
    event.preventDefault();
    requestBoardBack();
  }

  function selectStop(stop: TransitStopSearchResult) {
    selectedId = stop.id;
    openBoard(stop);
  }

  function scrollToStop(id: string) {
    selectedId = id;
    listEl?.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function setupMap() {
    const mgl = maplibregl;
    const el = mapEl;
    const position = location.position;
    if (!mgl || !el || !position) return;
    mapInstance?.remove();
    markers.forEach((marker) => marker.remove());
    markers = [];
    const dark = resolveTheme(settings.theme ?? 'system', window.matchMedia('(prefers-color-scheme: dark)').matches) === 'dark';
    mapInstance = new mgl.Map({
      container: el,
      style: dark ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [position[1], position[0]], zoom: 14.2, attributionControl: true, dragRotate: false, keyboard: false,
    });
    mapInstance.on('error', () => { mapError = true; });
    mapInstance.on('load', () => {
      mapError = false;
      const userMarker = new mgl.Marker({ color: '#2563EB' }).setLngLat([position[1], position[0]]).addTo(mapInstance);
      markers.push(userMarker);
      for (const stop of displayedStops) {
        if (!stop.coord) continue;
        const marker = new mgl.Marker({ color: stop.id === selectedId ? '#171717' : '#2563EB' })
          .setLngLat([stop.coord[1], stop.coord[0]])
          .setPopup(new mgl.Popup({ offset: 14 }).setText(stop.name))
          .addTo(mapInstance);
        marker.getElement().addEventListener('click', () => scrollToStop(stop.id));
        markers.push(marker);
      }
    });
  }

  $effect(() => {
    const position = location.position;
    if (position) void loadNearby(position);
  });

  $effect(() => {
    const stops = displayedStops;
    if (stops.length > 0 && !isSearchMode()) void loadPreviews(stops);
  });

  $effect(() => {
    if (mapCompact) return;
    displayedStops.length;
    selectedId;
    location.position;
    maplibregl;
    setupMap();
  });

  onMount(() => {
    locationUnsubscribe = subscribeToLocation((snapshot) => {
      location = snapshot;
      if (snapshot.position) void loadNearby(snapshot.position);
    });
    void loadGrantedLocation();
    maplibreLoad.then((module) => {
      module.setWorkerUrl(workerUrl);
      maplibregl = module;
    }).catch(() => { mapError = true; });
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  onDestroy(() => {
    locationUnsubscribe?.();
    if (searchTimer) clearTimeout(searchTimer);
    if (boardTimer) clearInterval(boardTimer);
    mapInstance?.remove();
  });
</script>

<svelte:window onkeydown={handleNearbyKeyDown} />

<section class="nearby-surface" aria-label={t.nearby ?? 'Nearby'}>
  {#if boardStop}
    <header class="nearby-header board-header">
      <button type="button" class="back-button" onclick={requestBoardBack} aria-label={t.back ?? 'Back'}>←</button>
      <div>
        <p class="eyebrow">{t.nearby ?? 'Nearby'}</p>
        <h1>{boardStop.name}</h1>
      </div>
    </header>
    <div class="board-meta">
      <span>{stopDistance(boardStop)}</span>
      {#if walkingLabel(boardStop)}<span>· {walkingLabel(boardStop)}</span>{/if}
      <span class="freshness">{t.live ?? 'Live'}</span>
    </div>
    {#if boardLoading}
      <div class="board-list" aria-busy="true">{#each Array(4) as _, i}<div class="board-skeleton" aria-hidden="true" style={`--i:${i}`}></div>{/each}</div>
    {:else if boardError}
      <div class="inline-message"><p>{t.departuresUnavailable ?? 'Departures unavailable'}</p><button type="button" onclick={() => void loadDepartures(boardStop!, true)}>{t.retry ?? 'Retry'}</button></div>
    {:else if boardDepartures.length === 0}
      <div class="inline-message"><p>{t.noDeparturesAvailable ?? 'No departures found'}</p></div>
    {:else}
      <div class="board-list" aria-label={t.departures ?? 'Departures'}>
        {#each boardDepartures as departure (departure.id)}
          <div class="board-row">
            <span class="line-badge">{departure.line}</span>
            <div class="board-destination"><strong>{departure.destination}</strong><span>{departure.lineName}</span></div>
            <div class="board-time"><strong>{departureLabel(departure)}</strong><span>{departure.scheduledTime}</span></div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class:map-compact={mapCompact} class="map-wrap">
      <div class="map-copy"><p class="eyebrow">{t.nearby ?? 'Nearby'}</p><h1>{t.nearbyTitle ?? 'Nära dig'}</h1><span>{location.position ? (t.defaultCity ?? 'Stockholm') : (t.locationPromptTitle ?? 'Find nearby stops')}</span></div>
      <div class="map-container" bind:this={mapEl} aria-label={t.nearbyMap ?? 'Nearby stops map'}></div>
      {#if mapError}<div class="map-fallback">{t.mapUnavailable ?? 'Map unavailable. The stop list is still available.'}</div>{/if}
    </div>
    <div class="nearby-content">
      <div class="nearby-search-wrap">
        <label for="nearby-search">{t.searchStops ?? 'Search stops'}</label>
        <input id="nearby-search" bind:value={query} oninput={handleSearchInput} placeholder={t.searchPlaceholder ?? 'Search stop...'} autocomplete="off" enterkeyhint="search" />
      </div>
      {#if !hasLocation && !isSearchMode()}
        <div class="location-prompt"><div><strong>{t.locationPromptTitle ?? 'Find nearby stops'}</strong><p>{t.locationPromptDesc ?? 'Allow location to show nearby stops.'}</p></div><button type="button" onclick={useLocation}>{t.locationEnableBtn ?? 'Use my location'}</button></div>
      {/if}
      {#if loading || searching}
        <div class="stop-list" aria-busy="true">{#each Array(4) as _, i}<div class="stop-skeleton" aria-hidden="true" style={`--i:${i}`}></div>{/each}</div>
      {:else if error && !isSearchMode()}
        <div class="inline-message"><p>{error}</p><button type="button" onclick={() => location.position && loadNearby(location.position)}>{t.retry ?? 'Retry'}</button></div>
      {:else if displayedStops.length === 0}
        <div class="inline-message"><p>{isSearchMode() ? (t.noStops ?? 'No stop found') : (t.noNearbyStops ?? 'No stops nearby')}</p></div>
      {:else}
        <div class="stop-list" bind:this={listEl} onscroll={(event) => { mapCompact = (event.currentTarget as HTMLElement).scrollTop > 32; }}>
          {#each displayedStops as stop (stop.id)}
            <button type="button" class:selected={selectedId === stop.id} class="stop-row" data-stop-id={stop.id} onclick={() => selectStop(stop)}>
              <span class="mode-dot" aria-hidden="true">{stop.modes[0] === 'metro' ? 'T' : stop.modes[0] === 'train' ? 'J' : stop.modes[0] === 'boat' ? '⌁' : '●'}</span>
              <span class="stop-main"><strong>{stop.name}</strong><span>{stopDistance(stop)}{walkingLabel(stop) ? ` · ${walkingLabel(stop)}` : ''}</span>{#if previews.has(stop.id)}<span class="preview-line">{#each previews.get(stop.id) ?? [] as departure, i (departure.id)}{#if i > 0} · {/if}{departure.line} {departure.destination} {departureLabel(departure)}{/each}</span>{:else}<span class="preview-line muted">{t.loadingDepartures ?? 'Loading departures...'}</span>{/if}</span>
              <span class="stop-arrow" aria-hidden="true">›</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <button type="button" class="nearby-back" onclick={boardStop ? requestBoardBack : onBack}>{t.backToPages ?? 'Back to pages'}</button>
</section>

<style>
  .nearby-surface { height: 100%; min-height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
  .map-wrap { position: relative; height: 42dvh; min-height: 250px; max-height: 410px; overflow: hidden; background: var(--surface-emphasis); transition: height 220ms ease; }
  .map-wrap.map-compact { height: 110px; min-height: 110px; }
  .map-container { position: absolute; inset: 0; }
  .map-copy { position: absolute; z-index: 2; left: 18px; top: calc(16px + env(safe-area-inset-top)); color: #171717; pointer-events: none; text-shadow: 0 1px 2px rgba(255,255,255,.7); }
  .map-copy h1 { font: 800 30px/1 'Neue Machina', sans-serif; letter-spacing: -.03em; }
  .map-copy span { font-size: 13px; font-weight: 700; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px; }
  .map-fallback { position: absolute; inset: auto 12px 12px; z-index: 3; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 12px; }
  .nearby-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; margin-top: -1px; }
  .nearby-search-wrap { position: sticky; top: 0; z-index: 4; padding: 10px 14px; background: var(--bg); border-top: 1px solid var(--border); }
  .nearby-search-wrap label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .nearby-search-wrap input { width: 100%; height: 46px; padding: 0 14px 0 42px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font: 500 16px/1.2 inherit; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%236b6b66' stroke-width='2'%3E%3Ccircle cx='8' cy='8' r='5.5'/%3E%3Cpath d='m12 12 4 4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: 14px center; }
  .location-prompt { display: flex; align-items: center; gap: 12px; justify-content: space-between; margin: 0 14px 10px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
  .location-prompt strong { font-size: 14px; }.location-prompt p { margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
  .location-prompt button, .inline-message button { min-height: 40px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--accent); color: var(--text-on-accent); font-weight: 700; white-space: nowrap; }
  .stop-list, .board-list { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow-y: auto; padding: 0 14px 18px; }
  .stop-row { display: grid; grid-template-columns: 34px 1fr 20px; gap: 10px; align-items: center; min-height: 74px; padding: 10px 4px; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; }
  .stop-row.selected { background: var(--accent-subtle); }.mode-dot { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--accent); color: var(--text-on-accent); font-weight: 800; }
  .stop-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }.stop-main strong { font-size: 16px; }.stop-main span { color: var(--text-secondary); font-size: 12px; }.stop-main .preview-line { overflow: hidden; color: var(--text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.stop-main .preview-line.muted { color: var(--text-muted); }.stop-arrow { font-size: 28px; color: var(--text-muted); }
  .inline-message { margin: 10px 14px; padding: 18px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-size: 14px; }.inline-message button { margin-top: 12px; }
  .stop-skeleton, .board-skeleton { height: 62px; margin-bottom: 1px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--bg), var(--surface), var(--bg)); animation: nearby-shimmer 1.3s ease-in-out infinite; animation-delay: calc(var(--i) * 80ms); }
  .nearby-header { display: flex; align-items: center; gap: 12px; padding: calc(14px + env(safe-area-inset-top)) 16px 14px; border-bottom: 1px solid var(--border); background: var(--bg); }.nearby-header h1 { font: 700 24px/1.1 'Neue Machina', sans-serif; }.back-button { width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 22px; }.board-meta { display: flex; gap: 8px; padding: 12px 16px; color: var(--text-secondary); font-size: 13px; }.freshness { margin-left: auto; color: var(--color-success, var(--text-secondary)); font-weight: 700; }.board-row { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; min-height: 70px; padding: 10px 4px; border-bottom: 1px solid var(--border); }.line-badge { display: grid; place-items: center; min-height: 32px; border-radius: 7px; background: var(--accent); color: var(--text-on-accent); font-weight: 800; }.board-destination, .board-time { display: flex; flex-direction: column; gap: 3px; }.board-destination span, .board-time span { color: var(--text-secondary); font-size: 12px; }.board-time { text-align: right; }.board-time strong { font-size: 17px; }.nearby-back { align-self: center; margin: auto 0 16px; min-height: 40px; border: 0; background: transparent; color: var(--text-secondary); font-weight: 700; }
  @keyframes nearby-shimmer { 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .map-wrap { transition: none; }.stop-skeleton, .board-skeleton { animation: none; opacity: .7; } }
</style>
