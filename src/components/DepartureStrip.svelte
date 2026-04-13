<script lang="ts">
  import type { Departure } from '../types/departure';
  import type { Segment } from '../types/route';
  import { fetchJourneyStops, estimateVehicleStopIndex } from '../services/journeyService';
  import type { JourneyData, JourneyStop } from '../services/journeyService';
  import { onMount, onDestroy } from 'svelte';

  let {
    departure,
    segment,
    onError,
  }: {
    departure: Departure;
    segment: Segment;
    onError?: () => void;
  } = $props();

  let journeyData = $state<JourneyData | null>(null);
  let loading = $state(true);
  let vehicleIdx = $state(0);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let stripEl = $state<HTMLElement | null>(null);

  const MAX_VISIBLE = 8;

  function expectedMs(): number {
    return departure.expectedAt ?? (Date.now() + departure.minutes * 60_000);
  }

  function updateVehiclePosition(data: JourneyData) {
    vehicleIdx = estimateVehicleStopIndex(data.stops, expectedMs(), Date.now());
  }

  function pickupIndex(data: JourneyData): number {
    if (data.pickupStopIndex !== undefined) return data.pickupStopIndex;
    return data.stops.findIndex(isYourStop);
  }

  function visibleStops(data: JourneyData): JourneyStop[] {
    const stops = data.stops;
    if (stops.length <= MAX_VISIBLE) return stops;

    const pickupIdx = pickupIndex(data);
    const start = Math.max(0, Math.min(vehicleIdx, pickupIdx >= 0 ? pickupIdx : vehicleIdx));
    const minEnd = pickupIdx >= 0 ? pickupIdx + 1 : start + 1;
    const end = Math.max(minEnd, Math.min(stops.length, start + MAX_VISIBLE));
    return stops.slice(start, end);
  }

  function isYourStop(stop: JourneyStop): boolean {
    return stop.siteId === segment.fromStop.siteId ||
      (stop.name !== '' && stop.name === segment.fromStop.name);
  }

  function stopState(origIdx: number, stop: JourneyStop): 'passed' | 'vehicle' | 'your-stop' | 'upcoming' {
    if (origIdx === vehicleIdx) return 'vehicle';
    if (isYourStop(stop)) return 'your-stop';
    if (origIdx < vehicleIdx) return 'passed';
    return 'upcoming';
  }

  function currentStopName(data: JourneyData): string {
    return data.stops[vehicleIdx]?.name || 'okänd hållplats';
  }

  function stopsUntilPickup(data: JourneyData): number | null {
    const idx = pickupIndex(data);
    if (idx < 0) return null;
    return Math.max(0, idx - vehicleIdx);
  }

  function progressText(data: JourneyData): string {
    const remaining = stopsUntilPickup(data);
    if (remaining === null) return `Mot ${segment.fromStop.name}`;
    if (remaining === 0) return `Nu vid ${segment.fromStop.name}`;
    if (remaining === 1) return `1 hållplats kvar till ${segment.fromStop.name}`;
    return `${remaining} hållplatser kvar till ${segment.fromStop.name}`;
  }

  function vehicleContextText(data: JourneyData): string {
    const current = currentStopName(data);
    if (!current) return '';
    if (isYourStop(data.stops[vehicleIdx])) return `Fordonet är vid din hållplats`;
    return `Fordonet är vid ${current}`;
  }

  function formatArrival(): string {
    const ms = departure.expectedAt;
    if (!ms) return departure.time;
    return new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  onMount(async () => {
    try {
      const data = await fetchJourneyStops(departure.journeyRef, segment, departure);
      journeyData = data;
      updateVehiclePosition(data);
      loading = false;

      // Scroll your stop into view after slide transition (280ms + small buffer)
      setTimeout(() => {
        const el = stripEl?.querySelector('.stop-your-stop') as HTMLElement | null;
        el?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      }, 310);

      ticker = setInterval(() => {
        if (journeyData) updateVehiclePosition(journeyData);
      }, 15_000);
    } catch {
      loading = false;
      onError?.();
    }
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
  });
</script>

{#if loading}
  <div class="strip skeleton" aria-hidden="true">
    <div class="skeleton-track"></div>
  </div>
{:else if journeyData}
  {@const visible = visibleStops(journeyData)}
  <div class="strip" role="region" aria-label="Fordonsposition" bind:this={stripEl}>
    <div class="strip-summary">
      <div class="summary-primary">{progressText(journeyData)}</div>
      <div class="summary-secondary">{vehicleContextText(journeyData)}</div>
    </div>

    <div class="track-scroll">
      <div class="track-row">
        {#each visible as stop, i}
          {@const origIdx = journeyData.stops.indexOf(stop)}
          {@const state = stopState(origIdx, stop)}
          {@const isLast = i === visible.length - 1}

          <div
            class="stop-node stop-{state}"
            aria-label={stop.name ? `Hållplats: ${stop.name}` : undefined}
          >
            {#if state === 'vehicle'}
              <div class="vehicle-bubble">{departure.line}</div>
            {:else}
              <div class="dot"></div>
            {/if}
            {#if stop.name}
              <span class="stop-label">{stop.name}</span>
            {/if}
          </div>

          {#if !isLast}
            {@const nextOrigIdx = journeyData.stops.indexOf(visible[i + 1])}
            <div
              class="segment-line"
              class:passed={origIdx < vehicleIdx && nextOrigIdx <= vehicleIdx}
              class:active={origIdx === vehicleIdx || (origIdx < vehicleIdx && nextOrigIdx > vehicleIdx)}
            ></div>
          {/if}
        {/each}

        {#if journeyData.destination}
          <div class="terminus">{journeyData.destination}</div>
        {/if}
      </div>
    </div>

    <div class="strip-footer">
      <span class="arrival-text">Ankommer <strong>{formatArrival()}</strong></span>
      {#if journeyData.isEstimated}
        <span class="badge badge-estimated">~Estimat</span>
      {:else}
        <span class="badge badge-live">Live ✦</span>
      {/if}
    </div>
  </div>
{/if}

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

  .summary-primary {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .summary-secondary {
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* ── Track ───────────────────────────────────── */
  .track-scroll {
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .track-scroll::-webkit-scrollbar { display: none; }

  .track-row {
    display: flex;
    align-items: center;
    min-width: max-content;
    padding: 18px 0 34px;
  }

  .segment-line {
    flex: 1;
    min-width: 18px;
    height: 3px;
    background: var(--border);
    border-radius: 2px;
  }
  .segment-line.passed { background: var(--accent); opacity: 0.35; }
  .segment-line.active { background: var(--accent); opacity: 1; }

  /* ── Stop nodes ──────────────────────────────── */
  .stop-node {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
    border: 1.5px solid var(--border);
  }

  .stop-passed .dot {
    background: var(--accent);
    opacity: 0.35;
    border-color: var(--accent);
  }

  .stop-upcoming .dot {
    background: transparent;
    border-color: var(--text-muted);
  }

  .stop-your-stop .dot {
    width: 12px;
    height: 12px;
    background: #fff;
    border: 2.5px solid var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  /* ── Vehicle bubble ──────────────────────────── */
  .vehicle-bubble {
    width: 30px;
    height: 30px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 7px;
    border: 2px solid #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Neue Machina', sans-serif;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: -0.3px;
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  /* ── Stop labels ─────────────────────────────── */
  .stop-label {
    position: absolute;
    top: calc(100% + 5px);
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    text-align: center;
    transform: translateX(-50%);
    left: 50%;
    max-width: 88px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stop-vehicle .stop-label,
  .stop-your-stop .stop-label {
    color: var(--text);
    font-weight: 600;
  }

  /* ── Terminus ────────────────────────────────── */
  .terminus {
    font-size: 9px;
    color: var(--text-ghost);
    white-space: nowrap;
    padding-left: 8px;
    flex-shrink: 0;
  }

  /* ── Footer ──────────────────────────────────── */
  .strip-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 2px;
  }

  .arrival-text {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .arrival-text strong {
    color: var(--text);
    font-weight: 600;
  }

  .badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .badge-live {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .badge-estimated {
    color: var(--text-muted);
    background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  }

  /* ── Skeleton ────────────────────────────────── */
  .skeleton {
    border-top: 1px solid var(--border);
  }

  .skeleton-track {
    height: 8px;
    border-radius: 4px;
    margin: 20px 0 40px;
    background: linear-gradient(
      90deg,
      var(--border) 25%,
      color-mix(in srgb, var(--border) 60%, var(--bg)) 50%,
      var(--border) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
