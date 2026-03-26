<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { isSjostadstrafikenStop } from '../services/staticTimetable';
  import { transportIcons } from '../icons/transport';
  
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
    return transportIcons[type as keyof typeof transportIcons] || transportIcons.bus;
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
        <div class="segment-icon" class:to-work={route.direction === 'toWork'} class:from-work={route.direction === 'fromWork'}>
          <svg viewBox="0 0 24 24" class="transport-icon">
            <g>{@html getTransportIcon(segment.transportType)}</g>
          </svg>
          <span class="line-num-header">{segment.line}</span>
        </div>
        <div class="segment-title">
          <span class="from-to">{segment.fromStop.name} → {segment.toStop.name}</span>
        </div>
      </div>
      
      <div class="departure-info">
        {#if deps.length > 0}
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
    gap: 12px;
    margin-bottom: 16px;
  }

  .segment-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    flex-shrink: 0;
  }

  .segment-icon.to-work {
    background: var(--to-work);
  }

  .segment-icon.from-work {
    background: var(--from-work);
  }

  .segment-icon .transport-icon {
    width: 20px;
    height: 20px;
    fill: #fff;
  }

  .segment-icon .line-num-header {
    font-size: 10px;
    font-weight: 700;
    color: #fff;
  }

  .segment-title {
    flex: 1;
    min-width: 0;
  }

  .from-to {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .departure-info {
    padding-top: 16px;
    border-top: 1px solid var(--border);
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
    font-size: 56px;
    font-weight: 700;
    color: var(--text);
    line-height: 0.9;
    letter-spacing: -2px;
  }

  .min-label {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .minutes-small {
    font-size: 28px;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1;
  }

  .min-label-small {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .time-subtle {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .no-departures {
    font-size: 14px;
    color: var(--text-secondary);
  }
</style>
