<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { isSjostadstrafikenStop } from '../services/staticTimetable';
  
  let { route }: { route: Route } = $props();
  
  let departureData = $state<Map<string, Departure[]>>(new Map());
  
  function getDeparturesForSegment(segment: Segment): Departure[] {
    const allDeps = departureData.get(segment.fromStop.siteId) || [];
    return allDeps.filter(dep => 
      dep.line === segment.line && 
      dep.destination === segment.directionText
    );
  }
  
  function getTransportIcon(type: string): string {
    switch (type) {
      case 'bus': return '🚌';
      case 'train': return '🚆';
      case 'metro': return '🚇';
      case 'boat': return '🚢';
      default: return '🚌';
    }
  }
  
  onMount(() => {
    if (route.segments && route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(siteIds, stopNames, 30000);
        
        const unsub = departureStore.subscribe(data => {
          departureData = data;
        });
        
        return () => unsub();
      }
    }
  });
  
  onDestroy(() => {
    if (route.segments) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      if (siteIds.length > 0) {
        departureStore.stopAutoRefresh();
      }
    }
  });
</script>

<div class="segments-view">
  {#each (route.segments || []) as segment, index (segment.id)}
    {@const deps = getDeparturesForSegment(segment)}
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
        {#if deps.length > 0}
          <div class="dep-header">
            <span class="transport-icon">{getTransportIcon(segment.transportType)}</span>
            <span class="line-num">{segment.line}</span>
            {#if isSjostadstrafikenStop(segment.fromStop.name)}
              <span class="badge">Sjöstadstrafiken</span>
            {/if}
          </div>
          <div class="dep-times">
            {#if deps[0]}
              <div class="dep-next">
                <span class="minutes-large">{deps[0].minutes}</span>
                <span class="min-label">MIN</span>
                <span class="time-subtle">({deps[0].time})</span>
              </div>
            {/if}
            {#if deps[1]}
              <div class="dep-second">
                <span class="minutes-small">{deps[1].minutes}</span>
                <span class="min-label-small">MIN</span>
                <span class="time-subtle">({deps[1].time})</span>
              </div>
            {/if}
          </div>
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
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .dep-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .transport-icon {
    font-size: 18px;
  }

  .line-num {
    font-weight: 600;
    font-size: 16px;
    color: var(--text);
  }

  .badge {
    font-size: 11px;
    background: #0077B6;
    color: #fff;
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: auto;
  }

  .dep-times {
    display: flex;
    gap: 32px;
    align-items: baseline;
  }

  .dep-next,
  .dep-second {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .minutes-large {
    font-size: 48px;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .min-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-left: 2px;
  }

  .minutes-small {
    font-size: 24px;
    font-weight: 500;
    color: var(--text);
    line-height: 1;
  }

  .min-label-small {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
    margin-left: 2px;
  }

  .time-subtle {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .no-departures {
    font-size: 14px;
    color: var(--text-secondary);
  }
</style>
