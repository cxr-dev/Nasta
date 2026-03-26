<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { transportIcons } from '../icons/transport';
  
  let { route }: { route: Route } = $props();
  
  let departureData = $state<Map<string, Departure[]>>(new Map());
  let visibleCards = $state<Set<string>>(new Set());
  
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
  
  function getMinutesClass(minutes: number): string {
    if (minutes <= 2) return 'urgent';
    if (minutes <= 5) return 'soon';
    return 'normal';
  }
  
  function getDelayBadge(departure: Departure): string | null {
    if (departure.deviation && parseInt(departure.deviation) > 0) {
      return `+${departure.deviation} min`;
    }
    return null;
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
    <div 
      class="segment-card" 
      class:to-work={route.direction === 'toWork'} 
      class:from-work={route.direction === 'fromWork'}
      in:fly={{ y: 20, duration: 300, delay: index * 80 }}
    >
      <div class="card-left">
        <div class="transport-pill" class:to-work={route.direction === 'toWork'} class:from-work={route.direction === 'fromWork'}>
          <svg viewBox="0 0 24 24" class="transport-icon">
            <g>{@html getTransportIcon(segment.transportType)}</g>
          </svg>
        </div>
      </div>
      
      <div class="card-center">
        <div class="line-destination">
          <span class="line-number">{segment.line}</span>
          <span class="destination">{segment.directionText}</span>
        </div>
        <div class="route-info">
          <span class="from-stop">{segment.fromStop.name}</span>
          <span class="arrow">→</span>
          <span class="to-stop">{segment.toStop.name}</span>
        </div>
      </div>
      
      <div class="card-right">
        {#if deps.length > 0 && deps[0]}
          {@const delayBadge = getDelayBadge(deps[0])}
          <div class="departure-primary {getMinutesClass(deps[0].minutes)}" class:delayed={delayBadge}>
            <span class="minutes">{deps[0].minutes}</span>
            <span class="min-label">min</span>
            {#if delayBadge}
              <span class="delay-badge">{delayBadge}</span>
            {/if}
          </div>
          {#if deps[1]}
            <div class="departure-secondary">
              <span class="minutes-small">{deps[1].minutes}</span>
              <span class="time-planned">({deps[1].time})</span>
            </div>
          {/if}
        {:else}
          <span class="no-departures">--</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .segments-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .segment-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s ease-out;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .segment-card.to-work {
    border-left: 4px solid var(--to-work);
  }

  .segment-card.from-work {
    border-left: 4px solid var(--from-work);
  }

  .card-left {
    flex-shrink: 0;
  }

  .transport-pill {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .transport-pill.to-work {
    background: var(--to-work);
  }

  .transport-pill.from-work {
    background: var(--from-work);
  }

  .transport-pill .transport-icon {
    width: 22px;
    height: 22px;
    fill: #fff;
  }

  .card-center {
    flex: 1;
    min-width: 0;
  }

  .line-destination {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .line-number {
    background: var(--text);
    color: var(--surface);
    font-size: 14px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .destination {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .route-info {
    font-size: 13px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .route-info .arrow {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .from-stop,
  .to-stop {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  .card-right {
    flex-shrink: 0;
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .departure-primary {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .departure-primary.urgent .minutes {
    color: #DC2626;
  }

  .departure-primary.soon .minutes {
    color: #F59E0B;
  }

  .departure-primary.normal .minutes {
    color: var(--text);
  }

  .departure-primary.delayed {
    animation: softGlow 2s ease-in-out infinite;
  }

  @keyframes softGlow {
    0%, 100% {
      box-shadow: 0 0 0 rgba(220, 38, 38, 0);
    }
    50% {
      box-shadow: 0 0 12px rgba(220, 38, 38, 0.3);
    }
  }

  .minutes {
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -2px;
  }

  .min-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .delay-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #DC2626;
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 8px;
  }

  .departure-secondary {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .minutes-small {
    font-size: 20px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .time-planned {
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .no-departures {
    font-size: 24px;
    color: var(--text-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    .segment-card {
      animation: none;
    }
  }
</style>
