<script lang="ts">
  import type { TransportType } from '../types/page';
  import TransportIcon from './TransportIcon.svelte';
  import TrainPosition from './TrainPosition.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import gsap from 'gsap';
  import { tick } from 'svelte';

  let {
    journeyMeta,
    isExpanded = false,
    ontoggle,
  }: {
    journeyMeta: {
      originLabel: string;
      destLabel: string;
      totalDurationMin: number;
      transfers: number;
      legs: Array<{
        originName: string;
        destName: string;
        transportType: TransportType;
        line: string;
        lineName: string;
        directionName: string;
        departureTime: number;
        arrivalTime: number;
        platformPosition: 'front' | 'middle' | 'back';
      }>;
    };
    isExpanded?: boolean;
    ontoggle?: () => void;
  } = $props();

  let t = $derived(getT());

  let depTime = $derived(journeyMeta.legs[0]?.departureTime ?? 0);
  let arrTime = $derived(journeyMeta.legs.length > 0
    ? journeyMeta.legs[journeyMeta.legs.length - 1].arrivalTime
    : 0);

  function formatTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  let panelEl: HTMLDivElement | undefined = $state();
  let collapsing = $state(false);

  function handleToggle() {
    if (isExpanded) {
      const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) { ontoggle?.(); return; }
      collapsing = true;
      tick().then(() => {
        if (!panelEl) { collapsing = false; ontoggle?.(); return; }
        gsap.to(panelEl, {
          height: 0, opacity: 0,
          duration: 0.2, ease: 'power2.in',
          onComplete: () => {
            collapsing = false;
            ontoggle?.();
          },
        });
      });
    } else {
      ontoggle?.();
    }
  }

  $effect(() => {
    if (!isExpanded || !panelEl) return;
    const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) return;
    gsap.fromTo(panelEl,
      { height: 0, opacity: 0 },
      { height: 'auto', opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'height,opacity' },
    );
  });
</script>

<article class="journey-card" class:expanded={isExpanded}>
  <button class="card-main" onclick={() => handleToggle()}>
    <span class="accent-bar"></span>

    <div class="card-body">
      <div class="card-top">
        <span class="dest-label">→ {journeyMeta.destLabel}</span>
        <span class="duration">{formatDuration(journeyMeta.totalDurationMin)}</span>
      </div>

      <div class="card-meta">
        <span class="transfers">
          {journeyMeta.transfers === 0
            ? 'Direct'
            : `${journeyMeta.transfers} transfer${journeyMeta.transfers > 1 ? 's' : ''}`}
        </span>
        <span class="time-range">
          {formatTime(depTime)} – {formatTime(arrTime)}
        </span>
      </div>

      {#if journeyMeta.legs[0]}
        <div class="primary-leg">
          <TransportIcon type={journeyMeta.legs[0].transportType} size={14} />
          <span class="leg-line">{journeyMeta.legs[0].lineName}</span>
          <span class="leg-direction">{journeyMeta.legs[0].directionName}</span>
          <TrainPosition position={journeyMeta.legs[0].platformPosition} />
        </div>
      {/if}
    </div>
  </button>

  {#if isExpanded || collapsing}
    <div class="expanded-panel" class:collapsing bind:this={panelEl}>
      <div class="timeline">
        {#each journeyMeta.legs as leg, i}
          <div class="leg-row">
            <span class="leg-dot"></span>
            <div class="leg-info">
              <div class="leg-header">
                <TransportIcon type={leg.transportType} size={12} />
                <span class="leg-line-name">{leg.lineName}</span>
                <span class="leg-time">
                  {formatTime(leg.departureTime)} → {formatTime(leg.arrivalTime)}
                </span>
              </div>
              <div class="leg-route">
                {leg.originName} → {leg.destName}
              </div>
              <div class="leg-position">
                Platform: <TrainPosition position={leg.platformPosition} />
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</article>

<style>
  .journey-card {
     background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    overflow: hidden;
    position: relative;
    transition: box-shadow 0.2s ease;
  }

  .journey-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .card-main {
    display: flex;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .accent-bar {
    width: 4px;
    flex-shrink: 0;
    background: var(--accent);
  }

  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .dest-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .duration {
    font-family: 'Neue Machina', sans-serif;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: clamp(-1.8px, -0.04em, -1.2px);
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    flex-shrink: 0;
    margin-left: 8px;
    line-height: 1;
  }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .primary-leg {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .leg-line {
    font-weight: 600;
    color: var(--text);
  }

  .leg-direction {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .expanded-panel {
    border-top: 1px solid var(--border);
    padding: 12px 14px 12px 18px;
    overflow: hidden;
  }

  .expanded-panel.collapsing {
    pointer-events: none;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .leg-row {
    display: flex;
    gap: 10px;
    position: relative;
  }

  .leg-row:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 14px;
    bottom: -16px;
    width: 1px;
    background: var(--border);
  }

  .leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    margin-top: 3px;
    position: relative;
    z-index: 1;
  }

  .leg-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }

  .leg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }

  .leg-line-name {
    font-weight: 600;
    color: var(--text);
  }

  .leg-time {
    margin-left: auto;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .leg-route {
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .leg-position {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
  }

  @media (min-width: 768px) {
    .duration {
      font-size: clamp(28px, 4vw, 38px);
    }
  }
</style>
