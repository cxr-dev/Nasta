<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  
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

<div class="tabs" role="tablist" aria-label="Rutter">
  {#each routes as route (route.id)}
    <button 
      class="tab"
      class:active={selected === route.id}
      onclick={() => selectRoute(route.id)}
      role="tab"
      aria-selected={selected === route.id}
    >
      <span class="name">{route.name}</span>
      {#if editing && routes.length > 1}
        <span class="delete" onclick={(e) => handleDelete(e, route.id)} aria-label="Ta bort">
          ×
        </span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .tab:hover {
    border-color: var(--text-secondary);
    color: var(--text);
  }

  .tab.active {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
  }

  .name {
    flex: 1;
  }

  .delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--danger);
    color: #fff;
    font-size: 14px;
    line-height: 1;
  }
</style>
