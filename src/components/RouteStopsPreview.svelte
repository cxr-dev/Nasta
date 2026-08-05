<script lang="ts">
  import type { Segment } from '../types/page';
  import { getT } from '../stores/localeStore.svelte';
  import { transitService } from '../providers/init';
  import { toEntityId } from '../lib/departureConverter';

  let { segment }: { segment: Segment } = $props();
  let t = $derived(getT());
  let stops = $state<string[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let showAll = $state(false);

  $effect(() => {
    segment.id;
    const controller = new AbortController();
    loading = true;
    failed = false;
    showAll = false;

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

  let visibleStops = $derived(showAll ? stops : stops.slice(0, 4));
  let hasMore = $derived(stops.length > 4);
</script>

{#if loading}
  <div class="route-stops route-stops-loading" aria-live="polite">
    <span class="route-stops-title">{t.routeStops ?? 'Stops along the route'}</span>
    <span class="route-stops-muted">{t.loading ?? 'Loading'}…</span>
  </div>
{:else if failed}
  <div class="route-stops route-stops-muted">
    {t.routeStopsUnavailable ?? 'Route stops are unavailable right now.'}
  </div>
{:else if stops.length > 0}
  <div class="route-stops">
    <div class="route-stops-heading">
      <span class="route-stops-title">{t.routeStops ?? 'Stops along the route'}</span>
      <span class="route-stops-direction">→ {segment.direction.destination}</span>
    </div>
    <ol class="stop-list">
      {#each visibleStops as stop, index (stop + index)}
        <li class:origin={index === 0} class:destination={index === stops.length - 1}>
          <span class="stop-node" aria-hidden="true"></span>
          <span>{stop}</span>
        </li>
      {/each}
    </ol>
    {#if hasMore}
      <button type="button" class="show-stops" onclick={() => (showAll = !showAll)}>
        {showAll ? (t.showLess ?? 'Show less') : (t.showAllStops ?? 'Show all stops')}
      </button>
    {/if}
  </div>
{/if}

<style>
  .route-stops {
    padding: 12px 0 2px;
    border-bottom: 1px solid var(--border);
  }
  .route-stops-loading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .route-stops-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .route-stops-title {
    color: var(--text);
    font-size: 12px;
    font-weight: 800;
  }
  .route-stops-direction,
  .route-stops-muted {
    color: var(--text-muted);
    font-size: 11px;
  }
  .stop-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    list-style: none;
    margin: 10px 0 8px;
    padding: 0;
  }
  .stop-list li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 26px;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .stop-list li:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 15px;
    bottom: -11px;
    width: 1px;
    background: var(--border-strong);
  }
  .stop-node {
    position: relative;
    z-index: 1;
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: var(--surface);
  }
  .stop-list li.origin,
  .stop-list li.destination {
    color: var(--text);
    font-weight: 700;
  }
  .stop-list li.origin .stop-node,
  .stop-list li.destination .stop-node {
    border-color: var(--accent);
    background: var(--accent);
  }
  .show-stops {
    padding: 4px 0 6px;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
