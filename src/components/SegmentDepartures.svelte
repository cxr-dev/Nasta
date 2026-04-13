<script lang="ts">
  import type { Route, Segment, TransportType } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { getPredictedDepartures } from '../services/timetableCache';
  import { getLiveMinutes, mergeDeparturesWithPredictions } from '../lib/departureDisplay';
  import { onMount, onDestroy } from 'svelte';
  import { transportIcons, transportLabels } from '../icons/transport';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import DepartureStrip from './DepartureStrip.svelte';

  let { route }: { route: Route } = $props();

  let departureData = $state<Map<string, Departure[]>>(new Map());
  let now = $state(Date.now());
  let expandedIndex = $state<number | null>(null);

  // Collapse when route changes
  $effect(() => {
    route.id;
    expandedIndex = null;
  });

  function toggleExpanded(index: number) {
    expandedIndex = expandedIndex === index ? null : index;
  }

  const UNSUBSCRIBERS: Array<() => void> = [];
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  function getDeparturesForSegment(segment: Segment): Departure[] {
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];
    const live = !segment.lineName || segment.lineName.trim() === ''
      ? allDeps.filter(dep => dep.line === segment.line)
      : allDeps.filter(dep =>
          dep.line === segment.line &&
          dep.directionText === segment.directionText
        );

    if (live.length >= 3) return live;

    // Supplement sparse/empty live data with cached timetable predictions
    const predicted = getPredictedDepartures(
      segment.fromStop.siteId, segment.line, segment.directionText, 3
    );
    if (!predicted.length) return live;

    return mergeDeparturesWithPredictions(live, predicted, 5);
  }

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  function getTransportLabel(type: TransportType): string {
    return transportLabels[type] ?? 'Transport';
  }

  function formatSubsequent(deps: Departure[]): string | null {
    const subsequent = deps.slice(1, 3).filter(d => d.time);
    if (subsequent.length === 0) return null;
    return subsequent.map(d => d.time).join(' · ');
  }

  // Recomputes only when departureData or route.segments changes — not on every clock tick
  let segmentDeps = $derived(
    (route.segments ?? []).map(seg => getDeparturesForSegment(seg))
  );

  onMount(() => {
    const unsub = departureStore.subscribe(data => {
      departureData = data;
    });
    UNSUBSCRIBERS.push(unsub);

    clockTimer = setInterval(() => {
      if (document.hidden) return;
      now = Date.now();
      // Trigger immediate refresh if any leading departure has hit 0
      const segments = route.segments ?? [];
      const needsRefresh = segments.some((segment, i) => {
        const deps = segmentDeps[i] ?? [];
        return deps.length > 0 && deps[0].expectedAt !== undefined && getLiveMinutes(deps[0], now) === 0;
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
    {@const deps = segmentDeps[index] ?? []}
    {@const departure = deps[0]}
    {@const subsequent = formatSubsequent(deps)}
    {@const hasDeparture = deps.length > 0 && !!departure}
    {@const liveMinutes = hasDeparture ? getLiveMinutes(departure, now) : 0}
    {@const isExpanded = expandedIndex === index}

    {#if hasDeparture}
    <button
      class="departure-row"
      class:expandable={hasDeparture}
      class:expanded={isExpanded}
      type="button"
      aria-expanded={isExpanded}
      onclick={() => toggleExpanded(index)}
      style="--delay: {Math.min(index, 3) * 40}ms"
    >
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
        <div class="time-stack" class:predicted={departure.predicted === true}>
          <div class="primary-time">
            {#if departure.predicted === true}<span class="tilde">~</span>{/if}
            <span class="minutes">{liveMinutes}</span>
            <span class="unit">min</span>
          </div>
          <div class="secondary-time">
            <span class="clock">{departure.time}</span>
            {#if subsequent}
              <span class="more">· {subsequent}</span>
            {/if}
          </div>
        </div>
      </div>
    </button>
    {:else}
    <div
      class="departure-row"
      style="--delay: {Math.min(index, 3) * 40}ms"
    >
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
        <div class="no-departure">—</div>
      </div>
    </div>
    {/if}

    <!-- Strip is a SIBLING of departure-row to avoid CSS contain clipping -->
    {#if isExpanded && hasDeparture}
      <div transition:slide={{ duration: 280, easing: cubicOut }}>
        <DepartureStrip
          {departure}
          {segment}
          onError={() => { expandedIndex = null; }}
        />
      </div>
    {/if}
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
    width: 100%;
    background: transparent;
    border-left: none;
    border-right: none;
    border-top: none;
    text-align: left;
  }

  .departure-row.expandable {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 120ms ease;
  }

  .departure-row.expandable:active {
    opacity: 0.7;
  }

  /* Remove bottom border when strip is open below */
  .departure-row.expanded {
    border-bottom: none;
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

  /* Predicted (timetable) departures are muted — not live-confirmed */
  .time-stack.predicted .minutes,
  .time-stack.predicted .unit {
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .tilde {
    font-family: 'Neue Machina', sans-serif;
    font-size: 32px;
    font-weight: 300;
    color: var(--text-secondary);
    opacity: 0.6;
    padding-bottom: 12px;
    margin-right: -4px;
    letter-spacing: 0;
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
