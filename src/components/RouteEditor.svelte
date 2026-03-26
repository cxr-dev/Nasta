<script lang="ts">
  import type { Route, TransportType, Stop } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';

  let {
    routes,
    activeRouteId,
    isOpen,
    onClose,
    onSwitchRoute
  }: {
    routes: Route[];
    activeRouteId: string;
    isOpen: boolean;
    onClose: () => void;
    onSwitchRoute: (routeId: string) => void;
  } = $props();

  let route = $derived(routes.find(r => r.id === activeRouteId));
  let otherRoute = $derived(routes.find(r => r.id !== activeRouteId));
  let showSearch = $state(false);

  function getRouteLabel(r: Route): string {
    return r.direction === 'toWork' ? 'Till jobbet' : 'Hem';
  }

  function addSegment(
    line: string, lineName: string, directionText: string,
    fromStop: Stop, toStop: Stop, transportType: TransportType
  ) {
    if (!route) return;
    routeStore.addSegment(route.id, { line, lineName, directionText, fromStop, toStop, transportType });
    showSearch = false;
  }
</script>

<div class="editor-overlay" class:open={isOpen} aria-hidden={!isOpen}>
  <div class="editor-sheet">
    <div class="sheet-header">
      <button class="back-btn" onclick={onClose} aria-label="Stäng redigering">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <span class="sheet-title">
        Redigera: {route ? getRouteLabel(route) : ''}
      </span>
    </div>

    {#if route}
      {#if showSearch}
        <div class="search-container">
          <SegmentSearch onSelect={addSegment} />
          <button class="cancel-search-btn" onclick={() => showSearch = false}>
            Avbryt
          </button>
        </div>
      {:else}
        <div class="segment-area">
          <SegmentList route={route} />
          <button class="add-btn" onclick={() => showSearch = true}>
            + Lägg till segment
          </button>
        </div>
      {/if}
    {/if}

    {#if otherRoute}
      <button class="switch-route-btn" onclick={() => onSwitchRoute(otherRoute!.id)}>
        Byt till: {getRouteLabel(otherRoute)}
      </button>
    {/if}
  </div>
</div>

<style>
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  max-width: 480px;
  margin: 0 auto;
}

.editor-overlay.open {
  pointer-events: auto;
}

.editor-sheet {
  position: absolute;
  inset: 0;
  background: var(--bg);
  transform: translateY(100%);
  transition: transform 200ms ease-out;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.editor-overlay.open .editor-sheet {
  transform: translateY(0);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 12px;
  padding-top: calc(16px + env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0;
}

.back-btn:hover { background: var(--border); }

.sheet-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.segment-area {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-btn {
  width: 100%;
  padding: 12px;
  border: 1.5px dashed var(--border-subtle);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms, color 150ms;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.search-container {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cancel-search-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}

.cancel-search-btn:hover {
  background: var(--border);
}

.switch-route-btn {
  margin: 0 16px 16px;
  padding: 11px;
  border: 1.5px solid var(--border-subtle);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms, color 150ms;
}

.switch-route-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
