<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  import { directionIcons } from '../icons/transport';
  
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
    <div 
      class="tab"
      class:active={selected === route.id}
      class:to-work={route.direction === 'toWork'}
      class:from-work={route.direction === 'fromWork'}
      onclick={() => selectRoute(route.id)}
      onkeydown={(e) => e.key === 'Enter' && selectRoute(route.id)}
      role="tab"
      tabindex="0"
      aria-selected={selected === route.id}
    >
      <span class="name" title={route.direction === 'toWork' ? 'Res till arbetet' : 'Res hem'}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d={route.direction === 'toWork' ? directionIcons.toWork : directionIcons.fromWork} />
        </svg>
      </span>
      {#if editing && routes.length > 2}
        <button 
          class="delete"
          onclick={(e) => handleDelete(e, route.id)}
          aria-label="Ta bort rutt"
        >
          ×
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 12px;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .tab:hover {
    border-color: var(--text-secondary);
    color: var(--text);
  }

  .tab.active.to-work {
    background: var(--to-work);
    border-color: var(--to-work);
    color: #fff;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  }

  .tab.active.from-work {
    background: var(--from-work);
    border-color: var(--from-work);
    color: #fff;
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.25);
  }

  .name {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.2s;
  }

  .delete:hover {
    background: rgba(0, 0, 0, 0.2);
  }
</style>