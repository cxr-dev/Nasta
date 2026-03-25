<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import DepartureList from './components/DepartureList.svelte';
  import ArrivalTime from './components/ArrivalTime.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { settingsStore } from './stores/settingsStore';
  import { departureStore } from './stores/departureStore';
  import { calculateArrival } from './services/arrivalCalculator';
  
  let editing = false;
  let arrivalInfo: ReturnType<typeof calculateArrival> = null;
  
  $: route = $selectedRoute;
  $: departures = $departureStore;
  $: settings = $settingsStore;
  
  $: if (route && departures) {
    arrivalInfo = calculateArrival(route.stops, departures);
  }
  
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
  <Header />
  
  <RouteSelector onSelect={handleRouteSelect} />
  
  {#if editing && route}
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
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #000;
    color: #fff;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
  }

  main.dark {
    background: #000;
  }
</style>
