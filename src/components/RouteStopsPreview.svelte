<script lang="ts">
  import type { Segment } from '../types/page';
  import { getT } from '../stores/localeStore.svelte';
  import { transitService } from '../providers/init';
  import { toEntityId } from '../lib/departureConverter';

  let {
    segment,
    showAll = false,
    onShowAllChange,
  }: {
    segment: Segment;
    showAll?: boolean;
    onShowAllChange?: (showAll: boolean) => void;
  } = $props();

  const PREVIEW_NEXT_COUNT = 3;

  let t = $derived(getT());
  let stops = $state<string[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    const controller = new AbortController();
    loading = true;
    failed = false;

    transitService
      .getStopSequence(
        toEntityId(segment.fromStop.siteId),
        segment.direction.destination,
        segment.line,
        segment.direction.code,
        controller.signal,
      )
      .then((sequence) => {
        if (controller.signal.aborted) return;
        const names = [
          segment.fromStop.name,
          ...(sequence?.stops ?? []).map((stop) => stop.stopName),
          segment.direction.destination,
        ].filter(Boolean);
        stops = names.filter((name, index) => index === 0 || name !== names[index - 1]);
        loading = false;
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        failed = true;
        loading = false;
      });

    return () => controller.abort();
  });

  // Total includes origin + the intermediate stops + destination.
  let totalStops = $derived(stops.length);
  // Intermediate stops hidden until "Show all" is pressed.
  let hiddenMore = $derived(Math.max(0, totalStops - (2 + PREVIEW_NEXT_COUNT)));
  // Collapsed view: origin + the next N upcoming stops + destination.
  let visibleStops = $derived(
    showAll || hiddenMore === 0
      ? stops
      : [stops[0], ...stops.slice(1, 1 + PREVIEW_NEXT_COUNT), stops[stops.length - 1]],
  );
</script>

{#if loading}
  <section class="route-stops route-stops-loading" aria-live="polite" aria-busy="true">
    <div class="route-stops-heading">
      <span class="route-stops-title">{t.routeStops ?? 'Stops along the route'}</span>
      <span class="route-stops-muted">{t.loading ?? 'Loading'}…</span>
    </div>
    <ol class="stop-list route-stops-skeleton" aria-hidden="true">
      {#each Array(4) as _, index (index)}
        <li>
          <span class="stop-node route-stops-skeleton-node"></span>
          <span class="route-stops-skeleton-label"></span>
        </li>
      {/each}
    </ol>
    <div class="route-stops-skeleton-action" aria-hidden="true"></div>
  </section>
{:else if failed}
  <div class="route-stops route-stops-muted">
    {t.routeStopsUnavailable ?? 'Route stops are unavailable right now.'}
  </div>
{:else if stops.length > 0}
  <section class="route-stops" aria-live="polite">
    <div class="route-stops-heading">
      <span class="route-stops-title">{t.routeStops ?? 'Stops along the route'}</span>
      <span class="route-stops-summary">
        {totalStops} {t.journeyMoreStops ?? 'stops'}
      </span>
    </div>

    <ol class="stop-list">
      {#each visibleStops as stop, index (stop + index)}
        {#if index === visibleStops.length - 1 && !showAll && hiddenMore > 0}
          <li class="more" aria-hidden="true">
            <span class="stop-node stop-node-more"></span>
            <span>+{hiddenMore} {t.journeyMoreStops ?? 'stops'}</span>
          </li>
        {/if}
        <li class:origin={index === 0} class:destination={index === visibleStops.length - 1}>
          <span class="stop-node" aria-hidden="true"></span>
          <span>{stop}</span>
        </li>
      {/each}
    </ol>

    {#if !showAll && hiddenMore > 0}
      <button
        type="button"
        class="show-stops"
        onpointerdown={(event) => event.stopPropagation()}
        onclick={(event) => {
          event.stopPropagation();
          onShowAllChange?.(true);
        }}
      >
        {t.showAllStops ?? 'Show all stops'}
      </button>
    {:else if showAll && totalStops > 2 + PREVIEW_NEXT_COUNT}
      <button
        type="button"
        class="show-stops"
        onpointerdown={(event) => event.stopPropagation()}
        onclick={(event) => {
          event.stopPropagation();
          onShowAllChange?.(false);
        }}
      >
        {t.showLess ?? 'Show less'}
      </button>
    {/if}
  </section>
{/if}

<style>
  .route-stops {
    box-sizing: border-box;
    min-height: 88px;
  }
  .route-stops-loading {
    min-height: 154px;
  }
  .route-stops-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    min-width: 0;
  }
  .route-stops-title {
    min-width: 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .route-stops-summary,
  .route-stops-muted {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .stop-list {
    position: relative;
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .stop-list::before {
    content: '';
    position: absolute;
    top: 19px;
    bottom: 19px;
    left: 6.5px;
    width: 1px;
    background: var(--border-strong);
  }
  .route-stops-skeleton {
    margin-bottom: 8px;
  }
  .route-stops-skeleton li {
    color: transparent;
  }
  .route-stops-skeleton-node {
    border-color: var(--border-strong);
    background: var(--border);
    opacity: 0.7;
  }
  .route-stops-skeleton-label {
    display: block;
    height: 8px;
    border-radius: 999px;
    background: var(--border);
    opacity: 0.7;
    width: min(52%, 180px);
  }
  .route-stops-skeleton li:nth-child(even) .route-stops-skeleton-label {
    width: min(40%, 140px);
  }
  .route-stops-skeleton-action {
    width: 96px;
    height: 42px;
    border-radius: var(--radius-sm);
    background: var(--border);
    opacity: 0.45;
  }
  .stop-list li {
    position: relative;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    min-height: 38px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.2;
  }
  .stop-list li.more {
    color: var(--text-muted);
    font-style: italic;
  }
  .stop-node {
    position: relative;
    z-index: 1;
    justify-self: center;
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--border-strong);
    border-radius: 50%;
    background: var(--surface);
  }
  .stop-node-more {
    border-color: transparent;
    background: transparent;
  }
  .stop-list li.origin,
  .stop-list li.destination {
    color: var(--text);
    font-weight: 700;
  }
  .stop-list li.origin .stop-node,
  .stop-list li.destination .stop-node {
    width: 10px;
    height: 10px;
    border-color: var(--accent);
    background: var(--accent);
  }
  .show-stops {
    min-height: 44px;
    margin-top: 6px;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
  }
  .show-stops:hover,
  .show-stops:focus-visible {
    background: var(--accent-subtle);
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
