<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { initialize } from './stores/pageStore.svelte';
  import { getActivePage, getActivePageId, getPages, setActivePage as pageSetActivePage, createPage } from './stores/pageStore.svelte';
  import { departureStore } from './stores/departureStore.svelte';
  import { deviationStore } from './stores/deviationStore.svelte';
  import { getSettings, markSwiped } from './stores/settingsStore.svelte';
  import { start as timeOfDayStart, stop as timeOfDayStop, getTimeOfDay } from './lib/stores/timeOfDay.svelte';
  import { applyTheme } from './themes';
  import { initializeCacheLifecycle, stopCacheLifecycle } from './lib/cacheLifecycle';
  import { getT, getLocale, resolveLocale, setLocale } from './stores/localeStore.svelte';

  let t = $derived(getT());
  let locale = $derived(getLocale());
  import { searchSites } from './services/slApi';
  import type { Segment } from './types/page';
  
  import PageHeader from './components/PageHeader.svelte';
  import BottomBar from './components/BottomBar.svelte';
  import PageEditor from './components/PageEditor.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import FeatureDiscoverySheet from './components/FeatureDiscoverySheet.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import type { Departure } from './stores/departureStore.svelte';
  import type { SegmentHealth } from './types/deviation';

  let editing = $state(false);
   let lastRefreshTime = $state(Date.now());
   let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;

  function safeLocalStorageGet(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  const hasSeenOnboarding = safeLocalStorageGet('nasta_onboarding_seen');
let showOnboardingHint = $derived(!hasSeenOnboarding && getPages().every(p => p.segments.length === 0));
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
    availableModes: Array<'venues' | 'events'>;
    defaultMode: 'venues' | 'events';
  } | null>(null);

  // Pull-to-refresh state
  const PULL_THRESHOLD = 64;
  const PULL_MAX = 90;
  let pullDistance = $state(0);
  let isRefreshing = $state(false);
  let pullTriggered = false; // prevents treating a PTR gesture as a horizontal swipe

  let page = $derived(getActivePage());
  let pages = $derived(getPages());
  let activePageId = $derived(getActivePageId());
  let hasNoRoutes = $derived(!pages || pages.length === 0);
  let settings = $derived(getSettings());
  let departures = $state<Map<string, Departure[]>>(new Map());
  let deviationHealthBySegment = $state<Map<string, SegmentHealth>>(new Map());
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
        const sites = await searchSites(input.stopName);
        const siteId = sites[0]?.siteId || '';
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
      // Only create new request ID if route changed, otherwise reuse existing
      if (currentPage.id !== previousPageId) {
        previousPageId = currentPage.id;
        const newRequestId = `page-${currentPage.id}-manual-${Date.now()}`;
        currentRequestId = newRequestId;
      }
      
      await startDeparturesForPage(currentPage.segments, clearFirst, currentRequestId);
    } else {
      if (import.meta.env.DEV) console.log(`[App] loadDepartures: No segments for route ${currentPage?.id}`);
    }
  }

  function handlePageSwitch(pageId: string) {
    const currentPage = getActivePage();
    if (!currentPage) return;
    if (import.meta.env.DEV) console.log(`[App] handlePageSwitch: ${currentPage.id} -> ${pageId}`);
    pageSetActivePage(pageId);
  }

  function openSegmentPanels(segment: Segment) {
    const coords = segment.fromStop.coord ?? segment.toStop.coord;
    if (!coords) return;
    const availableModes: Array<'venues' | 'events'> = [];
    if (settings.afterworkVenuesEnabled && hour >= settings.afterworkStartHour) availableModes.push('venues');
    if (settings.eventsEnabled) availableModes.push('events');
    if (availableModes.length === 0) return;
    activeFeatureContext = {
      lat: coords[0],
      lon: coords[1],
      label: segment.fromStop.name,
      destination: segment.direction?.destination ?? segment.toStop.name,
      availableModes,
      defaultMode: availableModes.includes('venues') ? 'venues' : 'events'
    };
  }

  let hasFeatureModes = $derived(settings.afterworkVenuesEnabled || settings.eventsEnabled);

