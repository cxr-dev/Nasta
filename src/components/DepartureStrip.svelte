<script lang="ts">
  import type { Departure } from "../types/departure";
  import type { Segment } from "../types/route";
  import { formatDepartureTime } from "../lib/departureDisplay";
  import { t } from "../stores/localeStore";

  let {
    departure,
    segment,
  }: {
    departure: Departure;
    segment: Segment;
    onError?: () => void;
  } = $props();

  const stops = $derived([
    segment.fromStop.name,
    segment.toStop.name,
  ].filter(Boolean));

  function departureLabel(): string {
    return formatDepartureTime(departure, Date.now());
  }
</script>

<div class="strip" role="region" aria-label={$t.departures}>
  <div class="strip-summary">
    <div class="summary-prefix">{departure.line}</div>
    <div class="summary-primary">{departure.destination}</div>
    <div class="summary-secondary">{departureLabel()}</div>
  </div>

  <div class="track">
    {#each stops as stop, index (stop)}
      <div class="stop">
        <span class="dot"></span>
        <span class="label">{stop}</span>
      </div>
      {#if index < stops.length - 1}
        <div class="line"></div>
      {/if}
    {/each}
  </div>

  <div class="strip-footer">
    <span class="arrival-text">{$t.arrivingAt.replace('{time}', departureLabel())}</span>
  </div>
</div>

<style>
  .strip {
    padding: 14px 16px 16px;
    border-top: 1px solid var(--border);
  }
  .strip-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }
  .summary-prefix {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .summary-primary {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .summary-secondary {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .track {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 0;
    overflow: hidden;
  }
  .stop {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .line {
    flex: 1;
    min-width: 16px;
    height: 2px;
    border-radius: 999px;
    background: var(--border);
  }
  .strip-footer {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
