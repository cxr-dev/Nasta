<script lang="ts">
  import type { Route, Segment, TransportType } from '../types/route';
  import { departureStore, type Departure } from '../stores/departureStore';
  import { onMount, onDestroy } from 'svelte';
  import { transportIcons } from '../icons/transport';

  let { route }: { route: Route } = $props();

  let departureData = $state<Map<string, Departure[]>>(new Map());

  const UNSUBSCRIBERS: Array<() => void> = [];

  function getDeparturesForSegment(segment: Segment): Departure[] {
    const allDeps = departureData.get(segment.fromStop.siteId) ?? [];
    return allDeps.filter(dep =>
      dep.line === segment.line &&
      dep.destination === segment.directionText
    );
  }

  function getLineBadge(transportType: TransportType, line: string): string {
    switch (transportType) {
      case 'metro': return `T${line}`;
      case 'train': return `J${line}`;
      default: return line;
    }
  }

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  function formatSedan(deps: Departure[]): string | null {
    const subsequent = deps.slice(1, 3).filter(Boolean);
    if (subsequent.length === 0) return null;
    return 'sedan ' + subsequent.map(d => `${d.minutes} min`).join(' · ');
  }

  // Strip gradient per transport type
  const STRIP_COLORS: Record<TransportType, { from: string; to: string }> = {
    metro: { from: '#1E40AF', to: '#3B82F6' },
    bus:   { from: '#065F46', to: '#10B981' },
    train: { from: '#713F12', to: '#D97706' },
    boat:  { from: '#0E7490', to: '#06B6D4' }
  };

  // Badge colors per transport type
  const BADGE_COLORS: Record<TransportType, { bg: string; text: string }> = {
    metro: { bg: '#EFF3FF', text: '#2563EB' },
    bus:   { bg: '#F0FDF4', text: '#059669' },
    train: { bg: '#FFFBEB', text: '#D97706' },
    boat:  { bg: '#ECFEFF', text: '#0891B2' }
  };

  onMount(() => {
    const unsub = departureStore.subscribe(data => {
      departureData = data;
    });
    UNSUBSCRIBERS.push(unsub);
  });

  onDestroy(() => {
    UNSUBSCRIBERS.forEach(fn => fn());
  });
</script>

<div class="segments-view">
  {#each (route.segments ?? []) as segment, index (segment.id)}
    {@const deps = getDeparturesForSegment(segment)}
    {@const strip = STRIP_COLORS[segment.transportType] ?? STRIP_COLORS.bus}
    {@const badge = BADGE_COLORS[segment.transportType] ?? BADGE_COLORS.bus}
    {@const sedan = formatSedan(deps)}

    <div
      class="card"
      style="--delay: {index * 60}ms"
    >
      <!-- Left strip -->
      <div
        class="strip"
        style="background: linear-gradient(175deg, {strip.from}, {strip.to})"
      >
        <div class="strip-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
            <g>{@html getTransportIcon(segment.transportType)}</g>
          </svg>
        </div>
      </div>

      <!-- Card body -->
      <div class="body">
        <div class="row1">
          <div class="meta">
            <div class="transport-name">{segment.lineName}</div>
            <div class="direction">→ {segment.directionText}</div>
            <div
              class="badge"
              style="background: {badge.bg}; color: {badge.text}"
            >{getLineBadge(segment.transportType, segment.line)}</div>
          </div>

          {#if deps.length > 0 && deps[0]}
            <div class="departure">
              <span class="dep-num">{deps[0].minutes}</span>
              <span class="dep-unit">min</span>
            </div>
          {:else}
            <div class="departure">
              <span class="dep-num no-dep">--</span>
            </div>
          {/if}
        </div>

        <div class="row2">
          {#if deps[0]}
            <span class="clock">{deps[0].time}</span>
          {/if}
          {#if sedan}
            <span class="sedan">{sedan}</span>
          {/if}
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .segments-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0 8px;
  }

  .card {
    background: var(--surface);
    border-radius: 16px;
    display: flex;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.06);
    animation: cardIn 300ms ease both;
    animation-delay: var(--delay, 0ms);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Strip */
  .strip {
    width: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .strip-icon {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Body */
  .body {
    flex: 1;
    padding: 13px 14px 11px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
  }

  .row1 {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
  }

  .meta {
    min-width: 0;
    flex: 1;
  }

  .transport-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .direction {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 6px;
    margin-top: 4px;
    letter-spacing: 0.02em;
  }

  /* Departure number */
  .departure {
    display: flex;
    align-items: baseline;
    gap: 2px;
    flex-shrink: 0;
  }

  .dep-num {
    font-size: 52px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -2.5px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .dep-num.no-dep {
    font-size: 36px;
    font-weight: 300;
    color: var(--text-muted);
    letter-spacing: 0;
  }

  .dep-unit {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    padding-bottom: 6px;
  }

  /* Row 2 */
  .row2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
  }

  .clock {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .sedan {
    font-size: 11px;
    color: var(--text-secondary);
  }
</style>
