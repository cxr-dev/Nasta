<script lang="ts">
  import { onMount } from 'svelte';
  import type { Route } from '../types/route';
  import { settingsStore } from '../stores/settingsStore';

  let {
    activeRouteId,
    routes,
    onSwitch
  }: {
    activeRouteId: string;
    routes: Route[];
    onSwitch: (routeId: string) => void;
  } = $props();

  let currentTime = $state('');
  let timeInterval: ReturnType<typeof setInterval>;

  let settings = $derived($settingsStore);
  let activeRoute = $derived(routes.find(r => r.id === activeRouteId));
  let inactiveRoute = $derived(routes.find(r => r.id !== activeRouteId));
  let showSwipeHint = $derived(!settings.hasSwipedRoutes && routes.length === 2);

  function getLabel(route: Route | undefined): string {
    if (!route) return '';
    return route.direction === 'toWork' ? 'TILL JOBBET' : 'HEM';
  }

  function getColor(route: Route | undefined): string {
    if (!route) return 'var(--text)';
    return route.direction === 'toWork' ? 'var(--route-work)' : 'var(--route-home)';
  }

  function getSwipeHint(route: Route | undefined): string {
    return route?.direction === 'toWork'
      ? '→ svep för att byta rutt'
      : '← svep för att byta rutt';
  }

  function updateTime() {
    const now = new Date();
    currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }

  function handleSwitch() {
    if (!inactiveRoute) return;
    onSwitch(inactiveRoute.id);
    if (!settings.hasSwipedRoutes) {
      settingsStore.markSwiped();
    }
  }

  onMount(() => {
    updateTime();
    timeInterval = setInterval(updateTime, 10000);
    return () => clearInterval(timeInterval);
  });
</script>

<header class="route-header">
  <div class="top-row">
    <span class="wordmark">NÄSTA</span>
    <span class="clock">{currentTime}</span>
  </div>
  
  <div class="route-display">
    <h1 
      class="route-title"
      style="color: {getColor(activeRoute)}"
    >
      {getLabel(activeRoute)}
    </h1>
    {#if inactiveRoute}
      <button class="switch-link" onclick={handleSwitch}>
        {getLabel(inactiveRoute)} →
      </button>
    {/if}
  </div>
  
  {#if showSwipeHint}
    <p class="swipe-hint">{getSwipeHint(activeRoute)}</p>
  {/if}
</header>

<style>
  .route-header {
    padding: 14px 20px 16px;
    padding-top: calc(14px + env(safe-area-inset-top));
    background: var(--bg);
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .wordmark {
    font-family: 'Neue Machina', sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-ghost);
  }

  .clock {
    font-family: 'Neue Machina', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .route-display {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .route-title {
    font-family: 'Neue Machina', sans-serif;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    margin: 0;
    transition: color 200ms ease;
  }

  .switch-link {
    font-family: 'Neue Machina', sans-serif;
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text-ghost);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    transition: color 150ms ease;
  }

  .switch-link:hover {
    color: var(--text-muted);
  }

  .swipe-hint {
    font-size: 11px;
    color: var(--text-ghost);
    margin-top: 10px;
    font-weight: 500;
  }
</style>
