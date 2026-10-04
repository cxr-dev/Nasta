<script lang="ts">
  import { tick } from 'svelte';
  import type { Segment } from "../types/page";
  import type { TransitStopSearchResult } from '../providers/types';
  import { getMemoizedDistance, formatDistance, getWalkingTime } from "../services/geo";
  import type { LocationSnapshot } from '../services/geo';
  import { cleanStopName as stopLabel } from "../lib/stopName";
  import SurfaceControl from './SurfaceControl.svelte';
  import { openWalkingDirections } from '../lib/openWalkingDirections';
  import NearbyMap from './NearbyMap.svelte';
  import FullscreenMapSurface from './FullscreenMapSurface.svelte';
  import { resolveRoutePoints, type RoutePoint } from "../services/routeStops";

  let {
    segment,
    userLocation,
    locationRequestInFlight,
    walkingEtaEnabled,
    openFeatureSheet,
    t,
  }: {
    segment: Segment;
    userLocation: [number, number] | null;
    locationRequestInFlight: boolean;
    walkingEtaEnabled: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    t: Record<string, string>;
  } = $props();

  let resetViewToken = $state(0);
  let expandButtonEl = $state<HTMLButtonElement | undefined>(undefined);
  let mapError = $state(false);
  let mapAttempt = $state(0);

  let mapStop = $derived.by<TransitStopSearchResult | null>(() => {
    const coord = segment.fromStop.coord;
    if (!coord) return null;
    return {
      id: segment.fromStop.id,
      name: segment.fromStop.name,
      coord,
      modes: [segment.transportType],
      relevance: 1,
      locationType: 'stop',
    };
  });
  let mapLocation = $derived.by<LocationSnapshot>(() => ({
    position: userLocation,
    accuracy: null,
    isLoading: locationRequestInFlight,
    access: userLocation ? 'granted' : 'unknown',
  }));

  function retryMap() {
    mapError = false;
    mapAttempt += 1;
  }

</script>

