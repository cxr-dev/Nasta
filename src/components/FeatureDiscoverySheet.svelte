<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import gsap from 'gsap';
  import { getT, getLocale } from '../stores/localeStore.svelte';

  let t = $derived(getT());
  let locale = $derived(getLocale());
  import {
    formatEventDateTime,
    formatEventRelativeShort,
    formatStockholmTime,
    formatVenueOpenStatus,
  } from '../lib/i18n';
  import { fetchNearbyEvents, type EventItem } from '../services/eventService';
  import { fetchNearbyVenues, type Venue } from '../services/venueService';
  import { distanceMeters } from '../services/geo';
  import { getSunPosition } from '../lib/sunPosition';

  function dedupeById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  type TabKey = 'beer' | 'wineCocktail' | 'events';

  let {
    lat,
    lon,
    label = '',
    destination = '',
    availableModes = ['beer', 'wineCocktail', 'events'] as TabKey[],
    defaultMode = 'beer' as TabKey,
    onClose = () => {},
  }: {
    lat: number;
    lon: number;
    label?: string;
    destination?: string;
    availableModes?: TabKey[];
    defaultMode?: TabKey;
    onClose?: () => void;
  } = $props();

  let activeTab = $state<TabKey>('beer');

  type TabData<T> = {
    items: T[];
    loading: boolean;
    loaded: boolean;
    token: number;
    error?: string;
  };

  let venuesByTab: Record<'beer' | 'wineCocktail', TabData<Venue>> = $state({
    beer: { items: [], loading: false, loaded: false, token: 0, error: undefined },
    wineCocktail: { items: [], loading: false, loaded: false, token: 0, error: undefined },
  });
  let eventsTab: TabData<EventItem> = $state({
    items: [], loading: false, loaded: false, token: 0, error: undefined,
  });
  let openingHoursParser: any = null;
  let venueOpenState = $state<Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }>>({});
  let tabLoadCtrl: AbortController | null = null;

  $effect(() => {
    if (!availableModes.includes(activeTab)) {
      activeTab = availableModes[0] ?? 'beer';
    }
  });

  $effect(() => {
    // If the tab already has cached data, render it immediately and refresh
    // in background without aborting any in-flight request. The user sees
    // data instantly; freshness comes silently.
    const tabData = activeTab === 'events' ? eventsTab : venuesByTab[activeTab];
    if (tabData.items.length > 0) {
      if (!tabData.loading && tabData.loaded) return;
      // Has cached items but not fully loaded — background refresh (no abort)
      if (activeTab !== 'events') loadVenues(activeTab);
      else loadEvents();
      return;
    }

    // Guard against re-entrance: if already loading or loaded (no items yet)
    if (activeTab === 'events' && (eventsTab.loading || eventsTab.loaded)) return;
    if (activeTab !== 'events' && (venuesByTab[activeTab].loading || venuesByTab[activeTab].loaded)) return;

    // Cancel any in-progress tab load when switching tabs.
    tabLoadCtrl?.abort();
    const ctrl = new AbortController();
    tabLoadCtrl = ctrl;

    if (activeTab !== 'events') loadVenues(activeTab, ctrl.signal);
    if (activeTab === 'events') loadEvents(ctrl.signal);
    // No cleanup registered — onDestroy handles unmount abort. The cleanup
    // would otherwise fire on every reactive re-run and abort the first signal.
  });

  // Kick off background prefetch for all available tabs immediately on mount so
  // switching tabs feels instant. These run without a signal — they use the service's
  // own internal caches and timeouts. The $effect above handles the reactive UI state.
  $effect(() => {
    const modes = availableModes;
    // Use a microtask so this doesn't block the initial render
    Promise.resolve().then(() => {
      if (modes.includes('beer') && !venuesByTab.beer.loaded) {
        void fetchNearbyVenues(lat, lon, 1200, ['beer']).catch(() => {});
      }
      if (modes.includes('wineCocktail') && !venuesByTab.wineCocktail.loaded) {
        void fetchNearbyVenues(lat, lon, 1200, ['wine', 'cocktail']).catch(() => {});
      }
      if (modes.includes('events') && !eventsTab.loaded) {
        void fetchNearbyEvents(lat, lon, 5000).catch(() => {});
      }
    });
  });

  async function loadVenues(tab: 'beer' | 'wineCocktail', signal?: AbortSignal) {
    const state = venuesByTab[tab];
    if (state.loading || state.loaded) return;
    const token = ++state.token;
    venuesByTab = { ...venuesByTab, [tab]: { ...state, loading: true, error: undefined } };
    try {
      const types: Array<'beer' | 'wine' | 'cocktail'> = tab === 'beer' ? ['beer'] : ['wine', 'cocktail'];
      const loaded = await fetchNearbyVenues(lat, lon, 1200, types, signal);
      if (signal?.aborted && token !== venuesByTab[tab].token) return;
      if (token !== venuesByTab[tab].token) return;
      venuesByTab = { ...venuesByTab, [tab]: { items: loaded, loading: false, loaded: true, token, error: undefined } };
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      if (token !== venuesByTab[tab].token) return;
      console.warn('[FeatureDiscoverySheet] loadVenues failed:', tab, e);
      venuesByTab = { ...venuesByTab, [tab]: { items: [], loading: false, loaded: true, token, error: t.loadError } };
    }
  }

  async function loadEvents(signal?: AbortSignal) {
    if (eventsTab.loading || eventsTab.loaded) return;
    const token = ++eventsTab.token;
    eventsTab = { ...eventsTab, loading: true, error: undefined };
    try {
      const loaded = await fetchNearbyEvents(lat, lon, 5000, signal);
      if (signal?.aborted && token !== eventsTab.token) return;
      if (token !== eventsTab.token) return;
      eventsTab = { items: loaded, loading: false, loaded: true, token, error: undefined };
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      if (token !== eventsTab.token) return;
      console.warn('[FeatureDiscoverySheet] loadEvents failed:', e);
      eventsTab = { items: [], loading: false, loaded: true, token, error: t.loadError };
    }
  }

  function computeVenueOpenState(venue: Venue) {
    const strings = t;
    const currentLocale = locale;
    if (!openingHoursParser || !venue.openingHours) {
      return { isOpenNow: true, statusText: '', statusClass: 'unknown' as const };
    }
    try {
      const oh = new openingHoursParser(venue.openingHours, { timezone: 'Europe/Stockholm' });
      const isOpenNow = Boolean(oh.getState());
      const nextChange = oh.getNextChange?.(new Date());
      const nextChangeText = nextChange ? formatStockholmTime(nextChange, currentLocale) : '';
      const statusText = formatVenueOpenStatus(isOpenNow, nextChangeText, strings);
      return { isOpenNow, statusText, statusClass: isOpenNow ? 'open' as const : 'closed' as const };
    } catch {
      return { isOpenNow: true, statusText: '', statusClass: 'unknown' as const };
    }
  }

  function updateVenueOpenStates(venues: Venue[]) {
    const next: Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }> = {};
    for (const v of venues) next[v.id] = computeVenueOpenState(v);
    venueOpenState = next;
  }

  function openMapsAt(lat: number, lon: number, label: string) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon} ${encodeURIComponent(label)}`, '_blank', 'noopener,noreferrer');
  }

  function venueMetric(venue: Venue): string {
    if (venue.rawPrice !== undefined) return `${venue.rawPrice} kr`;
    if (venue.priceLevel) return t.priceLevel;
    if (venue.distance !== undefined) return `${Math.round(venue.distance)} m`;
    return '';
  }

  function eventStats(event: EventItem): string {
    const timeText = event.startTime ? formatEventDateTime(event.startTime, locale, t) : t.emDash;
    const location = event.location || t.defaultCity;
    return `${timeText} · ${location}`;
  }

  // Events sort/filter state
  type SortMode = 'time' | 'distance';
  let sortBy = $state<SortMode>('time');
  let activeCategory = $state<string | null>(null);

  let currentItems = $derived<TabData<Venue | EventItem>>(
    activeTab === 'events' ? eventsTab : venuesByTab[activeTab]
  );

  let filteredVenues = $derived(
    activeTab !== 'events'
      ? (currentItems as TabData<Venue>).items.filter((venue) => {
          if (!venue.openingHours) return true;
          const state = venueOpenState[venue.id];
          if (!state || state.statusClass === 'unknown') return true;
          return state.isOpenNow;
        })
      : []
  );

  // Events filter/sort derived
  let eventCategories = $derived.by(() => {
    if (activeTab !== 'events') return [] as string[];
    const cats = new Set<string>();
    for (const ev of (eventsTab as TabData<EventItem>).items) {
      if (ev.categories) {
        for (const c of ev.categories) {
          if (c.title) cats.add(c.title);
        }
      }
    }
    return [...cats].sort();
  });

  let filteredEvents = $derived(
    activeTab !== 'events'
      ? ([] as EventItem[])
      : activeCategory === null
        ? dedupeById((eventsTab as TabData<EventItem>).items)
        : dedupeById((eventsTab as TabData<EventItem>).items).filter(
            (ev) => ev.categories?.some((c) => c.title === activeCategory)
          )
  );

  let sortedEvents = $derived(
    sortBy === 'time'
      ? [...filteredEvents].sort((a, b) => {
          if (!a.startTime && !b.startTime) return 0;
          if (!a.startTime) return 1;
          if (!b.startTime) return -1;
          // Timed events (contain T) before date-only
          const aHasTime = a.startTime.includes('T');
          const bHasTime = b.startTime.includes('T');
          if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
          return a.startTime.localeCompare(b.startTime);
        })
      : [...filteredEvents].sort((a, b) => {
          const dA = a.lat !== undefined && a.lon !== undefined ? distanceMeters(lat, lon, a.lat, a.lon) : Infinity;
          const dB = b.lat !== undefined && b.lon !== undefined ? distanceMeters(lat, lon, b.lat, b.lon) : Infinity;
          return dA - dB;
        })
  );

  let displayItems = $derived(
    activeTab !== 'events'
      ? filteredVenues
      : sortedEvents
  );

  let prevVenueKey = $state('');
  $effect(() => {
    locale;
    const items = activeTab !== 'events' ? (currentItems as TabData<Venue>).items : [];
    const key = items.map(v => v.id + '|' + (v as Venue).openingHours).join(',');
    if (key === prevVenueKey) return;
    prevVenueKey = key;
    updateVenueOpenStates(items as Venue[]);
  });

  let railEl = $state<HTMLElement | undefined>();

  $effect(() => {
    const isLoading = currentItems.loading;
    if (!railEl || !isLoading) return;
    const skels = railEl.querySelectorAll('.skeleton-element');
    if (skels.length === 0) return;
    const tweens = Array.from(skels).map((el) =>
      gsap.to(el, {
        backgroundPosition: '-200% 0',
        duration: 1.5,
        ease: 'sine.inOut',
        repeat: -1,
      })
    );
    return () => tweens.forEach((t) => t.kill());
  });

  $effect(() => {
    if (!railEl || displayItems.length === 0) return;
    const cards = railEl.querySelectorAll('.card');
    if (cards.length === 0) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    gsap.fromTo(cards, { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.36, ease: 'power2.out' });
  });

  function retryLoad() {
    const tab = activeTab;
    if (tab === 'events') {
      eventsTab = { items: [], loading: false, loaded: false, token: 0, error: undefined };
    } else {
      venuesByTab = { ...venuesByTab, [tab]: { items: [], loading: false, loaded: false, token: 0, error: undefined } };
    }
  }

  onMount(async () => {
    activeTab = defaultMode;
    if (!availableModes.includes(activeTab)) activeTab = availableModes[0] ?? 'beer';
    try {
      const mod = await import('opening_hours');
      openingHoursParser = mod.default ?? mod;
    } catch {
      openingHoursParser = null;
    }
    const allVenues = [...venuesByTab.beer.items, ...venuesByTab.wineCocktail.items];
    updateVenueOpenStates(allVenues);
  });

  onDestroy(() => {
    tabLoadCtrl?.abort();
  });

  function closeAndAbort() {
    tabLoadCtrl?.abort();
    onClose();
  }

  let tabLabel = $derived<Record<TabKey, string>>({
    beer: t.beer,
    wineCocktail: t.wineCocktails,
    events: t.events,
  });
</script>

<div class="sheet-shell">
  <div class="sheet-handle"></div>

  <header class="sheet-header">
    <div class="title-row">
      <div class="count">{displayItems.length}</div>
      <div class="copy">
        <h2>{tabLabel[activeTab]}</h2>
        <p>{t.browseNearby}</p>
      </div>
    </div>
    <button class="close-btn" type="button" onclick={closeAndAbort} aria-label={t.closePanel}>
      ×
    </button>
  </header>

  <div class="tabs" role="tablist" aria-label={t.featureMode}>
    {#each availableModes as tab (tab)}
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === tab}
        aria-selected={activeTab === tab}
        id="feature-tab-{tab}"
        onclick={() => (activeTab = tab)}
      >
        {tabLabel[tab]}
      </button>
    {/each}
  </div>

  {#if activeTab === 'events'}
    <div class="sort-bar">
      <button
        type="button"
        class="sort-pill"
        class:active={sortBy === 'time'}
        onclick={() => (sortBy = 'time')}
      >{t.sortByTime}</button>
      <button
        type="button"
        class="sort-pill"
        class:active={sortBy === 'distance'}
        onclick={() => (sortBy = 'distance')}
      >{t.sortByDistance}</button>
    </div>
    {#if eventCategories.length > 0}
      <div class="chip-row">
        <button
          type="button"
          class="chip"
          class:active={activeCategory === null}
          onclick={() => (activeCategory = null)}
        >{t.eventFilterAll}</button>
        {#each eventCategories as cat (cat)}
          <button
            type="button"
            class="chip"
            class:active={activeCategory === cat}
            onclick={() => (activeCategory = cat)}
          >{cat}</button>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="list" role="tabpanel" aria-labelledby="feature-tab-{activeTab}" bind:this={railEl}>
    {#if currentItems.error && displayItems.length === 0}
      <div class="error-card">
        <p class="error-text">{currentItems.error}</p>
        <button type="button" class="action-btn" onclick={retryLoad}>{t.retry}</button>
      </div>
    {:else if currentItems.loading && displayItems.length === 0}
      <div class="skeleton-list">
        {#each Array(3) as _, i (i)}
          <div class="skeleton-card" style={`--index:${i}`}>
            <div class="sk-top">
              <div class="skeleton-element skeleton-pill"></div>
              <div class="skeleton-element skeleton-metric"></div>
            </div>
            <div class="skeleton-element skeleton-title"></div>
            <div class="skeleton-element skeleton-text"></div>
          </div>
        {/each}
      </div>
    {:else if displayItems.length === 0}
      <div class="empty-card">{activeTab === 'events' ? t.noEventsFound : t.noVenuesFound}</div>
    {:else}
      {#each displayItems as item, index (item.id)}
        {#if activeTab !== 'events'}
          {@const venue = item as Venue}
          {@const openState = venueOpenState[venue.id]}
          {@const venSun = venue.lat !== undefined && venue.lon !== undefined ? getSunPosition(venue.lat, venue.lon) : null}
          <article class="card" style={`--index:${index}`}>
            <div class="card-top">
              <span class="card-distance">
                {venue.distance !== undefined
                  ? (venue.distance < 1000
                      ? `${Math.round(venue.distance)} m`
                      : `${(venue.distance / 1000).toFixed(1)} km`)
                  : ''}
              </span>
              {#if openState?.statusText}
                <span class="card-badge open-status {openState.statusClass}">
                  {openState.statusText}
                </span>
              {/if}
            </div>

            <h3 class="card-name">{venue.name}</h3>

            {#if venue.rawPrice !== undefined}
              <div class="card-price-row">
                {#if venue.drinkName}
                  <span class="card-drink">{venue.drinkName}</span>
                {/if}
                <span class="card-price">
                  <span class="card-price-value">{venue.rawPrice}</span>
                  <span class="card-price-currency"> kr</span>
                </span>
              </div>
              {#if venue.happyHourPrice != null}
                <div class="card-happy-row">
                  <span class="card-happy-label">{t.happyHour}</span>
                  <span class="card-happy-price">{venue.happyHourPrice} kr</span>
                </div>
              {/if}
            {:else if venue.priceLevel}
              <div class="card-price-level-row">
                <span class="card-price-level" aria-label={t.priceLevel}>
                  {'€'.repeat(venue.priceLevel)}
                </span>
              </div>
            {/if}

            {#if venue.address}
              <div class="card-address">{venue.address}</div>
            {/if}

            <div class="card-badges">
              {#if activeTab === 'beer'}
                <span class="badge-icon badge-beer" aria-label="Beer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/></svg>
                </span>
              {/if}
              {#if venue.isSpecificWine}
                <span class="badge-icon" aria-label={t.wineLabel}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/></svg>
                </span>
              {/if}
              {#if venue.isSpecificCocktail}
                <span class="badge-icon" aria-label={t.cocktailLabel}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207z"/><path d="M12 12v10"/><path d="M7 22h10"/></svg>
                </span>
              {/if}
              {#if venue.hasOutdoorSeating}
                <span class="badge-outdoor" aria-label={t.outdoorSeating} title={venSun?.label === 'sun' ? t.sunLabel : venSun?.label === 'shade' ? t.shadeLabel : t.outdoorSeating}>
                  {#if venSun?.label === 'sun'}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                  {:else if venSun?.label === 'shade'}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>
                  {:else if venSun?.label === 'low-sun'}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                  {/if}
                  {t.outdoorSeating}
                </span>
              {/if}
            </div>

            {#if venue.lat !== undefined && venue.lon !== undefined}
              {@const vLat = venue.lat}{@const vLon = venue.lon}
              <div class="card-actions">
                <button type="button" class="action-btn" onclick={() => openMapsAt(vLat, vLon, venue.name)}>
                  {t.openInMaps}
                </button>
              </div>
            {/if}
          </article>
        {:else}
          {@const event = item as EventItem}
          <article class="card" style={`--index:${index}`}>
            <div class="card-top">
              <span class="card-tag">{t.events}</span>
              {#if event.lat !== undefined && event.lon !== undefined}
                {@const dist = distanceMeters(lat, lon, event.lat, event.lon)}
                <span class="card-distance">
                  {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}
                </span>
              {/if}
              <span class="card-meta">{event.startTime ? formatEventDateTime(event.startTime, locale, t) : t.emDash}</span>
            </div>
            <h3 class="card-name">{event.name}</h3>
            <div class="card-details">
              <span class="card-event-meta">{eventStats(event)}</span>
              {#if event.description}
                <p class="card-description">{event.description}</p>
              {/if}
            </div>
            <div class="card-actions">
              {#if event.ticketUrl}
                <a class="action-btn primary" href={event.ticketUrl} target="_blank" rel="noopener noreferrer">
                  {t.openTickets}
                </a>
              {/if}
              {#if event.lat !== undefined && event.lon !== undefined}
                {@const eLat = event.lat}{@const eLon = event.lon}
                <button type="button" class="action-btn" onclick={() => openMapsAt(eLat, eLon, event.name)}>
                  {t.openInMaps}
                </button>
              {/if}
            </div>
          </article>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .sheet-shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  .sheet-handle {
    width: 54px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--border-subtle);
    margin: 2px auto 4px;
  }

  .sheet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    flex: 1;
    min-width: 0;
  }

  .count {
    font-family: 'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 24px;
    font-weight: 600;
    line-height: 1;
    color: var(--text);
    min-width: 1ch;
    padding-top: 2px;
  }

  .copy {
    min-width: 0;
  }

  .copy h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--text);
  }

  .copy p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .tab-btn {
    flex: 1;
    border: 0;
    background: var(--accent-subtle);
    color: var(--text-secondary);
    padding: 10px 12px;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }

  .tab-btn.active {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .tab-btn:focus-visible,
  .close-btn:focus-visible,
  .action-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .sort-bar {
    display: flex;
    gap: 6px;
  }

  .sort-pill {
    flex: 1;
    border: 0;
    background: var(--accent-subtle);
    color: var(--text-secondary);
    padding: 8px 12px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }

  .sort-pill.active {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .sort-pill:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .chip-row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overflow-y: clip;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
    padding: 4px 0 8px;
    flex-shrink: 0;
    min-height: 36px;
  }

  .chip-row::-webkit-scrollbar {
    display: none;
  }

  .chip {
    flex-shrink: 0;
    border: 0;
    background: var(--accent-subtle);
    color: var(--text-secondary);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    scroll-snap-align: start;
  }

  .chip.active {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card {
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .card-meta {
    font-family: 'Neue Machina', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .card-name {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
    text-wrap: balance;
  }

  .card-distance {
    font-family: 'Neue Machina', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .card-price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-drink {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }

  .card-price {
    display: flex;
    align-items: baseline;
    gap: 2px;
    flex-shrink: 0;
  }

  .card-price-value {
    font-family: 'Neue Machina', sans-serif;
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
    color: var(--accent);
    letter-spacing: -0.02em;
  }

  .card-price-currency {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .card-happy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: -4px;
  }

  .card-happy-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .card-happy-price {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .card-price-level-row {
    display: flex;
    align-items: center;
  }

  .card-price-level {
    font-family: 'Neue Machina', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.08em;
  }

  .card-details {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .card-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
  }

  .open-status.open {
    background: color-mix(in srgb, var(--color-success) 12%, transparent);
    color: var(--color-success);
  }

  .open-status.closed {
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
  }

  .open-status.unknown {
    background: rgba(111, 111, 111, 0.1);
    color: var(--text-secondary);
  }

  .card-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .badge-icon {
    display: inline-flex;
    align-items: center;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .badge-beer {
    opacity: 0.8;
    color: var(--accent);
  }

  .badge-outdoor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-subtle);
  }

  .card-address {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .card-tag {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .card-event-meta {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .card-description {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    display: -webkit-box;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 4px;
  }

  .action-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text);
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    text-decoration: none;
    transition: background 0.12s, border-color 0.12s;
  }

  .action-btn:hover {
    background: var(--accent-subtle);
    border-color: var(--accent);
  }

  .action-btn.primary {
    background: var(--accent);
    color: var(--text-on-accent);
    border-color: transparent;
  }

  .action-btn.primary:hover {
    opacity: 0.9;
  }

  .empty-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 4px 12px rgba(0,0,0,0.04);
    color: var(--text-secondary);
    font-size: 14px;
    min-height: 120px;
  }

  .error-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 4px 12px rgba(0,0,0,0.04);
    min-height: 120px;
    text-align: center;
  }

  .error-text {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-card {
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .skeleton-element {
    background: linear-gradient(90deg, var(--border) 0%, var(--surface-emphasis, color-mix(in srgb, var(--surface) 95%, #000 5%)) 50%, var(--border) 100%);
    background-size: 200% 100%;
    border-radius: 4px;
  }

  .sk-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .skeleton-pill {
    width: 60px;
    height: 20px;
    border-radius: 10px;
  }

  .skeleton-metric {
    width: 50px;
    height: 20px;
    border-radius: 6px;
  }

  .skeleton-title {
    width: 70%;
    height: 16px;
    border-radius: 6px;
  }

  .skeleton-text {
    width: 90%;
    height: 12px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-element {
      opacity: 0.4;
    }
  }
</style>
