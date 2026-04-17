<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { departureStore } from './stores/departureStore';
  import { settingsStore } from './stores/settingsStore';
  import { timeOfDay, weatherEmoji, isSunlightMode } from './lib/stores/timeOfDay';
  import { applyTheme } from './themes';
  import { computeArrivalSummary } from './lib/arrivalTime';
  import { initializeCacheLifecycle, stopCacheLifecycle } from './lib/cacheLifecycle';
  import { locale, resolveLocale, t } from './stores/localeStore';
  import { searchSites } from './services/slApi';
  
  import RouteHeader from './components/RouteHeader.svelte';
  import BottomBar from './components/BottomBar.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';

  let editing = $state(false);
  let updateAvailable = $state(false);
  let lastRefreshTime = $state(Date.now());
  let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let showOnboarding = $state(false);
  let siteLookupError = $state<string | null>(null);
  let dataOld = $derived(Date.now() - lastRefreshTime > 120000);
  let swipeStartX = 0;
  let swipeStartY = 0;
  let scrollContainer = $state<HTMLElement | null>(null);

  // Pull-to-refresh state
  const PULL_THRESHOLD = 64;
  const PULL_MAX = 90;
  let pullDistance = $state(0);
  let isRefreshing = $state(false);
  let pullTriggered = false; // prevents treating a PTR gesture as a horizontal swipe

  const hasSeenOnboarding = typeof localStorage !== 'undefined'
    && localStorage.getItem('nasta_onboarding_seen');

  // Service Worker lifecycle handling
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    // Register service worker with explicit update check for iOS Safari
    navigator.serviceWorker.register('/sw.js').then(registration => {
      // Explicitly check for updates - required for iOS Safari reliability
      registration.update();

      // Fallback banner for browsers where controllerchange doesn't fire
      if (registration.waiting && navigator.serviceWorker.controller) {
        updateAvailable = true;
      }
      registration.addEventListener('updatefound', () => {
        const w = registration.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            updateAvailable = true;
          }
        });
      });
    }).catch(err => {
      if (import.meta.env.DEV) console.error('[App] Service Worker registration failed:', err);
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
  let arrivalSummary = $derived(route ? computeArrivalSummary(route, departures) : null);

  $effect(() => {
    applyTheme($settingsStore.theme ?? 'default', $settingsStore.themeVariant ?? 'A');
  });

  $effect(() => {
    locale.set(resolveLocale($settingsStore.language ?? 'auto'));
  });

  // Watch for route changes and load departures
  $effect(() => {
    const currentRoute = $selectedRoute;
    if (!currentRoute) return;
    const siteIds = currentRoute.segments
      .map(s => s.fromStop.siteId || s.toStop.siteId)
      .filter(Boolean);
    if (siteIds.length > 0) {
      const stopNames = new Map(currentRoute.segments.map(s => {
        const siteId = s.fromStop.siteId || s.toStop.siteId;
        return [siteId, s.fromStop.name || s.toStop.name];
      }));
      departureStore.startAutoRefresh(
        siteIds,
        stopNames,
        settings.refreshInterval || 30000,
        true,
        currentRoute.direction
      );
      lastRefreshTime = Date.now();
    }
  });

  async function loadDepartures(clearFirst = false) {
    if (route && route.segments.length > 0) {
      const siteIds = route.segments
        .map(s => s.fromStop.siteId || s.toStop.siteId)
        .filter(Boolean);
      const stopNames = new Map(route.segments.map(s => {
        const siteId = s.fromStop.siteId || s.toStop.siteId;
        return [siteId, s.fromStop.name || s.toStop.name];
      }));
      if (siteIds.length > 0) {
        departureStore.startAutoRefresh(
          siteIds,
          stopNames,
          settings.refreshInterval || 30000,
          clearFirst,
          route.direction
        );
        lastRefreshTime = Date.now();
      } else if (route.segments.length > 0) {
        if (import.meta.env.DEV) console.log('[App] siteIds empty, attempting proactive lookup');
        const resolvedIds = await lookupMissingSiteIds(route.segments);
        if (resolvedIds.length > 0) {
          const resolvedStopNames = new Map<string, string>();
          route.segments.forEach((s, i) => {
            if (resolvedIds[i] && (s.fromStop.name || s.toStop.name)) {
              resolvedStopNames.set(resolvedIds[i], s.fromStop.name || s.toStop.name);
            }
          });
          departureStore.startAutoRefresh(
            resolvedIds.filter(Boolean),
            resolvedStopNames,
            settings.refreshInterval || 30000,
            true,
            route.direction
          );
          lastRefreshTime = Date.now();
        }
      }
    } else {
      if (import.meta.env.DEV) console.log(`[App] loadDepartures: No segments for route ${route?.id} (direction: ${route?.direction})`);
    }
  }

  async function lookupMissingSiteIds(segments: Array<{ fromStop: { name: string; siteId: string }; toStop: { name: string; siteId: string } }>): Promise<string[]> {
    const results: string[] = [];
    let hadError = false;
    for (const segment of segments) {
      const fromId = segment.fromStop.siteId || segment.toStop.siteId;
      if (fromId) {
        results.push(fromId);
      } else {
        const stopName = segment.fromStop.name || segment.toStop.name;
        if (stopName) {
          try {
            const sites = await searchSites(stopName);
            if (!sites[0]?.siteId) {
              hadError = true;
            }
            results.push(sites[0]?.siteId || '');
          } catch {
            hadError = true;
            results.push('');
          }
        } else {
          results.push('');
        }
      }
    }
    if (hadError) {
      siteLookupError = 'Some stop locations could not be found';
    }
    return results.filter(Boolean);
  }

function handleRouteSwitch(routeId: string) {
    const currentRoute = $selectedRoute;
    if (!currentRoute) return;
    if (import.meta.env.DEV) console.log(`[App] handleRouteSwitch: ${currentRoute.id} (${currentRoute.direction}) -> ${routeId}`);
    selectedRouteId.set(routeId);
    loadDepartures(true);
  }

  function toggleEdit() {
    editing = !editing;
    if (editing) {
      departureStore.stopAutoRefresh();
    } else {
      loadDepartures();
    }
  }

  function handleTouchStart(e: TouchEvent) {
    if (editing) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    pullTriggered = false;
  }

  function handleTouchMove(e: TouchEvent) {
    if (editing || isRefreshing) return;
    const dy = e.touches[0].clientY - swipeStartY;
    const dx = e.touches[0].clientX - swipeStartX;
    const atTop = !scrollContainer || scrollContainer.scrollTop === 0;
    if (atTop && dy > 0 && dy > Math.abs(dx) * 1.2) {
      pullDistance = Math.min(dy * 0.55, PULL_MAX);
    } else if (pullDistance > 0) {
      pullDistance = 0;
    }
  }

  function handleTouchCancel() {
    swipeStartX = 0;
    swipeStartY = 0;
    pullDistance = 0;
    pullTriggered = false;
  }

  async function handleTouchEnd(e: TouchEvent) {
    if (editing) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;

    // Pull-to-refresh takes priority over horizontal swipe
    if (pullDistance >= PULL_THRESHOLD) {
      pullTriggered = true;
      pullDistance = 0;
      await triggerManualRefresh();
      return;
    }
    pullDistance = 0;

    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 48) return;

    const allRoutes = $routeStore ?? [];
    if (allRoutes.length < 2) return;
    const currentIdx = allRoutes.findIndex(r => r.id === $selectedRouteId);
    if (dx < 0 && currentIdx < allRoutes.length - 1) {
      handleRouteSwitch(allRoutes[currentIdx + 1].id);
    } else if (dx > 0 && currentIdx > 0) {
      handleRouteSwitch(allRoutes[currentIdx - 1].id);
    }
    if (!settings.hasSwipedRoutes) {
      settingsStore.markSwiped();
    }
  }

  async function triggerManualRefresh() {
    if (!route?.segments || isRefreshing) return;
    isRefreshing = true;
    const siteIds = route.segments
      .map(s => s.fromStop.siteId || s.toStop.siteId)
      .filter(Boolean);
    const stopNames = new Map(route.segments.map(s => {
      const siteId = s.fromStop.siteId || s.toStop.siteId;
      return [siteId, s.fromStop.name || s.toStop.name];
    }));
    try {
      await departureStore.refresh(siteIds, stopNames, true, route.direction);
      lastRefreshTime = Date.now();
    } finally {
      isRefreshing = false;
    }
  }

  onMount(() => {
    timeOfDay.start();
    routeStore.initialize();
    initializeCacheLifecycle();
    const initialRoutes = $routeStore ?? [];

    if (!hasSeenOnboarding && initialRoutes.length === 0) {
      showOnboarding = true;
    }
    if (initialRoutes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(initialRoutes[0].id);
    }
    loadDepartures();

    const unsub = departureStore.subscribe(data => { departures = data; });

    lastRefreshInterval = setInterval(() => {
      if (!document.hidden) {
        lastRefreshTime = Date.now();
      }
    }, 1000);

    const onVisibility = () => {
      if (!document.hidden && route?.segments) {
        const timeSinceLastRefresh = Date.now() - lastRefreshTime;
        if (timeSinceLastRefresh > 10000) {
          const siteIds = route.segments
            .map(s => s.fromStop.siteId || s.toStop.siteId)
            .filter(Boolean);
          const stopNames = new Map(route.segments.map(s => {
            const siteId = s.fromStop.siteId || s.toStop.siteId;
            return [siteId, s.fromStop.name || s.toStop.name];
          }));
          departureStore.refresh(siteIds, stopNames, false, route.direction);
          lastRefreshTime = Date.now();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  onDestroy(() => {
    timeOfDay.stop();
    departureStore.stopAutoRefresh();
    stopCacheLifecycle();
    if (lastRefreshInterval) clearInterval(lastRefreshInterval);
  });
</script>

{#if showOnboarding}
  <Onboarding onComplete={completeOnboarding} />
{:else}
  <ErrorBoundary>
    <main
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchCancel}
  >
    {#if updateAvailable}
      <div class="update-banner">
        <span>{$t.updateAvailable}</span>
        <button onclick={reloadApp}>{$t.reload}</button>
      </div>
    {/if}

    {#if !hasNoRoutes}
      <RouteHeader
        activeRouteId={$selectedRouteId ?? ''}
        {routes}
        onSwitch={handleRouteSwitch}
      />
    {/if}

    <div
      class="pull-indicator"
      class:refreshing={isRefreshing}
      style="--pull: {pullDistance}px; --progress: {Math.min(pullDistance / PULL_THRESHOLD, 1)}"
    >
      {#if isRefreshing}
        <div class="ptr-spinner"></div>
      {:else}
        <svg class="ptr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
      {/if}
    </div>

    {#if siteLookupError}
      <div class="warning-banner">
        <span>{siteLookupError}</span>
        <button onclick={() => siteLookupError = null}>×</button>
      </div>
    {/if}

    <div class="scroll-container" bind:this={scrollContainer}>
      {#if hasNoRoutes}
        <div class="empty-state">
          <div class="empty-illustration">
            <svg viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="50" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
              <path d="M40 60h40M60 40v40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <circle cx="60" cy="60" r="8" fill="currentColor" opacity="0.3"/>
            </svg>
          </div>
          <h2>{$t.noRoutes}</h2>
          <p>{$t.noRoutesDesc}</p>
          <button class="empty-cta" onclick={toggleEdit}>
            <span>{$t.createRoute}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 4v12M4 10h12"/>
            </svg>
          </button>
        </div>
      {:else if route && route.segments.length > 0}
        <SegmentDepartures {route} />
      {:else if route}
        <div class="empty-segments">
          <div class="empty-illustration small">
            <svg viewBox="0 0 80 80" fill="none">
              <rect x="15" y="20" width="50" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
              <path d="M25 35h20M25 45h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <h2>{$t.noSegments}</h2>
          <p>{$t.noSegmentsDesc}</p>
          <button class="empty-cta" onclick={toggleEdit}>
            <span>{$t.add}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 4v12M4 10h12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    {#if !hasNoRoutes}
      <BottomBar
        arrivalSummary={arrivalSummary}
        {editing}
        onclick={toggleEdit}
        activeRouteDirection={route?.direction ?? 'toWork'}
      />
    {/if}

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
  </ErrorBoundary>
{/if}

<footer class="attribution">
  {$t.attribution} <a href="https://trafiklab.se" target="_blank" rel="noopener">Trafiklab</a>
</footer>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    font-family: 'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    overflow: hidden;
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

  /* Default theme tokens — overridden at runtime by applyTheme() on :root */
  :global(:root) {
    --bg:              #FAFAF9;
    --surface:         #FFFFFF;
    --border:          rgba(0,0,0,0.08);
    --border-subtle:   rgba(0,0,0,0.14);
    --text:            #171717;
    --text-secondary:  rgba(0,0,0,0.55);
    --text-muted:      rgba(0,0,0,0.35);
    --text-ghost:      rgba(0,0,0,0.13);
    --accent:          #171717;
    --accent-subtle:   rgba(23,23,23,0.10);
    --route-work:      #2563EB;
    --route-home:      #059669;
  }

  main {
    position: relative;
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    touch-action: pan-x pan-y; /* allow scroll + swipe; JS handles PTR */
    background: var(--bg);
  }

  .pull-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--pull, 0px);
    overflow: hidden;
    transition: height 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: height;
    flex-shrink: 0;
  }

  .pull-indicator.refreshing {
    height: 52px;
    transition: height 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ptr-arrow {
    width: 22px;
    height: 22px;
    color: var(--accent);
    opacity: var(--progress, 0);
    transform: rotate(calc(var(--progress, 0) * 180deg));
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .ptr-spinner {
    width: 20px;
    height: 20px;
    border: 2.5px solid var(--accent-subtle);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: ptr-spin 0.65s linear infinite;
  }

  @keyframes ptr-spin {
    to { transform: rotate(360deg); }
  }

  .scroll-container {
    flex: 1;
    overflow-y: scroll;
    background: var(--bg);
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 4px 20px calc(env(safe-area-inset-bottom) + 140px);

    /* Fix Chrome 125+ double scrollbar bug */
    scrollbar-gutter: stable;
  }

  /* Normalize scrollbars across browsers and prevent double scrollbars */
  :global(*)::-webkit-scrollbar {
    width: 12px;
  }

  :global(*)::-webkit-scrollbar-track {
    background: transparent;
  }

  :global(*)::-webkit-scrollbar-thumb {
    background-color: var(--border-subtle);
    border-radius: 20px;
    border: 3px solid var(--bg);
  }

  /* Fix for Chrome 125+ bug where both native and custom scrollbars appear */
  @supports not selector(::-webkit-scrollbar) {
    .scroll-container {
      scrollbar-width: thin;
      scrollbar-color: var(--border-subtle) var(--bg);
    }
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
    font-weight: 500;
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
    padding: 80px 20px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .empty-illustration {
    width: 100px;
    height: 100px;
    color: var(--text-ghost);
    margin-bottom: 8px;
  }

  .empty-illustration.small {
    width: 64px;
    height: 64px;
  }

  .empty-state h2,
  .empty-segments h2 {
    font-family: 'Neue Machina', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .empty-state p,
  .empty-segments p {
    font-size: 15px;
    color: var(--text-secondary);
    max-width: 240px;
  }

  .empty-cta {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 14px 24px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }

  .empty-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);
  }

  .empty-cta:active {
    transform: translateY(0);
  }

  .empty-cta svg {
    width: 18px;
    height: 18px;
  }

  .attribution {
    text-align: center;
    padding: 20px;
    font-size: 11px;
    color: var(--text-muted);
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }

  .attribution a {
    color: var(--text-muted);
    text-decoration: underline;
  }

  .warning-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 20px;
    padding: 10px 12px;
    background: #FEF3C7;
    border: 1px solid #FCD34D;
    border-radius: 8px;
    color: #92400E;
    font-size: 13px;
  }

  .warning-banner button {
    background: none;
    border: none;
    color: #92400E;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }
</style>