{#if segment.fromStop.coord}
  {@const dist = userLocation ? getMemoizedDistance(segment.fromStop.siteId, segment.fromStop.coord[0], segment.fromStop.coord[1], userLocation[0], userLocation[1]) : null}
  {@const stopLat = segment.fromStop.coord[0]}
  {@const stopLon = segment.fromStop.coord[1]}
  <section class="map-preview">
    <div class="journey-map-shell">
      <div class="journey-map-label">
        <span>{t.stopLocation ?? 'Stop location'}</span>
        {#if walkingEtaEnabled}
          {#if dist !== null}
            <span>{t.walkToStop} · {formatDistance(dist)} · {t.approx ?? 'Approx.'} {getWalkingTime(dist)} min</span>
          {:else if locationRequestInFlight}
            <span class="hint">{t.waitingForLocation}</span>
          {/if}
        {/if}
      </div>

      <FullscreenMapSurface
        id={`stop-map:${segment.id}`}
        label={t.stopLocation ?? 'Stop location'}
        onClosed={() => {
          resetViewToken += 1;
          tick().then(() => expandButtonEl?.focus());
        }}
      >
      {#snippet content(state)}
      <div
        class="map-container"
        class:fullscreen={state.fullscreen}
        class:visible={state.visible}
        class:closing={state.closing}
        >
        <div class="mini-map">
          {#if mapError}
            <div class="map-fallback" role="status">
              <span>{t.mapUnavailable ?? 'Map unavailable.'}</span>
              <button type="button" onclick={retryMap}>{t.retry ?? 'Retry'}</button>
            </div>
          {:else if mapStop}
            <svelte:boundary>
              {#key mapAttempt}
                <NearbyMap
                  active={true}
                  location={mapLocation}
                  boardStop={mapStop}
                  includeLocationWithBoardStop={true}
                  interactionMode={state.fullscreen ? 'fullscreen' : 'embedded'}
                  {resetViewToken}
                  label={t.stopLocation ?? 'Stop location'}
                  locationLabel={t.youAreHere ?? 'You are here'}
                  onFatalError={() => { mapError = true; }}
                />
              {/key}
              {#snippet failed(_error, reset)}
                <div class="map-fallback" role="status">
                  <span>{t.mapUnavailable ?? 'Map unavailable.'}</span>
                  <button type="button" onclick={() => { retryMap(); reset(); }}>{t.retry ?? 'Retry'}</button>
                </div>
              {/snippet}
            </svelte:boundary>
          {/if}
        </div>
        {#if state.fullscreen}
          <div class="map-back-control">
            <SurfaceControl kind="back" tone="overlay" label={t.back ?? 'Back'} onclick={state.close} />
          </div>
        {:else}
          <button
            bind:this={expandButtonEl}
            type="button"
            class="map-expand-btn no-scale"
            onclick={state.open}
            aria-label={t.expandMap}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {/if}
      </div>
      {/snippet}
      </FullscreenMapSurface>
    </div>

    <div class="journey-actions">
      {#if openFeatureSheet}
        <button
          type="button"
          class="map-link map-link-primary"
          onclick={() => openFeatureSheet(segment)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" stroke-linejoin="round"/>
          </svg>
          {t.discoverNearby}
        </button>
      {/if}

      <button
        type="button"
        class="map-link map-link-secondary"
        onclick={() => openWalkingDirections(stopLat, stopLon)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {t.navigateToStop ?? t.openInMaps}
      </button>
    </div>
  </section>
{/if}

<style>
  .map-preview {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 2px 0 4px;
  }
  .journey-map-shell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .journey-map-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .journey-map-label span:last-child {
    color: var(--text-muted);
    font-weight: 600;
  }
  .mini-map {
    position: relative;
    width: 100%;
    height: 132px;
    display: block;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(135deg, color-mix(in oklch, var(--surface) 88%, #000 12%), var(--surface));
  }
  .map-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    padding: 16px;
    background: var(--surface-emphasis);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 650;
    text-align: center;
  }
  .map-fallback button {
    min-height: 44px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .journey-actions {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
  }
  .map-link { 
    display: inline-flex; 
    align-items: center; 
    justify-content: center;
    gap: 8px; 
    padding: 10px 12px; 
    min-height: 44px;
    font-size: 13px; 
    font-weight: 700;
    border-radius: 12px;
    min-width: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .map-link:active { transform: scale(0.985); }
  .map-link svg { width: 16px; height: 16px; }
  .map-link-primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--text-on-accent, #fff);
    flex: 1 1 auto;
  }
  .map-link-primary:active {
    transform: scale(0.96);
    background: color-mix(in oklch, var(--accent) 85%, #000);
  }
  .map-link-secondary {
    color: var(--text-secondary);
    background: transparent;
    flex: 0 0 auto;
  }
  .map-container {
    position: relative;
    --map-control-safe-top: env(safe-area-inset-top, 0px);
    --map-control-safe-left: env(safe-area-inset-left, 0px);
    transition: opacity 150ms ease-out, transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .map-container.fullscreen {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: #000;
    opacity: 0;
    transform: scale(0.96);
  }
  .map-container.fullscreen.visible {
    opacity: 1;
    transform: scale(1);
  }
  .map-container.closing {
    opacity: 0;
    transform: scale(0.96);
  }
  .map-container.fullscreen .mini-map {
    height: 100dvh;
    width: 100%;
    border-radius: 0;
  }
  .map-expand-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border: none;
    border-radius: 8px;
    background: var(--text);
    color: var(--surface);
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;
  }
  .map-expand-btn:active {
    transform: scale(0.92);
    background: var(--text);
  }
  .map-expand-btn svg {
    width: 18px;
    height: 18px;
  }
  @media (prefers-reduced-motion: reduce) {
    .map-container,
    .map-container.fullscreen,
    .map-container.fullscreen.visible,
    .map-container.closing {
      transition: opacity 160ms ease;
      transform: none;
    }
  }
  .map-back-control {
    position: absolute;
    top: calc(12px + var(--map-control-safe-top));
    left: calc(12px + var(--map-control-safe-left));
    z-index: 10;
  }
</style>
