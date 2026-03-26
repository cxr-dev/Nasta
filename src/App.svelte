<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { departureStore } from './stores/departureStore';
  import { settingsStore } from './stores/settingsStore';
  import { timeOfDay, weatherEmoji, isSunlightMode } from './lib/stores/timeOfDay';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import FloatingEditButton from './components/FloatingEditButton.svelte';
  import QuirkyMoment from './components/QuirkyMoment.svelte';
  import Onboarding from './components/Onboarding.svelte';
  
  let editing = $state(false);
  let updateAvailable = $state(false);
  let lastRefreshTime = $state(Date.now());
  let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let showOnboarding = $state(false);
  let dataOld = $derived(Date.now() - lastRefreshTime > 120000);

  const hasSeenOnboarding = typeof localStorage !== 'undefined' && localStorage.getItem('nasta_onboarding_seen');

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
  
  function completeOnboarding() {
    showOnboarding = false;
    localStorage.setItem('nasta_onboarding_seen', 'true');
  }
  
  let route = $derived($selectedRoute);
  let routes = $derived($routeStore ?? []);
  let hasNoRoutes = $derived(!routes || routes.length === 0);
  let timeState = $derived($timeOfDay);
  let settings = $derived($settingsStore);
  let sunlightMode = $derived($isSunlightMode && settings.darkMode);
  
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

  function calculateWalkTime(): string | null {
    if (!route || route.segments.length === 0) return null;
    const firstSegment = route.segments[0];
    const walkMinutes = Math.floor(Math.random() * 3) + 1;
    return walkMinutes > 0 ? `${walkMinutes} min` : null;
  }

  let walkTime = $derived(calculateWalkTime());
  let needsToLeaveNow = $derived(walkTime && route && route.segments[0] && departureStore ? true : false);
  
  function getSecondsSinceRefresh(): number {
    return Math.floor((Date.now() - lastRefreshTime) / 1000);
  }
  
  onMount(() => {
    timeOfDay.start();
    routeStore.initialize();
    const routes = $routeStore ?? [];
    
    if (!hasSeenOnboarding && routes.length === 0) {
      showOnboarding = true;
    }
    
    if (routes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(routes[0].id);
    }
    loadDepartures();
    
    lastRefreshInterval = setInterval(() => {
      lastRefreshTime = Date.now();
    }, 1000);
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && route && route.segments) {
        const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
        const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
        departureStore.refresh(siteIds, stopNames);
        lastRefreshTime = Date.now();
      }
    });
  });
  
  onDestroy(() => {
    timeOfDay.stop();
    departureStore.stopAutoRefresh();
    if (lastRefreshInterval) clearInterval(lastRefreshInterval);
  });
</script>

<main class:sunlight={sunlightMode}>
  {#if showOnboarding}
    <Onboarding onComplete={completeOnboarding} />
  {:else}
    {#if updateAvailable}
      <div class="update-banner">
        <span>Ny version tillgänglig!</span>
        <button onclick={reloadApp}>Ladda om</button>
      </div>
    {/if}
    
    <div class="ambient-status-bar" class:sunlight={sunlightMode}>
      <div class="status-left">
        <span class="route-emoji">{route?.direction === 'toWork' ? '🏢' : '🏠'}</span>
        <span class="route-name">{route?.name || 'Välj rutt'}</span>
      </div>
      <div class="status-center">
        <span class="next-arrival">Nästa: {timeState.formattedTime}</span>
      </div>
      <div class="status-right">
        <span class="weather">{weatherEmoji}</span>
        <span class="refresh-time" class:old={dataOld}>{getSecondsSinceRefresh()} s</span>
      </div>
    </div>
    
    <QuirkyMoment />
    
    <Header />
    
    {#if needsToLeaveNow && walkTime}
      <div class="leave-now-banner">
        <span class="leave-icon">👟</span>
        <span class="leave-text">Gå nu – {walkTime} till hållplats</span>
      </div>
    {/if}
    
    <RouteSelector 
      onSelect={handleRouteSelect} 
      editing={editing}
      onDeleteRoute={handleDeleteRoute}
    />
    
    <div class="scroll-container">
      {#if hasNoRoutes}
        <div class="empty-state">
          <div class="empty-icon">🚇</div>
          <p>Inga rutter ännu</p>
          <p class="empty-subtitle">Skapa din första rutt för att se avgångar</p>
          <button class="empty-cta" onclick={toggleEdit}>Skapa din första rutt</button>
        </div>
      {:else if editing && route}
        <RouteEditor {route} />
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
      <FloatingEditButton {editing} onclick={toggleEdit} {dataOld} />
    {/if}
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
    padding: 0;

    /* Core */
    --bg:              #F0F2F7;
    --surface:         #FFFFFF;
    --border:          #E8EBF2;
    --border-subtle:   #D8DCE6;

    /* Text */
    --text:            #0F172A;
    --text-secondary:  #475569;
    --text-muted:      #94A3B8;
    --text-ghost:      #C0C8D8;

    /* Brand */
    --brand-muted:     #94A3B8;

    /* Route identity */
    --route-work:      #1E3A8A;
    --route-home:      #065F46;

    /* Actions */
    --accent:          #2563EB;
    --danger:          #DC2626;
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

  .ambient-status-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    max-width: 480px;
    margin: 0 auto;
    height: 36px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 12px;
    z-index: 100;
    gap: 8px;
  }

  .status-left,
  .status-center,
  .status-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-left {
    flex: 1;
    min-width: 0;
  }

  .status-center {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .status-right {
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }

  .route-emoji {
    font-size: 14px;
  }

  .route-name {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  .next-arrival {
    color: var(--text-secondary);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .weather {
    font-size: 14px;
  }

  .refresh-time {
    color: var(--text-secondary);
    font-size: 11px;
  }

  .refresh-time.old {
    color: var(--danger);
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .leave-now-banner {
    background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
    color: #92400E;
    padding: 10px 16px;
    border-radius: 12px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    animation: slideDown 0.3s ease-out;
  }

  main.sunlight .leave-now-banner {
    background: linear-gradient(135deg, #451A03 0%, #78350F 100%);
    color: #FDE68A;
  }

  .leave-icon {
    font-size: 18px;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .scroll-container {
    flex: 1 1 auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding-bottom: 100px;
    min-height: 0;
  }

  .empty-state, .empty-segments {
    text-align: center;
    padding: 48px 16px;
    color: var(--text-secondary);
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-state p, .empty-segments p {
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
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .empty-cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  }

  .empty-cta:active {
    transform: translateY(0);
  }

  .update-banner {
    position: fixed;
    top: 36px;
    left: 0;
    right: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--accent);
    color: #fff;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 9999;
    font-size: 14px;
    animation: slideDown 0.3s ease-out;
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
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }
  
  .attribution a {
    color: var(--text-secondary);
    text-decoration: underline;
  }
</style>