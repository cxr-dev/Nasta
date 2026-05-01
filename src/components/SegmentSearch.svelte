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

let { 
  onSelect = (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => {}
}: { 
  onSelect?: (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => void
} = $props();
  
interface StopInterface {
  id: string;
  name: string;
  siteId: string;
}
  
  let query = $state('');
  let stations = $state<SiteSearchResult[]>([]);
  let allDepartures = $state<Departure[]>([]);
  let userLocation = $state<[number, number] | null>(null);
  let recentStops = $state<SiteSearchResult[]>([]);

  // Filtering logic: Enforcement at data level
  let filteredStations = $derived.by(() => {
    const enabled = settings.enabledTransportTypes || ['bus', 'train', 'metro', 'boat'];
    return stations.filter(s => {
      if (!s.productClasses || s.productClasses.length === 0) return true; // Allow if unknown
      const types = mapProductClassesToTransportTypes(s.productClasses);
      return types.some(t => enabled.includes(t));
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
    const enabled = settings.enabledTransportTypes || ['bus', 'train', 'metro', 'boat'];
    return enabled.includes(d.transportType);
  }));

  let uniqueLinesFiltered = $derived.by(() => {
    const enabled = settings.enabledTransportTypes || ['bus', 'train', 'metro', 'boat'];
    const seen = new Set<string>();
    const lines: Departure[] = [];
    for (const d of allDepartures) {
      if (!seen.has(d.line) && enabled.includes(d.transportType)) {
        seen.add(d.line);
        lines.push(d);
      }
    }
    return lines;
  });
  let selectedLine = $state<Departure | null>(null);

  let selectedStation = $state<SiteSearchResult | null>(null);
  let loading = $state(false);
  let loadingDeps = $state(false);
  let departureError = $state<string | null>(null);
  let settings = $derived($settingsStore);
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

  function applyAnchor(value: string) {
    query = value;
    handleInput();
  }

  onMount(async () => {
    userLocation = await getQuickLocation();
    const stored = localStorage.getItem('nasta_recent_stops');
    if (stored) {
      try {
        recentStops = JSON.parse(stored);
      } catch (e) {
        recentStops = [];
      }
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

    {#if settings.homeAnchor || settings.workAnchor || nearbyStops.length > 0}
      <div class="anchor-row">
        {#if settings.homeAnchor}
          <button class="anchor-btn" onclick={() => applyAnchor(settings.homeAnchor)}>
            Hemma
          </button>
        {/if}
        {#if settings.workAnchor}
          <button class="anchor-btn" onclick={() => applyAnchor(settings.workAnchor)}>
            Jobb
          </button>
        {/if}
        {#if nearbyStops.length > 0}
          <div class="nearby-label">{$t.nearby || "Nära dig"}:</div>
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
        <div class="departures-list">
          {#each uniqueLinesFiltered as dep}
            <button class="dep-item" class:dep-cached={dep.predicted} onmousedown={() => handleLineSelect(dep)}>
              <div class="dep-transport">
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor" class:boat={dep.transportType === 'boat'}>
                  {@html transportIcons[dep.transportType]}
                </svg>
              </div>
              <div class="dep-line">{dep.line}</div>
              <div class="dep-info">
                <span class="dep-dest">{dep.lineName || `Linje ${dep.line}`}</span>
              </div>
              <div class="dep-select">
                {$t.select ?? 'Välj'}
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
            <span class="selected-line-name">{selectedLine?.lineName || `Linje ${selectedLine?.line}`}</span>
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

  .dep-cached {
    opacity: 0.7;
  }

  .dep-schedule {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
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