function toggleEdit() {
  if (hasNoRoutes) {
    const newPageId = createPage("My Departures");
    pageSetActivePage(newPageId);
    editing = true;
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

  onDestroy(() => {
    timeOfDayStop();
    departureStore.stopAutoRefresh();
    deviationStore.stopAutoRefresh();
    stopCacheLifecycle();
    if (lastRefreshInterval) clearInterval(lastRefreshInterval);
  });
</script>

<ErrorBoundary>
    <main
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchCancel}
  >
    {#if !hasNoRoutes}
      <PageHeader
        activePageId={activePageId ?? ''}
        {pages}
        onSwitch={handlePageSwitch}
      />
    {/if}

    <div
      class="pull-indicator"
      class:refreshing={isRefreshing}
      style="--pull: {pullDistance}px; --progress: {Math.min(pullDistance / PULL_THRESHOLD, 1)}"
    >
      {#if isRefreshing}
        <div class="ptr-spinner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="4" y="5" width="16" height="12" rx="2.5"/>
            <circle cx="8" cy="17.5" r="1.5"/>
            <circle cx="16" cy="17.5" r="1.5"/>
          </svg>
        </div>
      {:else}
        <svg class="ptr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          {#if pullDistance < PULL_THRESHOLD * 0.25}
            <rect x="4" y="5" width="16" height="12" rx="2.5"/>
            <circle cx="8" cy="17.5" r="1.5"/>
            <circle cx="16" cy="17.5" r="1.5"/>
          {:else if pullDistance < PULL_THRESHOLD * 0.5}
            <rect x="6" y="3.5" width="12" height="13.5" rx="4"/>
            <path d="M8.5 7.5h7M9 19l-2 2M15 19l2 2"/>
          {:else if pullDistance < PULL_THRESHOLD * 0.75}
            <circle cx="12" cy="12" r="9"/>
            <path d="M8 8.5h8M12 8.5v7"/>
          {:else}
            <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2z"/>
          {/if}
        </svg>
      {/if}
    </div>

    {#if siteLookupError}
      <div class="warning-banner">
        <span>{siteLookupError}</span>
        <button onclick={() => siteLookupError = null}>×</button>
      </div>
    {/if}

    <div class="freshness-bar" aria-live="polite">
      <span>{freshnessText}</span>
      {#if dataOld}
        <span class="freshness-dot">•</span>
        <span>{t.autoRefresh}</span>
      {/if}
    </div>

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
          <h2>{t.noPages}</h2>
          <p>{t.noPagesDesc}</p>
          <button 
            class="empty-cta" 
            class:onboarding-highlight={showOnboardingHint}
            onclick={toggleEdit}
          >
            <span>{t.addSegment}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 4v12M4 10h12"/>
            </svg>
          </button>
        </div>
      {:else if page && page.segments.length > 0}
        <SegmentDepartures
          route={page}
          deviationHealthBySegment={deviationHealthBySegment}
          deviationUsedCache={deviationUsedCache}
          deviationLastUpdatedAt={deviationLastUpdatedAt}
          openFeatureSheet={hasFeatureModes ? openSegmentPanels : null}
        />
      {:else if page}
        <div class="empty-segments">
          <div class="empty-illustration small">
            <svg viewBox="0 0 80 80" fill="none">
              <rect x="15" y="20" width="50" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
              <path d="M25 35h20M25 45h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <h2>{t.noSegments}</h2>
          <p>{t.noSegmentsDesc}</p>
          <button 
            class="empty-cta" 
            class:onboarding-highlight={showOnboardingHint}
            onclick={toggleEdit}
          >
            <span>{t.add}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 4v12M4 10h12"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <BottomBar
      {editing}
      onclick={toggleEdit}
    />

    {#if !hasNoRoutes && page}
      <PageEditor
        pages={pages}
        activePageId={activePageId ?? ''}
        isOpen={editing}
        onClose={toggleEdit}
        onSwitchPage={handlePageSwitch}
        onboardingHighlight={showOnboardingHint}
      />
    {/if}

    {#if activeFeatureContext}
      <button
        type="button"
        class="feature-backdrop"
        aria-label={t.closePanel}
        onclick={() => (activeFeatureContext = null)}
      ></button>
      <div
        class="feature-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={activeFeatureContext.availableModes.includes('venues') ? t.afterwork : t.events}
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === 'Escape') activeFeatureContext = null;
        }}
      >
        <FeatureDiscoverySheet
          lat={activeFeatureContext.lat}
          lon={activeFeatureContext.lon}
          label={activeFeatureContext.label}
          destination={activeFeatureContext.destination}
          availableModes={activeFeatureContext.availableModes}
          defaultMode={activeFeatureContext.defaultMode}
          onClose={() => (activeFeatureContext = null)}
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
  :global(button:active) {
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
  }

  main {
    position: relative;
    max-width: 480px;
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
    transform: rotate(calc(var(--progress, 0) * 180deg));
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .ptr-spinner {
    width: 26px;
    height: 26px;
    animation: ptr-spin 1s linear infinite;
  }
  .ptr-spinner svg {
    width: 100%;
    height: 100%;
    color: var(--accent);
    animation: transport-rotate 2s ease-in-out infinite;
  }

  @keyframes ptr-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes transport-rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

.scroll-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg);
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 4px 20px calc(90px + env(safe-area-inset-bottom));
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .scroll-container::-webkit-scrollbar {
    display: none;
  }

  .feature-backdrop {
    position: fixed;
    inset: 0;
    z-index: 240;
    left: 50%;
    transform: translateX(-50%);
    max-width: 480px;
    width: 100%;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(2px);
    cursor: pointer;
    animation: fade-in 200ms ease-out;
  }

  .feature-drawer {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 245;
    width: min(calc(100% - 24px), 456px);
    max-height: min(72dvh, 620px);
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
    padding: 14px 16px 16px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    animation: sheet-rise 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sheet-rise {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
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

  .empty-cta.onboarding-highlight {
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35);
    animation: pulse-ring 1300ms ease-out infinite;
    position: relative;
  }

  .empty-cta.onboarding-highlight::after {
    content: '';
    position: absolute;
    top: -8px;
    right: -8px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.4);
    animation: pulse-dot 800ms ease-out infinite;
  }

  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.34); }
    80% { box-shadow: 0 0 0 12px rgba(23, 23, 23, 0); }
    100% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
  }

  @keyframes pulse-dot {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35); }
    75% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(23, 23, 23, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .empty-cta.onboarding-highlight,
    .empty-cta.onboarding-highlight::after {
      animation: none;
    }
    .empty-cta.onboarding-highlight {
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    .empty-cta.onboarding-highlight::after {
      display: none;
    }
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

  .freshness-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .freshness-dot { opacity: 0.6; }

  .warning-banner button {
    background: none;
    border: none;
    color: #92400E;
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
</style>
