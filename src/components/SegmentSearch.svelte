<script lang="ts">
  import { transitService } from '../providers/init';
  import { getQuickLocation, getMemoizedDistance, formatDistance } from '../services/geo';
import type { TransitStopSearchResult, TransitDeparture } from '../providers/types';
import type { TransportType, Stop, SegmentDirection } from '../types/page';
import { getT } from '../stores/localeStore.svelte';
import TransportIcon from './TransportIcon.svelte';

  let t = $derived(getT());
import { getSettings, setActiveTransportType } from '../stores/settingsStore.svelte';
import DirectionSelector from './DirectionSelector.svelte';
import { onMount } from 'svelte';
import gsap from 'gsap';

const SEARCH_MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_LOAD_DELAY_MS = 80;
const ALL_TRANSPORT_TYPES: TransportType[] = ['metro', 'train', 'bus', 'boat', 'tram'];

type TransportFilterOption = 'all' | TransportType;
const TRANSPORT_FILTER_OPTIONS: TransportFilterOption[] = ['all', ...ALL_TRANSPORT_TYPES];

let { 
  onSelect = (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => {}
}: { 
  onSelect?: (line: string, lineName: string, direction: SegmentDirection, fromStop: Stop, toStop: Stop, transportType: TransportType) => void
} = $props();

let settings = $derived(getSettings());
  
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

function getDistanceSortValue(station: TransitStopSearchResult): number {
  if (!userLocation || !station.coord) return Infinity;
  return getMemoizedDistance(station.id, station.coord[0], station.coord[1], userLocation[0], userLocation[1]);
}

function getPrimaryType(station: TransitStopSearchResult): TransportType {
  const m = station.modes ?? (station.providerMetadata?.modes as string[] | undefined);
  if (m && m.length > 0) return m[0] as TransportType;
  return 'bus';
}
  
  let query = $state('');
  let stations = $state<TransitStopSearchResult[]>([]);
  let allDepartures = $state<TransitDeparture[]>([]);
  let userLocation = $state<[number, number] | null>(null);
  let isLoadingLocation = $state(false);
  let recentStops = $state<TransitStopSearchResult[]>([]);
  let activeTransportTypes = $state<TransportType[]>([]);

  // Filtering logic: Enforcement at data level
  let filteredStations = $derived.by(() => {
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    
    if (mode === 'single' && activeType) {
      return stations.filter(s => {
        if (!s.modes || s.modes.length === 0) return true;
        return (s.modes as TransportType[]).includes(activeType);
      });
    }
    
    if (activeTransportTypes.length === 0) return stations;
    return stations.filter(s => {
      if (!s.modes || s.modes.length === 0) return true;
      return s.modes.some(m => activeTransportTypes.includes(m as TransportType));
    });
  });

  let nameCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const s of filteredStations) {
      counts[s.name] = (counts[s.name] ?? 0) + 1;
    }
    return counts;
  });

  let nearbyStops = $derived.by(() => {
    if (!userLocation) return [];
    return recentStops
      .map(s => {
        if (!s.coord) return { ...s, distance: Infinity };
        const dist = getMemoizedDistance(s.id, s.coord[0], s.coord[1], userLocation![0], userLocation![1]);
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
      return d.transportMode === (activeType as typeof d.transportMode);
    }
    if (activeTransportTypes.length === 0) return true;
    return activeTransportTypes.includes(d.transportMode as unknown as TransportType);
  }));
  
  let uniqueLinesFiltered = $derived.by(() => {
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    
    const seen = new Set<string>();
    const lines: TransitDeparture[] = [];
    for (const d of allDepartures) {
      if (seen.has(d.line)) continue;
      
      if (mode === 'single' && activeType) {
        if (d.transportMode !== (activeType as typeof d.transportMode)) continue;
      } else if (activeTransportTypes.length > 0) {
        if (!activeTransportTypes.includes(d.transportMode as unknown as TransportType)) continue;
      }
      
      seen.add(d.line);
      lines.push(d);
    }
    return lines;
  });
  let lineDestinations = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const dep of allDepartures) {
      const dests = map.get(dep.line);
      if (dests) {
        if (!dests.includes(dep.destination)) {
          dests.push(dep.destination);
        }
      } else {
        map.set(dep.line, [dep.destination]);
      }
    }
    return map;
  });
  let selectedLine = $state<TransitDeparture | null>(null);

  let selectedStation = $state<TransitStopSearchResult | null>(null);
  let loading = $state(false);
  let loadingDeps = $state(false);
  let departureError = $state<string | null>(null);
  let step = $state<'search' | 'select' | 'direction'>('search');
  let stepIndex = $derived(
    step === 'search' ? 0 : step === 'select' ? 1 : 2
  );
  let searchMode = $derived(
    step !== 'search' ? 'selected' :
    query.length < SEARCH_MIN_QUERY_LENGTH ? 'idle' : 'typing'
  );
  let stepLabels = $derived([t.stepStop, t.stepLine, t.stepDirection]);
  let progressEl = $state<HTMLDivElement | undefined>();
  let contentEl = $state<HTMLDivElement | undefined>();
  let debounceTimer: ReturnType<typeof setTimeout>;
  let abortController: AbortController | null = null;
  let directionStopSequences = $state<Record<number, string[]>>({});
  let stopSequenceAbortController: AbortController | null = null;

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
      const results = await transitService.searchStops(query, abortController.signal);
      
        // Sort by relevance and distance
        const normalize = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        const q = normalize(query);
        results.sort((a, b) => {
          if (a.relevance !== b.relevance) return b.relevance - a.relevance;
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
      
        stations = results;
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
  
  async function selectStation(station: TransitStopSearchResult) {
    selectedStation = station;
    step = 'select';
    loadingDeps = true;
    
    // Save to recent stops for "Nearby" feature
    if (!recentStops.some(s => s.id === station.id)) {
      recentStops = [station, ...recentStops].slice(0, 20);
      localStorage.setItem('nasta_recent_stops', JSON.stringify(recentStops));
    }

    try {
      const rawDeps = await transitService.getDepartures(station.id, station.name, undefined, undefined);
      // Supplement with routes known from timetable cache (covers overnight / off-peak)
      const cachedRoutes = await transitService.getKnownRoutes(station.id, station.name);
      for (const route of cachedRoutes) {
        if (!rawDeps.some(d => d.line === route.line && d.directionCode === route.directionCode)) {
          rawDeps.push({
            id: `${station.id}|${route.line}|${route.directionCode}|cached`,
            stopId: station.id,
            line: route.line,
            lineName: route.lineName,
            destination: route.destination,
            directionCode: route.directionCode,
            transportMode: route.transportMode,
            minutes: -1,
            scheduledTime: '',
            dataSource: 'predicted',
          });
        }
      }
      allDepartures = rawDeps;
      
      // Auto-skip to direction step if only 1 unique line at this stop
      const uniqueLineSet = new Set(allDepartures.map(d => d.line));
      if (uniqueLineSet.size === 1) {
        const onlyLine = allDepartures.find(d => d.line === allDepartures[0].line)!;
        selectedLine = onlyLine;
        step = 'direction';
        void fetchDirectionStopSequences();
        return;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to load departures:', e);
      departureError = t.failedToFetchDepartures;
      allDepartures = [];
    } finally {
      loadingDeps = false;
    }
  }
  
  function handleLineSelect(lineDep: TransitDeparture) {
    selectedLine = lineDep;
    step = 'direction';
    void fetchDirectionStopSequences();
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
        siteId: selectedStation.id,
        coord: selectedStation.coord ?? undefined,
        productClasses: [],
      },
      { id: crypto.randomUUID(), name: direction.destination, siteId: '' },
      selectedLine.transportMode as unknown as TransportType
    );
    reset();
  }
  
  async function fetchDirectionStopSequences() {
    if (!selectedLine || !selectedStation) return;
    
    stopSequenceAbortController?.abort();
    stopSequenceAbortController = new AbortController();
    const signal = stopSequenceAbortController.signal;
    
    const seen = new Set<number>();
    const dirs: Array<{ code: number; dest: string }> = [];
    for (const dep of allDepartures) {
      if (dep.line === selectedLine.line && !seen.has(dep.directionCode)) {
        seen.add(dep.directionCode);
        dirs.push({ code: dep.directionCode, dest: dep.destination });
      }
    }
    
    const results = await Promise.allSettled(
      dirs.map((dir) =>
        transitService.getStopSequence(
          selectedStation!.id,
          dir.dest,
          selectedLine!.line,
          dir.code,
          signal,
        ),
      ),
    );
    
    const newSequences: Record<number, string[]> = {};
    for (let i = 0; i < dirs.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        newSequences[dirs[i].code] = result.value.stops.map(s => s.stopName);
      }
    }
    
    if (Object.keys(newSequences).length > 0) {
      directionStopSequences = newSequences;
    }
  }
  
  function reset() {
    query = '';
    stations = [];
    allDepartures = [];
    directionStopSequences = {};
    stopSequenceAbortController?.abort();
    selectedStation = null;
    selectedLine = null;
    departureError = null;
    step = 'search';
    const mode = settings.transportFilterMode ?? 'multi';
    const activeType = settings.activeTransportType;
    if (mode === 'single' && activeType) {
      activeTransportTypes = [activeType];
    } else {
      activeTransportTypes = [];
    }
  }
  
  function goBack() {
    if (step === 'direction') {
      step = 'select';
      directionStopSequences = {};
      stopSequenceAbortController?.abort();
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

function filterIconType(type: TransportFilterOption): TransportType {
  return type === 'all' ? 'bus' : type;
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
        const parsed: any[] = JSON.parse(recentStored);
        recentStops = parsed.map((s: any) => ({
          // Migrate old SiteSearchResult format to TransitStopSearchResult
          id: s.id || s.siteId || `stale-${crypto.randomUUID()}`,
          name: s.name || '',
          coord: s.coord || (s.lat != null && s.lon != null ? [s.lat, s.lon] : undefined),
          modes: s.modes || (s.productClasses ? [] : []), // old format has no modes
          relevance: s.relevance ?? 50,
          locationType: s.locationType || (s.type || 'stop'),
          providerMetadata: s.providerMetadata ?? (s.siteId ? { siteId: s.siteId } : {}),
        }));
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
        const parsed: any[] = JSON.parse(recentStored);
        recentStops = parsed.map((s: any) => ({
          id: s.id || s.siteId || `stale-${crypto.randomUUID()}`,
          name: s.name || '',
          coord: s.coord || (s.lat != null && s.lon != null ? [s.lat, s.lon] : undefined),
          modes: s.modes || [],
          relevance: s.relevance ?? 50,
          locationType: s.locationType || (s.type || 'stop'),
          providerMetadata: s.providerMetadata ?? (s.siteId ? { siteId: s.siteId } : {}),
        }));
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

  $effect(() => {
    const idx = stepIndex;
    if (!progressEl) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const dot = progressEl.querySelector(`[data-step="${idx}"]`) as HTMLElement | null;
    if (dot) {
      gsap.fromTo(dot, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
    }
    if (idx > 0) {
      const fill = progressEl.querySelector(`[data-connector="${idx - 1}"] .step-connector-fill`) as HTMLElement | null;
      if (fill) {
        gsap.to(fill, { scaleX: 1, duration: 0.25, ease: 'power2.out', transformOrigin: 'left center' });
      }
    }
  });

  $effect(() => {
    if (!contentEl) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const s = step;
    gsap.fromTo(contentEl, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
  });
</script>

<div class="segment-search">
  <div class="step-progress" bind:this={progressEl}>
    {#each stepLabels as label, i}
      <div class="step-node" class:active={stepIndex >= i} class:completed={stepIndex > i}>
        <div class="step-dot" data-step={i}>
          {#if stepIndex > i}
            <svg viewBox="0 0 12 12" width="8" height="8" fill="none"><path d="M3 6l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {/if}
        </div>
        <span class="step-label">{label}</span>
      </div>
      {#if i < 2}
        <div class="step-connector-wrap">
          <div class="step-connector" data-connector={i}>
            <div class="step-connector-fill"></div>
          </div>
        </div>
      {/if}
    {/each}
  </div>
  <div class="step-content" bind:this={contentEl}>
    {#key step}
      {#if step === 'search'}
<input
        type="text"
        bind:value={query}
        oninput={handleInput}
        placeholder={t.searchPlaceholder}
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
          <div class="nearby-label">{t.nearby}:</div>
          {#each nearbyStops as stop (stop.id)}
             <button class="anchor-btn nearby-btn" onclick={() => selectStation(stop)}>
              {stop.name} <span class="dist-mini">{formatDistance(stop.distance as number)}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
    
    {#if searchMode === 'idle' && recentStops.length > 0}
      <div class="recent-section">
        <div class="section-label">{t.recentStops}</div>
        {#each recentStops.slice(0, 5) as stop (stop.id)}
          <button class="item" onclick={() => selectStation(stop)}>
            <div class="item-top-row">
              <div class="item-left">
                <TransportIcon type={getPrimaryType(stop)} size={18} />
                <span class="name">{stop.name}</span>
              </div>
              <div class="item-right">
                {#if userLocation && stop.coord}
                  {@const dist = getMemoizedDistance(stop.id, stop.coord[0], stop.coord[1], userLocation[0], userLocation[1])}
                  <span class="distance">{formatDistance(dist)}</span>
                {/if}
                <span class="arrow">→</span>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {:else if loading}
      <div class="msg">{t.searching}</div>
    {:else if filteredStations.length > 0}
      <div class="results">
        {#each filteredStations as station (station.id)}
          {@const nameCount = nameCounts[station.name] ?? 1}
          {@const modes = station.modes}
          {@const isSjostad = station.id.startsWith('sjostad:')}
          {@const hasNotableTypes = modes.some(t => t === 'boat' || t === 'train')}
          {@const showBadges = isSjostad || hasNotableTypes || nameCount > 1}
          {@const primaryType = getPrimaryType(station)}
          <button class="item" onclick={() => selectStation(station)}>
            <div class="item-top-row">
              <div class="item-left">
                <TransportIcon type={primaryType} size={18} />
                <span class="name">{station.name}</span>
              </div>
              <div class="item-right">
                {#if userLocation && station.coord}
                  {@const dist = getMemoizedDistance(station.id, station.coord[0], station.coord[1], userLocation[0], userLocation[1])}
                  <span class="distance">{formatDistance(dist)}</span>
                {/if}
                <span class="arrow">→</span>
              </div>
            </div>
            {#if showBadges}
              <div class="item-bottom-row">
                {#if showBadges}
                  <div class="badges">
                    {#if isSjostad}
                      <span class="badge-label">Sjöstadstrafiken</span>
                    {/if}
                    {#each modes as mode}
                      <TransportIcon type={mode as import('../types/page').TransportType} size={14} />
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {:else if query.length >= SEARCH_MIN_QUERY_LENGTH}
      <div class="msg">{t.noStops}</div>
    {/if}
  {:else}
    <div class="departures-view">
      <button class="back" onclick={goBack}>
        {t.back}
      </button>
      <h3>{selectedStation?.name}</h3>
      
      {#if loadingDeps}
        <div class="msg">{t.loadingDepartures}</div>
      {:else if departureError}
        <div class="error">{departureError}</div>
      {:else if allDepartures.length === 0}
        <div class="msg">{t.noDepartures}</div>
      {:else if step === 'select'}
        <div class="transport-filter-row" data-testid="transport-filter-row">
          {#if (settings.transportFilterMode ?? 'multi') === 'single'}
            {#each TRANSPORT_FILTER_OPTIONS as type (type)}
              <button
                class="transport-filter-btn"
                class:active={type === 'all' ? !settings.activeTransportType : settings.activeTransportType === type}
                onclick={() => {
                  if (type === 'all') {
                    setActiveTransportType(null);
                    activeTransportTypes = [...ALL_TRANSPORT_TYPES];
                  } else {
                    const transportType = type as TransportType;
                    setActiveTransportType(transportType);
                    activeTransportTypes = [transportType];
                  }
                }}
                aria-label={type === 'all' ? t.allTransportTypes : type}
                aria-pressed={type === 'all' ? !settings.activeTransportType : settings.activeTransportType === type}
                data-testid={`transport-filter-${type}`}
              >
                <TransportIcon type={filterIconType(type)} size={16} />
                <span>{type === 'all' ? t.allTransportTypes : type}</span>
              </button>
            {/each}
          {:else}
            {#each ALL_TRANSPORT_TYPES as type (type)}
              <button
                class="transport-filter-btn"
                class:active={activeTransportTypes.includes(type)}
                onclick={() => toggleTransportType(type)}
                aria-label={type}
                aria-pressed={activeTransportTypes.includes(type)}
                data-testid={`transport-filter-${type}`}
              >
                <TransportIcon type={type} size={16} />
                <span>{type}</span>
              </button>
            {/each}
          {/if}
        </div>
        <div class="departures-list">
          {#each uniqueLinesFiltered as dep (dep.line)}
            {@const dests = lineDestinations.get(dep.line)}
            <button class="dep-item" onclick={() => handleLineSelect(dep)}>
              <div class="dep-transport">
                <TransportIcon type={dep.transportMode as unknown as import('../types/page').TransportType} size={18} />
              </div>
              <div class="dep-line">{dep.line}</div>
              <div class="dep-info">
                <span class="dep-dest">{dep.lineName || t.lineLabel.replace('{line}', dep.line)}</span>
                {#if dests && dests.length > 0}
                  <span class="dep-destinations">{dests.join(' · ')}</span>
                {/if}
              </div>
              <div class="dep-select">
                {t.select}
              </div>
            </button>
          {/each}
        </div>
      {:else if step === 'direction'}
        <div class="direction-view">
          <div class="selected-line-header">
            <div class="dep-transport">
              <TransportIcon type={(selectedLine?.transportMode || 'bus') as unknown as import('../types/page').TransportType} size={18} />
            </div>
            <span class="selected-line-number">{selectedLine?.line}</span>
            <span class="selected-line-name">{selectedLine?.lineName || t.lineLabel.replace('{line}', selectedLine?.line ?? '')}</span>
          </div>
          <DirectionSelector departures={selectedLineDepartures} onSelect={handleDirectionSelect} stopSequences={directionStopSequences} />
        </div>
      {/if}
    </div>
      {/if}
    {/key}
  </div>
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
    flex-direction: column;
    width: 100%;
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

  .item .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .item-bottom-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 2px;
    padding-left: 26px;
  }

  .badges {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .badge-label {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
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
    color: var(--text-secondary);
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

  .recent-section {
    margin-top: 8px;
  }

  .section-label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 8px 0 4px;
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
    color: var(--accent);
  }

  .dep-info {
    flex: 1;
  }

  .dep-dest {
    display: block;
    font-size: 15px;
    color: var(--text);
  }

  .dep-destinations {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
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

  .step-progress {
    display: flex;
    align-items: flex-start;
    padding: 0 0 12px 0;
    width: 100%;
  }

  .step-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .step-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, border-color 0.2s ease, width 0.2s ease, height 0.2s ease;
  }

  .step-node.active .step-dot {
    width: 12px;
    height: 12px;
    background: var(--accent);
    border-color: var(--accent);
  }

  .step-node.completed .step-dot {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--text-on-accent);
  }

  .step-connector-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    padding-top: 4px;
    margin: 0 5px;
  }

  .step-connector {
    height: 2px;
    width: 100%;
    background: var(--border);
    overflow: hidden;
  }

  .step-connector-fill {
    height: 100%;
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: left center;
  }

  .step-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: center;
    transition: color 0.2s ease;
    white-space: nowrap;
  }

  .step-node.active .step-label {
    color: var(--text-secondary);
  }

  .step-node.completed .step-label {
    color: var(--accent);
  }
</style>
