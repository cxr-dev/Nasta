<script lang="ts">
  import type { JourneyLeg } from '../types/journey';
  import TransportIcon from './TransportIcon.svelte';

  type RoutePoint = {
    label: string;
    x: number;
    y: number;
    kind: 'origin' | 'transfer' | 'destination';
  };

  let {
    legs,
    focusedLegIndex = -1,
    onSelectLeg,
    overviewLabel = 'Journey overview',
    tapLegLabel = 'Tap a leg to focus it',
  }: {
    legs: JourneyLeg[];
    focusedLegIndex?: number;
    onSelectLeg?: (index: number) => void;
    overviewLabel?: string;
    tapLegLabel?: string;
  } = $props();

  let points = $derived.by<RoutePoint[]>(() => {
    if (legs.length === 0) return [];

    const labels = [legs[0].originName];
    for (const leg of legs) {
      if (labels.at(-1) !== leg.destName) labels.push(leg.destName);
    }

    const end = Math.max(1, labels.length - 1);
    return labels.map((label, index) => ({
      label,
      x: 24 + (312 * index) / end,
      y: index % 2 === 0 ? 104 : 54,
      kind: index === 0 ? 'origin' : index === labels.length - 1 ? 'destination' : 'transfer',
    }));
  });

  let segments = $derived.by(() => legs.map((leg, index) => ({
    leg,
    index,
    from: points[index],
    to: points[index + 1],
  })).filter((segment) => segment.from && segment.to));

  function segmentClass(index: number): string {
    const color = index === 0 ? 'primary' : 'secondary';
    if (focusedLegIndex < 0) return `route-segment ${color}`;
    return `route-segment ${color}${focusedLegIndex === index ? ' focused' : ' quiet'}`;
  }
</script>

<section class="journey-overview" aria-label={overviewLabel} data-testid="journey-route-overview">
  <div class="overview-heading">
    <span class="overview-title">{overviewLabel}</span>
    <span class="overview-hint">{tapLegLabel}</span>
  </div>

  <div class="overview-map">
    <svg viewBox="0 0 360 140" role="img" aria-label={overviewLabel}>
      <path class="map-road road-one" d="M0 30C82 15 122 55 186 31S278 4 360 27" />
      <path class="map-road road-two" d="M-10 116C68 87 113 132 186 104S276 74 370 94" />
      <path class="map-water" d="M-15 76C55 56 93 80 147 67S257 46 375 62L375 86C280 69 224 92 151 91S55 76-15 101Z" />
      {#each segments as segment}
        <line
          class={segmentClass(segment.index)}
          x1={segment.from.x}
          y1={segment.from.y}
          x2={segment.to.x}
          y2={segment.to.y}
          aria-hidden="true"
        />
      {/each}
      {#each points as point, index}
        <circle
          class:route-point-origin={point.kind === 'origin'}
          class:route-point-destination={point.kind === 'destination'}
          class:route-point-transfer={point.kind === 'transfer'}
          cx={point.x}
          cy={point.y}
          r={point.kind === 'transfer' ? 5 : 7}
        />
        <text class="route-label" x={point.x} y={point.y + (index % 2 === 0 ? 22 : -13)} text-anchor="middle">
          {point.label}
        </text>
      {/each}
    </svg>

    <div class="overview-line-labels" aria-hidden="true">
      {#each segments as segment}
        <button
          type="button"
          class:focused={focusedLegIndex === segment.index}
          class="line-label"
          style:left={`${segment.from.x / 3.6}%`}
          style:top={`${Math.min(segment.from.y, segment.to.y) / 1.4 - 2}%`}
          onclick={() => onSelectLeg?.(segment.index)}
          tabindex="-1"
        >
          <TransportIcon type={segment.leg.transportType} size={11} />
          <span>{segment.leg.line}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="overview-legend" role="group" aria-label={tapLegLabel}>
    {#each legs as leg, index (leg.departureTime + '-' + index)}
      <button
        type="button"
        class:focused={focusedLegIndex === index}
        class="legend-item"
        aria-pressed={focusedLegIndex === index}
        onclick={() => onSelectLeg?.(index)}
      >
        <TransportIcon type={leg.transportType} size={13} />
        <span>{leg.lineName}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .journey-overview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 calc(var(--transit-card-padding-inline) * -1) 14px;
    padding: 12px var(--transit-card-padding-inline) 10px;
    background: var(--journey-map-bg, var(--surface-emphasis));
    border-bottom: 1px solid var(--border);
  }

  .overview-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .overview-title {
    color: var(--text);
    font-size: 12px;
    font-weight: 800;
  }

  .overview-hint {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
  }

  .overview-map {
    position: relative;
    height: 140px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--surface);
  }

  .overview-map svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .map-road {
    fill: none;
    stroke: var(--journey-map-road, var(--border));
    stroke-width: 1.5;
    opacity: 0.72;
  }

  .road-two { opacity: 0.45; }

  .map-water {
    fill: var(--journey-map-water, var(--accent-subtle));
    opacity: 0.5;
  }

  .route-segment {
    stroke: var(--journey-primary, var(--accent));
    stroke-width: 5;
    stroke-linecap: round;
  }

  .route-segment.secondary {
    stroke: var(--journey-secondary, var(--journey-primary, var(--accent)));
  }

  .route-segment.focused {
    stroke: var(--journey-primary, var(--accent));
    stroke-width: 7;
  }

  .route-segment.secondary.focused {
    stroke: var(--journey-secondary, var(--journey-primary, var(--accent)));
  }

  .route-segment.quiet {
    stroke: var(--journey-map-quiet, var(--border-strong));
    stroke-width: 4;
  }

  .route-point-origin,
  .route-point-destination {
    fill: var(--journey-primary, var(--accent));
    stroke: var(--surface);
    stroke-width: 3;
  }

  .route-point-transfer {
    fill: var(--surface);
    stroke: var(--journey-primary, var(--accent));
    stroke-width: 3;
  }

  .route-label {
    fill: var(--text);
    font-size: 8px;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .overview-line-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .line-label {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 28px;
    min-height: 24px;
    justify-content: center;
    padding: 3px 6px;
    transform: translateX(-50%);
    border: 1px solid var(--journey-primary, var(--accent));
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    color: var(--journey-primary, var(--accent));
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    pointer-events: auto;
  }

  .line-label.focused {
    background: var(--journey-primary, var(--accent));
    color: var(--journey-on-primary, var(--text-on-accent));
  }

  .overview-legend {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .overview-legend::-webkit-scrollbar { display: none; }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    flex: 0 0 auto;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-full, 999px);
    background: var(--surface);
    color: var(--text-secondary);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
  }

  .legend-item.focused {
    border-color: var(--journey-primary, var(--accent));
    color: var(--journey-primary, var(--accent));
  }

  .line-label:focus-visible,
  .legend-item:focus-visible {
    outline: 2px solid var(--journey-primary, var(--accent));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .line-label,
    .legend-item { transition: none; }
  }
</style>
