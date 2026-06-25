<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import gsap from 'gsap';
  import { initialize } from './stores/pageStore.svelte';
  import { getActivePage, getActivePageId, getPages, setActivePage as pageSetActivePage, createPage, addSegment as storeAddSegment } from './stores/pageStore.svelte';
  import { departureStore } from './stores/departureStore.svelte';
  import { deviationStore } from './stores/deviationStore.svelte';
  import { getSettings, markSwiped } from './stores/settingsStore.svelte';
  import { start as timeOfDayStart, stop as timeOfDayStop, getTimeOfDay } from './lib/stores/timeOfDay.svelte';
  import { applyTheme } from './themes';
  import { initializeCacheLifecycle, stopCacheLifecycle } from './lib/cacheLifecycle';
  import { getT, getLocale, resolveLocale, setLocale } from './stores/localeStore.svelte';

  let t = $derived(getT());
  let locale = $derived(getLocale());
  import { transitService } from './providers/init';
  import type { Segment, Stop, TransportType, SegmentDirection } from './types/page';
  

  import PageEditor from './components/PageEditor.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import FeatureDiscoverySheet from './components/FeatureDiscoverySheet.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import SegmentSearch from './components/SegmentSearch.svelte';
  import type { Departure } from './stores/departureStore.svelte';
  import type { SegmentHealth, StationAlert } from './types/deviation';

  const logoPath = import.meta.env.BASE_URL + 'logosvg.svg';

  let editing = $state(false);
  let showSettings = $state(false);
  let showQuickAdd = $state(false);
  let quickAddBackdropEl = $state<HTMLButtonElement | undefined>();
  let quickAddDrawerEl = $state<HTMLDivElement | undefined>();
  let lastRefreshTime = $state(Date.now());
  let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;


  let siteLookupError = $state<string | null>(null);
   let dataOld = $derived(Date.now() - lastRefreshTime > 120000);
  let swipeStartX = 0;
  let swipeStartY = 0;
  let scrollContainer = $state<HTMLElement | null>(null);
  let currentRequestId = $state<string | null>(null);
  let previousPageId = $state<string | null>(null);
  let activeFeatureContext = $state<{
    lat: number;
    lon: number;
    label: string;
    destination: string;
    availableModes: Array<'beer' | 'wineCocktail' | 'events'>;
    defaultMode: 'beer' | 'wineCocktail' | 'events';
  } | null>(null);
  let backdropEl = $state<HTMLButtonElement | undefined>();
  let drawerEl = $state<HTMLDivElement | undefined>();
  let warningBannerEl = $state<HTMLDivElement | undefined>();

  // Pull-to-refresh state
  const PULL_THRESHOLD = 64;
  const PULL_MAX = 90;
  let pullDistance = $state(0);
  let isRefreshing = $state(false);
  let pullTriggered = false;
  // PTR icon spring entrance
  let ptrSpinnerEl = $state<HTMLDivElement | undefined>();
  let ptrIconEl = $state<SVGSVGElement | undefined>();
  // Page swipe transition
  let isTransitioning = $state(false);
  let transitionDirection: 'left' | 'right' = 'left';
  let pageContentEl = $state<HTMLDivElement | undefined>();
  let prevPageId: string | null = null;

  let page = $derived(getActivePage());
  let pages = $derived(getPages());
  let activePageId = $derived(getActivePageId());
  let hasNoRoutes = $derived(!pages || pages.length === 0);
  let settings = $derived(getSettings());
  let departures = $state<Map<string, Departure[]>>(new Map());
  let deviationHealthBySegment = $state<Map<string, SegmentHealth>>(new Map());
  let deviationStationAlerts = $state<StationAlert[]>([]);
  let deviationUsedCache = $state(false);
  let deviationLastUpdatedAt = $state(0);
  let hour = $derived(getTimeOfDay().hour);
  let freshnessText = $derived(
    lastRefreshTime
      ? dataOld
        ? t.dataMayBeStale
        : t.updatedMinutesAgo.replace(
            '{minutes}',
            String(Math.max(0, Math.floor((Date.now() - lastRefreshTime) / 60000))),
          )
      : t.loading,
  );

  type DepartureSegmentInput = {
    siteId: string;
    stopName: string;
    line: string;
    direction_code: number;
    destId?: string;
  };

  function buildDepartureInputs(segments: Segment[]): DepartureSegmentInput[] {
    return segments.map((segment) => ({
      siteId: segment.fromStop.siteId || segment.toStop.siteId || '',
      stopName: segment.fromStop.name || segment.toStop.name || '',
      line: segment.line,
      direction_code: segment.direction?.code ?? 0,
      destId: segment.toStop.siteId || undefined
    }));
  }

  function toDepartureStoreArgs(inputs: DepartureSegmentInput[]) {
    const readyInputs = inputs.filter((input): input is DepartureSegmentInput => Boolean(input.siteId));
    return {
      siteIds: readyInputs.map((input) => input.siteId),
      stopNames: new Map(readyInputs.map((input) => [input.siteId, input.stopName])),
      segmentMetaBySiteId: new Map(readyInputs.map((input) => [input.siteId, {
        line: input.line,
        direction_code: input.direction_code,
        destId: input.destId
      }])),
    };
  }

  async function resolveMissingSiteIds(inputs: DepartureSegmentInput[]): Promise<DepartureSegmentInput[]> {
    let hadError = false;
    const resolved: DepartureSegmentInput[] = [];

    for (const input of inputs) {
      if (input.siteId || !input.stopName) {
        resolved.push(input);
        continue;
      }

      try {
        const entityId = await transitService.resolveStopId(input.stopName);
        const siteId = entityId ? (entityId.includes(':') ? entityId.split(':')[1] : entityId) : '';
        if (!siteId) hadError = true;
        resolved.push({ ...input, siteId });
      } catch {
        hadError = true;
        resolved.push(input);
      }
    }

    siteLookupError = hadError ? t.someStopsNotFound : null;
    return resolved;
  }

  async function startDisruptionsForPage(segments: Segment[]) {
    if (!settings.disruptionAlertsEnabled) return;
    const preferredLanguage = resolveLocale(settings.language ?? 'auto');
    await deviationStore.startAutoRefresh(
      segments,
      preferredLanguage,
      settings.disruptionSeverityThreshold
    );
  }

  async function refreshDisruptions(segments: Segment[], opts?: { force?: boolean }) {
    if (!settings.disruptionAlertsEnabled) return;
    const preferredLanguage = resolveLocale(settings.language ?? 'auto');
    await deviationStore.refresh(segments, preferredLanguage, settings.disruptionSeverityThreshold, opts);
  }

  async function startDeparturesForPage(
    segments: Segment[],
    clearFirst = false,
    requestId: string | null = null,
  ) {
    const inputs = await resolveMissingSiteIds(buildDepartureInputs(segments));
    if (requestId && requestId !== currentRequestId) return;
    const { siteIds, stopNames, segmentMetaBySiteId } = toDepartureStoreArgs(inputs);

    if (siteIds.length === 0) return;

    departureStore.startAutoRefresh(
      siteIds,
      stopNames,
      segmentMetaBySiteId,
      settings.refreshInterval || 30000,
      clearFirst,
      requestId
    );
    startDisruptionsForPage(segments);
    lastRefreshTime = Date.now();
  }

  $effect(() => {
    const s = getSettings();
    applyTheme(s.theme ?? 'default', s.themeVariant ?? 'A');
  });

  $effect(() => {
    const s = getSettings();
    setLocale(resolveLocale(s.language ?? 'auto'));
  });

  // Watch for page changes and load departures
  $effect(() => {
    const currentPage = getActivePage();
    if (!currentPage) return;
    
    // Only generate new request ID if page ACTUALLY changed
    // This prevents rejecting in-flight responses from settings/other reactive updates
    if (currentPage.id !== previousPageId) {
      previousPageId = currentPage.id;
      const newRequestId = `page-${currentPage.id}-${Date.now()}`;
      currentRequestId = newRequestId;
      if (import.meta.env.DEV) console.log(`[App] Page switched to ${currentPage.id}, requestId: ${newRequestId}`);
    }
    
    void startDeparturesForPage(currentPage.segments, true, currentRequestId);
  });

  async function loadDepartures(clearFirst = false) {
    const currentPage = getActivePage();
    if (currentPage && currentPage.segments.length > 0) {
      // Only create new request ID if page changed, otherwise reuse existing
      if (currentPage.id !== previousPageId) {
        previousPageId = currentPage.id;
        const newRequestId = `page-${currentPage.id}-manual-${Date.now()}`;
        currentRequestId = newRequestId;
      }
      
      await startDeparturesForPage(currentPage.segments, clearFirst, currentRequestId);
    } else {
      if (import.meta.env.DEV) console.log(`[App] loadDepartures: No segments for page ${currentPage?.id}`);
    }
  }

  function handleQuickAdd(
    line: string, lineName: string, direction: SegmentDirection,
    fromStop: Stop, toStop: Stop, transportType: TransportType
  ) {
    const p = getActivePage();
    if (!p) return;
    storeAddSegment(p.id, { line, lineName, direction, fromStop, toStop, transportType });
    showQuickAdd = false;
    void loadDepartures(true);
  }

  async function handlePageSwitch(pageId: string) {
    if (isTransitioning) return;
    const currentPage = getActivePage();
    if (!currentPage) return;
    if (import.meta.env.DEV) console.log(`[App] handlePageSwitch: ${currentPage.id} -> ${pageId}`);
    const allPages = getPages();
    const currentIdx = allPages.findIndex(p => p.id === currentPage.id);
    const nextIdx = allPages.findIndex(p => p.id === pageId);
    transitionDirection = nextIdx > currentIdx ? 'left' : 'right';
    await performPageTransition(pageId);
  }

  async function performPageTransition(nextPageId: string) {
    const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!pageContentEl || rm) {
      pageSetActivePage(nextPageId);
      return;
    }

    isTransitioning = true;
    const dir = transitionDirection === 'left' ? -1 : 1;
    gsap.set(pageContentEl!, { willChange: 'transform, opacity' });

    // Exit: slide out
    await new Promise<void>(resolve => {
      gsap.to(pageContentEl!, {
        x: dir * 25,
        opacity: 0,
        duration: 0.15,
        ease: 'power2.in',
        overwrite: 'auto',
        onComplete: resolve,
      });
    });

    // Switch page data
    prevPageId = getActivePage()?.id ?? null;
    pageSetActivePage(nextPageId);
    await tick();

    // Enter: slide in from opposite side
    if (pageContentEl) {
      gsap.set(pageContentEl!, { x: dir * -25, opacity: 0 });
      await new Promise<void>(resolve => {
        gsap.to(pageContentEl!, {
          x: 0,
          opacity: 1,
          duration: 0.3,
          ease: 'power3.out',
          overwrite: 'auto',
          onComplete: () => {
            gsap.set(pageContentEl!, { clearProps: 'transform,opacity,willChange' });
            resolve();
          },
        });
      });
    }

    isTransitioning = false;
  }

  function openSegmentPanels(segment: Segment) {
    if (activeFeatureContext) return;
    const coords = segment.fromStop.coord ?? segment.toStop.coord;
    if (!coords) return;
    const availableModes: Array<'beer' | 'wineCocktail' | 'events'> = [];
    if (settings.afterworkVenuesEnabled && hour >= settings.afterworkStartHour) {
      availableModes.push('beer');
      availableModes.push('wineCocktail');
    }
    if (settings.eventsEnabled) availableModes.push('events');
    if (availableModes.length === 0) return;
    activeFeatureContext = {
      lat: coords[0],
      lon: coords[1],
      label: segment.fromStop.name,
      destination: segment.direction?.destination ?? segment.toStop.name,
      availableModes,
      defaultMode: availableModes.includes('beer') ? 'beer' : 'events'
    };
  }

  function closeFeatureSheet() {
    activeFeatureContext = null;
  }

  function dismissWarning() {
    if (warningBannerEl) {
      gsap.to(warningBannerEl, {
        opacity: 0,
        y: -8,
        duration: 0.15,
        ease: 'power2.in',
        onComplete: () => { siteLookupError = null; }
      });
    } else {
      siteLookupError = null;
    }
  }

  $effect(() => {
    if (activeFeatureContext && backdropEl && drawerEl) {
      gsap.fromTo(backdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power2.out' }
      );
      gsap.fromTo(drawerEl,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.28, ease: 'back.out(1.7)' }
      );
    }
  });

  $effect(() => {
    if (showQuickAdd && quickAddBackdropEl && quickAddDrawerEl) {
      gsap.fromTo(quickAddBackdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power2.out' }
      );
      gsap.fromTo(quickAddDrawerEl,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.7)' }
      );
    }
  });

  $effect(() => {
    if (siteLookupError && warningBannerEl) {
      gsap.fromTo(warningBannerEl,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }
      );
    }
  });

  let hasFeatureModes = $derived(settings.afterworkVenuesEnabled || settings.eventsEnabled);

