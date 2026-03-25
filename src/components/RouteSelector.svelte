<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  
  export let onSelect: (routeId: string) => void = () => {};
  
  $: routes = $routeStore;
  $: selected = $selectedRouteId;
  
  function selectRoute(id: string) {
    selectedRouteId.set(id);
    onSelect(id);
  }
</script>

<div class="route-selector">
  {#each routes as route (route.id)}
    <button 
      class="route-tab"
      class:active={selected === route.id}
      on:click={() => selectRoute(route.id)}
    >
      {route.name}
    </button>
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
    padding: 12px 20px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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
</style>
