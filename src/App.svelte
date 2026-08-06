<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import gsap from 'gsap';
  import { initialize } from './stores/pageStore.svelte';
  import { getActivePage, getActivePageId, getPages, setActivePage as pageSetActivePage, createPage, addSegment as storeAddSegment, updateSegment, moveSegment, removeSegmentWithSnapshot, restoreSegment, type RemovedSegmentSnapshot } from './stores/pageStore.svelte';
  import { departureStore } from './stores/departureStore.svelte';
  import { deviationStore } from './stores/deviationStore.svelte';
  import { getSettings, markSwiped } from './stores/settingsStore.svelte';
  import { start as timeOfDayStart, stop as timeOfDayStop, getTimeOfDay } from './lib/stores/timeOfDay.svelte';
  import { applyTheme, resolveTheme } from './themes';
  import { initializeCacheLifecycle, stopCacheLifecycle } from './lib/cacheLifecycle';
  import { getT, getLocale, resolveLocale, setLocale } from './stores/localeStore.svelte';
  import { subscribeToPlatformLifecycle } from './lib/platform';

  let t = $derived(getT());
  let locale = $derived(getLocale());
  import { transitService } from './providers/init';
  import type { Segment, Stop, TransportType, SegmentDirection } from './types/page';
  import { DEFAULT_JOURNEY_ROUTE_TYPE } from './services/journeyService';
  

  import PageEditor from './components/PageEditor.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SegmentDepartures from './components/SegmentDepartures.svelte';
  import FeatureDiscoverySheet from './components/FeatureDiscoverySheet.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import AddExperience from './components/AddExperience.svelte';
  import Snackbar from './components/Snackbar.svelte';
  import type { SavedCardActionId } from './lib/savedCardActions';
  import type { Journey } from './types/journey';
  import {
    isCurrentSavedJourney,
    reduceSavedJourneyAction,
    resolveSavedJourneyRefreshes,
    type SavedJourneyAction,
  } from './lib/savedJourneyLifecycle';
  import type { Departure } from './stores/departureStore.svelte';
  import type { SegmentHealth, StationAlert } from './types/deviation';

  const logoPath = import.meta.env.BASE_URL + 'logosvg.svg';

  let editing = $state(false);
  let showSettings = $state(false);
  let showQuickAdd = $state(false);
  let editingSegment = $state<Segment | null>(null);
  let editingSegmentPageId = $state<string | null>(null);
  let snackbar = $state<{ message: string; snapshot?: RemovedSegmentSnapshot } | null>(null);
  let snackbarTimer: ReturnType<typeof setTimeout> | null = null;
  let quickAddBackdropEl = $state<HTMLButtonElement | undefined>();
  let quickAddDrawerEl = $state<HTMLDivElement | undefined>();
  let quickAddHandleDragging = $state(false);
  let quickAddHandleStartY = $state(0);
  let quickAddDragOffset = $state(0);
  let journeyRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let journeyRefreshInFlight = false;
  let journeyRefreshPendingForce = false;
  let journeyRefreshPageId: string | null = null;


  let siteLookupError = $state<string | null>(null);
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
  let hour = $derived(getTimeOfDay().hour);

  type DepartureSegmentInput = {
    siteId: string;
    stopName: string;
    line: string;
    direction_code: number;
    destId?: string;
  };

  function buildDepartureInputs(segments: Segment[]): DepartureSegmentInput[] {
    return segments
      .filter((s) => !s.journeyMeta)
      .map((segment) => ({
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
      requests: readyInputs.map((input) => ({
        siteId: input.siteId,
        stopName: input.stopName,
        line: input.line,
        direction_code: input.direction_code,
        destId: input.destId,
      })),
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
    const { requests } = toDepartureStoreArgs(inputs);

    if (requests.length === 0) return;

    departureStore.startAutoRefresh(
      requests,
      settings.refreshInterval || 30000,
      clearFirst,
      requestId
    );
    startDisruptionsForPage(segments);
  }

  $effect(() => {
    const s = getSettings();
    const preference = s.theme ?? 'system';
    const media = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const updateTheme = () => applyTheme(resolveTheme(preference, media?.matches ?? false));

    updateTheme();
    if (media && preference === 'system') {
      media.addEventListener('change', updateTheme);
      return () => media.removeEventListener('change', updateTheme);
    }
  });

  $effect(() => {
    const s = getSettings();
    const resolved = resolveLocale(s.language ?? 'auto');
    setLocale(resolved);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = resolved;
    }
  });

  // Start the data pipeline only when the active page changes. Reading the
  // whole page here would make every segment/journey persistence update look
  // like a navigation and clear the visible departures mid-refresh.
  $effect(() => {
    const pageId = getActivePageId();
    if (!pageId || pageId === previousPageId) return;
    const currentPage = getActivePage();
    if (!currentPage) return;
    
    // Only generate new request ID if page ACTUALLY changed
    // This prevents rejecting in-flight responses from settings/other reactive updates
    previousPageId = pageId;
    const newRequestId = `page-${pageId}-${Date.now()}`;
    currentRequestId = newRequestId;
    if (import.meta.env.DEV) console.log(`[App] Page switched to ${pageId}, requestId: ${newRequestId}`);
    
    if (journeyRefreshPageId !== pageId) {
      journeyRefreshPageId = pageId;
      void refreshSavedJourneys(currentPage, true);
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
    if (editingSegment && editingSegmentPageId) {
      const sameDirection = editingSegment.direction.code === direction.code && editingSegment.line === line;
      const ok = updateSegment(editingSegmentPageId, editingSegment.id, {
        line,
        lineName,
        direction: sameDirection ? { ...editingSegment.direction, destination: direction.destination } : direction,
        fromStop,
        toStop: sameDirection ? editingSegment.toStop : toStop,
        transportType,
      });
      if (!ok) {
        showSnackbar(t.actionFailed ?? 'The change could not be saved. Try again.');
        return false;
      }
      closeQuickAdd();
      void loadDepartures(true);
      return true;
    }
    storeAddSegment(p.id, { line, lineName, direction, fromStop, toStop, transportType });
    closeQuickAdd();
    void loadDepartures(true);
    return true;
  }

  function handleJourneySelect(journey: Journey) {
    const p = getActivePage();
    if (!p) return;

    const firstLeg = journey.legs[0];
    if (!firstLeg) return;

    const nextSegment = {
      line: firstLeg.line,
      lineName: firstLeg.lineName,
      direction: {
        code: firstLeg.directionCode,
        destination: journey.destLabel,
        stopPointId: '',
      },
      fromStop: {
        id: '',
        name: journey.originLabel,
        siteId: firstLeg.originSiteId ?? '',
      },
      toStop: {
        id: '',
        name: journey.destLabel,
        siteId: firstLeg.destSiteId ?? '',
      },
      transportType: firstLeg.transportType,
      travelTimeMinutes: journey.totalDurationMin,
      journeyMeta: {
        journeyId: journey.id,
        originLabel: journey.originLabel,
        destLabel: journey.destLabel,
        query: journey.query ?? {
          origin: journey.originLabel,
          destination: journey.destLabel,
          routeType: DEFAULT_JOURNEY_ROUTE_TYPE,
        },
        status: editingSegment?.journeyMeta?.status ?? 'planned',
        totalDurationMin: journey.totalDurationMin,
        transfers: journey.transfers,
        departureTime: journey.departureTime,
        arrivalTime: journey.arrivalTime,
        connections: journey.connections,
        updatedAt: Date.now(),
        legs: journey.legs,
      },
    };
    if (editingSegment && editingSegmentPageId) {
      const existingMeta = editingSegment.journeyMeta;
      const ok = updateSegment(editingSegmentPageId, editingSegment.id, {
        ...nextSegment,
        journeyMeta: existingMeta ? { ...nextSegment.journeyMeta, status: existingMeta.status, activeSnapshot: existingMeta.activeSnapshot, lastMissedAt: existingMeta.lastMissedAt, lastMissedJourney: existingMeta.lastMissedJourney } : nextSegment.journeyMeta,
      });
      if (!ok) {
        showSnackbar(t.actionFailed ?? 'The change could not be saved. Try again.');
        return false;
      }
      closeQuickAdd();
      return true;
    }
    storeAddSegment(p.id, nextSegment);
    closeQuickAdd();
    return true;
  }

  function showSnackbar(message: string, snapshot?: RemovedSegmentSnapshot) {
    if (snackbarTimer) clearTimeout(snackbarTimer);
    snackbar = { message, snapshot };
    snackbarTimer = setTimeout(() => snackbar = null, 5000);
  }

  function openEditSegment(segment: Segment) {
    editingSegment = segment;
    editingSegmentPageId = pages.find((candidate) => candidate.segments.some((item) => item.id === segment.id))?.id ?? activePageId;
    showQuickAdd = true;
    departureStore.stopAutoRefresh();
    deviationStore.stopAutoRefresh();
  }

  function handleSavedCardAction(segment: Segment, action: SavedCardActionId) {
    if (action === 'edit') {
      openEditSegment(segment);
      return;
    }
    if (action === 'remove') {
      const pageId = pages.find((candidate) => candidate.segments.some((item) => item.id === segment.id))?.id;
      if (!pageId) return;
      const snapshot = removeSegmentWithSnapshot(pageId, segment.id);
      if (!snapshot) {
        showSnackbar(t.actionFailed ?? 'The change could not be saved. Try again.');
        return;
      }
      const message = segment.journeyMeta ? (t.journeyRemovedUndo ?? 'Journey removed — Undo') : (t.departureRemovedUndo ?? 'Departure removed — Undo');
      showSnackbar(message, snapshot);
      void loadDepartures(true);
    }
  }

  function handleMoveSegment(segment: Segment, toPageId: string) {
    const fromPageId = pages.find((candidate) => candidate.segments.some((item) => item.id === segment.id))?.id;
    if (!fromPageId) return;
    const result = moveSegment(fromPageId, segment.id, toPageId);
    if (!result) {
      showSnackbar(t.actionFailed ?? 'The change could not be saved. Try again.');
      return;
    }
    const destination = pages.find((candidate) => candidate.id === toPageId)?.name ?? '';
    showSnackbar((t.movedToPage ?? 'Moved to {page}').replace('{page}', destination));
  }

  function undoRemoval() {
    const pending = snackbar?.snapshot;
    if (!pending) return;
    if (restoreSegment(pending)) {
      snackbar = null;
      if (snackbarTimer) clearTimeout(snackbarTimer);
      void loadDepartures(true);
    } else {
      showSnackbar(t.restoreFailed ?? 'The item could not be restored.');
    }
  }

  function closeSnackbar() {
    snackbar = null;
    if (snackbarTimer) clearTimeout(snackbarTimer);
  }

  async function refreshSavedJourneys(page = getActivePage(), force = false): Promise<void> {
    if (!page) return;
    if (journeyRefreshInFlight) {
      if (force) journeyRefreshPendingForce = true;
      return;
    }

    journeyRefreshInFlight = true;
    try {
      const result = await resolveSavedJourneyRefreshes({ page, force });
      const currentPage = getPages().find((candidate) => candidate.id === page.id);
      for (const update of result.updates) {
        const segment = currentPage?.segments.find((candidate) => candidate.id === update.segmentId);
        if (!isCurrentSavedJourney(segment, update)) continue;
        updateSegment(page.id, update.segmentId, update.patch);
      }
      if (result.failedSegmentIds.length > 0 && import.meta.env.DEV) {
        console.warn('[App] Saved journey refresh failed for segments:', result.failedSegmentIds);
      }
    } finally {
      journeyRefreshInFlight = false;
      if (journeyRefreshPendingForce) {
        journeyRefreshPendingForce = false;
        const nextPage = getActivePage();
        if (nextPage) void refreshSavedJourneys(nextPage, true);
      }
    }
  }

  function handleJourneyAction(segmentId: string, action: SavedJourneyAction): void {
    const page = getActivePage();
    const segment = page?.segments.find((item) => item.id === segmentId);
    const meta = segment?.journeyMeta;
    if (!page || !segment || !meta) return;

    const result = reduceSavedJourneyAction(meta, action, Date.now());
    if (result.changed) {
      updateSegment(page.id, segmentId, { journeyMeta: result.nextMeta });
    }
    if (result.shouldRefresh) void refreshSavedJourneys(page, true);
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
        x: dir * 16,
        opacity: 0,
        duration: 0.1,
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
      gsap.set(pageContentEl!, { x: dir * -16, opacity: 0 });
      await new Promise<void>(resolve => {
        gsap.to(pageContentEl!, {
          x: 0,
          opacity: 1,
          duration: 0.18,
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
    if (!backdropEl || !drawerEl) { activeFeatureContext = null; return; }
    gsap.to(backdropEl, { opacity: 0, duration: 0.18, ease: 'power2.out' });
    gsap.to(drawerEl, {
      xPercent: -50, y: '100%', opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: () => { activeFeatureContext = null; }
    });
  }

  function closeQuickAdd() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && quickAddDrawerEl?.contains(activeElement)) {
      activeElement.blur();
    }
    const finish = () => {
      showQuickAdd = false;
      editingSegment = null;
      editingSegmentPageId = null;
    };
    if (!quickAddBackdropEl || !quickAddDrawerEl) { finish(); return; }
    gsap.to(quickAddBackdropEl, { opacity: 0, duration: 0.18, ease: 'power2.out' });
    gsap.to(quickAddDrawerEl, {
      y: '100%', opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: finish
    });
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
        { opacity: 1, duration: 0.18, ease: 'power2.out' }
      );
      gsap.set(drawerEl, { xPercent: -50, y: '100%', opacity: 0 });
      gsap.fromTo(drawerEl,
        { opacity: 0, xPercent: -50, y: '100%' },
        { opacity: 1, xPercent: -50, y: '0%', duration: 0.4, ease: 'cubic-bezier(0.32, 0.72, 0, 1)' }
      );
    }
  });

  $effect(() => {
    if (showQuickAdd && quickAddBackdropEl && quickAddDrawerEl) {
      gsap.fromTo(quickAddBackdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: 'power2.out' }
      );
      gsap.fromTo(quickAddDrawerEl,
        { opacity: 0, y: '100%' },
        { opacity: 1, y: '0%', duration: 0.4, ease: 'cubic-bezier(0.32, 0.72, 0, 1)' }
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
    if (e.touches.length !== 1) return;
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
      const { requests } = toDepartureStoreArgs(inputs);
      if (requests.length === 0) return;
      await departureStore.refresh(
        requests,
        true,
        null
      );
      await refreshDisruptions(currentPage.segments, { force: true });
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

    // pageStore handles active page initialization; the page-id effect starts
    // the first departure load after initialization and avoids a duplicate
    // clear/reload cycle here.

    const unsub = departureStore.subscribe(data => { departures = data; });
    const unsubDeviations = deviationStore.subscribe(state => {
      deviationHealthBySegment = state.bySegmentId;
      deviationStationAlerts = state.stationAlerts;
    });

    journeyRefreshInterval = setInterval(() => {
      if (!document.hidden) void refreshSavedJourneys(getActivePage());
    }, 15000);

    const unsubscribeLifecycle = subscribeToPlatformLifecycle(({ isVisible, isOnline: online }) => {
      departureStore.setConnectivity(online);
      if (!isVisible || !online || editing || showSettings || showQuickAdd) {
        departureStore.stopAutoRefresh();
        deviationStore.stopAutoRefresh();
        return;
      }

      const currentPage = getActivePage();
      if (currentPage?.segments) {
        void startDeparturesForPage(currentPage.segments, false, currentRequestId);
        void startDisruptionsForPage(currentPage.segments);
        void refreshSavedJourneys(currentPage, true);
      }
    });

    return () => {
      unsub();
      unsubDeviations();
      unsubscribeLifecycle();
      if (journeyRefreshInterval) clearInterval(journeyRefreshInterval);
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
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<ErrorBoundary>
  <main
    id="main-content"
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
              <h1 class="app-name">Nästa</h1>
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
              page={page}
              deviationHealthBySegment={deviationHealthBySegment}
              deviationStationAlerts={deviationStationAlerts}
              openFeatureSheet={hasFeatureModes ? openSegmentPanels : null}
              onSwitchPage={handlePageSwitch}
              onEditToggle={toggleEdit}
              onOpenSettings={openSettingsPanel}
              onQuickAdd={() => showQuickAdd = true}
              onJourneyAction={handleJourneyAction}
              onSavedCardAction={handleSavedCardAction}
              onMoveSegment={handleMoveSegment}
            />
          {/if}
        </div>
      {/key}

          {#if pages.length > 1 && !editing && !hasNoRoutes}
            <nav class="bottom-nav" aria-label={t.pageNavigation}>
              <span class="sr-only">Page {pages.findIndex(p => p.id === activePageId) + 1} of {pages.length}</span>
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
        onclick={closeQuickAdd}
        bind:this={quickAddBackdropEl}
      ></button>
      <div
        class="quick-add-drawer"
        bind:this={quickAddDrawerEl}
        role="dialog"
        aria-modal="true"
        aria-label={t.addSegment}
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Escape') closeQuickAdd(); }}
      >
          <AddExperience
            idPrefix="quick-add"
            variant="drawer"
            closeAriaLabel={t.closePanel}
            onClose={closeQuickAdd}
            mode={editingSegment ? 'edit' : 'add'}
            editSegment={editingSegment ?? undefined}
            editKind={editingSegment?.journeyMeta ? 'journey' : 'departure'}
            onStopSelect={handleQuickAdd}
            onJourneySelect={handleJourneySelect}
          />
      </div>
    {/if}

    {#if snackbar}
      <Snackbar
        message={snackbar.message}
        actionLabel={snackbar.snapshot ? (t.undo ?? 'Undo') : undefined}
        onAction={snackbar.snapshot ? undoRemoval : undefined}
        onClose={closeSnackbar}
      />
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

  /* Focus-visible: ensure visible outline on all themes */
  :global(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  :global(:focus:not(:focus-visible)) {
    outline: none;
  }

  /* Global button press feedback for snappy feel */
  :global(button) {
    transition: opacity 120ms ease, background-color 120ms ease, border-color 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  :global(button:active) {
    opacity: 0.9;
  }
  :global(button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Light fallback tokens; applyTheme() replaces these at runtime. */
  :global(:root) {
    --bg:              #F7F7F5;
    --surface:         #FFFFFF;
    --surface-emphasis:#F0F0ED;
    --surface-elevated:#FFFFFF;
    --surface-hover:   #F3F3F0;
    --surface-pressed: #EDEDE9;
    --border:          #D8D8D3;
    --border-strong:   #B9B9B2;
    --border-subtle:   #D8D8D3;
    --text:            #171717;
    --text-secondary:  #4F4F4B;
    --text-muted:      #6B6B66;
    --text-ghost:      #8A8A84;
    --text-decorative: #8A8A84;
    --accent:          #171717;
    --accent-subtle:   rgba(23,23,23,0.08);
    --text-on-accent:  #FFFFFF;
    --shadow-tint:     rgba(23,23,23,0.10);
    --page-work:       #2563EB;
    --page-home:       #059669;
    --color-success:   #171717;
    --color-success-subtle: transparent;
    --color-success-bg: transparent;
    --color-error:     #A94848;
    --color-error-subtle: #FFF0EF;
    --color-error-bg:  #FFF0EF;
    --color-warning:   #956B12;
    --color-warning-subtle: #FFF7E2;
    --color-warning-bg: #FFF7E2;
    --color-info:      #356A86;
    --color-info-subtle: #EEF7FA;
    --color-info-bg:   #EEF7FA;
    --layout-max-width: 480px;
    --page-gutter: 16px;
    --transit-card-padding-inline: 14px;
    --sheet-padding-inline: 16px;

    /* Border-radius scale */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 14px;
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
    background: var(--bg);
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 0 var(--page-gutter) 0;
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

  /* Screen-reader-only utility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
    margin: 0 calc(var(--page-gutter) * -1);
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
    padding: 14px var(--sheet-padding-inline) var(--sheet-padding-inline);
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
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }

  .empty-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in oklch, var(--accent) 25%, transparent);
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
    background: rgba(0,0,0,0.38);
    backdrop-filter: blur(2px);
    border: none;
    cursor: pointer;
    padding: 0;
    display: block;
  }

  .quick-add-drawer {
    position: fixed;
    left: 0;
    right: 0;
    z-index: var(--z-dialog);
    background: var(--surface);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
    max-height: 70dvh;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  /* ── Tablet breakpoint ── */
  @media (min-width: 768px) {
    :global(:root) {
      --layout-max-width: 820px;
      --page-gutter: 24px;
    }

    .quick-add-drawer {
      left: 50%;
      right: auto;
    transform: translateX(-50%);
      max-width: var(--layout-max-width, 480px);
      width: 100%;
      max-height: 85dvh;
      bottom: calc(76px + env(safe-area-inset-bottom));
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    .bottom-nav {
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
