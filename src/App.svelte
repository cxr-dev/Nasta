<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { departureStore } from './stores/departureStore';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  
  let editing = $state(false);
  
  let route = $derived($selectedRoute);
  let routes = $derived($routeStore);
  let hasNoRoutes = $derived(routes.length === 0);
  
  function loadDepartures() {
    if (route && route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(siteIds, 30000);
      }
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
  
  function handleDeleteRoute(routeId: string) {
    routeStore.removeRoute(routeId);
    if ($selectedRouteId === routeId) {
      const routes = $routeStore;
      if (routes.length > 0) {
        selectedRouteId.set(routes[0].id);
      }
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
        const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
        departureStore.refresh(siteIds);
      }
    });
  });
  
  onDestroy(() => {
    departureStore.stopAutoRefresh();
  });
</script>

<main>
  <Header 
    {editing}
    onToggleEdit={toggleEdit}
  />
  
  <RouteSelector 
    onSelect={handleRouteSelect} 
    editing={editing}
    onDeleteRoute={handleDeleteRoute}
  />
  
  {#if hasNoRoutes}
    <div class="empty-state">
      <p>Inga rutter ännu</p>
      <button class="empty-cta" onclick={toggleEdit}>Skapa din första rutt</button>
    </div>
  {:else if editing && route}
    <RouteEditor {route} />
  {:else if route && route.segments.length > 0}
    <SegmentDepartures {route} />
  {:else if route}
    <div class="empty-segments">
      <p>Inga segment i denna rutt</p>
      <button class="empty-cta" onclick={toggleEdit}>Lägg till segment</button>
    </div>
  {/if}
</main>

<footer class="attribution">
  Transit data from <a href="https://trafiklab.se" target="_blank" rel="noopener">Trafiklab.se</a>
</footer>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
    --bg: #FAFBFC;
    --text: #1F2937;
    --text-secondary: #6B7280;
    --surface: #FFFFFF;
    --border: #E5E7EB;
    --accent: #2563EB;
    --accent-light: #DBEAFE;
    --to-work: #2563EB;
    --to-work-light: #DBEAFE;
    --from-work: #059669;
    --from-work-light: #D1FAE5;
    --danger: #DC2626;
  }

  :global(body) {
    background: var(--bg);
    color: var(--text);
  }

  :global(input),
  :global(button),
  :global(select) {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }

  :global(.segment),
  :global(.route-editor) {
    background: var(--surface);
  }

  .empty-state, .empty-segments {
    text-align: center;
    padding: 48px 16px;
    color: var(--text-secondary);
  }

  .empty-state p, .empty-segments p {
    font-size: 16px;
    margin-bottom: 16px;
  }

  .empty-cta {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .attribution {
    text-align: center;
    padding: 16px;
    font-size: 11px;
    color: var(--text-secondary);
    border-top: 1px solid var(--border);
    margin-top: 24px;
  }
  .attribution a {
    color: var(--text-secondary);
    text-decoration: underline;
  }
</style>