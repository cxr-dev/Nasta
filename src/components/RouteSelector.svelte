<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  import { transportIcons } from '../icons/transport';
  
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
      class:editing
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
    background: var(--surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    color: var(--text-secondary, #888);
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
    border-color: var(--border-hover, #555);
    color: var(--text-secondary-hover, #ccc);
  }

  .route-tab.active {
    background: var(--surface-active, #fff);
    border-color: var(--border-active, #fff);
    color: var(--text-primary-active, #000);
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
    background: var(--danger, #e53935);
    border: none;
    color: var(--danger-text, #fff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    padding: 3px;
  }

  .route-tab:hover .delete-btn,
  .route-tab.editing .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: #c62828;
  }
</style>
