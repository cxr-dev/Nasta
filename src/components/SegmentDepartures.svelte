<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { transportIcons } from '../icons/transport';
  
  let { route }: { route: Route } = $props();
  
  let departureData = $state<Map<string, Departure[]>>(new Map());
  let visibleCards = $state<Set<string>>(new Set());
  
  const UNSUBSCRIBERS: Array<() => void> = [];
  
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

  function getTravelTime(segment: Segment): string {
    const walkTime = Math.floor(Math.random() * 8) + 2;
    const rideTime = Math.floor(Math.random() * 15) + 10;
    return `${walkTime + rideTime} min`;
  }
  
  onMount(() => {
    if (route.segments && route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
      if (siteIds.length > 0) {
        const unsub = departureStore.subscribe(data => {
          departureData = data;
        });
        UNSUBSCRIBERS.push(unsub);
      }
    }
  });
  
  onDestroy(() => {
    UNSUBSCRIBERS.forEach(fn => fn());
  });

  const getTransportColor = (type: string, direction: string): string => {
    const baseColor = direction === 'toWork' ? 'var(--to-work)' : 'var(--from-work)';
    return baseColor;
  };
</script>

<div class="segments-view">
  {#each (route.segments || []) as segment, index (segment.id)}
    {@const deps = getDeparturesForSegment(segment)}
    {@const delayBadge = deps[0] ? getDelayBadge(deps[0]) : null}
    <div 
      class="departure-card"
      class:to-work={route.direction === 'toWork'} 
      class:from-work={route.direction === 'fromWork'}
      class:delayed={delayBadge !== null}
      in:fly={{ y: 30, duration: 350, delay: index * 80, easing: (x) => 1 - Math.pow(1 - x, 3) }}
    >
      <div class="card-left">
        <div 
          class="transport-pill"
          style="background: {getTransportColor(segment.transportType, route.direction || 'toWork')}"
        >
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
          <span class="stop-name">{segment.fromStop.name}</span>
          <svg class="arrow" viewBox="0 0 24 24" width="14" height="14">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" fill="currentColor"/>
          </svg>
          <span class="stop-name">{segment.toStop.name}</span>
          <span class="travel-time">{getTravelTime(segment)}</span>
        </div>
      </div>
      
      <div class="card-right">
        {#if deps.length > 0 && deps[0]}
          <div class="departure-primary {getMinutesClass(deps[0].minutes)}" class:delayed={delayBadge !== null}>
            <span class="minutes">{deps[0].minutes}</span>
            <span class="min-label">min</span>
          </div>
          {#if delayBadge}
            <span class="delay-badge">{delayBadge}</span>
          {/if}
          {#if deps[1]}
            <div class="departure-secondary">
              <span class="next-time">{deps[1].minutes} min</span>
              <span class="planned-time">({deps[1].time})</span>
            </div>
          {/if}
        {:else}
          <div class="no-departures">
            <span class="dash">--</span>
          </div>
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
    padding: 4px 0;
  }

  .departure-card {
    background: var(--surface, #FFFFFF);
    border: 1px solid var(--border, #E5E7EB);
    border-radius: 20px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    transition: all 0.2s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    position: relative;
    overflow: hidden;
  }

  .departure-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
  }

  .departure-card.to-work::before {
    background: var(--to-work, #2563EB);
  }

  .departure-card.from-work::before {
    background: var(--from-work, #059669);
  }

  .departure-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .departure-card.delayed {
    animation: softGlow 2.5s ease-in-out infinite;
  }

  @keyframes softGlow {
    0%, 100% {
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.08);
    }
    50% {
      box-shadow: 0 2px 16px rgba(220, 38, 38, 0.2);
    }
  }

  .card-left {
    flex-shrink: 0;
  }

  .transport-pill {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .transport-pill .transport-icon {
    width: 24px;
    height: 24px;
    fill: #fff;
  }

  .card-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .line-destination {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .line-number {
    background: var(--text, #1F2937);
    color: var(--surface, #FFFFFF);
    font-size: 14px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 8px;
    min-width: 32px;
    text-align: center;
  }

  .destination {
    font-size: 16px;
    font-weight: 600;
    color: var(--text, #1F2937);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .route-info {
    font-size: 13px;
    color: var(--text-secondary, #6B7280);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .stop-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 80px;
  }

  .arrow {
    color: var(--text-secondary, #6B7280);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .travel-time {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-secondary, #6B7280);
    background: var(--border, #E5E7EB);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .card-right {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    min-width: 70px;
    position: relative;
  }

  .departure-primary {
    display: flex;
    align-items: baseline;
    gap: 2px;
    line-height: 1;
  }

  .departure-primary.urgent .minutes {
    color: #DC2626;
  }

  .departure-primary.soon .minutes {
    color: #F59E0B;
  }

  .departure-primary.normal .minutes {
    color: var(--text, #1F2937);
  }

  .minutes {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: -3px;
    line-height: 1;
  }

  .min-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary, #6B7280);
  }

  .delay-badge {
    position: absolute;
    top: 0;
    right: 0;
    background: #DC2626;
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 10px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
  }

  .departure-secondary {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-top: 2px;
  }

  .next-time {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-secondary, #6B7280);
  }

  .planned-time {
    font-size: 12px;
    color: var(--text-secondary, #6B7280);
    opacity: 0.7;
  }

  .no-departures {
    text-align: right;
  }

  .dash {
    font-size: 36px;
    font-weight: 300;
    color: var(--text-secondary, #6B7280);
  }

  @media (prefers-reduced-motion: reduce) {
    .departure-card {
      animation: none;
      transition: none;
    }
  }

  @media (max-width: 380px) {
    .minutes {
      font-size: 40px;
    }
    
    .transport-pill {
      width: 42px;
      height: 42px;
    }
    
    .transport-pill .transport-icon {
      width: 20px;
      height: 20px;
    }
  }
</style>