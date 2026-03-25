<script lang="ts">
  import type { Route, Stop } from '../types/route';
  import type { SiteSearchResult } from '../types/departure';
  import { routeStore } from '../stores/routeStore';
  import StopSearch from './StopSearch.svelte';
  
  export let route: Route;
  
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
            on:click={() => removeStop(stop.id)}
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
                on:change={(e) => updateTravelTime(index, parseInt(e.currentTarget.value) || 0)}
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
    background: #111;
    border-radius: 16px;
    padding: 20px;
    margin-top: 16px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .stops {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stop-row {
    background: #1a1a1a;
    border-radius: 10px;
    padding: 12px;
  }

  .stop-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stop-name {
    font-size: 15px;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: #333;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
  }

  .remove-btn:hover {
    background: #c00;
  }

  .travel-input {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #222;
  }

  .travel-input label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #888;
  }

  .travel-input input {
    width: 50px;
    padding: 4px 8px;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    text-align: center;
  }

  .empty {
    text-align: center;
    color: #555;
    font-size: 14px;
    padding: 20px;
  }
</style>
