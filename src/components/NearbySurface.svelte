<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { TransitDeparture, TransitStopSearchResult } from '../providers/types';
  import { transitService } from '../providers/init';
  import {
    clearLocationSession,
    formatDistance,
    getWalkingTime,
    isDistanceReliable,
    loadGrantedLocation,
    requestLocation,
    subscribeToLocation,
    type LocationSnapshot,
  } from '../services/geo';
  import { getSettings, setLocationServicesEnabled } from '../stores/settingsStore.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import { getTransportType } from '../lib/getTransportType';
  import { editPencil, mapIcon, settingsGear, slLogo } from '../icons/departureIcons';
  import { openSlTickets } from '../lib/openSlTickets';
  import MapViewer from './MapViewer.svelte';
  import NearbyMap from './NearbyMap.svelte';
  import StationDepartureCard from './StationDepartureCard.svelte';
  import TransportIcon from './TransportIcon.svelte';
  type LocationStatusState = 'off' | 'searching' | 'ready' | 'blocked' | 'unavailable' | 'permission';
  type UtilityView = 'nearby' | 'board';

  let {
    onBack,
    onBoardBack,
    onSelectStation,
    onEditToggle,
    onOpenSettings,
    boardStop = null,
    view = 'nearby',
    preview = false,
  }: {
    onBack: () => void;
    onBoardBack?: () => void;
    onSelectStation?: (stop: TransitStopSearchResult) => void;
    onEditToggle?: () => void;
    onOpenSettings?: () => void;
    boardStop?: TransitStopSearchResult | null;
    view?: UtilityView;
    preview?: boolean;
  } = $props();

  let t = $derived(getT());
  let settings = $derived(getSettings());
  let location = $state<LocationSnapshot>({ position: null, accuracy: null, isLoading: false, access: 'unknown' });
  let nearbyStops = $state<TransitStopSearchResult[]>([]);
  let searchResults = $state<TransitStopSearchResult[]>([]);
  let query = $state('');
  let loading = $state(false);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let locationActionMessage = $state<string | null>(null);
  let searchError = $state<string | null>(null);
  let nearbyMapError = $state(false);
  let boardMapError = $state(false);
  let selectedId = $state<string | null>(null);
  let boardDepartures = $state<TransitDeparture[]>([]);
  let boardLoading = $state(false);
  let boardError = $state(false);
  let previews = $state<Map<string, TransitDeparture[]>>(new Map());
  let catalogGeneration = 0;
  let previewGeneration = 0;
  let searchGeneration = 0;
  let boardGeneration = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setInterval> | null = null;
  let loadedBoardStopId: string | null = null;
  let listEl = $state<HTMLDivElement | undefined>(undefined);
  let showNetworkMap = $state(false);
  let locationUnsubscribe: (() => void) | null = null;
  let mounted = $state(false);
  let utilityActive = $state(false);

  let displayedStops = $derived(query.trim().length >= 2 ? searchResults : nearbyStops);
  let hasLocation = $derived(Boolean(location.position));
  let locationEnabled = $derived(Boolean(settings.locationServicesEnabled));
  let locationStatus = $derived.by((): { state: LocationStatusState; label: string } => {
    if (!locationEnabled) return { state: 'off', label: t.nearbyLocationOff ?? 'Location off' };
    if (location.position) return { state: 'ready', label: t.nearbyLocationReady ?? 'Your location' };
    if (location.isLoading) return { state: 'searching', label: t.nearbyLocationSearching ?? 'Finding your location...' };
    if (location.access === 'denied') return { state: 'blocked', label: t.nearbyLocationBlocked ?? 'Location blocked' };
    if (location.access === 'unsupported') return { state: 'unavailable', label: t.nearbyLocationUnavailable ?? 'Location unavailable' };
    return { state: 'permission', label: t.nearbyLocationPermission ?? 'Allow location' };
  });

  function stopDistance(stop: TransitStopSearchResult): string {
    if (stop.distance == null || !isDistanceReliable(stop.distance, location.accuracy)) return '';
    return formatDistance(stop.distance / 1000);
  }

  function walkingLabel(stop: TransitStopSearchResult): string {
    if (!settings.walkingEtaEnabled || stop.distance == null || !isDistanceReliable(stop.distance, location.accuracy)) return '';
    return `${getWalkingTime(stop.distance / 1000)} min`;
  }

  function departureLabel(departure: TransitDeparture): string {
    if (departure.minutes <= 0) return t.departureNow ?? 'Nu';
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
      if (stops.length === 0) error = t.noNearbyStops ?? 'Inga hållplatser hittades inom 2 km.';
    } catch {
      if (generation !== catalogGeneration) return;
      error = t.nearbyLoadError ?? t.loadError ?? 'Kunde inte läsa in hållplatser.';
      nearbyStops = [];
    } finally {
      if (generation === catalogGeneration) loading = false;
    }
  }

  async function useLocation() {
    locationActionMessage = null;
    setLocationServicesEnabled(true);
    const position = await requestLocation();
    if (!position && location.access === 'denied') {
      locationActionMessage = 'Allow site in browser settings.';
    }
  }

  async function runSearch() {
    const value = query.trim();
    const generation = ++searchGeneration;
    if (value.length < 2) {
      searchResults = [];
      searchError = null;
      return;
    }
    searching = true;
    searchError = null;
    try {
      const results = await transitService.searchStops(value);
      if (generation !== searchGeneration) return;
      searchResults = results;
      selectedId = results[0]?.id ?? null;
    } catch {
      if (generation === searchGeneration) {
        searchResults = [];
        searchError = t.nearbyLoadError ?? t.loadError ?? 'Kunde inte söka hållplatser.';
      }
    } finally {
      if (generation === searchGeneration) searching = false;
    }
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(), 220);
  }

  async function loadDepartures(stop: TransitStopSearchResult, forBoard = false) {
    const generation = forBoard ? ++boardGeneration : boardGeneration;
    if (forBoard) {
      boardLoading = true;
      boardError = false;
    }
    try {
      const result = await transitService.getDepartures(stop.id, stop.name);
      const departures = result.departures
        .filter((departure) => departure.minutes >= 0)
        .sort((a, b) => a.minutes - b.minutes);
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id) {
        boardDepartures = departures;
      }
      return departures.slice(0, 2);
    } catch {
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id) boardError = true;
      return [];
    } finally {
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id) boardLoading = false;
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

  function openDirections() {
    const coord = boardStop?.coord;
    if (!coord) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${coord[0]},${coord[1]}&travelmode=walking`, '_blank', 'noopener,noreferrer');
  }

  function selectStop(stop: TransitStopSearchResult) {
    selectedId = stop.id;
    onSelectStation?.(stop);
  }

  function scrollToStop(id: string) {
    selectedId = id;
    listEl?.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function departureUrgencyLabel(departure: TransitDeparture): string {
    return departure.minutes > 0 && departure.minutes <= 3 ? (t.departureSoon ?? 'Snart') : '';
  }

  function departureCountdownColor(departure: TransitDeparture): string {
    return departure.minutes <= 3 ? 'var(--accent)' : 'var(--text)';
  }

  async function loadInitialLocation() {
    const position = await loadGrantedLocation();
    if (position && settings.locationServicesEnabled && !location.position) {
      location = { ...location, position, isLoading: false, access: 'granted' };
    }
  }

  function activate() {
    if (utilityActive || preview || !mounted) return;
    utilityActive = true;
    locationUnsubscribe = subscribeToLocation((snapshot) => { location = snapshot; });
  }

  function deactivate() {
    if (!utilityActive) return;
    utilityActive = false;
    locationUnsubscribe?.();
    locationUnsubscribe = null;
    if (boardTimer) clearInterval(boardTimer);
    boardTimer = null;
  }

  $effect(() => {
    if (!utilityActive) return;
    if (settings.locationServicesEnabled) void loadInitialLocation();
    else {
      nearbyStops = [];
      selectedId = null;
      clearLocationSession();
    }
  });

  $effect(() => {
    if (!utilityActive || view !== 'nearby') return;
    const position = location.position;
    if (position && settings.locationServicesEnabled) void loadNearby(position);
  });

  $effect(() => {
    if (!utilityActive || view !== 'nearby') return;
    const stops = displayedStops;
    if (stops.length > 0) void loadPreviews(stops);
  });

  $effect(() => {
    const stop = boardStop;
    const boardActive = utilityActive && view === 'board' && Boolean(stop);
    if (!boardActive || !stop) {
      if (boardTimer) clearInterval(boardTimer);
      boardTimer = null;
      return;
    }
    if (loadedBoardStopId !== stop.id) {
      loadedBoardStopId = stop.id;
      boardDepartures = [];
      boardGeneration += 1;
      void loadDepartures(stop, true);
    }
    if (!boardTimer) {
      boardTimer = setInterval(() => void loadDepartures(stop, true), 30000);
    }
    return () => {
      if (boardTimer) clearInterval(boardTimer);
      boardTimer = null;
    };
  });

  onMount(() => {
    mounted = true;
    activate();
  });

  $effect(() => {
    if (preview) deactivate();
    else activate();
  });

  onDestroy(() => {
    deactivate();
    if (searchTimer) clearTimeout(searchTimer);
    if (boardTimer) clearInterval(boardTimer);
  });
</script>

{#snippet headerActions()}
  <div class="header-actions">
    <button type="button" class="header-icon-btn sl-ticket-btn" onclick={() => openSlTickets()} aria-label={t.openTickets}>
      <svg class="sl-logo" viewBox="0 0 470.42 372.62" fill="none" aria-hidden="true">{@html slLogo}</svg>
    </button>
    <button type="button" class="header-icon-btn" onclick={() => showNetworkMap = true} aria-label={t.networkMap ?? t.mapViewerLabel}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html mapIcon}</svg>
    </button>
    {#if onEditToggle}
      <button type="button" class="header-icon-btn" onclick={onEditToggle} aria-label={t.managePages ?? 'Manage pages'}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html editPencil}</svg>
      </button>
    {/if}
    {#if onOpenSettings}
      <button type="button" class="header-icon-btn" onclick={onOpenSettings} aria-label={t.settings}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html settingsGear}</svg>
      </button>
    {/if}
  </div>
{/snippet}

<section
  class="nearby-surface"
  aria-label={t.nearby ?? 'Nära dig'}
  aria-hidden={preview ? 'true' : undefined}
  inert={preview}
>
  {#if boardStop}
    <div class="utility-panel board-panel" aria-hidden={preview || view !== 'board' ? 'true' : undefined} inert={preview || view !== 'board'}>
    <header class="nearby-topbar">
      <button type="button" class="icon-button" onclick={onBoardBack} aria-label={t.back ?? 'Tillbaka'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="topbar-copy"><span class="topbar-kicker">{t.nearby ?? 'Nära dig'}</span><h1>{boardStop.name}</h1></div>
      {@render headerActions()}
    </header>
    <div class="board-content">
      <div class="board-summary">
        <div><span class="summary-label">{t.stopLocation ?? 'Hållplats'}</span><strong>{stopDistance(boardStop) || (t.nearby ?? 'Nära dig')}</strong></div>
        {#if walkingLabel(boardStop)}<div><span class="summary-label">{t.walking ?? 'Gå'}</span><strong>{walkingLabel(boardStop)}</strong></div>{/if}
      </div>
      {#if boardStop.coord}
        <div class="detail-map-shell">
          {#if boardMapError}
            <div class="detail-map-empty"><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span></div>
          {:else}
            <svelte:boundary>
              <NearbyMap
                active={!preview && view === 'board'}
                {location}
                {boardStop}
                label={t.nearbyMap ?? 'Karta över hållplatsen'}
                onError={() => { boardMapError = true; }}
              />
              {#snippet failed(_error, _reset)}
                <div class="detail-map-empty"><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span></div>
              {/snippet}
            </svelte:boundary>
          {/if}
          {#if location.position}<div class="map-route-label"><span class="route-dot user-dot"></span><span>{t.walkToStop ?? 'Gå till hållplats'}</span><strong>{walkingLabel(boardStop) || stopDistance(boardStop)}</strong></div>{:else}<div class="map-route-label"><span class="route-dot stop-dot"></span><span>{t.stopLocation ?? 'Hållplatsens läge'}</span></div>{/if}
        </div>
        <button type="button" class="directions-action" onclick={openDirections}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 19V5M12 5 6 11M12 5l6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>{t.navigateToStop ?? t.openInMaps ?? 'Vägbeskrivning'}</button>
      {:else}
        <div class="detail-map-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z"/><path d="M9 4v13.5M15 6.5V20"/></svg><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span></div>
      {/if}
      {#if boardLoading}
        <div class="departure-list" aria-busy="true">{#each Array(4) as _, i (i)}<div class="departure-skeleton" style={`--i:${i}`} aria-hidden="true"></div>{/each}</div>
      {:else if boardError}
        <div class="state-panel"><strong>{t.departuresUnavailable ?? 'Avgångar kunde inte läsas in'}</strong><button type="button" onclick={() => void loadDepartures(boardStop!, true)}>{t.retry ?? 'Försök igen'}</button></div>
      {:else if boardDepartures.length === 0}
        <div class="state-panel"><strong>{t.noDeparturesAvailable ?? 'Inga kommande avgångar'}</strong></div>
      {:else}
        <div class="departure-list" aria-label={t.departures ?? 'Avgångar'}>
          {#each boardDepartures as departure (departure.id)}
            <div class="departure-card station-board-departure">
              <StationDepartureCard
                destination={departure.destination}
                line={departure.line}
                transportType={getTransportType(departure.transportMode)}
                scheduledTime={departure.scheduledTime}
                countdown={departureLabel(departure)}
                urgencyLabel={departureUrgencyLabel(departure)}
                countdownColor={departureCountdownColor(departure)}
                isArrivingNow={departure.minutes <= 0}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
    </div>
  {/if}
  <div class="utility-panel nearby-panel" aria-hidden={preview || view !== 'nearby' ? 'true' : undefined} inert={preview || view !== 'nearby'}>
    <header class="nearby-topbar">
      <button type="button" class="icon-button" onclick={onBack} aria-label={t.backToPages ?? 'Tillbaka till sidorna'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="topbar-copy"><span class="topbar-kicker">{t.nearby ?? 'Nära dig'}</span><h1>{t.nearbyTitle ?? 'Hållplatser nära dig'}</h1></div>
      {@render headerActions()}
    </header>
    <div class="map-wrap">
      <svelte:boundary>
        <NearbyMap
          active={!preview && view === 'nearby'}
          {location}
          stops={displayedStops}
          {selectedId}
          label={t.nearbyMap ?? 'Karta över hållplatser i närheten'}
          onSelectStop={(stop) => scrollToStop(stop.id)}
          onError={() => { nearbyMapError = true; }}
        />
        {#snippet failed(_error, _reset)}
          <div class="map-fallback">{t.mapUnavailable ?? 'Kartan är inte tillgänglig. Listan fungerar fortfarande.'}</div>
        {/snippet}
      </svelte:boundary>
      <div class="map-location-status" class:ready={locationStatus.state === 'ready'} class:searching={locationStatus.state === 'searching'} class:blocked={locationStatus.state === 'blocked'} class:unavailable={locationStatus.state === 'unavailable'} role="status" aria-label={locationStatus.label} aria-live="polite">
        <span class="map-location-status-dot" aria-hidden="true"></span>
        <span>{locationStatus.label}</span>
      </div>
      {#if !location.position}<div class="map-overlay-copy"><span>{locationEnabled ? (t.locationServices ?? 'Platstjänster') : (t.locationPromptTitle ?? 'Hitta hållplatser nära dig')}</span><strong>{location.isLoading ? (t.waitingForLocation ?? 'Hämtar position...') : locationEnabled ? (location.access === 'denied' || location.access === 'prompt' ? (t.nearbyStopsPermissionDenied ?? 'Tillåt platsåtkomst i webbläsaren.') : (t.nearbyLocationUnavailable ?? 'Plats ej tillgänglig.')) : (t.locationPromptDesc ?? 'Aktivera Platstjänster för att se din omgivning.')}</strong></div>{/if}
      {#if nearbyMapError}<div class="map-fallback">{t.mapUnavailable ?? 'Kartan är inte tillgänglig. Listan fungerar fortfarande.'}</div>{/if}
    </div>
    <div class="nearby-content">
      <div class="search-wrap">
        <label for="nearby-search">{t.searchStops ?? 'Sök hållplats'}</label>
        <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5" stroke-linecap="round"/></svg><input id="nearby-search" bind:value={query} oninput={handleSearchInput} placeholder={t.searchPlaceholder ?? 'Sök hållplats'} autocomplete="off" enterkeyhint="search" /></div>
      </div>
      {#if (!locationEnabled || !hasLocation) && !location.isLoading}
        <div class="location-prompt">
          <div class="prompt-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke-linecap="round"/></svg></div>
          <div class="prompt-copy"><strong>{locationEnabled ? (t.locationServices ?? 'Platstjänster') : (t.locationPromptTitle ?? 'Hitta hållplatser nära dig')}</strong><span>{locationActionMessage ?? (locationEnabled ? (location.access === 'denied' || location.access === 'prompt' ? (t.nearbyStopsPermissionDenied ?? 'Tillåt platsåtkomst i webbläsaren.') : (t.nearbyLocationUnavailable ?? 'Plats ej tillgänglig.')) : (t.locationPromptDesc ?? 'Aktivera plats för att sortera efter avstånd.'))}</span></div>
          <button type="button" class="primary-action" onclick={useLocation}>{locationEnabled ? (location.access === 'denied' || location.access === 'prompt' ? (t.nearbyLocationPermission ?? 'Allow location') : (t.nearbyLocationTryAgain ?? 'Try location again')) : (t.locationEnableBtn ?? 'Aktivera plats')}</button>
        </div>
      {/if}
      {#if searching || loading}
        <div class="station-list" aria-busy="true">{#each Array(4) as _, i (i)}<div class="station-skeleton" style={`--i:${i}`} aria-hidden="true"></div>{/each}</div>
      {:else if searchError || (error && !isSearchMode())}
        <div class="state-panel"><strong>{searchError ?? error}</strong><button type="button" onclick={() => isSearchMode() ? void runSearch() : location.position && void loadNearby(location.position)}>{t.retry ?? 'Försök igen'}</button></div>
      {:else if displayedStops.length === 0}
        <div class="state-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5.5 10 3l4 2.5L20 3v15.5L14 21l-4-2.5-6 2.5V5.5Z" stroke-linejoin="round"/><path d="M10 3v15.5M14 5.5V21"/></svg><strong>{isSearchMode() ? (t.noStops ?? 'Ingen hållplats hittades') : (t.noNearbyStops ?? 'Inga hållplatser nära dig')}</strong></div>
      {:else}
        <div class="station-section-heading"><h2>{isSearchMode() ? (t.searchStops ?? 'Sökresultat') : (t.nearbyTitle ?? 'Nära dig')}</h2><span>{displayedStops.length}</span></div>
        <div class="station-list" bind:this={listEl}>
          {#each displayedStops as stop (stop.id)}
            <button type="button" class="station-card" class:selected={selectedId === stop.id} data-stop-id={stop.id} onclick={() => selectStop(stop)}>
              <span class="station-mode" aria-hidden="true">
                <TransportIcon type={getTransportType(stop.modes[0])} size={20} />
              </span>
              <span class="station-main"><strong>{stop.name}</strong><span class="station-meta">{stopDistance(stop)}{walkingLabel(stop) ? ` · ${walkingLabel(stop)}` : ''}</span>{#if previews.has(stop.id)}<span class="station-preview">{#each previews.get(stop.id) ?? [] as departure (departure.id)}<StationDepartureCard variant="preview" destination={departure.destination} line={departure.line} transportType={getTransportType(departure.transportMode)} scheduledTime={departure.scheduledTime} countdown={departureLabel(departure)} countdownColor={departureCountdownColor(departure)} />{/each}</span>{:else}<span class="station-preview muted">{t.loadingDepartures ?? 'Läser in avgångar…'}</span>{/if}</span>
              <svg class="station-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>

<MapViewer isOpen={showNetworkMap} onOpen={() => showNetworkMap = true} onClose={() => showNetworkMap = false} mapSrc={import.meta.env.BASE_URL + 'SL_railway_map.svg'} />

<style>
  .nearby-surface { position: relative; height: 100%; min-height: 100%; overflow: visible; background: var(--bg); color: var(--text); }
  .utility-panel { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
  .board-panel { transform: translate3d(100%, 0, 0); }
  .nearby-topbar { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; padding: calc(12px + env(safe-area-inset-top)) 16px 12px; border-bottom: 1px solid var(--border); background: var(--bg); }
  .icon-button { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 44px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); }
  .icon-button svg { width: 21px; height: 21px; }
  .topbar-copy { min-width: 0; flex: 1; }
  .topbar-kicker { display: block; color: var(--text-secondary); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .topbar-copy h1 { margin: 2px 0 0; overflow: hidden; font-size: 21px; font-weight: 750; letter-spacing: -.02em; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
  .header-actions { display: flex; align-items: center; gap: 0; flex: 0 0 auto; }
  .header-icon-btn { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-right: -4px; border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .15s, transform .12s ease; }
  .header-icon-btn:hover { background: var(--accent-subtle); }
  .header-icon-btn:active { transform: scale(.965); opacity: .9; }
  .header-icon-btn svg { width: 24px; height: 24px; }
  .header-icon-btn .sl-logo { width: 30.5px; height: 24px; }
  .sl-ticket-btn { display: none; }
  @media (max-width: 767px) { .sl-ticket-btn { display: flex; } }
  .map-wrap { position: relative; height: 27dvh; min-height: 176px; max-height: 270px; flex: 0 0 auto; overflow: hidden; background: var(--surface-emphasis); }
  .map-location-status { position: absolute; top: 12px; right: 12px; display: inline-flex; align-items: center; gap: 7px; min-height: 32px; max-width: calc(100% - 24px); padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-full); background: var(--surface); color: var(--text); font-size: 11px; font-weight: 700; line-height: 1; }
  .map-location-status-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--text-muted); }
  .map-location-status.ready .map-location-status-dot, .map-location-status.searching .map-location-status-dot { background: #2563EB; }
  .map-location-status.blocked .map-location-status-dot { background: var(--color-warning, #956B12); }
  .map-location-status.unavailable .map-location-status-dot { background: var(--text-secondary); }
  .map-overlay-copy { position: absolute; left: 16px; right: 16px; bottom: 16px; display: grid; gap: 4px; max-width: 250px; padding: 10px 12px; border: 1px solid rgba(23,23,23,.12); border-radius: 10px; background: rgba(255,255,255,.9); color: #171717; }
  .map-overlay-copy span { font-size: 12px; font-weight: 650; }.map-overlay-copy strong { font-size: 13px; line-height: 1.3; }
  .map-fallback { position: absolute; inset: auto 12px 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 12px; }
  .nearby-content, .board-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y pinch-zoom; padding-bottom: calc(18px + env(safe-area-inset-bottom)); }
  .search-wrap { padding: 12px 16px 8px; }.search-wrap label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .search-field { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); }.search-field svg { width: 19px; height: 19px; flex: 0 0 19px; color: var(--text-secondary); }.search-field input { width: 100%; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 16px; }
  .location-prompt { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: center; margin: 0 16px 10px; padding: 11px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }.prompt-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: var(--accent-subtle); color: var(--accent); }.prompt-icon svg { width: 20px; height: 20px; }.prompt-copy { display: grid; gap: 2px; min-width: 0; }.prompt-copy strong { font-size: 13px; }.prompt-copy span { color: var(--text-secondary); font-size: 11px; line-height: 1.3; }.primary-action { grid-column: 2; justify-self: start; min-height: 38px; padding: 0 12px; border: 0; border-radius: 9px; background: var(--accent); color: var(--text-on-accent); font-size: 13px; font-weight: 700; }
  .station-section-heading { display: flex; align-items: baseline; gap: 8px; padding: 4px 16px 8px; }.station-section-heading h2 { margin: 0; font-size: 15px; font-weight: 750; }.station-section-heading span { color: var(--text-secondary); font-size: 12px; }
  .station-list, .departure-list { display: grid; gap: 8px; padding: 0 16px; }.station-card, .departure-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 11px; align-items: center; width: 100%; min-height: 78px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); text-align: left; }.station-card.selected { border-color: var(--border-strong); background: var(--surface-hover); }.station-mode { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--accent); color: var(--text-on-accent); font-size: 12px; font-weight: 800; }.station-main { display: grid; gap: 3px; min-width: 0; }.station-main > strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.station-main > span { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.station-main .station-meta { font-size: 12px; }.station-main .station-preview { display: grid; gap: 0; min-width: 0; color: var(--text); }.station-main .muted { color: var(--text-muted); }.station-chevron { width: 19px; height: 19px; color: var(--text-muted); }
  .state-panel, .detail-map-empty { display: grid; place-items: center; gap: 8px; margin: 8px 16px; padding: 24px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-secondary); text-align: center; }.state-panel strong { color: var(--text); font-size: 14px; }.state-panel button { min-height: 40px; padding: 0 13px; border: 0; border-radius: 9px; background: var(--accent); color: var(--text-on-accent); font-weight: 700; }.state-panel svg, .detail-map-empty svg { width: 24px; height: 24px; }
  .board-summary { display: flex; align-items: end; gap: 18px; flex: 0 0 auto; padding: 14px 16px 10px; }.board-summary > div { display: grid; gap: 3px; }.summary-label { color: var(--text-secondary); font-size: 11px; }.board-summary strong { font-size: 15px; }.detail-map-shell { position: relative; height: 210px; min-height: 210px; flex: 0 0 210px; margin: 0 16px 14px; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-emphasis); }.map-route-label { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; align-items: center; gap: 7px; max-width: calc(100% - 20px); padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text-secondary); font-size: 11px; }.map-route-label strong { margin-left: auto; color: var(--text); font-size: 12px; }.route-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; }.user-dot { background: #2563EB; }.stop-dot { background: var(--text); }
  .station-board-departure { display: block; min-height: 0; padding: 0; overflow: hidden; }.departure-skeleton, .station-skeleton { min-height: 68px; border: 1px solid var(--border); border-radius: 12px; background: linear-gradient(90deg, var(--bg), var(--surface), var(--bg)); animation: nearby-shimmer 1.3s ease-in-out infinite; animation-delay: calc(var(--i) * 80ms); }.departure-skeleton { min-height: 110px; }
  .directions-action { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; margin: 0 16px 14px; padding: 0 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; }.directions-action svg { width: 17px; height: 17px; color: #2563EB; }
  @keyframes nearby-shimmer { 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .departure-skeleton, .station-skeleton { animation: none; opacity: .7; } }
</style>
