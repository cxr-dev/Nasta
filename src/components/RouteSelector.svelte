<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  import type { TransportType } from '../types/route';
  
  let { 
    onSelect = () => {},
    editing = false,
    onDeleteRoute = () => {}
  }: { 
    onSelect?: (routeId: string) => void;
    editing?: boolean;
    onDeleteRoute?: (routeId: string) => void;
  } = $props();
  
  let routes = $derived($routeStore);
  let selected = $derived($selectedRouteId);
  
  function selectRoute(id: string) {
    selectedRouteId.set(id);
    onSelect(id);
  }
  
  const transportIcons: Record<TransportType, string> = {
    bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1 .55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31-2.69-6-6-6S4 2.69 4 6v10zm9 0c0 .88-.39 1.67-1 2.22V20c0 .55-.45 1-1 1-.55 0-1-.45-1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31 2.69-6 6-6s6 2.69 6 6v10zm-9-10v10',
    train: 'M4 15c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8H4v7zm8-5h-2v2h2v-2zm0 3h-2v2h2v-2zm0 3h-2v2h2v-2zM7.5 6h9v1h-9V6z',
    metro: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z',
    boat: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z'
  };
  
  function handleDelete(e: Event, routeId: string) {
    e.stopPropagation();
    onDeleteRoute(routeId);
  }
</script>

<div class="route-selector" role="tablist" aria-label="Rutter">
  {#each routes as route (route.id)}
    <div 
      class="route-tab"
      class:active={selected === route.id}
      onclick={() => selectRoute(route.id)}
      onkeydown={(e) => e.key === 'Enter' && selectRoute(route.id)}
      role="tab"
      tabindex="0"
      aria-selected={selected === route.id}
    >
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={transportIcons[route.transportType]} />
      </svg>
      <span class="name">{route.name}</span>
      {#if editing && routes.length > 1}
        <button 
          class="delete-btn" 
          onclick={(e) => handleDelete(e, route.id)}
          aria-label="Ta bort rutt {route.name}"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .route-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .route-tab {
    flex-shrink: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #888;
    padding: 12px 16px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .route-tab:hover {
    border-color: #555;
    color: #ccc;
  }

  .route-tab.active {
    background: #fff;
    border-color: #fff;
    color: #000;
  }

  .icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .name {
    white-space: nowrap;
  }

  .delete-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e53935;
    border: none;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    padding: 3px;
  }

  .delete-btn svg {
    width: 12px;
    height: 12px;
  }

  .route-tab:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: #c62828;
  }
</style>
