<script lang="ts">
  import { searchSites, getDepartures, mapProductClassesToTransportTypes } from '../services/slApi';
  import { isSjostadstrafikenStop, getNextDepartures } from '../services/staticTimetable';
  import { getKnownRoutes } from '../services/timetableCache';
  import { getQuickLocation, getMemoizedDistance, formatDistance } from '../services/geo';
import type { SiteSearchResult, Departure } from '../types/departure';
import type { TransportType, Stop, SegmentDirection } from '../types/route';
import { transportIcons } from '../icons/transport';
import { t } from '../stores/localeStore';
import { settingsStore } from '../stores/settingsStore';
import DirectionSelector from './DirectionSelector.svelte';
import { onMount } from 'svelte';

const SEARCH_MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_LOAD_DELAY_MS = 80;
const ALL_TRANSPORT_TYPES: TransportType[] = ['metro', 'train', 'bus', 'boat'];

type TransportFilterOption = 'all' | TransportType;
const TRANSPORT_FILTER_OPTIONS: TransportFilterOption[] = ['all', ...ALL_TRANSPORT_TYPES];

let { 
  onSelect = (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => {}
}: { 
  onSelect?: (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => void
} = $props();

let settings = $derived($settingsStore);
  
interface StopInterface {
  id: string;
  name: string;
  siteId: string;
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function getDistanceSortValue(station: SiteSearchResult): number {
  if (!userLocation || station.lat === undefined || station.lon === undefined) return Infinity;
  return getMemoizedDistance(station.siteId, station.lat, station.lon, userLocation[0], userLocation[1]);
}
  
  let query = $state('');
  let stations = $state<SiteSearchResult[]>([]);
  let allDepartures = $state<Departure[]>([]);
  let userLocation = $state<[number, number] | null>(null);
  let isLoadingLocation = $state(false);
  let recentStops = $state<SiteSearchResult[]>([]);
  let activeTransportTypes = $state<TransportType[]>([...ALL_TRANSPORT_TYPES]);

  // Filtering logic: Enforcement at data level
  let filteredStations = $derived.by(() => {
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    
    if (mode === 'single' && activeType) {
      // Single-select mode: only show stops that support the active transport type
      return stations.filter(s => {
        if (!s.productClasses || s.productClasses.length === 0) return true;
        const types = mapProductClassesToTransportTypes(s.productClasses);
        if (types.length === 0) return true;
        return types.includes(activeType);
      });
    }
    
    // Multi-select mode (default): use activeTransportTypes array
    return stations.filter(s => {
      if (!s.productClasses || s.productClasses.length === 0) return true;
      const types = mapProductClassesToTransportTypes(s.productClasses);
      if (types.length === 0) return true;
      return types.some(t => activeTransportTypes.includes(t));
    });
  });

  let nearbyStops = $derived.by(() => {
    if (!userLocation) return [];
    return recentStops
      .map(s => {
        if (s.lat === undefined || s.lon === undefined) return { ...s, distance: Infinity };
        const dist = getMemoizedDistance(s.siteId, s.lat, s.lon, userLocation![0], userLocation![1]);
        return { ...s, distance: dist };
      })
      .filter(s => s.distance < 2.0) // Within 2km for "nearby"
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  });
  
  let selectedLineDepartures = $derived(allDepartures.filter(d => {
    const isLineMatch = selectedLine && d.line === selectedLine.line;
    if (!isLineMatch) return false;
    
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    
    if (mode === 'single' && activeType) {
      return d.transportType === activeType;
    }
    return activeTransportTypes.includes(d.transportType);
  }));

  let uniqueLinesFiltered = $derived.by(() => {
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    
    const seen = new Set<string>();
    const lines: Departure[] = [];
    for (const d of allDepartures) {
      if (seen.has(d.line)) continue;
      
      if (mode === 'single' && activeType) {
        if (d.transportType !== activeType) continue;
      } else {
        if (!activeTransportTypes.includes(d.transportType)) continue;
      }
      
      seen.add(d.line);
      lines.push(d);
    }
    return lines;
  });
  let selectedLine = $state<Departure | null>(null);

  let selectedStation = $state<SiteSearchResult | null>(null);
  let loading = $state(false);
  let loadingDeps = $state(false);
  let departureError = $state<string | null>(null);
  let step = $state<'search' | 'select' | 'direction'>('search');
  let debounceTimer: ReturnType<typeof setTimeout>;
  let abortController: AbortController | null = null;

  async function handleInput() {
    clearTimeout(debounceTimer);

    if (query.length < SEARCH_MIN_QUERY_LENGTH) {
      stations = [];
      loading = false;
      return;
    }

    debounceTimer = setTimeout(async () => {
      abortController?.abort();
      abortController = new AbortController();

      const minLoadDelay = new Promise(resolve => setTimeout(resolve, MIN_LOAD_DELAY_MS));

      loading = true;
      try {
        const [result] = await Promise.all([
          searchSites(query, abortController.signal),
          minLoadDelay
        ]);

        const normalize = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        const q = normalize(query);
        result.sort((a, b) => {
          const aNorm = normalize(a.name);
          const bNorm = normalize(b.name);
          if (aNorm === q) return -1;
          if (bNorm === q) return 1;
          if (aNorm.startsWith(q)) return -1;
          if (bNorm.startsWith(q)) return 1;

          const distanceA = getDistanceSortValue(a);
          const distanceB = getDistanceSortValue(b);
          if (distanceA !== distanceB) return distanceA - distanceB;

          return a.name.localeCompare(b.name);
        });

      if (isSjostadstrafikenStop(query)) {
          const staticStopKeys: Record<string, string> = {
            'luma': 'Luma brygga',
            'barn': 'Barnängen',
            'henrik': 'Henriksdal'
          };
          const actualName = Object.entries(staticStopKeys).find(([k]) =>
            query.toLowerCase().includes(k)
          )?.[1] || query;

          const staticDeps = getNextDepartures(actualName, 3);
          if (staticDeps.length > 0) {
            const sjostadStation: SiteSearchResult = {
              siteId: 'sjostad-' + actualName.toLowerCase().replace(/\s+/g, '-'),
              name: actualName,
              type: 'stop',
              note: 'Sjöstadstrafiken'
            };
            result.unshift(sjostadStation);
          }
        }

        stations = result;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          if (import.meta.env.DEV) console.error('Search failed:', e);
          stations = [];
        }
      } finally {
        loading = false;
      }
    }, SEARCH_DEBOUNCE_MS);
  }
  
  async function selectStation(station: SiteSearchResult) {
    selectedStation = station;
    step = 'select';
    loadingDeps = true;
    
    // Save to recent stops for "Nearby" feature
    if (!recentStops.some(s => s.siteId === station.siteId)) {
      recentStops = [station, ...recentStops].slice(0, 20);
      localStorage.setItem('nasta_recent_stops', JSON.stringify(recentStops));
    }

    try {
      let rawDeps: Departure[] = [];
      if (station.note === 'Sjöstadstrafiken') {
        rawDeps = getNextDepartures(station.name, 5);
      } else {
        const result = await getDepartures(station.siteId, 240);
        rawDeps = result.departures;
      }

      // Supplement with routes known from timetable cache (covers overnight / off-peak)
      const cachedRoutes = getKnownRoutes(station.siteId);
      for (const route of cachedRoutes) {
        if (!rawDeps.some(d => d.line === route.line && d.direction_code === route.direction_code)) {
          rawDeps.push({
            ...route, lineName: route.lineName, minutes: -1, time: '', predicted: true
          });
        }
      }
      allDepartures = rawDeps;
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to load departures:', e);
      departureError = $t.failedToFetchDepartures;
      allDepartures = [];
    } finally {
      loadingDeps = false;
    }
  }
  
  function handleLineSelect(lineDep: Departure) {
    selectedLine = lineDep;
    step = 'direction';
  }

  function handleDirectionSelect(direction: SegmentDirection) {
    if (!selectedLine || !selectedStation) return;
    onSelect(
      selectedLine.line,
      selectedLine.lineName,
      direction,
      { 
        id: crypto.randomUUID(), 
        name: selectedStation.name, 
        siteId: selectedStation.siteId,
        coord: selectedStation.lat !== undefined && selectedStation.lon !== undefined ? [selectedStation.lat, selectedStation.lon] : undefined,
        productClasses: selectedStation.productClasses
      },
      { id: crypto.randomUUID(), name: direction.destination, siteId: '' },
      selectedLine.transportType
    );
    reset();
  }
  
  function reset() {
    query = '';
    stations = [];
    allDepartures = [];
    selectedStation = null;
    selectedLine = null;
    departureError = null;
    step = 'search';
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    if (mode === 'single' && activeType) {
      activeTransportTypes = [activeType];
    } else {
      activeTransportTypes = [...ALL_TRANSPORT_TYPES];
    }
  }
  
  function goBack() {
    if (step === 'direction') {
      step = 'select';
      selectedLine = null;
    } else {
      step = 'search';
      allDepartures = [];
      selectedStation = null;
    }
  }

  function toggleTransportType(type: TransportType) {
    if (activeTransportTypes.includes(type)) {
      activeTransportTypes = activeTransportTypes.filter(t => t !== type);
      return;
    }
    activeTransportTypes = [...activeTransportTypes, type];
  }

  async function fetchLocationIfEnabled() {
    if (!(settings.walkingEtaEnabled ?? false)) return;
    isLoadingLocation = true;
    userLocation = await getQuickLocation();
    isLoadingLocation = false;
  }

  onMount(async () => {
    if (!(settings.walkingEtaEnabled ?? false)) {
      const recentStored = safeLocalStorageGet('nasta_recent_stops');
      if (recentStored) {
        try {
          recentStops = JSON.parse(recentStored);
        } catch {
          recentStops = [];
        }
      }
      return;
    }

    let shouldFetch = true;
    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        shouldFetch = status.state !== 'denied';
      } catch {
        shouldFetch = true;
      }
    }
    if (shouldFetch) {
      await fetchLocationIfEnabled();
    }

    const recentStored = safeLocalStorageGet('nasta_recent_stops');
    if (recentStored) {
      try {
        recentStops = JSON.parse(recentStored);
      } catch (e) {
        recentStops = [];
      }
    }
  });

  $effect(() => {
    if (!(settings.walkingEtaEnabled ?? false)) {
      userLocation = null;
      return;
    }
    if (!userLocation && !isLoadingLocation) {
      void fetchLocationIfEnabled();
    }
  });
