<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  
  let { route }: { route: Route } = $props();
  
  let departureData = $state<Map<string, Departure[]>>(new Map());
  
  function getDeparturesForSegment(segment: Segment) {
    return departureData.get(segment.fromStop.siteId) || [];
  }
  
  onMount(() => {
    if (route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(siteIds, 30000);
        
        const unsub = departureStore.subscribe(data => {
          departureData = data;
        });
        
        return () => unsub();
      }
    }
  });
  
  onDestroy(() => {
    const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
    if (siteIds.length > 0) {
      departureStore.stopAutoRefresh();
    }
  });
</script>

<div class="segments-view">
  {#each route.segments as segment, index (segment.id)}
    {@const deps = getDeparturesForSegment(segment)}
    {@const nextDep = deps.find(d => d.line === segment.line)}
    <div class="segment-card" class:to-work={route.direction === 'toWork'} class:from-work={route.direction === 'fromWork'}>
      <div class="segment-header">
        <div class="segment-num" class:to-work={route.direction === 'toWork'} class:from-work={route.direction === 'fromWork'}>{index + 1}</div>
        <div class="segment-title">
          <span class="line">{segment.lineName}</span>
          <span class="direction">{segment.directionText}</span>
        </div>
      </div>
      
      <div class="segment-route">
        <span class="from">{segment.fromStop.name}</span>
        <span class="arrow">→</span>
        <span class="to">{segment.toStop.name}</span>
      </div>
      
      <div class="departure-info">
        {#if nextDep}
          <span class="time">{nextDep.minutes} min</span>
          {#if nextDep.deviation}
            <span class="deviation">{nextDep.deviation}</span>
          {/if}
        {:else}
          <span class="no-departures">Ingen avgång</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .segments-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .segment-card {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    transition: border-color 0.2s;
  }

  .segment-card.to-work {
    border-left: 4px solid var(--to-work);
  }

  .segment-card.from-work {
    border-left: 4px solid var(--from-work);
  }

  .segment-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }

  .segment-num {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .segment-num.to-work {
    background: var(--to-work);
  }

  .segment-num.from-work {
    background: var(--from-work);
  }

  .segment-title {
    flex: 1;
  }

  .line {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }

  .direction {
    display: block;
    font-size: 14px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .segment-route {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    color: var(--text-secondary);
    margin-bottom: 16px;
    padding: 12px;
    background: var(--bg);
    border-radius: 8px;
  }

  .arrow {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .departure-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .time {
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.5px;
  }

  .deviation {
    font-size: 12px;
    color: var(--danger);
    background: rgba(220, 38, 38, 0.1);
    padding: 4px 8px;
    border-radius: 6px;
    font-weight: 500;
  }

  .no-departures {
    font-size: 14px;
    color: var(--text-secondary);
  }
</style>