<script lang="ts">
  import type { Page } from '../types/page';
  import { getSettings } from '../stores/settingsStore.svelte';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());

  let {
    activePageId,
    pages,
    onSwitch
  }: {
    activePageId: string;
    pages: Page[];
    onSwitch: (pageId: string) => void;
  } = $props();

  let settings = $derived(getSettings());
  let activePage = $derived(pages.find(p => p.id === activePageId));
  let currentIndex = $derived(pages.findIndex(p => p.id === activePageId));
  let hasPrev = $derived(currentIndex > 0);
  let hasNext = $derived(currentIndex < pages.length - 1);
  let showSwipeHint = $derived(!settings.hasSwipedRoutes && pages.length >= 2);

  function handlePrev() {
    if (!hasPrev) return;
    onSwitch(pages[currentIndex - 1].id);
  }

  function handleNext() {
    if (!hasNext) return;
    onSwitch(pages[currentIndex + 1].id);
  }

</script>

<header class="page-header">
  <div class="route-block">
    {#if hasPrev}
      <button class="nav-arrow" onclick={handlePrev} aria-label={t.previousPage}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {:else}
      <div class="nav-arrow-placeholder"></div>
    {/if}

    <h1 class="page-name">{activePage?.name ?? ''}</h1>

    {#if hasNext}
      <button class="nav-arrow" onclick={handleNext} aria-label={t.nextPage}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {:else}
      <div class="nav-arrow-placeholder"></div>
    {/if}
  </div>

  {#if showSwipeHint}
    <p class="swipe-hint">
      {t.swipeHint}
    </p>
  {/if}

  <div class="header-rule"></div>
</header>

<style>
  .page-header {
    padding: 14px 20px 0;
    padding-top: calc(14px + env(safe-area-inset-top));
    background: var(--bg);
    position: relative;
  }

  .page-block {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 18px;
  }

  .page-name {
    font-family: 'Neue Machina', sans-serif;
    font-size: clamp(38px, 10vw, 52px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 0.9;
    margin: 0;
    color: var(--accent);
    text-align: center;
    min-width: 0;
    flex: 1;
  }

  .nav-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: var(--accent-subtle);
    border-radius: 50%;
    color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 150ms ease, transform 150ms ease;
  }

  .nav-arrow:hover {
    background: var(--border);
  }

  .nav-arrow:active {
    transform: scale(0.92);
  }

  .nav-arrow svg {
    width: 14px;
    height: 14px;
  }

  .nav-arrow-placeholder {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }

  .swipe-hint {
    font-size: 11px;
    color: var(--text-ghost);
    font-weight: 500;
    padding-bottom: 10px;
    padding-left: 1px;
    text-align: center;
  }

  .header-rule {
    height: 2px;
    background: var(--accent);
    opacity: 0.25;
    margin: 0 -20px;
  }
</style>