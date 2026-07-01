<script lang="ts">
  import type { Page } from '../types/page';
  import { getSettings } from '../stores/settingsStore.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import gsap from 'gsap';
  import { cloudRain, cloudSnow, cloudLightning } from '../icons/departureIcons';
  import { getDailySummary, type DailySummary } from '../services/weatherCache';

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

  let dailyWeather = $state<DailySummary>({ symbol: null, tempMin: null, tempMax: null });

  $effect(() => {
    // Stockholm center coordinates
    getDailySummary(59.329, 18.068).then((s) => {
      dailyWeather = s;
    });
  });

  let weatherIcon = $derived(
    dailyWeather.symbol === 'rain' ? cloudRain :
    dailyWeather.symbol === 'snow' ? cloudSnow :
    dailyWeather.symbol === 'thunder' ? cloudLightning :
    null
  );

  let titleEl: HTMLHeadingElement | undefined = $state();
  let prevBtnEl: HTMLButtonElement | undefined = $state();
  let nextBtnEl: HTMLButtonElement | undefined = $state();

  $effect(() => {
    const name = activePage?.name;
    if (!name || !titleEl) return;
    gsap.fromTo(titleEl,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', overwrite: 'auto' },
    );
    return () => gsap.killTweensOf(titleEl!);
  });

  function handlePrev() {
    if (!hasPrev) {
      if (prevBtnEl) {
        gsap.fromTo(prevBtnEl, { x: 0 }, { x: -4, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: 'auto' });
      }
      return;
    }
    onSwitch(pages[currentIndex - 1].id);
  }

  function handleNext() {
    if (!hasNext) {
      if (nextBtnEl) {
        gsap.fromTo(nextBtnEl, { x: 0 }, { x: 4, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out', overwrite: 'auto' });
      }
      return;
    }
    onSwitch(pages[currentIndex + 1].id);
  }

</script>

<header class="page-header">
  <div class="page-block">
    <button bind:this={prevBtnEl} class="nav-arrow" class:inactive={!hasPrev} onclick={handlePrev} aria-label={t.previousPage} disabled={!hasPrev}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <h1 bind:this={titleEl} class="page-name" data-testid="page-name">{activePage?.name ?? ''}</h1>

    <button bind:this={nextBtnEl} class="nav-arrow" class:inactive={!hasNext} onclick={handleNext} aria-label={t.nextPage} disabled={!hasNext}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>

  {#if showSwipeHint}
    <p class="swipe-hint">
      {t.swipeHint}
    </p>
  {/if}

  {#if weatherIcon}
    <div class="weather-bar">
      <svg viewBox="0 0 24 24" fill="none" class="weather-icon" aria-label={dailyWeather.symbol ?? 'Weather'}>
        <g>{@html weatherIcon}</g>
      </svg>
      {#if dailyWeather.tempMax !== null}
        <span class="weather-temp">{Math.round(dailyWeather.tempMax)}°</span>
      {/if}
    </div>
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

  .nav-arrow:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .swipe-hint {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 500;
    padding-bottom: 10px;
    padding-left: 1px;
    text-align: center;
  }

  .weather-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding-bottom: 8px;
  }

  .weather-icon {
    width: 14px;
    height: 14px;
    color: var(--accent-subtle);
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }

  .weather-temp {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    line-height: 1;
  }

  .header-rule {
    height: 2px;
    background: var(--accent);
    opacity: 0.25;
    margin: 0 -20px;
  }
</style>