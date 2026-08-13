<script lang="ts">
  import type { TransportType } from '../types/page';
  import { moonIcon } from '../icons/departureIcons';
  import TransportIcon from './TransportIcon.svelte';

  let {
    variant = 'station',
    destination,
    line,
    transportType,
    scheduledTime,
    countdown,
    urgencyLabel = '',
    countdownColor = 'var(--text)',
    badgeBackground = 'var(--accent-subtle)',
    isArrivingNow = false,
    isSleeping = false,
    nextDepartureTime = null,
    disruptionLabel = '',
    isCritical = false,
    interactive = false,
    isExpanded = false,
    controls,
    onactivate,
    onprefetch,
  }: {
    variant?: 'station' | 'preview';
    destination: string;
    line: string;
    transportType: TransportType;
    scheduledTime: string;
    countdown: string;
    urgencyLabel?: string;
    countdownColor?: string;
    badgeBackground?: string;
    isArrivingNow?: boolean;
    isSleeping?: boolean;
    nextDepartureTime?: string | null;
    disruptionLabel?: string;
    isCritical?: boolean;
    interactive?: boolean;
    isExpanded?: boolean;
    controls?: string;
    onactivate?: () => void;
    onprefetch?: () => void;
  } = $props();

  let countdownParts = $derived.by(() => {
    const match = /^(\d+)\s+(min)$/i.exec(countdown.trim());
    return match ? { value: match[1], unit: match[2] } : null;
  });

  function prefetch(node: HTMLElement) {
    if (!onprefetch) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onprefetch();
          observer.unobserve(node);
        }
      }
    }, { root: null, rootMargin: '400px', threshold: 0.1 });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

{#if variant === 'preview'}
  <span class="departure-preview" aria-label={`${line} ${destination}, ${countdown}`}>
    <span class="preview-line">{line}</span>
    <span class="preview-destination">{destination}</span>
    <strong class="preview-countdown" style={`color:${countdownColor}`}>{countdown}</strong>
  </span>
{:else}
  {#snippet content()}
    <span class="station-destination">{destination}</span>
    <div class="station-service-identity">
      <div class="icon-badge" style={`background:${badgeBackground}`}>
        <TransportIcon type={transportType} size={18} />
      </div>
      <span class="stacked-pill">{line}</span>
    </div>
    <span class="clock-times station-clock-times">{scheduledTime}</span>
    {#if disruptionLabel}
      <span class="disruption-summary station-disruption-summary" class:critical={isCritical}>
        <span class="status-dot" aria-hidden="true"></span>
        {disruptionLabel}
      </span>
    {/if}
    <div class="station-time-rail">
      {#if isSleeping}
        <svg viewBox="0 0 24 24" fill="none" class="sleeping-indicator" aria-label="Sleeping"><g>{@html moonIcon}</g></svg>
        {#if nextDepartureTime}<span class="sleep-next">{nextDepartureTime}</span>{/if}
      {:else}
        {#if urgencyLabel}<span class="urgency-label">{urgencyLabel}</span>{/if}
        {#if countdown === '—'}
          <span class="em-dash">—</span>
        {:else}
          <span class="countdown station-countdown" class:arriving-now={isArrivingNow} style={`color:${countdownColor}`} data-testid="countdown-minutes">
            {#if countdownParts}
              <span class="countdown-value">{countdownParts.value}</span>
              <span class="countdown-unit">{countdownParts.unit}</span>
            {:else}
              {countdown}
            {/if}
          </span>
        {/if}
      {/if}
    </div>
  {/snippet}

  {#if interactive}
    <button
      class="card-main station-card-main"
      type="button"
      aria-expanded={isExpanded}
      aria-controls={controls}
      use:prefetch
      onclick={onactivate}
    >
      {@render content()}
    </button>
  {:else}
    <div class="station-card-main station-board-card">
      {@render content()}
    </div>
  {/if}
{/if}

<style>
  .departure-preview { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; padding: 5px 0; border-top: 1px solid var(--border); color: var(--text); }
  .preview-line, .stacked-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 25px; height: 25px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--accent-subtle); color: var(--accent); font-family: 'Neue Machina', sans-serif; font-size: 11px; font-weight: 900; line-height: 1; }
  .preview-destination { min-width: 0; overflow: hidden; color: var(--text-secondary); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .preview-countdown { font-family: 'Neue Machina', sans-serif; font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: -.03em; white-space: nowrap; }

  .station-card-main { display: grid; grid-template-columns: auto minmax(0, 1fr) 110px; grid-template-rows: minmax(0, 1fr) auto auto; align-items: stretch; min-height: 86px; width: 100%; padding: 12px var(--transit-card-padding-inline); column-gap: 10px; row-gap: 8px; box-sizing: border-box; background: transparent; color: var(--text); text-align: left; }
  button.station-card-main { border: 0; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  button.station-card-main:active { opacity: .95; }
  .station-destination { grid-column: 1 / 3; grid-row: 1; align-self: center; min-width: 0; overflow: hidden; color: var(--text); font-size: 16px; font-weight: 700; line-height: 1.25; text-wrap: pretty; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .station-service-identity { grid-column: 1; grid-row: 2; display: flex; align-items: center; gap: 6px; align-self: end; }
  .icon-badge { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: 0 0 32px; border-radius: var(--radius-sm); background: var(--accent-subtle); color: var(--accent); }
  .stacked-pill { width: 32px; padding: 0; font-size: 12px; }
  .station-clock-times { grid-column: 2; grid-row: 2; align-self: center; justify-self: center; min-width: 0; max-width: 100%; overflow: hidden; color: var(--text-muted); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .station-time-rail { grid-column: 3; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; gap: 4px; min-width: 0; min-height: 100%; text-align: right; }
  .countdown { font-family: 'Neue Machina', sans-serif; font-size: clamp(32px, 4vw, 40px); font-weight: 900; letter-spacing: clamp(-1.8px, -0.04em, -1.2px); font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
  .station-countdown { display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 5px; }
  .countdown-unit { font-family: 'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; font-weight: 700; letter-spacing: -.01em; line-height: 1; }
  .urgency-label { align-self: flex-end; color: var(--text-muted); font-size: 10px; font-weight: 800; letter-spacing: .05em; line-height: 1; text-transform: uppercase; }
  .countdown.arriving-now { animation: urgency-arrival 160ms ease-out; }
  .sleeping-indicator { width: 24px; height: 24px; color: var(--text-muted); }
  .sleep-next { color: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .em-dash { color: var(--text-muted); font-family: 'Neue Machina', sans-serif; font-size: 30px; font-weight: 300; line-height: 1; }
  .station-disruption-summary { grid-column: 1 / 3; grid-row: 3; display: inline-flex; align-items: center; gap: 5px; max-width: 100%; overflow: hidden; justify-self: start; color: var(--color-warning); font-size: 11px; font-weight: 700; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .station-disruption-summary.critical { color: var(--color-critical); }
  .status-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }
  @keyframes urgency-arrival { from { opacity: .35; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .countdown.arriving-now { animation: none; } }
  @media (min-width: 768px) { .station-card-main { grid-template-columns: auto minmax(0, 1fr) 118px; column-gap: 12px; row-gap: 8px; } }
</style>
