<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { departureStore } from './stores/departureStore';
  import { settingsStore } from './stores/settingsStore';
  import { timeOfDay, weatherEmoji, isSunlightMode } from './lib/stores/timeOfDay';
  import { computeArrivalTime } from './lib/arrivalTime';
  import RouteHeader from './components/RouteHeader.svelte';
  import BottomBar from './components/BottomBar.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import QuirkyMoment from './components/QuirkyMoment.svelte';
  import Onboarding from './components/Onboarding.svelte';

  let editing = $state(false);
  let updateAvailable = $state(false);
  let lastRefreshTime = $state(Date.now());
  let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let showOnboarding = $state(false);
  let dataOld = $derived(Date.now() - lastRefreshTime > 120000);
  let swipeStartX = 0;
  let swipeStartY = 0;

  const hasSeenOnboarding = typeof localStorage !== 'undefined'
    && localStorage.getItem('nasta_onboarding_seen');

  // Service worker update detection
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('updatefound', () => {
      navigator.serviceWorker.ready.then(registration => {
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

  function reloadApp() { window.location.reload(); }

  function completeOnboarding() {
    showOnboarding = false;
    localStorage.setItem('nasta_onboarding_seen', 'true');
  }

  let route = $derived($selectedRoute);
  let routes = $derived($routeStore ?? []);
  let hasNoRoutes = $derived(!routes || routes.length === 0);
  let settings = $derived($settingsStore);
  let departures = $state<Map<string, import('./stores/departureStore').Departure[]>>(new Map());
  let arrivalTime = $derived(route ? computeArrivalTime(route, departures) : null);

  function loadDepartures() {
    if (route && route.segments.length > 0) {
      const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
      const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(siteIds, stopNames, settings.refreshInterval || 30000);
        lastRefreshTime = Date.now();
      }
    }
  }

  function handleRouteSwitch(routeId: string) {
    selectedRouteId.set(routeId);
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

  // Swipe gesture — horizontal swipe on main container switches routes
  function handleTouchStart(e: TouchEvent) {
    if (editing) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (editing) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll — ignore
    if (Math.abs(dx) < 48) return; // below threshold

    const allRoutes = $routeStore ?? [];
    if (allRoutes.length < 2) return;
    const currentIdx = allRoutes.findIndex(r => r.id === $selectedRouteId);
    if (dx < 0 && currentIdx < allRoutes.length - 1) {
      handleRouteSwitch(allRoutes[currentIdx + 1].id);
    } else if (dx > 0 && currentIdx > 0) {
      handleRouteSwitch(allRoutes[currentIdx - 1].id);
    }
  }

  onMount(() => {
    timeOfDay.start();
    routeStore.initialize();
    const initialRoutes = $routeStore ?? [];

    if (!hasSeenOnboarding && initialRoutes.length === 0) {
      showOnboarding = true;
    }
    if (initialRoutes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(initialRoutes[0].id);
    }
    loadDepartures();

    // Subscribe to departures for arrival time computation
    const unsub = departureStore.subscribe(data => { departures = data; });

    lastRefreshInterval = setInterval(() => {
      lastRefreshTime = Date.now();
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && route?.segments) {
        const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
        const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
        departureStore.refresh(siteIds, stopNames);
        lastRefreshTime = Date.now();
      }
    });

    return () => unsub();
  });

  onDestroy(() => {
    timeOfDay.stop();
    departureStore.stopAutoRefresh();
    if (lastRefreshInterval) clearInterval(lastRefreshInterval);
  });
</script>

{#if showOnboarding}
  <Onboarding onComplete={completeOnboarding} />
{:else}
  <main
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
  >
    {#if updateAvailable}
      <div class="update-banner">
        <span>Ny version tillgänglig!</span>
        <button onclick={reloadApp}>Ladda om</button>
      </div>
    {/if}

    {#if !hasNoRoutes}
      <RouteHeader
        activeRouteId={$selectedRouteId ?? ''}
        {routes}
        onSwitch={handleRouteSwitch}
      />
    {/if}

    <QuirkyMoment />

    <div class="scroll-container">
      {#if hasNoRoutes}
        <div class="empty-state">
          <div class="empty-icon">🚇</div>
          <p>Inga rutter ännu</p>
          <p class="empty-subtitle">Skapa din första rutt för att se avgångar</p>
          <button class="empty-cta" onclick={toggleEdit}>Skapa din första rutt</button>
        </div>
      {:else if route && route.segments.length > 0}
        <SegmentDepartures {route} />
      {:else if route}
        <div class="empty-segments">
          <div class="empty-icon">📍</div>
          <p>Inga segment i denna rutt</p>
          <p class="empty-subtitle">Lägg till avgångar för att komma igång</p>
          <button class="empty-cta" onclick={toggleEdit}>Lägg till segment</button>
        </div>
      {/if}
    </div>

    {#if !hasNoRoutes}
      <BottomBar
        {arrivalTime}
        {editing}
        onclick={toggleEdit}
        activeRouteDirection={route?.direction ?? 'toWork'}
      />
    {/if}

    <!-- RouteEditor: always in DOM, overlay via CSS transform -->
    {#if !hasNoRoutes && route}
      <RouteEditor
        {routes}
        activeRouteId={$selectedRouteId ?? ''}
        isOpen={editing}
        onClose={toggleEdit}
        onSwitchRoute={handleRouteSwitch}
      />
    {/if}
  </main>
{/if}

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
  overscroll-behavior: contain;
}

@media (prefers-reduced-motion: reduce) {
  :global(*),
  :global(*::before),
  :global(*::after) {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

main {
  position: relative;
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;

  --bg:              #F0F2F7;
  --surface:         #FFFFFF;
  --border:          #E8EBF2;
  --border-subtle:   #D8DCE6;
  --text:            #0F172A;
  --text-secondary:  #475569;
  --text-muted:      #94A3B8;
  --text-ghost:      #C0C8D8;
  --brand-muted:     #94A3B8;
  --route-work:      #1E3A8A;
  --route-home:      #065F46;
  --accent:          #2563EB;
  --danger:          #DC2626;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 4px 14px calc(env(safe-area-inset-bottom) + 140px);
}

.update-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  max-width: 480px;
  margin: 0 auto;
  background: var(--accent);
  color: #fff;
  padding: 10px 16px;
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
  padding: 6px 14px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.empty-state,
.empty-segments {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p,
.empty-segments p {
  font-size: 16px;
  margin-bottom: 8px;
}

.empty-subtitle {
  font-size: 14px !important;
  color: var(--text-secondary);
  opacity: 0.7;
  margin-bottom: 20px !important;
}

.empty-cta {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 14px 28px;
  border-radius: 12px;
  font-size: 15px;
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
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.attribution a {
  color: var(--text-secondary);
  text-decoration: underline;
}
</style>
