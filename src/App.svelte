<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import DepartureList from './components/DepartureList.svelte';
  import ArrivalTime from './components/ArrivalTime.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import AddRouteModal from './components/AddRouteModal.svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { settingsStore } from './stores/settingsStore';
  import { departureStore } from './stores/departureStore';
  import { calculateArrival } from './services/arrivalCalculator';
  
  let editing = $state(false);
  let showAddRouteModal = $state(false);
  let addRouteBtnRef = $state<HTMLButtonElement | null>(null);
  
  let route = $derived($selectedRoute);
  let routes = $derived($routeStore);
  let departures = $derived($departureStore);
  let settings = $derived($settingsStore);
  let hasNoRoutes = $derived(routes.length === 0);
  
  let arrivalInfo = $derived.by(() => {
    if (route && departures) {
      return calculateArrival(route.stops, departures);
    }
    return null;
  });
  
  function loadDepartures() {
    if (route && route.stops.length > 0) {
      const siteIds = route.stops.map(s => s.siteId);
      departureStore.startAutoRefresh(siteIds, settings.refreshInterval);
    }
  }
  
  function handleRouteSelect() {
    loadDepartures();
  }
  
  function toggleEdit() {
    editing = !editing;
    if (editing) {
      departureStore.stopAutoRefresh();
    } else {
      loadDepartures();
    }
  }
  
  function toggleTheme() {
    settingsStore.toggleDarkMode();
  }

  function openAddRouteModal() {
    showAddRouteModal = true;
  }

  function closeAddRouteModal() {
    showAddRouteModal = false;
  }
  
  function handleDeleteRoute(routeId: string) {
    routeStore.removeRoute(routeId);
    if ($selectedRouteId === routeId) {
      const routes = $routeStore;
      if (routes.length > 0) {
        selectedRouteId.set(routes[0].id);
      }
    }
  }
  
  function handleRemoveStop(stopId: string) {
    if (route) {
      routeStore.removeStop(route.id, stopId);
    }
  }
  
  onMount(() => {
    routeStore.initialize();
    const routes = $routeStore;
    if (routes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(routes[0].id);
    }
    loadDepartures();
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && route) {
        departureStore.refresh(route.stops.map(s => s.siteId));
      }
    });
  });
  
  onDestroy(() => {
    departureStore.stopAutoRefresh();
  });
</script>

<main class:dark={settings.darkMode}>
  <Header 
    {editing}
    darkMode={settings.darkMode}
    onToggleEdit={toggleEdit}
    onToggleTheme={toggleTheme}
    onAddRoute={openAddRouteModal}
    bind:addRouteBtnRef
  />
  
  <RouteSelector 
    onSelect={handleRouteSelect} 
    editing={editing}
    onDeleteRoute={handleDeleteRoute}
  />
  
  {#if hasNoRoutes}
    <div class="empty-state">
      <p>Inga rutter ännu</p>
      <button class="empty-cta" onclick={openAddRouteModal}>Lägg till din första rutt</button>
    </div>
  {:else if editing && route}
    <RouteEditor {route} />
  {:else if route}
    <DepartureList 
      stops={route.stops} 
      {departures} 
      {editing}
      onRemoveStop={handleRemoveStop}
    />
    <ArrivalTime arrival={arrivalInfo} />
  {/if}
  
  {#if showAddRouteModal}
    <AddRouteModal onClose={closeAddRouteModal} triggerRef={addRouteBtnRef} />
  {/if}
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg, #fff);
    color: var(--text-primary, #000);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    transition: background 0.3s, color 0.3s;
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
  }

  main.dark {
    --bg: #000;
    --text-primary: #fff;
    --text-secondary: #888;
    --text-secondary-hover: #ccc;
    --surface: #1a1a1a;
    --surface-active: #fff;
    --border: #333;
    --border-hover: #555;
    --border-focus: #666;
    --border-active: #fff;
    --input-bg: #222;
    --overlay: rgba(0, 0, 0, 0.6);
    --btn-primary-bg: #fff;
    --btn-primary-text: #000;
    --btn-primary-hover: #eee;
    --danger: #e53935;
    --danger-text: #fff;
    background: var(--bg);
    color: var(--text-primary);
  }

  :global(body:not(.dark)) {
    --bg: #fff;
    --text-primary: #000;
    --text-secondary: #666;
    --text-secondary-hover: #333;
    --surface: #f5f5f5;
    --surface-active: #000;
    --border: #ddd;
    --border-hover: #bbb;
    --border-focus: #888;
    --border-active: #000;
    --input-bg: #fff;
    --overlay: rgba(0, 0, 0, 0.3);
    --btn-primary-bg: #000;
    --btn-primary-text: #fff;
    --btn-primary-hover: #333;
    --danger: #d32f2f;
    --danger-text: #fff;
  }

  main:not(.dark) {
    background: var(--bg);
    color: var(--text-primary);
  }

  main:not(.dark) :global(button),
  main:not(.dark) :global(input) {
    background: var(--input-bg);
    border-color: var(--border);
    color: var(--text-primary);
  }

  main:not(.dark) :global(.stop-item),
  main:not(.dark) :global(.route-editor) {
    background: var(--surface);
  }

  main:not(.dark) :global(.travel-time),
  main:not(.dark) :global(.travel-input input) {
    background: var(--input-bg);
  }

  .empty-state {
    text-align: center;
    padding: 48px 16px;
    color: var(--text-secondary, #888);
  }

  .empty-state p {
    font-size: 16px;
    margin-bottom: 16px;
  }

  .empty-cta {
    background: var(--btn-primary-bg, #fff);
    color: var(--btn-primary-text, #000);
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
</style>
