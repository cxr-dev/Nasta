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
  import type { EventItem } from '../services/eventService';
  import type { Venue } from '../services/venueService';
  import {
    loadFeatureDiscovery,
    peekFeatureDiscovery,
    prefetchFeatureDiscovery,
    type FeatureDiscoveryMode,
  } from '../services/featureDiscoverySession';
  import { distanceMeters } from '../services/geo';
  import { getSunPosition } from '../lib/sunPosition';
  import { moodImagePath, resolveVenueMedia } from '../data/venueMoodImages';

  function dedupeById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  type TabKey = 'beer' | 'wineCocktail' | 'events';
  type VenueFilter = 'all' | 'beer' | 'wineCocktail';

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
  let activeVenueFilter = $state<VenueFilter>('all');
  let imageInfoOpenId = $state<string | null>(null);

  let discoveryModes = $derived<TabKey[]>([
    ...(availableModes.some((mode) => mode === 'beer' || mode === 'wineCocktail') ? ['beer' as const] : []),
    ...(availableModes.includes('events') ? ['events' as const] : []),
  ]);

  type TabData<T> = {
    items: T[];
    loading: boolean;
    loaded: boolean;
    error?: string;
  };

  let venuesByTab: Record<'beer' | 'wineCocktail', TabData<Venue>> = $state.raw({
    beer: { items: [], loading: false, loaded: false, error: undefined },
    wineCocktail: { items: [], loading: false, loaded: false, error: undefined },
  });
  let eventsTab: TabData<EventItem> = $state.raw({
    items: [], loading: false, loaded: false, error: undefined,
  });
  let openingHoursParser: any = null;
  let venueOpenState = $state<Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }>>({});
  let loadGeneration = 0;
  let disposed = false;

  $effect(() => {
    if (activeTab === 'wineCocktail' || !discoveryModes.includes(activeTab)) {
      activeTab = discoveryModes[0] ?? 'beer';
    }
  });

  function hydrateCachedData() {
    const beer = peekFeatureDiscovery({ lat, lon, mode: 'beer' });
    const wineCocktail = peekFeatureDiscovery({ lat, lon, mode: 'wineCocktail' });
    const events = peekFeatureDiscovery({ lat, lon, mode: 'events' });
    if (beer) venuesByTab = { ...venuesByTab, beer: { items: beer, loading: false, loaded: true, error: undefined } };
    if (wineCocktail) venuesByTab = { ...venuesByTab, wineCocktail: { items: wineCocktail, loading: false, loaded: true, error: undefined } };
    if (events) eventsTab = { items: events, loading: false, loaded: true, error: undefined };
  }

  async function loadMode(mode: FeatureDiscoveryMode) {
    const generation = loadGeneration;
    if (mode === 'events') {
      if (eventsTab.loading || eventsTab.loaded) return;
      eventsTab = { ...eventsTab, loading: true, error: undefined };
      try {
        const loaded = await loadFeatureDiscovery({ lat, lon, mode });
        if (disposed || generation !== loadGeneration) return;
        eventsTab = { items: loaded, loading: false, loaded: true, error: undefined };
      } catch (error) {
        if (disposed || generation !== loadGeneration) return;
        console.warn('[FeatureDiscoverySheet] loadMode failed:', mode, error);
        eventsTab = { items: [], loading: false, loaded: true, error: t.loadError };
      }
      return;
    }

    const state = venuesByTab[mode];
    if (state.loading || state.loaded) return;
    venuesByTab = { ...venuesByTab, [mode]: { ...state, loading: true, error: undefined } };
    try {
      const loaded = await loadFeatureDiscovery({ lat, lon, mode });
      if (disposed || generation !== loadGeneration) return;
      venuesByTab = { ...venuesByTab, [mode]: { items: loaded, loading: false, loaded: true, error: undefined } };
    } catch (error) {
      if (disposed || generation !== loadGeneration) return;
      console.warn('[FeatureDiscoverySheet] loadMode failed:', mode, error);
      venuesByTab = { ...venuesByTab, [mode]: { items: [], loading: false, loaded: true, error: t.loadError } };
    }
  }

  function selectTab(tab: TabKey) {
    activeTab = tab;
    void loadMode(tab);
    if (tab !== 'events' && availableModes.includes('wineCocktail')) void loadMode('wineCocktail');
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

  let venueItems = $derived(
    dedupeById([...venuesByTab.beer.items, ...venuesByTab.wineCocktail.items])
  );

  let currentItems = $derived<TabData<Venue | EventItem>>(
    activeTab === 'events'
      ? eventsTab
      : {
          items: venueItems,
          loading: venuesByTab.beer.loading || venuesByTab.wineCocktail.loading,
          loaded: venuesByTab.beer.loaded || venuesByTab.wineCocktail.loaded,
          error: venuesByTab.beer.error ?? venuesByTab.wineCocktail.error,
        }
  );

  let filteredVenues = $derived(
    activeTab !== 'events'
      ? venueItems
          .filter((venue) => {
            if (activeVenueFilter === 'all') return true;
            if (activeVenueFilter === 'beer') return venue._classified === 'beer' || venue.source?.startsWith('supabase');
            return venue._classified === 'wine' || venue._classified === 'cocktail' || venue.isSpecificWine || venue.isSpecificCocktail;
          })
          .sort((a, b) => {
            const aOpen = venueOpenState[a.id]?.isOpenNow === true ? 0 : 1;
            const bOpen = venueOpenState[b.id]?.isOpenNow === true ? 0 : 1;
            if (aOpen !== bOpen) return aOpen - bOpen;
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
          })
      : []
  );
  let venueMedia = $derived(resolveVenueMedia(filteredVenues));

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
    const available = [...cats].sort();
    const preferred = ['Music', 'Musik', 'Exhibitions', 'Utställningar', 'Family', 'Familj', 'Sports', 'Sport'];
    const common = preferred.filter((name) => available.includes(name));
    return (common.length > 0 ? common : available).slice(0, 3);
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
    const items = activeTab !== 'events' ? venueItems : [];
    const key = items.map(v => v.id + '|' + (v as Venue).openingHours).join(',');
    if (key === prevVenueKey) return;
    prevVenueKey = key;
    updateVenueOpenStates(items as Venue[]);
  });

  let railEl = $state<HTMLElement | undefined>();

  $effect(() => {
    if (!railEl || displayItems.length === 0) return;
    const cards = railEl.querySelectorAll('.card');
    if (cards.length === 0) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    gsap.fromTo(cards, { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.36, ease: 'power2.out' });
  });

  onMount(async () => {
    activeTab = defaultMode === 'events' && discoveryModes.includes('events') ? 'events' : discoveryModes[0] ?? 'beer';
    hydrateCachedData();
    loadGeneration += 1;
    void loadMode(activeTab);
    if (activeTab !== 'events' && availableModes.includes('wineCocktail')) void loadMode('wineCocktail');
    for (const mode of availableModes) {
      if (mode === activeTab) continue;
      void prefetchFeatureDiscovery({ lat, lon, mode }).catch(() => {});
    }
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
    disposed = true;
    loadGeneration += 1;
  });

  function closeAndAbort() {
    onClose();
  }

  let tabLabel = $derived<Record<TabKey, string>>({
    beer: t.afterwork,
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
    {#each discoveryModes as tab (tab)}
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === tab}
        aria-selected={activeTab === tab}
        id="feature-tab-{tab}"
        onclick={() => selectTab(tab)}
      >
        {tabLabel[tab]}
      </button>
    {/each}
  </div>

  {#if activeTab !== 'events'}
    <div class="venue-filters" role="group" aria-label={t.venueFilter}>
      {#each [
        ['all', t.allVenues ?? 'All'],
        ['beer', t.beer],
        ['wineCocktail', t.wineCocktails],
      ] as filter (filter[0])}
        <button
          type="button"
          class="filter-chip"
          class:active={activeVenueFilter === filter[0]}
          aria-pressed={activeVenueFilter === filter[0]}
          onclick={() => {
            activeVenueFilter = filter[0] as VenueFilter;
            if (activeVenueFilter === 'wineCocktail') void loadMode('wineCocktail');
          }}
        >{filter[1]}</button>
      {/each}
    </div>
  {/if}

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
        <p class="error-text">{t.featureUnavailable ?? 'Unavailable'}</p>
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
          {@const media = venueMedia.get(venue.id)}
          <article class="card" style={`--index:${index}`}>
            {#if media}
              <div class="card-media venue-media" class:mood-media={media.kind === 'mood'}>
              {#if media.kind === 'venue'}
                <img
                  src={media.imageUrl}
                  alt={venue.name}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  fetchpriority={index < 2 ? 'high' : 'auto'}
                  decoding="async"
                  onerror={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              {:else}
                <picture>
                  <source srcset={moodImagePath(media.image, 'avif')} type="image/avif" />
                  <img src={moodImagePath(media.image, 'webp')} alt="" loading={index < 2 ? 'eager' : 'lazy'} fetchpriority={index < 2 ? 'high' : 'auto'} decoding="async" width="960" height="360" />
                </picture>
                <span class="mood-label">{t.moodImage ?? 'Stämningsbild'}</span>
              {/if}
              </div>
            {/if}
            <div class="card-heading"><h3 class="card-name">{venue.name}</h3></div>
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
            {#if event.imageUrl}
              <div class="card-media event-media">
                <img
                  src={event.imageUrl}
                  alt={event.name}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  fetchpriority={index < 2 ? 'high' : 'auto'}
                  decoding="async"
                  onerror={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                {#if event.imageCredit && event.imageLicense}
                  <button class="image-info" type="button" aria-label={t.imageInformation ?? 'Image information'} aria-expanded={imageInfoOpenId === event.id} aria-controls={`event-image-info-${event.id}`} onclick={() => imageInfoOpenId = imageInfoOpenId === event.id ? null : event.id}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  </button>
                  {#if imageInfoOpenId === event.id}<span id={`event-image-info-${event.id}`} class="image-info-popover">{event.imageCredit} · {event.imageSource} · {event.imageLicense}</span>{/if}
                {/if}
              </div>
            {/if}
            <div class="event-heading">
              {#if !event.imageUrl}
                <span class="event-category-tile" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></span>
              {/if}
              <h3 class="card-name">{event.name}</h3>
            </div>
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
      {#if activeTab === 'events'}
        <p class="events-credit">{t.eventDataAttribution ?? 'Event information from'} <a href="https://api.visitstockholm.com/documentation/" target="_blank" rel="noopener noreferrer">Stockholm Business Region · CC BY 4.0</a></p>
      {/if}
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
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--border-subtle);
    margin: 8px auto 6px;
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
    -webkit-tap-highlight-color: transparent;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .venue-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 2px;
  }
  .filter-chip {
    flex: 0 0 auto;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    padding: 7px 11px;
    border-radius: var(--radius-full);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .filter-chip.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .filter-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    -webkit-tap-highlight-color: transparent;
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
    -webkit-tap-highlight-color: transparent;
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
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0 8px;
    flex-shrink: 0;
    min-height: 36px;
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
    -webkit-tap-highlight-color: transparent;
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
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-media {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 104px;
    margin: -12px -12px 2px;
    overflow: hidden;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 30px;
  }
  .card-media.venue-media {
    background: color-mix(in oklch, var(--color-warning-bg) 70%, var(--surface));
  }
  .card-media.event-media {
    background: color-mix(in oklch, var(--color-info-bg) 70%, var(--surface));
  }
  .card-media img,
  .card-media picture {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mood-label {
    position: absolute;
    left: 8px;
    bottom: 7px;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.58);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
  }

  .image-info { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.48); color: #fff; }
  .image-info-popover { position: absolute; right: 8px; top: 48px; max-width: calc(100% - 16px); padding: 5px 7px; border-radius: 6px; background: rgba(0, 0, 0, 0.76); color: #fff; font-size: 10px; z-index: 1; }
  .card-heading, .event-heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .event-category-tile { width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; background: var(--color-info-bg); color: var(--color-info); }

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
    background: color-mix(in oklch, var(--color-success) 12%, transparent);
    color: var(--color-success);
  }

  .open-status.closed {
    background: color-mix(in oklch, var(--color-error) 12%, transparent);
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
    line-clamp: 2;
    -webkit-line-clamp: 2;
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
    -webkit-tap-highlight-color: transparent;
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

  .events-credit { margin: 0; padding: 4px 2px 12px; color: var(--text-muted); font-size: 11px; line-height: 1.4; }
  .events-credit a { color: inherit; text-underline-offset: 2px; }

  @media (min-width: 768px) { .card-media { height: 112px; } }

  @media (hover: none), (pointer: coarse) {
    .action-btn:hover { background: transparent; border-color: var(--border); }
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
    position: relative;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .skeleton-card::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      110deg,
      transparent 22%,
      color-mix(in oklch, var(--surface) 68%, var(--text) 32%) 50%,
      transparent 78%
    );
    transform: translateX(-100%);
    animation: skeleton-shimmer 1.7s ease-in-out infinite;
  }

  .skeleton-element {
    background: var(--border);
    border-radius: 4px;
  }

  @keyframes skeleton-shimmer {
    to { transform: translateX(100%); }
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
    .skeleton-card::after { display: none; }
  }
</style>
