<script lang="ts">
  import type { Route } from '../types/route';
  import { settingsStore } from '../stores/settingsStore';
  import { t } from '../stores/localeStore';

  let {
    activeRouteId,
    routes,
    onSwitch
  }: {
    activeRouteId: string;
    routes: Route[];
    onSwitch: (routeId: string) => void;
  } = $props();

  let settings = $derived($settingsStore);
  let activeRoute = $derived(routes.find(r => r.id === activeRouteId));
  let inactiveRoute = $derived(routes.find(r => r.id !== activeRouteId));
  let showSwipeHint = $derived(!settings.hasSwipedRoutes && routes.length === 2);

  function getLabel(route: Route | undefined): string {
    if (!route) return '';
    return route.direction === 'toWork' ? $t.toWork : $t.home;
  }

  function handleSwitch() {
    if (!inactiveRoute) return;
    onSwitch(inactiveRoute.id);
    if (!settings.hasSwipedRoutes) {
      settingsStore.markSwiped();
    }
  }

</script>

<header class="route-header">
  <div class="route-block">
    <h1 class="route-name">{getLabel(activeRoute)}</h1>

    {#if inactiveRoute}
      <button class="route-switch" onclick={handleSwitch}>
        <span class="switch-label">{getLabel(inactiveRoute)}</span>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {/if}
  </div>

  {#if showSwipeHint}
    <p class="swipe-hint">
      {activeRoute?.direction === 'toWork' ? $t.swipeHintToWork : $t.swipeHintHome}
    </p>
  {/if}

  <div class="header-rule"></div>
</header>

<style>
  .route-header {
    padding: 14px 20px 0;
    padding-top: calc(14px + env(safe-area-inset-top));
    background: var(--bg);
    position: relative;
  }

  .route-block {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 18px;
  }

  .route-name {
    font-family: 'Neue Machina', sans-serif;
    font-size: clamp(38px, 10vw, 52px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 0.9;
    margin: 0;
    color: var(--accent);
    /* Prevent overflow on narrow screens */
    min-width: 0;
    flex: 1;
  }

  .route-switch {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'Neue Machina', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--text-ghost);
    background: none;
    border: none;
    padding: 6px 0 6px 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 150ms ease;
    white-space: nowrap;
    align-self: flex-end;
    padding-bottom: 4px;
  }

  .route-switch svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    transition: transform 150ms ease;
  }

  .route-switch:hover {
    color: var(--text-muted);
  }

  .route-switch:hover svg {
    transform: translateX(2px);
  }

  .swipe-hint {
    font-size: 11px;
    color: var(--text-ghost);
    font-weight: 500;
    padding-bottom: 10px;
    padding-left: 1px;
  }

  .header-rule {
    height: 2px;
    background: var(--accent);
    opacity: 0.25;
    margin: 0 -20px;
  }
</style>
