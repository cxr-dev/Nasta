<script lang="ts">
  import type { Route, Stop } from '../types/route';
  import type { SiteSearchResult } from '../types/departure';
  import { routeStore } from '../stores/routeStore';
  import StopSearch from './StopSearch.svelte';
  
  let { route }: { route: Route } = $props();
  
  function addStop(site: SiteSearchResult) {
    const newStop: Stop = {
      id: crypto.randomUUID(),
      name: site.name,
      siteId: site.siteId
    };
    routeStore.addStop(route.id, newStop);
  }
  
  function removeStop(stopId: string) {
    routeStore.removeStop(route.id, stopId);
  }
  
  function updateTravelTime(stopIndex: number, minutes: number) {
    routeStore.setTravelTime(route.id, stopIndex, minutes);
  }
</script>

<div class="route-editor">
  <h2>Redigera: {route.name}</h2>
  
  <StopSearch onSelect={addStop} />
  
  <div class="stops">
    {#each route.stops as stop, index (stop.id)}
      <div class="stop-row">
        <div class="stop-info">
          <span class="stop-name">{stop.name}</span>
          <button 
            class="remove-btn" 
            onclick={() => removeStop(stop.id)}
            aria-label="Ta bort"
          >
            ×
          </button>
        </div>
        
        {#if index < route.stops.length - 1}
          <div class="travel-input">
            <label>
              Restid:
              <input
                type="number"
                min="0"
                max="60"
                value={stop.travelMinutesToNext || 0}
                onchange={(e) => updateTravelTime(index, parseInt((e.target as HTMLInputElement).value) || 0)}
              />
              min
            </label>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if route.stops.length === 0}
      <p class="empty">Lägg till hållplatser ovan</p>
    {/if}
  </div>
</div>

<style>
  .route-editor {
    background: var(--surface);
    border-radius: 12px;
    padding: 20px;
    margin-top: 16px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text);
  }

  .stops {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stop-row {
    background: var(--bg);
    border-radius: 8px;
    padding: 12px;
  }

  .stop-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stop-name {
    font-size: 15px;
    color: var(--text);
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
  }

  .remove-btn:hover {
    background: var(--danger);
  }

  .travel-input {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .travel-input label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .travel-input input {
    width: 50px;
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 14px;
    text-align: center;
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    padding: 20px;
  }
</style>
