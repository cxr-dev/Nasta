<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { departureStore } from './stores/departureStore';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  
  let editing = $state(false);
  let updateAvailable = $state(false);
  
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('updatefound', () => {
      const reg = navigator.serviceWorker.ready;
      reg.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                updateAvailable = true;
              }
            });
          }
        });
      });
    });
  }
  
  function reloadApp() {
    window.location.reload();
  }
  
  let route = $derived($selectedRoute);
  let routes = $derived($routeStore ?? []);
  let hasNoRoutes = $derived(!routes || routes.length === 0);
  
  function loadDepartures() {
    if (route && route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(siteIds, stopNames, 30000);
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
      const routes = $routeStore ?? [];
      if (routes.length > 0) {
        selectedRouteId.set(routes[0].id);
      }
    }
  }
  
  onMount(() => {
    routeStore.initialize();
    const routes = $routeStore ?? [];
    if (routes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(routes[0].id);
    }
    loadDepartures();
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && route && route.segments) {
        const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
        const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
        departureStore.refresh(siteIds, stopNames);
      }
    });
  });
  
  onDestroy(() => {
    departureStore.stopAutoRefresh();
  });
</script>

<main>
  {#if updateAvailable}
    <div class="update-banner">
      <span>Ny version tillgänglig!</span>
      <button onclick={reloadApp}>Ladda om</button>
    </div>
  {/if}
  <Header />
  
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
  
  {#if !hasNoRoutes}
    <button class="edit-btn" onclick={toggleEdit}>
      {editing ? 'Klar' : 'Redigera'}
    </button>
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
    position: relative;
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    padding-top: 80px;
    padding-bottom: 72px;
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

  .update-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: var(--accent);
    color: #fff;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 9999;
    font-size: 14px;
  }

  .update-banner button {
    background: #fff;
    color: var(--accent);
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
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

  .edit-btn {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    z-index: 100;
  }

  .edit-btn:hover {
    background: #1d4ed8;
  }
</style>