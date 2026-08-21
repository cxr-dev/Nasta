<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { DepartureFetchDiagnostics, TransitDeparture, TransitStopSearchResult } from '../providers/types';
  import type { SlApiError } from '../services/slApi';
  import { transitService } from '../providers/init';
  import {
    clearLocationSession,
    formatDistance,
    isDistanceReliable,
    loadGrantedLocation,
    requestLocation,
    subscribeToLocation,
    type LocationSnapshot,
  } from '../services/geo';
  import { getSettings, setLocationServicesEnabled } from '../stores/settingsStore.svelte';
  import { translations } from '../lib/i18n';
  import { resolveLocale } from '../stores/localeStore.svelte';
  import { getTransportType } from '../lib/getTransportType';
  import { editPencil, mapIcon, settingsGear, slLogo } from '../icons/departureIcons';
  import { openSlTickets } from '../lib/openSlTickets';
  import { openWalkingDirections } from '../lib/openWalkingDirections';
  import { rankStopSearchResults } from '../services/stopSearchRanking';
  import { focusBoundary } from '../lib/focusBoundary';
  import { createHistoryView } from '../lib/historyView';
  import MapViewer from './MapViewer.svelte';
  import NearbyMap from './NearbyMap.svelte';
  import SurfaceControl from './SurfaceControl.svelte';
  import StationDepartureCard from './StationDepartureCard.svelte';
  import TransportIcon from './TransportIcon.svelte';
  type LocationStatusState = 'off' | 'searching' | 'ready' | 'blocked' | 'unavailable' | 'permission';
  type UtilityView = 'nearby' | 'board';
  type PreviewState =
    | { state: 'loading' }
    | { state: 'ready'; departures: TransitDeparture[] }
    | { state: 'empty' }
    | { state: 'unavailable' };

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

  let settings = $derived(getSettings());
  let t = $derived(translations[resolveLocale(settings.language)]);
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
  let nearbyMapReady = $state(false);
  let nearbyMapAttempt = $state(0);
  let boardMapError = $state(false);
  let boardMapAttempt = $state(0);
  let selectedId = $state<string | null>(null);
  let boardDepartures = $state<TransitDeparture[]>([]);
  let boardLoading = $state(false);
  let boardRefreshing = $state(false);
  let boardError = $state(false);
  let boardEmptyState = $state<'none' | 'empty' | 'invalid'>('none');
  let boardDiagnostics = $state<DepartureFetchDiagnostics | undefined>(undefined);
  let boardStopDeviations = $state<any[]>([]);
  let boardExtendedForecast = $state(false);
  let boardCopyConfirmation = $state(false);
  let previews = $state<Map<string, PreviewState>>(new Map());
  let locationAnnouncement = $state('');
  let catalogGeneration = 0;
  let previewGeneration = 0;
  let searchGeneration = 0;
  let boardGeneration = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let boardTimer: ReturnType<typeof setInterval> | null = null;
  let boardAbortController: AbortController | null = null;
  let loadedBoardStopId: string | null = null;
  let showNetworkMap = $state(false);
  let locationUnsubscribe: (() => void) | null = null;
  let mounted = $state(false);
  let utilityActive = $state(false);
  let nearbyMapFullscreen = $state(false);
  let nearbyMapHistory: ReturnType<typeof createHistoryView> | null = null;

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
  let boardCopy = $derived({
    noDepartures: t.nearbyNoDepartures,
    invalidData: t.nearbyInvalidData,
    details: t.nearbyTechnicalDetails,
    copy: t.nearbyCopyDetails,
    copied: t.nearbyDetailsCopied,
    refreshing: t.nearbyRefreshing,
    stale: t.nearbyShowingStale,
    nextService: t.nearbyNextService,
  });

  function stopDistance(stop: TransitStopSearchResult): string {
    if (stop.distance == null || !isDistanceReliable(stop.distance, location.accuracy)) return '';
    return formatDistance(stop.distance / 1000);
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
      error = navigator.onLine === false
        ? (t.nearbyOffline ?? 'Ingen anslutning. Försök igen när du är online.')
        : (t.nearbyLoadError ?? t.loadError ?? 'Kunde inte läsa in hållplatser.');
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
      locationActionMessage = t.nearbyLocationSettings ?? 'Tillåt platsåtkomst i webbläsarens inställningar.';
    }
  }

  function retryNearbyMap() {
    nearbyMapError = false;
    nearbyMapReady = false;
    nearbyMapAttempt += 1;
  }

  function retryBoardMap() {
    boardMapError = false;
    boardMapAttempt += 1;
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
      searchResults = rankStopSearchResults(results, value, location.position);
      selectedId = searchResults[0]?.id ?? null;
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

  function currentStopDeviations(deviations: unknown[], stopId: string): any[] {
    const siteId = stopId.replace(/^sl:/, '');
    return deviations.filter((deviation) => {
      if (!deviation || typeof deviation !== 'object') return false;
      const item = deviation as Record<string, unknown>;
      const scopedId = item.site_id ?? item.siteId ?? item.stop_id ?? item.stopId;
      return scopedId == null || String(scopedId) === siteId;
    });
  }

  function extendedDepartureLabel(departure: TransitDeparture): string {
    if (departure.expectedTime == null) return departure.scheduledTime;
    const departureDate = new Date(departure.expectedTime);
    const now = new Date();
    const stockholmDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const dayLabel = stockholmDate(departureDate) === stockholmDate(now) ? t.today : t.tomorrow;
    const time = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(departureDate);
    return `${dayLabel} ${time}`;
  }

  function deviationMessage(deviation: unknown): string {
    if (!deviation || typeof deviation !== 'object') return '';
    const message = (deviation as Record<string, unknown>).message;
    return typeof message === 'string' ? message.trim() : '';
  }

  async function loadDepartures(stop: TransitStopSearchResult, forBoard = false, allowExtendedForecast = true) {
    const generation = forBoard ? ++boardGeneration : boardGeneration;
    if (forBoard) {
      boardAbortController?.abort();
      boardAbortController = new AbortController();
      boardLoading = boardDepartures.length === 0;
      boardRefreshing = boardDepartures.length > 0;
      boardError = false;
      boardEmptyState = 'none';
      boardCopyConfirmation = false;
    }
    try {
      const signal = forBoard ? boardAbortController?.signal : undefined;
      let result = await transitService.getDepartures(stop.id, stop.name, undefined, undefined, signal);
      const initialStopDeviations = result.stopDeviations ?? [];
      let extendedForecast = false;
      if (forBoard && allowExtendedForecast && result.departures.length === 0) {
        result = await transitService.getDepartures(stop.id, stop.name, undefined, undefined, signal, { forecastMinutes: 720 });
        extendedForecast = true;
      }
      const departures = result.departures
        .filter((departure) => departure.minutes >= 0)
        .sort((a, b) => a.minutes - b.minutes);
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id) {
        if (departures.length > 0 || !boardExtendedForecast || allowExtendedForecast) {
          boardDepartures = extendedForecast ? departures.slice(0, 12) : departures;
          boardExtendedForecast = extendedForecast && departures.length > 0;
        }
        boardStopDeviations = currentStopDeviations(result.stopDeviations?.length ? result.stopDeviations : initialStopDeviations, stop.id);
        boardDiagnostics = result.diagnostics;
        boardEmptyState = departures.length === 0 && result.diagnostics && result.diagnostics.rawCount > 0 && result.diagnostics.validCount === 0 ? 'invalid' : departures.length === 0 ? 'empty' : 'none';
      }
      return departures.slice(0, 2);
    } catch (error) {
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id && (error as Error).name !== 'AbortError') {
        boardError = true;
        boardDiagnostics = (error as SlApiError).diagnostics;
      }
      return [];
    } finally {
      if (forBoard && generation === boardGeneration && boardStop?.id === stop.id) {
        boardLoading = false;
        boardRefreshing = false;
      }
    }
  }

  async function loadPreviews(stops: TransitStopSearchResult[]) {
    const generation = ++previewGeneration;
    const next = new Map<string, PreviewState>();
    for (const stop of stops) next.set(stop.id, previews.get(stop.id) ?? { state: 'loading' });
    previews = next;
    const pending = stops.filter((stop) => next.get(stop.id)?.state === 'loading');
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const stop = pending[cursor++];
        let preview: PreviewState;
        try {
          const result = await transitService.getDepartures(stop.id, stop.name);
          const departures = result.departures.filter((departure) => departure.minutes >= 0).sort((a, b) => a.minutes - b.minutes).slice(0, 2);
          preview = departures.length > 0 ? { state: 'ready', departures } : { state: 'empty' };
        } catch {
          preview = { state: 'unavailable' };
        }
        if (generation !== previewGeneration) return;
        next.set(stop.id, preview);
        previews = new Map(next);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  }

  function openDirections() {
    const coord = boardStop?.coord;
    if (!coord) return;
    openWalkingDirections(coord[0], coord[1]);
  }

  function selectStop(stop: TransitStopSearchResult) {
    selectedId = stop.id;
    onSelectStation?.(stop);
  }

  function departureUrgencyLabel(departure: TransitDeparture): string {
    return departure.minutes > 0 && departure.minutes <= 3 ? (t.departureSoon ?? 'Snart') : '';
  }

  function selectStopFromMap(stop: TransitStopSearchResult) {
    if (nearbyMapFullscreen) nearbyMapHistory?.back();
    selectStop(stop);
  }

  function lockBodyScroll(lock: boolean) {
    document.documentElement.style.touchAction = lock ? 'none' : '';
  }

  function openNearbyMapFullscreen() {
    if (nearbyMapFullscreen) return;
    nearbyMapFullscreen = true;
    lockBodyScroll(true);
    nearbyMapHistory?.enter();
  }

  function closeNearbyMapFullscreen() {
    if (!nearbyMapFullscreen) return;
    nearbyMapFullscreen = false;
    lockBodyScroll(false);
  }

  function requestNearbyMapBack() {
    closeNearbyMapFullscreen();
    nearbyMapHistory?.back();
  }

  function copyBoardDiagnostics() {
    if (!boardStop) return;
    const diagnostics = boardDiagnostics;
    const text = [
      `siteId=${boardStop.id.replace(/^sl:/, '')}`,
      `requestedAt=${diagnostics?.requestedAt ?? 'unknown'}`,
      `durationMs=${diagnostics?.durationMs ?? 'unknown'}`,
      `forecastMinutes=${diagnostics?.forecastMinutes ?? 'unknown'}`,
      `httpStatus=${diagnostics?.httpStatus ?? 'unknown'}`,
      `raw=${diagnostics?.rawCount ?? 'unknown'}`,
      `valid=${diagnostics?.validCount ?? 'unknown'}`,
      `stale=${diagnostics?.staleCount ?? 'unknown'}`,
      `invalid=${diagnostics?.invalidCount ?? 'unknown'}`,
    ].join('\n');
    const write = navigator.clipboard?.writeText(text);
    if (write) void write.then(() => { boardCopyConfirmation = true; }).catch(() => undefined);
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
    locationUnsubscribe = subscribeToLocation((snapshot) => untrack(() => {
      const acquired = !location.position && Boolean(snapshot.position);
      location = snapshot;
      if (acquired) locationAnnouncement = t.nearbyLocationAcquired ?? 'Location found. Nearby stops are now sorted by distance.';
    }));
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
    if (settings.locationServicesEnabled) void untrack(() => loadInitialLocation());
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
    if (stops.length > 0) void untrack(() => loadPreviews(stops));
  });

  $effect(() => {
    const stop = boardStop;
    const boardActive = utilityActive && view === 'board' && Boolean(stop);
    if (!boardActive || !stop) {
      if (boardTimer) clearInterval(boardTimer);
      boardTimer = null;
      boardAbortController?.abort();
      boardAbortController = null;
      loadedBoardStopId = null;
      return;
    }
    if (loadedBoardStopId !== stop.id) {
      loadedBoardStopId = stop.id;
      boardDepartures = [];
      boardStopDeviations = [];
      boardDiagnostics = undefined;
      boardExtendedForecast = false;
      boardEmptyState = 'none';
      boardGeneration += 1;
      void loadDepartures(stop, true);
    }
    if (!boardTimer) {
      boardTimer = setInterval(() => void loadDepartures(stop, true, false), 30000);
    }
    return () => {
      if (boardTimer) clearInterval(boardTimer);
      boardTimer = null;
    };
  });

  onMount(() => {
    mounted = true;
    activate();
    nearbyMapHistory = createHistoryView('nearby-map', {
      onEnter: openNearbyMapFullscreen,
      onExit: closeNearbyMapFullscreen,
    });
  });

  $effect(() => {
    if (preview) deactivate();
    else activate();
  });

  onDestroy(() => {
    deactivate();
    if (searchTimer) clearTimeout(searchTimer);
    if (boardTimer) clearInterval(boardTimer);
    boardAbortController?.abort();
    nearbyMapHistory?.destroy();
    lockBodyScroll(false);
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
        <div><span class="summary-label">{t.distance ?? 'Avstånd'}</span><strong>{stopDistance(boardStop) || (t.stopLocation ?? 'Hållplats')}</strong></div>
      </div>
      {#if boardStop.coord}
        <div class="detail-map-shell">
          {#if boardMapError}
            <div class="detail-map-empty"><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span><button type="button" onclick={retryBoardMap}>{t.retry ?? 'Försök igen'}</button></div>
          {:else}
            <svelte:boundary>
              {#key boardMapAttempt}
                <NearbyMap
                  active={!preview && view === 'board'}
                  {location}
                  {boardStop}
                  label={t.nearbyMap ?? 'Karta över hållplatsen'}
                  onFatalError={() => { boardMapError = true; }}
                />
              {/key}
              {#snippet failed(_error, _reset)}
                <div class="detail-map-empty"><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span></div>
              {/snippet}
            </svelte:boundary>
          {/if}
          {#if stopDistance(boardStop)}<div class="map-distance-label"><span>{t.distance ?? 'Avstånd'}</span><strong>{stopDistance(boardStop)}</strong></div>{/if}
        </div>
        <button type="button" class="directions-action" onclick={openDirections}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 19V5M12 5 6 11M12 5l6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>{t.navigateToStop ?? t.openInMaps ?? 'Vägbeskrivning'}</button>
      {:else}
        <div class="detail-map-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z"/><path d="M9 4v13.5M15 6.5V20"/></svg><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig för den här hållplatsen.'}</span></div>
      {/if}
      {#if boardLoading}
        <div class="departure-list" aria-busy="true">{#each Array(4) as _, i (i)}<div class="departure-skeleton" style={`--i:${i}`} aria-hidden="true"></div>{/each}</div>
      {:else if boardError && boardDepartures.length === 0}
        {#each boardStopDeviations as deviation, index (deviation.id ?? deviation.deviation_id ?? `${boardStop?.id ?? 'stop'}-${index}`)}
          {@const message = deviationMessage(deviation)}
          {#if message}<p class="board-disruption" role="status">{message}</p>{/if}
        {/each}
        <div class="state-panel"><strong>{t.departuresUnavailable ?? 'Avgångar kunde inte läsas in'}</strong><button type="button" onclick={() => void loadDepartures(boardStop!, true)}>{t.retry ?? 'Försök igen'}</button><details><summary>{boardCopy.details}</summary><button type="button" onclick={copyBoardDiagnostics}>{boardCopyConfirmation ? boardCopy.copied : boardCopy.copy}</button></details></div>
      {:else if boardDepartures.length === 0}
        {#each boardStopDeviations as deviation, index (deviation.id ?? deviation.deviation_id ?? `${boardStop?.id ?? 'stop'}-${index}`)}
          {@const message = deviationMessage(deviation)}
          {#if message}<p class="board-disruption" role="status">{message}</p>{/if}
        {/each}
        <div class="state-panel"><strong>{boardEmptyState === 'invalid' ? boardCopy.invalidData : boardCopy.noDepartures}</strong>{#if boardEmptyState === 'invalid'}<details><summary>{boardCopy.details}</summary><button type="button" onclick={copyBoardDiagnostics}>{boardCopyConfirmation ? boardCopy.copied : boardCopy.copy}</button></details>{/if}</div>
      {:else}
        {#if boardExtendedForecast}<p class="board-status" role="status">{boardCopy.nextService}</p>{/if}
        {#if boardRefreshing || boardError}<div class="board-status" role="status">{boardError ? boardCopy.stale : boardCopy.refreshing} {#if boardError}<button type="button" onclick={() => void loadDepartures(boardStop!, true)}>{t.retry ?? 'Försök igen'}</button>{/if}</div>{/if}
        {#each boardStopDeviations as deviation, index (deviation.id ?? deviation.deviation_id ?? `${boardStop?.id ?? 'stop'}-${index}`)}
          {@const message = deviationMessage(deviation)}
          {#if message}<p class="board-disruption" role="status">{message}</p>{/if}
        {/each}
        <div class="departure-list" aria-label={t.departures ?? 'Avgångar'}>
          {#each boardDepartures as departure (departure.id)}
            <div class="departure-card station-board-departure">
              <StationDepartureCard
                destination={departure.destination}
                line={departure.line}
                transportType={getTransportType(departure.transportMode)}
                scheduledTime={boardExtendedForecast ? extendedDepartureLabel(departure) : departure.scheduledTime}
                countdown={departureLabel(departure)}
                urgencyLabel={departureUrgencyLabel(departure)}
                countdownColor={departureCountdownColor(departure)}
                isArrivingNow={departure.minutes <= 0}
                isSleeping={false}
                nextDepartureTime={null}
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
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="map-wrap"
      class:nearby-map-fullscreen={nearbyMapFullscreen}
      role={nearbyMapFullscreen ? 'dialog' : undefined}
      aria-modal={nearbyMapFullscreen ? 'true' : undefined}
      aria-label={nearbyMapFullscreen ? (t.nearbyMap ?? 'Karta över hållplatser i närheten') : undefined}
      tabindex={nearbyMapFullscreen ? -1 : undefined}
      onkeydown={(event) => { if (event.key === 'Escape' && nearbyMapFullscreen) requestNearbyMapBack(); }}
      use:focusBoundary={{ active: nearbyMapFullscreen, initialFocus: '[data-surface-control]' }}
    >
      <svelte:boundary>
        {#key nearbyMapAttempt}
          <NearbyMap
            active={!preview && view === 'nearby'}
            {location}
            stops={displayedStops}
            {selectedId}
            label={t.nearbyMap ?? 'Karta över hållplatser i närheten'}
            locationLabel={t.youAreHere ?? t.nearbyLocationReady ?? 'Du är här'}
            interactionMode={nearbyMapFullscreen ? 'fullscreen' : 'embedded'}
            onSelectStop={selectStopFromMap}
            onLoading={() => { nearbyMapReady = false; }}
            onReady={() => { nearbyMapReady = true; }}
            onFatalError={() => { nearbyMapError = true; }}
          />
        {/key}
        {#snippet failed(_error, _reset)}
          <div class="map-fallback">{t.mapUnavailable ?? 'Kartan är inte tillgänglig. Listan fungerar fortfarande.'}</div>
        {/snippet}
      </svelte:boundary>
      {#if nearbyMapFullscreen}
        <div class="nearby-map-close"><SurfaceControl kind="close" tone="overlay" label={t.minimizeMap ?? 'Förminska kartan'} onclick={requestNearbyMapBack} /></div>
      {:else}
        <button type="button" class="nearby-map-expand" aria-label={t.expandMap ?? 'Förstora kartan'} onclick={openNearbyMapFullscreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      {/if}
      <div class:visible={!nearbyMapReady && !nearbyMapError} class="map-skeleton" aria-hidden="true"></div>
      {#if nearbyMapError}<div class="map-fallback"><span>{t.mapUnavailable ?? 'Kartan är inte tillgänglig. Listan fungerar fortfarande.'}</span><button type="button" onclick={retryNearbyMap}>{t.retry ?? 'Försök igen'}</button></div>{/if}
    </div>
    <div class="nearby-content">
      <div class="search-wrap">
        <label for="nearby-search">{t.searchStops ?? 'Sök hållplats'}</label>
        <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5" stroke-linecap="round"/></svg><input id="nearby-search" bind:value={query} oninput={handleSearchInput} placeholder={t.searchPlaceholder ?? 'Sök hållplats'} autocomplete="off" enterkeyhint="search" /></div>
      </div>
      {#if !isSearchMode() && (!locationEnabled || !hasLocation)}
        <div class="location-prompt">
          <div class="prompt-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke-linecap="round"/></svg></div>
          <div class="prompt-copy"><strong>{location.isLoading ? (t.nearbyLocationSearching ?? 'Hämtar plats...') : locationEnabled ? (t.locationServices ?? 'Platstjänster') : (t.locationPromptTitle ?? 'Hitta hållplatser nära dig')}</strong><span>{locationActionMessage ?? (location.isLoading ? (t.waitingForLocation ?? 'Hämtar position...') : locationEnabled ? (location.access === 'denied' || location.access === 'prompt' ? (t.nearbyStopsPermissionDenied ?? 'Tillåt platsåtkomst i webbläsaren.') : (t.nearbyLocationUnavailable ?? 'Plats ej tillgänglig.')) : (t.locationPromptDesc ?? 'Aktivera plats för att sortera efter avstånd.'))}</span></div>
          {#if !location.isLoading}<button type="button" class="primary-action" onclick={useLocation}>{locationEnabled ? (location.access === 'denied' || location.access === 'prompt' ? (t.nearbyLocationPermission ?? 'Allow location') : (t.nearbyLocationTryAgain ?? 'Try location again')) : (t.locationEnableBtn ?? 'Aktivera plats')}</button>{/if}
        </div>
      {/if}
      {#if searching || loading}
        <div class="station-list" aria-busy="true">{#each Array(4) as _, i (i)}<div class="station-skeleton" style={`--i:${i}`} aria-hidden="true"></div>{/each}</div>
      {:else if searchError || (error && !isSearchMode())}
        <div class="state-panel"><strong>{searchError ?? error}</strong><button type="button" onclick={() => isSearchMode() ? void runSearch() : location.position && void loadNearby(location.position)}>{t.retry ?? 'Försök igen'}</button></div>
      {:else if displayedStops.length === 0 && (isSearchMode() || (hasLocation && locationEnabled))}
        <div class="state-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5.5 10 3l4 2.5L20 3v15.5L14 21l-4-2.5-6 2.5V5.5Z" stroke-linejoin="round"/><path d="M10 3v15.5M14 5.5V21"/></svg><strong>{isSearchMode() ? (t.noStops ?? 'Ingen hållplats hittades') : (t.noNearbyStops ?? 'Inga hållplatser nära dig')}</strong></div>
      {:else}
        <div class="station-section-heading"><h2>{isSearchMode() ? (t.searchStops ?? 'Sökresultat') : (t.nearbyTitle ?? 'Nära dig')}</h2><span>{displayedStops.length}</span></div>
        <div class="station-list">
          {#each displayedStops as stop (stop.id)}
            {@const previewState = previews.get(stop.id) ?? { state: 'loading' }}
            <button type="button" class="station-card" class:selected={selectedId === stop.id} data-stop-id={stop.id} onclick={() => selectStop(stop)}>
              <span class="station-mode" aria-hidden="true">
                <TransportIcon type={getTransportType(stop.modes[0])} size={20} />
              </span>
              <span class="station-main"><strong>{stop.name}</strong><span class="station-meta">{stopDistance(stop)}</span><span class="station-preview" class:muted={previewState.state !== 'ready'}>{#if previewState.state === 'ready'}{#each previewState.departures as departure (departure.id)}<StationDepartureCard variant="preview" destination={departure.destination} line={departure.line} transportType={getTransportType(departure.transportMode)} scheduledTime={departure.scheduledTime} countdown={departureLabel(departure)} countdownColor={departureCountdownColor(departure)} />{/each}{:else if previewState.state === 'loading'}<i class="preview-skeleton"></i><i class="preview-skeleton"></i>{:else if previewState.state === 'empty'}{t.noDeparturesAvailable ?? 'Inga kommande avgångar'}{:else}{t.departuresUnavailable ?? 'Avgångar kunde inte läsas in'}{/if}</span></span>
              <svg class="station-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>

<p class="sr-only" aria-live="polite">{locationAnnouncement}</p>

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
  .map-wrap { position: relative; height: 27dvh; min-height: 176px; max-height: 270px; flex: 0 0 auto; overflow: hidden; background: var(--surface-emphasis); --map-control-safe-top: env(safe-area-inset-top, 0px); }
  .map-wrap.nearby-map-fullscreen { position: fixed; z-index: 40; inset: 0; width: auto; height: auto; min-height: 0; max-height: none; border-radius: 0; touch-action: none; }
  .nearby-map-expand, .nearby-map-close { position: absolute; z-index: 3; right: 12px; }
  .nearby-map-expand { top: 12px; }
  .nearby-map-close { top: calc(12px + var(--map-control-safe-top)); }
  .nearby-map-expand { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; background: var(--text); color: var(--surface); cursor: pointer; }
  .nearby-map-expand:focus-visible { outline: 2px solid var(--focus-ring, var(--accent)); outline-offset: 2px; }
  .nearby-map-expand svg { width: 20px; height: 20px; }
  .map-skeleton { position: absolute; inset: 0; z-index: 1; background: var(--surface-emphasis); opacity: 0; pointer-events: none; transition: opacity 150ms ease; }.map-skeleton.visible { opacity: 1; }
  .map-fallback { position: absolute; inset: auto 12px 12px; display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 12px; }.map-fallback button { justify-self: start; min-height: 44px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: var(--text-on-accent); font: inherit; font-weight: 700; }
  .nearby-content, .board-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y pinch-zoom; padding-bottom: calc(18px + env(safe-area-inset-bottom)); }
  .search-wrap { padding: 12px 16px 8px; }.search-wrap label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .search-field { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 13px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); }.search-field svg { width: 19px; height: 19px; flex: 0 0 19px; color: var(--text-secondary); }.search-field input { width: 100%; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 16px; }
  .location-prompt { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: center; margin: 0 16px 10px; padding: 11px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }.prompt-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: var(--accent-subtle); color: var(--accent); }.prompt-icon svg { width: 20px; height: 20px; }.prompt-copy { display: grid; gap: 2px; min-width: 0; }.prompt-copy strong { font-size: 13px; }.prompt-copy span { color: var(--text-secondary); font-size: 11px; line-height: 1.3; }.primary-action { grid-column: 2; justify-self: start; min-height: 44px; padding: 0 12px; border: 0; border-radius: 9px; background: var(--accent); color: var(--text-on-accent); font-size: 13px; font-weight: 700; }
  .station-section-heading { display: flex; align-items: baseline; gap: 8px; padding: 4px 16px 8px; }.station-section-heading h2 { margin: 0; font-size: 15px; font-weight: 750; }.station-section-heading span { color: var(--text-secondary); font-size: 12px; }
  .station-list, .departure-list { display: grid; gap: 8px; padding: 0 16px; }.station-card, .departure-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 11px; align-items: center; width: 100%; min-height: 106px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); text-align: left; }.station-card.selected { border-color: var(--border-strong); background: var(--surface-hover); }.station-mode { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--accent); color: var(--text-on-accent); font-size: 12px; font-weight: 800; }.station-main { display: grid; gap: 3px; min-width: 0; }.station-main > strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.station-main > span { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.station-main .station-meta { font-size: 12px; }.station-main .station-preview { display: grid; grid-template-rows: repeat(2, 24px); gap: 0; min-width: 0; min-height: 48px; color: var(--text); }.station-main .muted { color: var(--text-muted); }.preview-skeleton { display: block; width: min(150px, 88%); height: 9px; align-self: center; border-radius: 999px; background: var(--surface-emphasis); }.station-chevron { width: 19px; height: 19px; color: var(--text-muted); }
  .state-panel, .detail-map-empty { display: grid; place-items: center; gap: 8px; margin: 8px 16px; padding: 24px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-secondary); text-align: center; }.state-panel strong { color: var(--text); font-size: 14px; }.state-panel button, .detail-map-empty button { min-height: 44px; padding: 0 13px; border: 0; border-radius: 9px; background: var(--accent); color: var(--text-on-accent); font-weight: 700; }.state-panel svg, .detail-map-empty svg { width: 24px; height: 24px; }
  .state-panel details { max-width: 100%; color: var(--text-secondary); font-size: 12px; }.state-panel summary { cursor: pointer; }.state-panel details button { margin-top: 8px; }
  .board-status { margin: 0 16px 8px; color: var(--text-secondary); font-size: 12px; }.board-status button { min-height: 32px; margin-left: 8px; padding: 0 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-weight: 700; }.board-disruption { margin: 0 16px 8px; padding: 9px 10px; border-left: 3px solid var(--accent); background: var(--surface-hover); color: var(--text-secondary); font-size: 12px; }
  .board-summary { display: flex; align-items: end; gap: 18px; flex: 0 0 auto; padding: 14px 16px 10px; }.board-summary > div { display: grid; gap: 3px; }.summary-label { color: var(--text-secondary); font-size: 11px; }.board-summary strong { font-size: 15px; }.detail-map-shell { position: relative; height: 210px; min-height: 210px; flex: 0 0 210px; margin: 0 16px 14px; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-emphasis); }.map-distance-label { position: absolute; left: 10px; bottom: 10px; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text-secondary); font-size: 11px; }.map-distance-label strong { color: var(--text); font-size: 12px; }
  .station-board-departure { display: block; min-height: 0; padding: 0; overflow: hidden; }.departure-skeleton, .station-skeleton { min-height: 68px; border: 1px solid var(--border); border-radius: 12px; background: linear-gradient(90deg, var(--bg), var(--surface), var(--bg)); animation: nearby-shimmer 1.3s ease-in-out infinite; animation-delay: calc(var(--i) * 80ms); }.departure-skeleton { min-height: 110px; }
  .directions-action { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin: 0 16px 14px; padding: 0 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; }.directions-action svg { width: 17px; height: 17px; color: #2563EB; }
  @keyframes nearby-shimmer { 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .departure-skeleton, .station-skeleton { animation: none; opacity: .7; } }
  @media (prefers-reduced-motion: reduce) { .map-skeleton { transition: none; } }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
