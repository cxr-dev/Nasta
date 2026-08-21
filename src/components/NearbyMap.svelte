<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { TransitStopSearchResult } from '../providers/types';
  import type { LocationSnapshot } from '../services/geo';
  import { getSettings } from '../stores/settingsStore.svelte';
  import { resolveTheme } from '../themes';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

  const maplibreLoad = Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]).then(([module]) => module);

  const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  let { active, location, stops = [], selectedId = null, boardStop = null, includeLocationWithBoardStop = false, interactionMode = 'embedded', resetViewToken = 0, label, locationLabel = 'You are here', onSelectStop, onLoading, onReady, onFatalError }: {
    active: boolean; location: LocationSnapshot; stops?: TransitStopSearchResult[]; selectedId?: string | null;
    boardStop?: TransitStopSearchResult | null; includeLocationWithBoardStop?: boolean; interactionMode?: 'embedded' | 'fullscreen'; resetViewToken?: number; label: string; locationLabel?: string; onSelectStop?: (stop: TransitStopSearchResult) => void;
    onLoading?: () => void; onReady?: () => void; onFatalError?: () => void;
  } = $props();

  let host = $state<HTMLDivElement>();
  let maplibregl: any = null;
  let map: any = null;
  let ready = false;
  let markers: any[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame: number | null = null;
  let loading = false;
  let systemDark = $state(false);
  let currentStyle = '';
  let handledResetViewToken = 0;

  function styleUrl() {
    return resolveTheme(getSettings().theme ?? 'system', systemDark) === 'dark' ? DARK_STYLE : LIGHT_STYLE;
  }
  function reportFatalError() { onFatalError?.(); }
  function teardown() {
    ready = false;
    resizeObserver?.disconnect();
    resizeObserver = null;
    markers.forEach((marker) => marker.remove());
    markers = [];
    try { map?.remove(); } catch { /* Map cleanup is best effort. */ }
    map = null;
  }
  function resize() {
    if (!map || resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      try { map?.resize?.(); } catch { reportFatalError(); }
    });
  }
  function setMapInteractionMode(mode: 'embedded' | 'fullscreen') {
    if (!map) return;
    const enabled = mode === 'fullscreen';
    for (const handler of [map.dragPan, map.scrollZoom, map.touchZoomRotate]) {
      if (enabled) handler?.enable?.();
      else handler?.disable?.();
    }
    map.touchZoomRotate?.disableRotation?.();
    map.dragRotate?.disable?.();
    map.doubleClickZoom?.disable?.();
    map.keyboard?.disable?.();
  }
  function markerElement(stop: TransitStopSearchResult, selected: boolean) {
    const interactive = Boolean(onSelectStop);
    const element = document.createElement(interactive ? 'button' : 'div');
    if (element instanceof HTMLButtonElement) element.type = 'button';
    element.className = `nearby-stop-marker${selected ? ' selected' : ''}`;
    element.setAttribute('aria-label', stop.name);
    element.title = stop.name;
    if (!interactive) element.setAttribute('role', 'img');
    const dot = document.createElement('span');
    dot.className = 'nearby-stop-marker-dot';
    dot.setAttribute('aria-hidden', 'true');
    const center = document.createElement('span');
    center.className = 'nearby-stop-marker-center';
    center.setAttribute('aria-hidden', 'true');
    element.append(dot, center);
    if (interactive) element.addEventListener('click', () => onSelectStop?.(stop));
    return element;
  }
  function locationElement() {
    const element = document.createElement('div');
    element.className = 'nearby-user-marker';
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', locationLabel);
    element.title = locationLabel;
    element.style.zIndex = '2';
    const dot = document.createElement('span');
    dot.className = 'nearby-user-marker-dot';
    dot.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'nearby-user-marker-label';
    caption.textContent = locationLabel;
    caption.setAttribute('aria-hidden', 'true');
    element.append(dot, caption);
    return element;
  }
  function collapseAttribution() {
    const container = map?.getContainer?.() as HTMLElement | undefined;
    const control = container?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
    control?.classList.remove('maplibregl-compact-show');
    control?.querySelector<HTMLButtonElement>('button')?.blur();
  }
  function updateMarkers() {
    if (!map || !ready || !maplibregl) return;
    markers.forEach((marker) => {
      try { marker.remove(); } catch { /* Continue removing the remaining markers. */ }
    });
    markers = [];
    if ((!boardStop || includeLocationWithBoardStop) && location.position && location.position.every(Number.isFinite)) {
      try {
        markers.push(new maplibregl.Marker({ element: locationElement() })
          .setLngLat([location.position[1], location.position[0]]).addTo(map));
      } catch { /* A bad location marker must not suppress stop markers. */ }
    }
    for (const stop of boardStop ? [boardStop] : stops) {
      if (!stop.coord || !stop.coord.every(Number.isFinite)) continue;
      try {
        markers.push(new maplibregl.Marker({ element: markerElement(stop, stop.id === selectedId || Boolean(boardStop)) })
          .setLngLat([stop.coord[1], stop.coord[0]]).addTo(map));
      } catch { /* One bad stop must not suppress the remaining markers. */ }
    }
  }
  async function setup() {
    if (!active || loading || map || !host) return;
    const center = boardStop?.coord ?? location.position;
    if (!center) return;
    loading = true;
    onLoading?.();
    try {
      const module = await maplibreLoad;
      if (!active || map || !host) return;
      module.setWorkerUrl(workerUrl);
      maplibregl = module;
      currentStyle = styleUrl();
      map = new module.Map({ container: host, style: currentStyle, center: [center[1], center[0]], zoom: boardStop ? 15.5 : 14.2, attributionControl: false, dragPan: false, scrollZoom: false, doubleClickZoom: false, touchZoomRotate: false, dragRotate: false, keyboard: false });
      map.addControl(new module.AttributionControl({ compact: true }), 'bottom-right');
      setMapInteractionMode(interactionMode);
      map.on('error', (event: { sourceId?: string; error?: unknown }) => {
        if (event?.sourceId || !event?.error || typeof map?.isStyleLoaded !== 'function') return;
        if (!map.isStyleLoaded()) reportFatalError();
      });
      map.once?.('idle', collapseAttribution);
      const initialize = () => { ready = true; updateMarkers(); resize(); collapseAttribution(); onReady?.(); };
      map.on('load', initialize); map.on('style.load', initialize);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      }
    } catch { reportFatalError(); }
    finally { loading = false; }
  }

  $effect(() => {
    if (!active) {
      teardown();
      return;
    }
    host; boardStop?.id; location.position;
    void setup();
    resize();
  });
  $effect(() => { active; stops; selectedId; boardStop; includeLocationWithBoardStop; location.position; if (active) updateMarkers(); });
  $effect(() => { setMapInteractionMode(interactionMode); resize(); });
  $effect(() => {
    const token = resetViewToken;
    if (!token || token === handledResetViewToken || !map) return;
    const center = boardStop?.coord ?? location.position;
    if (!center) return;
    handledResetViewToken = token;
    try { map.jumpTo?.({ center: [center[1], center[0]], zoom: boardStop ? 15.5 : 14.2 }); } catch { reportFatalError(); }
  });
  $effect(() => {
    const nextStyle = styleUrl();
    if (map && nextStyle !== currentStyle) {
      currentStyle = nextStyle;
      ready = false;
      onLoading?.();
      try { map.setStyle?.(nextStyle); } catch { reportFatalError(); }
    }
  });
  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { systemDark = media.matches; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  onDestroy(() => {
    teardown();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  });
</script>

<div class="nearby-map" class:fullscreen={interactionMode === 'fullscreen'} bind:this={host} role="group" aria-label={label}></div>

<style>
  .nearby-map { position: absolute; inset: 0; touch-action: pan-y pinch-zoom; }
  .nearby-map.fullscreen { touch-action: none; }
  /* MapLibre owns marker-root transforms; roots must remain outside normal flow. */
  :global(.nearby-stop-marker) { position: absolute; top: 0; left: 0; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; }
  :global(button.nearby-stop-marker) { cursor: pointer; }
  :global(.nearby-stop-marker-dot), :global(.nearby-stop-marker-center) { position: absolute; border-radius: 50%; pointer-events: none; }
  :global(.nearby-stop-marker-dot) { width: 25px; height: 25px; border: 3px solid var(--surface); background: var(--text-secondary); box-shadow: 0 1px 4px color-mix(in srgb, var(--text) 28%, transparent); }
  :global(.nearby-stop-marker-center) { width: 7px; height: 7px; background: var(--surface); }
  :global(.nearby-stop-marker.selected .nearby-stop-marker-dot) { background: var(--accent); transform: scale(1.12); }
  :global(.nearby-stop-marker:focus-visible) { outline: 3px solid var(--focus-ring, var(--accent)); outline-offset: 2px; }
  :global(.nearby-user-marker) { position: absolute; top: 0; left: 0; display: grid; place-items: center; width: 44px; height: 44px; pointer-events: none; }
  :global(.nearby-user-marker-dot) { width: 17px; height: 17px; border: 3px solid #fff; border-radius: 50%; background: #1677e8; box-shadow: 0 0 0 5px color-mix(in srgb, #1677e8 24%, transparent), 0 1px 4px color-mix(in srgb, #000 32%, transparent); }
  :global(.nearby-user-marker-label) { position: absolute; top: 36px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); box-shadow: 0 1px 3px color-mix(in srgb, var(--text) 18%, transparent); color: var(--text); font-size: 10px; font-weight: 750; line-height: 1; white-space: nowrap; }
  :global(.maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show)) { min-height: 24px; padding: 0 24px 0 0; margin: 6px !important; background-color: transparent; border-radius: 12px; }
  :global(.maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show)::before) { content: ''; position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: rgba(255, 255, 255, 0.92); pointer-events: none; }
  :global(.maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show) .maplibregl-ctrl-attrib-button) { width: 24px; height: 24px; border-radius: 12px; background-color: transparent; background-position: center; background-repeat: no-repeat; background-size: 18px 18px; z-index: 1; }
  :global(.maplibregl-ctrl-attrib) { font-size: 9px; }
</style>
