<script lang="ts">
  import type { Route, Segment, TransportType } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { transportIcons, transportLabels } from '../icons/transport';

  let { route }: { route: Route } = $props();

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let now = $state(Date.now());

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  function getDeparturesForSegment(segment: Segment): Departure[] {
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];
    // For buses, lineName might be empty so match by line number only
    if (!segment.lineName || segment.lineName.trim() === '') {
      return allDeps.filter(dep => dep.line === segment.line);
    }
    return allDeps.filter(dep =>
      dep.line === segment.line &&
      dep.destination === segment.directionText
    );
  }

  function getLiveMinutes(dep: Departure): number {
    if (dep.expectedAt !== undefined) {
      return Math.max(0, Math.floor((dep.expectedAt - now) / 60000));
    }
    return dep.minutes;
  }

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  function getTransportLabel(type: TransportType): string {
    return transportLabels[type] ?? 'Transport';
  }

  function formatSubsequent(deps: Departure[]): string | null {
    const subsequent = deps.slice(1, 3).filter(Boolean);
    if (subsequent.length === 0) return null;
    return subsequent.map(d => `${getLiveMinutes(d)}`).join(' · ');
  }

  onMount(() => {
    const unsub = departureStore.subscribe(data => {
      departureData = data;
    });
    UNSUBSCRIBERS.push(unsub);

    clockTimer = setInterval(() => {
      now = Date.now();
      // Trigger immediate refresh if any leading departure has hit 0
      const segments = route.segments ?? [];
      const needsRefresh = segments.some(segment => {
        const deps = getDeparturesForSegment(segment);
        return deps.length > 0 && deps[0].expectedAt !== undefined && getLiveMinutes(deps[0]) === 0;
      });
      if (needsRefresh) {
        const siteIds = segments.map(s => s.fromStop.siteId).filter(Boolean);
        const stopNames = new Map(segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
        departureStore.refresh(siteIds, stopNames);
      }
    }, 1000);
  });

  onDestroy(() => {
    UNSUBSCRIBERS.forEach(fn => fn());
    if (clockTimer) clearInterval(clockTimer);
  });
</script>

<div class="departures-list">
  {#each (route.segments ?? []) as segment, index (segment.id)}
    {@const deps = getDeparturesForSegment(segment)}
    {@const subsequent = formatSubsequent(deps)}
    {@const hasDeparture = deps.length > 0 && deps[0]}
    {@const liveMinutes = hasDeparture ? getLiveMinutes(deps[0]) : 0}

    <div class="departure-row" style="--delay: {Math.min(index, 3) * 40}ms">
      <div class="row-left">
        <div class="transport-badge" data-type={segment.transportType}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <g>{@html getTransportIcon(segment.transportType)}</g>
          </svg>
        </div>
        
        <div class="line-details">
          <span class="line-info">{segment.lineName || segment.line}</span>
          <span class="stop-route">
            {segment.fromStop.name} → {segment.directionText}
          </span>
        </div>
      </div>

      <div class="row-right">
        {#if hasDeparture}
          <div class="time-stack">
            <div class="primary-time">
              <span class="minutes">{liveMinutes}</span>
              <span class="unit">min</span>
            </div>
            <div class="secondary-time">
              <span class="clock">{deps[0].time}</span>
              {#if subsequent}
                <span class="more">· {subsequent}</span>
              {/if}
            </div>
          </div>
        {:else}
          <div class="no-departure">—</div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .departures-list {
    display: flex;
    flex-direction: column;
    padding: 12px 0 20px;
  }

  .departure-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 0;
    border-bottom: 1px solid var(--border);
    animation: rowIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--delay, 0ms);
    contain: layout paint style;
  }

  @keyframes rowIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .departure-row:last-child {
    border-bottom: none;
  }

  .row-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding-right: 12px;
  }

  .transport-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    flex-shrink: 0;
    transition: transform 200ms ease;
  }

  .transport-badge svg {
    width: 20px;
    height: 20px;
  }

  .transport-badge {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .line-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .line-info {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stop-route {
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-right {
    flex-shrink: 0;
    text-align: right;
  }

  .time-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .primary-time {
    display: flex;
    align-items: baseline;
    gap: 4px;
    line-height: 1;
  }

  .minutes {
    font-family: 'Neue Machina', sans-serif;
    font-size: 68px;
    font-weight: 800;
    letter-spacing: -4px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  .unit {
    font-size: 16px;
    font-weight: 500;
    color: var(--accent);
    opacity: 0.5;
    padding-bottom: 10px;
  }

  .secondary-time {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .more {
    color: var(--text-muted);
    font-size: 12px;
  }

  .no-departure {
    font-family: 'Neue Machina', sans-serif;
    font-size: 48px;
    font-weight: 300;
    color: var(--text-ghost);
    letter-spacing: 0;
    line-height: 1;
  }
</style>
