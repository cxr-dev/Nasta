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
    return route.direction === 'toWork' ? 'Till jobbet' : 'Hem';
  }

  function getActiveColor(route: Route | undefined): string {
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
  <div class="route-row">
    <span
      class="active-name"
      style="color: {getActiveColor(activeRoute)}"
    >{getLabel(activeRoute)}</span>
    {#if inactiveRoute}
      <button class="inactive-name" onclick={handleSwitch}>
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
    padding: 14px 16px 10px;
    padding-top: calc(14px + env(safe-area-inset-top));
    background: var(--bg);
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .wordmark {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand-muted);
  }

  .clock {
    font-size: 11px;
    font-weight: 500;
    color: var(--brand-muted);
    font-variant-numeric: tabular-nums;
  }

  .route-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .active-name {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.1;
    transition: color 200ms ease;
  }

  .inactive-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-ghost);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: -0.5px;
    transition: color 150ms ease;
  }

  .inactive-name:hover {
    color: var(--text-muted);
  }

  .swipe-hint {
    font-size: 10px;
    color: var(--text-ghost);
    margin-top: 3px;
    font-weight: 500;
  }
</style>
