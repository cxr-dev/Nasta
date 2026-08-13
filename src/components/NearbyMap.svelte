<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { TransitStopSearchResult } from '../providers/types';
  import type { LocationSnapshot } from '../services/geo';
  import { getSettings } from '../stores/settingsStore.svelte';
  import { resolveTheme } from '../themes';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

  const maplibreLoad = import('maplibre-gl');
  void import('maplibre-gl/dist/maplibre-gl.css');

  let {
    active,
    location,
    stops = [],
    selectedId = null,
    boardStop = null,
    label,
    onSelectStop,
    onError,
  }: {
    active: boolean;
    location: LocationSnapshot;
    stops?: TransitStopSearchResult[];
    selectedId?: string | null;
    boardStop?: TransitStopSearchResult | null;
    label: string;
    onSelectStop?: (stop: TransitStopSearchResult) => void;
    onError?: () => void;
  } = $props();

  let host = $state<HTMLDivElement | undefined>();
  let maplibregl: any = null;
  let map: any = null;
  let ready = false;
  let markers: any[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame: number | null = null;
  let loading = false;

  function walkingBounds(user: [number, number], stop: [number, number]): [[number, number], [number, number]] {
    return [
      [Math.min(user[1], stop[1]), Math.min(user[0], stop[0])],
      [Math.max(user[1], stop[1]), Math.max(user[0], stop[0])],
    ];
  }

  function reportError() {
    onError?.();
  }

  function resize() {
    if (!map || resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      try { map?.resize?.(); } catch { reportError(); }
    });
  }

  function updateMarkers() {
    if (!map || !ready || !maplibregl) return;
    try {
      markers.forEach((marker) => marker.remove());
      markers = [];
      if (location.position) {
        markers.push(new maplibregl.Marker({ color: '#2563EB' })
          .setLngLat([location.position[1], location.position[0]])
          .addTo(map));
      }
      for (const stop of stops) {
        if (!stop.coord) continue;
        const marker = new maplibregl.Marker({ color: stop.id === selectedId ? '#171717' : '#6B7280' })
          .setLngLat([stop.coord[1], stop.coord[0]])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setText(stop.name))
          .addTo(map);
        marker.getElement?.().addEventListener('click', () => onSelectStop?.(stop));
        markers.push(marker);
      }
      if (boardStop?.coord) {
        markers.push(new maplibregl.Marker({ color: '#171717' })
          .setLngLat([boardStop.coord[1], boardStop.coord[0]])
          .addTo(map));
      }
      const source = map.getSource?.('nearby-walk-line');
      const coordinates = location.position && boardStop?.coord
        ? [[location.position[1], location.position[0]], [boardStop.coord[1], boardStop.coord[0]]]
        : [];
      source?.setData?.({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {},
      });
      if (location.position && boardStop?.coord) {
        map.fitBounds?.(walkingBounds(location.position, boardStop.coord), { padding: 42, maxZoom: 15.5 });
      }
    } catch {
      reportError();
    }
  }

  async function setup() {
    const center = boardStop?.coord ?? location.position;
    if (!active || !host || !center || map || loading) return;
    loading = true;
    try {
      const module = await maplibreLoad;
      if (!active || !host || map) return;
      module.setWorkerUrl(workerUrl);
      maplibregl = module;
      const settings = getSettings();
      const dark = resolveTheme(
        settings.theme ?? 'system',
        window.matchMedia('(prefers-color-scheme: dark)').matches,
      ) === 'dark';
      map = new module.Map({
        container: host,
        style: dark
          ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
          : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [center[1], center[0]],
        zoom: 14.2,
        attributionControl: false,
        dragRotate: false,
        keyboard: false,
      });
      map.addControl(new module.AttributionControl({ compact: true }), 'bottom-right');
      map.dragPan?.disable?.();
      map.scrollZoom?.disable?.();
      map.touchZoomRotate?.disable?.();
      map.doubleClickZoom?.disable?.();
      map.keyboard?.disable?.();
      map.on('error', reportError);
      map.on('load', () => {
        try {
          map.addSource('nearby-walk-line', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
          });
          map.addLayer({
            id: 'nearby-walk-line',
            type: 'line',
            source: 'nearby-walk-line',
            paint: { 'line-color': '#2563EB', 'line-width': 3, 'line-dasharray': [1, 1.5], 'line-opacity': 0.75 },
          });
          ready = true;
          updateMarkers();
          resize();
        } catch { reportError(); }
      });
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    } catch {
      reportError();
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    active;
    host;
    boardStop?.id;
    location.position;
    void setup();
    if (active) resize();
  });

  $effect(() => {
    active;
    stops;
    selectedId;
    boardStop;
    location.position;
    if (active) updateMarkers();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    markers.forEach((marker) => marker.remove());
    try { map?.remove(); } catch { /* MapLibre cleanup is best effort. */ }
  });
</script>

<div class="nearby-map" bind:this={host} role="application" aria-label={label}></div>

<style>
  .nearby-map {
    position: absolute;
    inset: 0;
    touch-action: pan-y pinch-zoom;
  }
</style>
