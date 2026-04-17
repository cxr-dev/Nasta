<script lang="ts">
  import { searchSites, getDepartures } from '../services/slApi';
  import { isSjostadstrafikenStop, getNextDepartures } from '../services/staticTimetable';
  import { getKnownRoutes } from '../services/timetableCache';
  import type { SiteSearchResult, Departure } from '../types/departure';
  import type { TransportType, Stop } from '../types/route';
  import { transportIcons } from '../icons/transport';
  import { t } from '../stores/localeStore';
  
  let { 
    onSelect = (line: string, lineName: string, directionText: string, fromStop: Stop, toStop: Stop, transportType: TransportType) => {}
  }: { 
    onSelect?: (line: string, lineName: string, directionText: string, fromStop: Stop, toStop: Stop, transportType: TransportType) => void
  } = $props();
  
  interface Stop {
    id: string;
    name: string;
    siteId: string;
  }
  
  let query = $state('');
  let stations = $state<SiteSearchResult[]>([]);
  let departures = $state<Departure[]>([]);
  let selectedStation = $state<SiteSearchResult | null>(null);
  let loading = $state(false);
  let loadingDeps = $state(false);
  let step = $state<'search' | 'select'>('search');
  let debounceTimer: ReturnType<typeof setTimeout>;
  
  async function handleInput() {
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
      stations = [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      loading = true;
      try {
        stations = await searchSites(query);
        
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
            stations = [sjostadStation, ...stations];
          }
        }
      } catch (e) {
        console.error('Search failed:', e);
        stations = [];
      } finally {
        loading = false;
      }
    }, 200);
  }
  
  async function selectStation(station: SiteSearchResult) {
    selectedStation = station;
    step = 'select';
    loadingDeps = true;
    
    try {
      if (station.note === 'Sjöstadstrafiken') {
        departures = getNextDepartures(station.name, 5);
      } else {
        departures = await getDepartures(station.siteId, 240);
      }
      const seen = new Set<string>();
      departures = departures.filter(d => {
        const key = `${d.line}-${d.directionText}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Supplement with routes known from timetable cache (covers overnight / off-peak)
      const cachedRoutes = getKnownRoutes(station.siteId);
      for (const route of cachedRoutes) {
        const key = `${route.line}-${route.directionText}`;
        if (!seen.has(key)) {
          seen.add(key);
          departures.push({
            ...route, lineName: route.lineName, minutes: -1, time: '', predicted: true
          });
        }
      }
    } catch (e) {
      console.error('Failed to load departures:', e);
      departures = [];
    } finally {
      loadingDeps = false;
    }
  }
  
   async function handleSelect(departure: Departure) {
     // Get real siteId for destination using searchSites
     let destinationSiteId = 'dest-' + departure.destination; // fallback
     try {
       const destinations = await searchSites(departure.destination);
       if (destinations.length > 0) {
         // Use the first matching site's siteId
         destinationSiteId = destinations[0].siteId;
       }
     } catch (e) {
       console.error('Failed to search for destination:', e);
       // Keep fallback siteId
     }
     
     onSelect(
       departure.line,
       departure.lineName,
       departure.directionText,
       { id: crypto.randomUUID(), name: selectedStation!.name, siteId: selectedStation!.siteId },
       { id: crypto.randomUUID(), name: departure.destination, siteId: destinationSiteId },
       departure.transportType
     );
     reset();
   }
  
  function reset() {
    query = '';
    stations = [];
    departures = [];
    selectedStation = null;
    step = 'search';
  }
  
  function goBack() {
    step = 'search';
    departures = [];
  }
</script>

<div class="segment-search">
  {#if step === 'search'}
    <input
      type="text"
      bind:value={query}
      oninput={handleInput}
      placeholder={$t.searchPlaceholder}
      class="search-input"
    />
    
    {#if loading}
      <div class="msg">{$t.searching}</div>
    {:else if stations.length > 0}
      <div class="results">
        {#each stations as station}
          <button class="item" onmousedown={() => selectStation(station)}>
            {#if station.note === 'Sjöstadstrafiken'}
              <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor"><g>{@html transportIcons.boat}</g></svg>
            {:else}
              <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor"><g>{@html transportIcons.bus}</g></svg>
            {/if}
            <span class="name">{station.name}</span>
            <span class="arrow">→</span>
          </button>
        {/each}
      </div>
    {:else if query.length >= 2}
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
      {:else if departures.length === 0}
        <div class="msg">{$t.noDepartures}</div>
      {:else}
        <div class="departures-list">
          {#each departures as dep}
            <button class="dep-item" class:dep-cached={dep.predicted} onmousedown={() => handleSelect(dep)}>
              <div class="dep-transport">
                <svg viewBox="0 0 24 24" class="transport-icon" fill="currentColor" class:boat={dep.transportType === 'boat'}>
                  {@html transportIcons[dep.transportType]}
                </svg>
              </div>
              <div class="dep-line">{dep.line}</div>
              <div class="dep-info">
                <span class="dep-dest">{dep.destination}</span>
                <span class="dep-dir">{dep.directionText}</span>
              </div>
              <div class="dep-select" class:dep-schedule={dep.predicted}>
                {dep.predicted ? $t.schedule ?? 'Tidtabell' : $t.select}
              </div>
            </button>
          {/each}
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
    font-size: 16px;
    font-family: inherit;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .msg {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
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
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-size: 15px;
  }

  .item:hover {
    background: var(--border);
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
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .dep-item:hover {
    border-color: var(--accent);
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

  .dep-dir {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
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
</style>
