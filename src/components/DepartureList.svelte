<script lang="ts">
  import type { Stop } from '../types/route';
  import type { Departure } from '../types/departure';
  
  let { 
    stops, 
    departures, 
    editing = false,
    onRemoveStop = () => {}
  }: { 
    stops: Stop[];
    departures: Map<string, Departure[]>;
    editing?: boolean;
    onRemoveStop?: (stopId: string) => void;
  } = $props();
  
  function getDeparturesForStop(siteId: string): Departure[] {
    return departures.get(siteId) || [];
  }
</script>

<div class="departure-list">
  {#each stops as stop, index (stop.id)}
    <div class="stop-item">
      {#if editing}
        <button 
          class="remove-btn" 
          onclick={() => onRemoveStop(stop.id)}
          aria-label="Ta bort stopp"
        >
          ×
        </button>
      {/if}
      
      <div class="stop-info">
        <div class="stop-name">{stop.name}</div>
        
        <div class="departures">
          {#each getDeparturesForStop(stop.siteId).slice(0, 3) as dep}
            <div class="departure">
              <span class="line">Buss {dep.line}</span>
              <span class="minutes">{dep.minutes} min</span>
              {#if dep.deviation}
                <span class="delay">+{dep.deviation}</span>
              {/if}
            </div>
          {/each}
          {#if getDeparturesForStop(stop.siteId).length === 0}
            <div class="no-departures">Inga avgångar</div>
          {/if}
        </div>
      </div>
      
      {#if index < stops.length - 1 && stop.travelMinutesToNext !== undefined}
        <div class="travel-time">
          ↓ {stop.travelMinutesToNext} min
        </div>
      {/if}
    </div>
  {/each}
  
  {#if stops.length === 0}
    <div class="empty-state">
      <p>Inga stopp i denna rutt</p>
      <p class="hint">Lägg till stopp för att se avgångar</p>
    </div>
  {/if}
</div>

<style>
  .departure-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stop-item {
    position: relative;
    padding: 16px;
    background: var(--surface);
    border-radius: 8px;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn:hover {
    background: var(--danger);
  }

  .stop-name {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text);
  }

  .departures {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .departure {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }

  .line {
    color: var(--text-secondary);
    min-width: 70px;
  }

  .minutes {
    font-weight: 600;
    font-size: 18px;
    color: var(--text);
  }

  .delay {
    color: var(--danger);
    font-size: 12px;
  }

  .travel-time {
    position: absolute;
    left: 50%;
    bottom: -12px;
    transform: translateX(-50%);
    background: var(--border);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: var(--text-secondary);
    z-index: 1;
  }

  .no-departures {
    color: var(--text-secondary);
    font-size: 13px;
    font-style: italic;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
  }

  .hint {
    font-size: 13px;
    margin-top: 8px;
    color: var(--text-secondary);
  }
</style>
