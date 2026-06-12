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
  let expandedCardId = $state<string | null>(null);

  type TabData<T> = {
    items: T[];
    loading: boolean;
    loaded: boolean;
    token: number;
  };

  let venuesByTab: Record<'beer' | 'wineCocktail', TabData<Venue>> = $state({
    beer: { items: [], loading: false, loaded: false, token: 0 },
    wineCocktail: { items: [], loading: false, loaded: false, token: 0 },
  });
  let eventsTab: TabData<EventItem> = $state({
    items: [], loading: false, loaded: false, token: 0,
  });
  let openingHoursParser: any = null;
  let venueOpenState = $state<Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }>>({});
  let tabLoadCtrl = $state<AbortController | null>(null);

  $effect(() => {
    if (!availableModes.includes(activeTab)) {
      activeTab = availableModes[0] ?? 'beer';
    }
  });

  $effect(() => {
    tabLoadCtrl?.abort();
    const ctrl = new AbortController();
    tabLoadCtrl = ctrl;
    if (activeTab !== 'events') loadVenues(activeTab);
    if (activeTab === 'events') loadEvents(ctrl.signal);
    return () => ctrl.abort();
  });

  async function loadVenues(tab: 'beer' | 'wineCocktail') {
    const state = venuesByTab[tab];
    if (state.loading || state.loaded) return;
    const token = ++state.token;
    venuesByTab = { ...venuesByTab, [tab]: { ...state, loading: true } };
    try {
      const types: Array<'beer' | 'wine' | 'cocktail'> = tab === 'beer' ? ['beer'] : ['wine', 'cocktail'];
      const loaded = await fetchNearbyVenues(lat, lon, 1200, types);
      if (token !== venuesByTab[tab].token) return;
      venuesByTab = { ...venuesByTab, [tab]: { items: loaded, loading: false, loaded: true, token } };
    } catch {
      if (token !== venuesByTab[tab].token) return;
      venuesByTab = { ...venuesByTab, [tab]: { items: [], loading: false, loaded: true, token } };
    }
  }

  async function loadEvents(signal?: AbortSignal) {
    if (eventsTab.loading || eventsTab.loaded) return;
    const token = ++eventsTab.token;
    eventsTab = { ...eventsTab, loading: true };
    try {
      const loaded = await fetchNearbyEvents(lat, lon, 5000, signal);
      if (token !== eventsTab.token) return;
      eventsTab = { items: loaded, loading: false, loaded: true, token };
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      if (token !== eventsTab.token) return;
      eventsTab = { items: [], loading: false, loaded: true, token };
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

  let displayItems = $derived(
    activeTab !== 'events' ? filteredVenues : (currentItems as TabData<EventItem>).items
  );

  $effect(() => {
    locale;
    t;
    const items = activeTab !== 'events' ? (currentItems as TabData<Venue>).items : [];
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
    gsap.fromTo(cards, { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.36, ease: 'power2.out' });
  });

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
    venuesByTab = {
      beer: { ...venuesByTab.beer, token: venuesByTab.beer.token + 1 },
      wineCocktail: { ...venuesByTab.wineCocktail, token: venuesByTab.wineCocktail.token + 1 },
    };
    onClose();
  }

  function toggleCard(id: string) {
    expandedCardId = expandedCardId === id ? null : id;
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
    <button class="close-btn" type="button" onclick={() => closeAndAbort()} aria-label={t.closePanel}>
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
        onclick={() => (activeTab = tab)}
      >
        {tabLabel[tab]}
      </button>
    {/each}
  </div>

  <section class="list" bind:this={railEl} aria-label={tabLabel[activeTab]}>
    {#if currentItems.loading && displayItems.length === 0}
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
        {@const isExpanded = expandedCardId === item.id}
        {#if activeTab !== 'events'}
          {@const venue = item as Venue}
          <article
            class="card"
            class:expanded={isExpanded}
            style={`--index:${index}`}
          >
            <button class="card-header" onclick={() => toggleCard(venue.id)} aria-expanded={isExpanded}>
              <div class="card-header-left">
                <span class="card-type-pill">
                  {activeTab === 'beer' ? t.beer : t.wineCocktails}
                </span>
                <span class="card-title">{venue.name}</span>
                {#if venue.isSpecificWine}
                  <span class="flag" aria-label={t.wineLabel}>🍷</span>
                {/if}
                {#if venue.isSpecificCocktail}
                  <span class="flag" aria-label={t.cocktailLabel}>🍸</span>
                {/if}
              </div>
              <div class="card-header-right">
                <span class="card-metric">{venueMetric(venue)}</span>
                <span class="chevron" class:open={isExpanded}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                  </svg>
                </span>
              </div>
            </button>
            {#if isExpanded}
              <div class="card-body">
                <div class="card-details">
                  {#if venueOpenState[venue.id]?.statusText}
                    <span class={`open-status ${venueOpenState[venue.id]?.statusClass}`}>
                      {venueOpenState[venue.id]?.statusText}
                    </span>
                  {/if}
                  {#if venue.hasOutdoorSeating}
                    <span class="badge outdoor">☀️ {t.outdoorSeating}</span>
                  {/if}
                  {#if venue.address}
                    <p class="card-address">{venue.address}</p>
                  {/if}
                </div>
                <div class="card-actions">
                  {#if venue.lat !== undefined && venue.lon !== undefined}
                    {@const vLat = venue.lat}{@const vLon = venue.lon}
                    <button type="button" class="action-btn primary" onclick={() => openMapsAt(vLat, vLon, venue.name)}>
                      {t.openInMaps}
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </article>
        {:else}
          {@const event = item as EventItem}
          <article
            class="card"
            class:expanded={isExpanded}
            style={`--index:${index}`}
          >
            <button class="card-header" onclick={() => toggleCard(event.id)} aria-expanded={isExpanded}>
              <div class="card-header-left">
                <span class="card-type-pill">{t.events}</span>
                <span class="card-title">{event.name}</span>
              </div>
              <div class="card-header-right">
                <span class="card-metric date">{event.startTime ? formatEventRelativeShort(event.startTime, locale, t) : t.emDash}</span>
                <span class="chevron" class:open={isExpanded}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                  </svg>
                </span>
              </div>
            </button>
            {#if isExpanded}
              <div class="card-body">
                <div class="card-details">
                  <p class="card-event-meta">{eventStats(event)}</p>
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
              </div>
            {/if}
          </article>
        {/if}
      {/each}
    {/if}
  </section>
</div>

<style>
  .sheet-shell {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sheet-handle {
    width: 54px;
    height: 5px;
    border-radius: 999px;
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
    font-family: 'Neue Machina', sans-serif;
    font-size: clamp(44px, 12vw, 64px);
    line-height: 0.86;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--accent);
    min-width: 1ch;
  }

  .copy {
    min-width: 0;
  }

  .copy h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.05;
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
    border-radius: 999px;
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
    border-radius: 999px;
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

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    max-height: 360px;
    overscroll-behavior: contain;
  }

  .card {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    transition: background 0.12s;
  }

  .card-header:hover {
    background: var(--accent-subtle);
  }

  .card-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .card-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .card-type-pill {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .card-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .flag {
    font-size: 14px;
    flex-shrink: 0;
  }

  .card-metric {
    font-family: 'Neue Machina', sans-serif;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text);
    white-space: nowrap;
  }

  .card-metric.date {
    font-size: 12px;
    font-family: inherit;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .card-body {
    padding: 0 14px 14px;
    border-top: 1px solid var(--border);
  }

  .card-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
  }

  .open-status {
    display: inline-flex;
    align-items: center;
    padding: 5px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    align-self: flex-start;
  }

  .open-status.open {
    background: rgba(60, 176, 124, 0.12);
    color: #3ca07c;
  }

  .open-status.closed {
    background: rgba(215, 63, 91, 0.12);
    color: #d73f5b;
  }

  .open-status.unknown {
    background: rgba(111, 111, 111, 0.1);
    color: var(--text-secondary);
  }

  .badge.outdoor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(255, 190, 61, 0.14);
    color: #b26a00;
    font-size: 12px;
    font-weight: 700;
    align-self: flex-start;
  }

  .card-address {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .card-event-meta {
    margin: 0;
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
    padding-top: 10px;
    flex-wrap: wrap;
  }

  .action-btn {
    border: 1px solid var(--border);
    border-radius: 999px;
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
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 14px;
    min-height: 120px;
  }

  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .skeleton-card {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    padding: 14px;
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
    .chevron {
      transition: none;
    }
    .skeleton-element {
      opacity: 0.4;
    }
  }
</style>