function toggleEdit() {
  if (hasNoRoutes) {
    const newPageId = createPage(t.defaultPageName);
    pageSetActivePage(newPageId);
    showQuickAdd = true;
    return;
  }
  editing = !editing;
  if (editing) {
    departureStore.stopAutoRefresh();
    deviationStore.stopAutoRefresh();
  } else {
    loadDepartures();
  }
}

function openSettingsPanel() {
  showSettings = true;
  departureStore.stopAutoRefresh();
  deviationStore.stopAutoRefresh();
}

function closeSettingsPanel() {
  showSettings = false;
  loadDepartures();
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

    if (pullDistance > 0) {
      const indicator = document.querySelector('.pull-indicator') as HTMLElement | null;
      if (indicator) {
        gsap.to(indicator, {
          height: 0,
          duration: 0.35,
          ease: 'back.out(2.5)',
          overwrite: 'auto',
          onComplete: () => {
            pullDistance = 0;
            gsap.set(indicator, { clearProps: 'height' });
          },
        });
      } else {
        pullDistance = 0;
      }
      return;
    }
    pullDistance = 0;

    if (isTransitioning) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 48) return;

    const allPages = getPages();
    if (allPages.length < 2) return;
    const currentIdx = allPages.findIndex(p => p.id === getActivePageId());
    if (dx < 0 && currentIdx < allPages.length - 1) {
      handlePageSwitch(allPages[currentIdx + 1].id);
    } else if (dx > 0 && currentIdx > 0) {
      handlePageSwitch(allPages[currentIdx - 1].id);
    }
    if (!settings.hasSwipedRoutes) {
      markSwiped();
    }
  }

  async function triggerManualRefresh() {
    const currentPage = getActivePage();
    if (!currentPage?.segments || isRefreshing) return;
    isRefreshing = true;
    await tick();
    if (ptrSpinnerEl) {
      gsap.fromTo(ptrSpinnerEl,
        { scale: 0.6, rotation: -90 },
        { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.5)' },
      );
    }
    try {
      const inputs = await resolveMissingSiteIds(buildDepartureInputs(currentPage.segments));
      const { siteIds, stopNames, segmentMetaBySiteId } = toDepartureStoreArgs(inputs);
      if (siteIds.length === 0) return;
      await departureStore.refresh(
        siteIds,
        stopNames,
        segmentMetaBySiteId,
        true,
        null
      );
      await refreshDisruptions(currentPage.segments, { force: true });
      lastRefreshTime = Date.now();
    } catch (error) {
      if (import.meta.env.DEV) console.error('[App] manual refresh failed', error);
    } finally {
      isRefreshing = false;
    }
  }

  onMount(() => {
    timeOfDayStart();
    initialize();
    initializeCacheLifecycle();
    // pageStore.syncFromRoutes() is called automatically on creation

    // pageStore handles active page initialization
    loadDepartures();

    const unsub = departureStore.subscribe(data => { departures = data; });
    const unsubDeviations = deviationStore.subscribe(state => {
      deviationHealthBySegment = state.bySegmentId;
      deviationStationAlerts = state.stationAlerts;
      deviationUsedCache = state.usedCache;
      deviationLastUpdatedAt = state.lastUpdatedAt;
    });

    lastRefreshInterval = setInterval(() => {
      if (!document.hidden) {
        lastRefreshTime = Date.now();
      }
    }, 1000);

    const onVisibility = () => {
      const currentPage = getActivePage();
      if (!document.hidden && currentPage?.segments) {
        const timeSinceLastRefresh = Date.now() - lastRefreshTime;
        if (timeSinceLastRefresh > 10000) {
          void (async () => {
            try {
              const inputs = await resolveMissingSiteIds(buildDepartureInputs(currentPage.segments));
              const { siteIds, stopNames, segmentMetaBySiteId } = toDepartureStoreArgs(inputs);
              if (siteIds.length === 0) return;
              await departureStore.refresh(
                siteIds,
                stopNames,
                segmentMetaBySiteId,
                false,
                null
              );
              lastRefreshTime = Date.now();
            } catch (error) {
              if (import.meta.env.DEV) console.error('[App] visibility refresh failed', error);
            }
          })();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsub();
      unsubDeviations();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (editing) return;

    // Ignore if typing in an input, textarea, or contenteditable
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
      return;
    }

    if (isTransitioning) return;
    const allPages = getPages();
    if (allPages.length < 2) return;

    const currentIdx = allPages.findIndex(p => p.id === getActivePageId());

    if (e.key === 'ArrowRight') {
      if (currentIdx < allPages.length - 1) {
        handlePageSwitch(allPages[currentIdx + 1].id);
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentIdx > 0) {
        handlePageSwitch(allPages[currentIdx - 1].id);
      }
    }
  }

  onDestroy(() => {
    timeOfDayStop();
    departureStore.stopAutoRefresh();
    deviationStore.stopAutoRefresh();
    stopCacheLifecycle();
    if (lastRefreshInterval) clearInterval(lastRefreshInterval);
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<ErrorBoundary>
  <main
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchCancel}
  >
    <div
      class="pull-indicator"
      class:refreshing={isRefreshing}
      style="--pull: {pullDistance}px; --progress: {Math.min(pullDistance / PULL_THRESHOLD, 1)}"
    >
      {#if isRefreshing}
        <div class="ptr-spinner" bind:this={ptrSpinnerEl}>
          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      {:else}
        <svg class="ptr-icon" bind:this={ptrIconEl} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
          <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"/>
        </svg>
      {/if}
    </div>

    {#if siteLookupError}
      <div class="warning-banner" bind:this={warningBannerEl}>
        <span>{siteLookupError}</span>
        <button onclick={dismissWarning}>×</button>
      </div>
    {/if}

    <div class="scroll-container" bind:this={scrollContainer}>
      {#key activePageId}
        <div bind:this={pageContentEl} class="page-transition-inner">
          {#if hasNoRoutes}
            <div class="empty-state">
              <div class="empty-illustration">
                <img src={logoPath} alt="Nästa" width="90" height="90" />
              </div>
              <h2 class="app-name">Nästa</h2>
              <p>{t.noPagesDesc}</p>
              <button
                class="empty-cta"
                onclick={toggleEdit}
              >
                <span>{t.addSegment}</span>
              </button>
            </div>
          {:else if page}
            <SegmentDepartures
              route={page}
              deviationHealthBySegment={deviationHealthBySegment}
              deviationStationAlerts={deviationStationAlerts}
              deviationUsedCache={deviationUsedCache}
              deviationLastUpdatedAt={deviationLastUpdatedAt}
              openFeatureSheet={hasFeatureModes ? openSegmentPanels : null}
              onSwitchPage={handlePageSwitch}
              onEditToggle={toggleEdit}
              onOpenSettings={openSettingsPanel}
              onQuickAdd={() => showQuickAdd = true}
              {lastRefreshTime}
            />
          {/if}
        </div>
      {/key}

          {#if pages.length > 1 && !editing && !hasNoRoutes}
            <nav class="bottom-nav" aria-label={t.pageNavigation}>
              <div class="page-dots">
                {#each pages as p, i (p.id)}
                  <span
                    class="dot"
                    class:active={p.id === activePageId}
                    aria-hidden="true"
                  ></span>
                {/each}
              </div>
            </nav>
          {/if}
    </div>

    {#if !hasNoRoutes && page}
      <SettingsPanel
        isOpen={showSettings}
        onClose={closeSettingsPanel}
      />
      <PageEditor
        pages={pages}
        activePageId={activePageId ?? ''}
        isOpen={editing}
        onClose={toggleEdit}
        onSwitchPage={handlePageSwitch}
      />
    {/if}

    {#if showQuickAdd && page}
      <button
        type="button"
        class="quick-add-backdrop"
        aria-label={t.closePanel}
        onclick={() => showQuickAdd = false}
        bind:this={quickAddBackdropEl}
      ></button>
      <div
        class="quick-add-drawer"
        bind:this={quickAddDrawerEl}
        role="dialog"
        aria-modal="true"
        aria-label={t.addSegment}
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Escape') showQuickAdd = false; }}
      >
        <div class="quick-add-handle"></div>
        <SegmentSearch onSelect={handleQuickAdd} />
      </div>
    {/if}

    {#if activeFeatureContext}
      <button
        type="button"
        class="feature-backdrop"
        aria-label={t.closePanel}
        onclick={closeFeatureSheet}
        bind:this={backdropEl}
      ></button>
      <div
        class="feature-drawer"
        bind:this={drawerEl}
        role="dialog"
        aria-modal="true"
        aria-label={activeFeatureContext.availableModes.includes('beer') ? t.afterwork : t.events}
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === 'Escape') closeFeatureSheet();
        }}
      >
        <FeatureDiscoverySheet
          lat={activeFeatureContext.lat}
          lon={activeFeatureContext.lon}
          label={activeFeatureContext.label}
          destination={activeFeatureContext.destination}
          availableModes={activeFeatureContext.availableModes}
          defaultMode={activeFeatureContext.defaultMode}
          onClose={closeFeatureSheet}
        />
      </div>
    {/if}
  </main>
</ErrorBoundary>
<UpdateBanner />


<footer class="attribution">
  {t.attribution} <a href="https://trafiklab.se" target="_blank" rel="noopener">Trafiklab</a>
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
    block-size: 100dvh;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    overscroll-behavior: contain;
  }


  :global(:root) {
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  /* Webkit fallback */
  :global(::-webkit-scrollbar) { width: 10px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background-color: var(--border-subtle);
    border-radius: 10px;
    border: 2px solid var(--bg);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Global button press feedback for snappy feel */
  :global(button) {
    transition: transform 120ms ease, opacity 120ms ease;
  }
  :global(button:not(.no-scale):active) {
    transform: scale(0.965);
    opacity: 0.9;
  }
  :global(button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
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
    --page-work:      #2563EB;
    --page-home:      #059669;
    --color-accent:   #27ae60;
    --layout-max-width: 480px;

    /* Border-radius scale */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-full: 999px;

    /* Z-index scale */
    --z-sticky: 100;
    --z-overlay: 300;
    --z-dialog: 400;
    --z-toast: 500;
  }

  main {
    position: relative;
    max-width: var(--layout-max-width, 480px);
    margin: 0 auto;
    height: 100dvh;
    overflow: hidden;
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

  .ptr-icon {
    width: 26px;
    height: 26px;
    color: var(--accent);
    opacity: var(--progress, 0);
    transition: opacity 0.15s ease;
  }

  .ptr-spinner {
    width: 26px;
    height: 26px;
  }
  .ptr-spinner svg {
    width: 100%;
    height: 100%;
    color: var(--accent);
  }

.scroll-container {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg);
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 0 20px 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .scroll-container::-webkit-scrollbar {
    display: none;
  }

  .page-transition-inner {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .bottom-nav {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: center;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    z-index: var(--z-sticky);
    background: var(--bg);
    -webkit-mask-image: linear-gradient(to top, black 70%, transparent);
    mask-image: linear-gradient(to top, black 70%, transparent);
    margin: 0 -20px;
    padding-top: 16px;
  }

  .page-dots {
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: auto;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    border: none;
    padding: 0;
    background: var(--text-ghost);
    flex-shrink: 0;
    transition: background 0.15s ease, transform 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .dot.active {
    background: var(--text);
    transform: scale(1.3);
  }

  .feature-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    left: 50%;
    transform: translateX(-50%);
    max-width: var(--layout-max-width, 480px);
    width: 100%;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(2px);
    cursor: pointer;
  }

  .feature-drawer {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-dialog);
    width: min(calc(100% - 24px), 456px);
    max-height: min(72dvh, 620px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
    padding: 14px 16px 16px;
    bottom: calc(76px + env(safe-area-inset-bottom));
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

  .empty-state {
    text-align: center;
    padding: 80px 20px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .empty-illustration {
    width: 90px;
    height: 90px;
    margin-bottom: 8px;
  }

  .empty-illustration img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .app-name {
    font-family: 'Neue Machina', sans-serif;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
    margin: 0;
  }

  .empty-state h2 {
    font-family: 'Neue Machina', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .empty-state p {
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
    color: var(--text-on-accent);
    border: none;
    padding: 14px 24px;
    border-radius: var(--radius-sm);
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



  .attribution {
    text-align: center;
    padding: 20px;
    font-size: 11px;
    color: var(--text-muted);
    max-width: var(--layout-max-width, 480px);
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
    background: var(--color-warning-subtle);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-sm);
    color: var(--color-warning);
    font-size: 13px;
  }

  .warning-banner button {
    background: none;
    border: none;
    color: var(--color-warning);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 4px;
  }

  @keyframes hint-slide-in {
    0% {
      transform: translateX(-50%) translateY(20px);
      opacity: 0;
    }
    60% {
      transform: translateX(-50%) translateY(-2px);
      opacity: 1;
    }
    100% {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  .quick-add-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: rgba(0,0,0,0.35);
    border: none;
    cursor: pointer;
    padding: 0;
    display: block;
  }

  .quick-add-drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-dialog);
    background: var(--surface);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    max-height: 70vh;
    overflow-y: auto;
    touch-action: pan-y;
  }

  .quick-add-handle {
    width: 36px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin: 0 auto 12px;
  }

  /* ── Tablet breakpoint ── */
  @media (min-width: 768px) {
    :global(:root) {
      --layout-max-width: 820px;
    }

    .quick-add-drawer {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      max-width: var(--layout-max-width, 480px);
      width: 100%;
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    .bottom-nav {
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