</script>

<div class="segment-search">
  {#if step === 'search'}
<input
        type="text"
        bind:value={query}
        oninput={handleInput}
        placeholder={$t.searchPlaceholder}
        class="search-input"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      />

    {#if nearbyStops.length > 0}
      <div class="anchor-row">
        {#if nearbyStops.length > 0}
          <div class="nearby-label">{$t.nearby}:</div>
          {#each nearbyStops as stop}
             <button class="anchor-btn nearby-btn" onclick={() => selectStation(stop)}>
              {stop.name} <span class="dist-mini">{formatDistance(stop.distance as number)}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
    
    {#if loading}
      <div class="msg">{$t.searching}</div>
    {:else if filteredStations.length > 0}
      <div class="results">
        {#each filteredStations as station}
           <button class="item" onmousedown={() => selectStation(station)}>
            <div class="item-main">
              {#if station.note === 'Sjöstadstrafiken'}
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor"><g>{@html transportIcons.boat}</g></svg>
              {:else}
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor"><g>{@html transportIcons.bus}</g></svg>
              {/if}
              <span class="name">{station.name}</span>
            </div>
            {#if userLocation && station.lat !== undefined && station.lon !== undefined}
              {@const dist = getMemoizedDistance(station.siteId, station.lat, station.lon, userLocation[0], userLocation[1])}
              <span class="distance">{formatDistance(dist)}</span>
            {/if}
            <span class="arrow">→</span>
          </button>
        {/each}
      </div>
    {:else if query.length >= SEARCH_MIN_QUERY_LENGTH}
      <div class="msg">{$t.noStops}</div>
    {/if}
  {:else}
    <div class="departures-view">
      <button class="back" onmousedown={goBack}>
        {$t.back}
      </button>
      <h3>{selectedStation?.name}</h3>
      
      {#if loadingDeps}
        <div class="msg">{$t.loadingDepartures}</div>
      {:else if departureError}
        <div class="error">{departureError}</div>
      {:else if allDepartures.length === 0}
        <div class="msg">{$t.noDepartures}</div>
      {:else if step === 'select'}
        <div class="transport-filter-row" data-testid="transport-filter-row">
          {#if (settings.transportFilterMode ?? 'multi') === 'single'}
            {#each TRANSPORT_FILTER_OPTIONS as type}
              <button
                class="transport-filter-btn"
                class:active={type === 'all' ? !settings.activeTransportType : settings.activeTransportType === type}
                onclick={() => {
                  if (type === 'all') {
                    settingsStore.setActiveTransportType(null);
                    activeTransportTypes = [...ALL_TRANSPORT_TYPES];
                  } else {
                    const transportType = type as TransportType;
                    settingsStore.setActiveTransportType(transportType);
                    activeTransportTypes = [transportType];
                  }
                }}
                aria-label={type === 'all' ? $t.allTransportTypes : type}
                aria-pressed={type === 'all' ? !settings.activeTransportType : settings.activeTransportType === type}
                data-testid={`transport-filter-${type}`}
              >
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor">
                  {#if type === 'all'}
                    {@html transportIcons.bus}
                  {:else}
                    {@html transportIcons[type as TransportType]}
                  {/if}
                </svg>
                <span>{type === 'all' ? $t.allTransportTypes : type}</span>
              </button>
            {/each}
          {:else}
            {#each ALL_TRANSPORT_TYPES as type}
              <button
                class="transport-filter-btn"
                class:active={activeTransportTypes.includes(type)}
                onclick={() => toggleTransportType(type)}
                aria-label={type}
                aria-pressed={activeTransportTypes.includes(type)}
                data-testid={`transport-filter-${type}`}
              >
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor">
                  {@html transportIcons[type]}
                </svg>
                <span>{type}</span>
              </button>
            {/each}
          {/if}
        </div>
        <div class="departures-list">
          {#each uniqueLinesFiltered as dep}
            <button class="dep-item" onmousedown={() => handleLineSelect(dep)}>
              <div class="dep-transport">
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor" class:boat={dep.transportType === 'boat'}>
                  {@html transportIcons[dep.transportType]}
                </svg>
              </div>
              <div class="dep-line">{dep.line}</div>
              <div class="dep-info">
                <span class="dep-dest">{dep.lineName || $t.lineLabel.replace('{line}', dep.line)}</span>
              </div>
              <div class="dep-select">
                {$t.select}
              </div>
            </button>
          {/each}
        </div>
      {:else if step === 'direction'}
        <div class="direction-view">
          <div class="selected-line-header">
            <div class="dep-transport">
              <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor" class:boat={selectedLine?.transportType === 'boat'}>
                {@html transportIcons[selectedLine?.transportType || 'bus']}
              </svg>
            </div>
            <span class="selected-line-number">{selectedLine?.line}</span>
            <span class="selected-line-name">{selectedLine?.lineName || $t.lineLabel.replace('{line}', selectedLine?.line ?? '')}</span>
          </div>
          <DirectionSelector departures={selectedLineDepartures} onSelect={handleDirectionSelect} />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .segment-search {
    margin-bottom: 16px;
  }

  .search-input {
    width: 100%;
    padding: 12px 14px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    font-size: 16px;
    font-family: inherit;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    touch-action: manipulation;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .msg {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
  }

  .anchor-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .anchor-btn {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .error {
    padding: 16px;
    text-align: center;
    color: #dc2626;
    background: #fef2f2;
    border-radius: 8px;
    margin-top: 8px;
  }

  .results {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-top: 4px;
    max-height: 280px;
    overflow-y: auto;
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: 48px;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-size: 15px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: background 150ms cubic-bezier(0.2, 0, 0, 1);
  }

  @media (hover: hover) {
    .item:hover {
      background: var(--border);
    }
  }
  
  .item:active {
    background: var(--accent-subtle);
    transform: scale(0.98);
  }

  .arrow {
    color: var(--accent);
  }

  .item .transport-icon {
    font-size: 16px;
    margin-right: 8px;
  }

  .item .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-main {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .distance {
    font-size: 12px;
    color: var(--text-muted);
    margin-right: 12px;
    font-variant-numeric: tabular-nums;
  }

  .dist-mini {
    opacity: 0.6;
    font-size: 10px;
    margin-left: 4px;
  }

  .nearby-label {
    font-size: 11px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    align-self: center;
    margin-right: 4px;
  }

  .nearby-btn {
    border-color: var(--accent-subtle);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .departures-view {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .back {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 12px;
    padding: 0;
  }

  h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text);
  }

  .departures-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .transport-filter-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }

  .transport-filter-btn {
    min-height: 52px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    text-transform: capitalize;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .transport-filter-btn .transport-icon {
    width: 16px;
    height: 16px;
    color: currentColor;
    fill: currentColor;
  }

  .transport-filter-btn.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .transport-filter-btn:active {
    transform: scale(0.97);
  }

  .dep-item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: all 180ms cubic-bezier(0.2, 0, 0, 1);
    will-change: transform, border-color;
  }

  @media (hover: hover) {
    .dep-item:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
  }
  
  .dep-item:active {
    border-color: var(--accent);
    transform: scale(0.985);
  }

  .dep-line {
    font-weight: 600;
    font-size: 16px;
    min-width: 40px;
    color: var(--text);
  }

  .dep-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--accent-subtle);
  }

  .transport-icon {
    width: 18px;
    height: 18px;
    fill: var(--accent);
  }

  .transport-icon.boat {
    fill: var(--accent);
  }

  .dep-info {
    flex: 1;
  }

  .dep-dest {
    display: block;
    font-size: 15px;
    color: var(--text);
  }

  .dep-select {
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }

   .direction-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 8px;
  }

  .selected-line-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--accent-subtle);
    border-radius: 12px;
  }

  .selected-line-number {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .selected-line-name {
    font-size: 15px;
    color: var(--text-secondary);
    flex: 1;
  }
</style>
