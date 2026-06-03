<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../stores/localeStore';
  import { fetchNearbyEvents, type EventItem } from '../services/eventService';
  import { fetchNearbyVenues, type Venue } from '../services/venueService';

  type Mode = 'venues' | 'events';
  type VenueGroup = 'beer' | 'wineCocktail';

  let {
    lat,
    lon,
    label = '',
    destination = '',
    availableModes = ['venues', 'events'] as Mode[],
    defaultMode = 'venues' as Mode,
    onClose = () => {},
  }: {
    lat: number;
    lon: number;
    label?: string;
    destination?: string;
    availableModes?: Mode[];
    defaultMode?: Mode;
    onClose?: () => void;
  } = $props();

  let activeMode = $state<Mode>('venues');
  let venueGroup = $state<VenueGroup>('beer');
  let venuesByGroup = $state<Record<VenueGroup, Venue[]>>({
    beer: [],
    wineCocktail: [],
  });
  let venueLoadingByGroup = $state<Record<VenueGroup, boolean>>({
    beer: false,
    wineCocktail: false,
  });
  let venueLoadedByGroup = $state<Record<VenueGroup, boolean>>({
    beer: false,
    wineCocktail: false,
  });
  let events = $state<EventItem[]>([]);
  let eventLoading = $state(false);
  let venueOpenState = $state<Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }>>({});
  let openingHoursParser: any = null;

  $effect(() => {
    if (!availableModes.includes(activeMode)) {
      activeMode = availableModes[0] ?? 'venues';
    }
  });

  let venueFetchTokenByGroup = { beer: 0, wineCocktail: 0 };
  let eventFetchToken = 0;

  async function loadVenues(group: VenueGroup) {
    if (venueLoadingByGroup[group] || venueLoadedByGroup[group]) return;
    const token = ++venueFetchTokenByGroup[group];
    venueLoadingByGroup = { ...venueLoadingByGroup, [group]: true };
    try {
      const types: Array<'beer' | 'wine' | 'cocktail'> = group === 'beer' ? ['beer'] : ['wine', 'cocktail'];
      const loadedVenues = await fetchNearbyVenues(lat, lon, 1200, types);
      if (token !== venueFetchTokenByGroup[group]) return;
      venuesByGroup = { ...venuesByGroup, [group]: loadedVenues };
      venueLoadedByGroup = { ...venueLoadedByGroup, [group]: true };
    } catch {
      if (token !== venueFetchTokenByGroup[group]) return;
      venuesByGroup = { ...venuesByGroup, [group]: [] };
    } finally {
      if (token === venueFetchTokenByGroup[group]) {
        venueLoadingByGroup = { ...venueLoadingByGroup, [group]: false };
        const otherGroup: VenueGroup = group === 'beer' ? 'wineCocktail' : 'beer';
        if (!venueLoadedByGroup[otherGroup] && !venueLoadingByGroup[otherGroup]) {
          void loadVenues(otherGroup);
        }
      }
    }
  }

  async function loadEvents(signal?: AbortSignal) {
    if (eventLoading || events.length > 0) return;
    const token = ++eventFetchToken;
    eventLoading = true;
    try {
      const loadedEvents = await fetchNearbyEvents(lat, lon, 5000, signal);
      if (token !== eventFetchToken) return;
      events = loadedEvents;
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      if (token !== eventFetchToken) return;
      events = [];
    } finally {
      if (token === eventFetchToken) eventLoading = false;
    }
  }

  let _controller: AbortController | null = null;

  onMount(async () => {
    activeMode = defaultMode;
    if (!availableModes.includes(activeMode)) {
      activeMode = availableModes[0] ?? 'venues';
    }
    // create a controller to abort pending fetches when sheet is closed
    _controller = new AbortController();
    if (availableModes.includes('venues')) {
      void loadVenues('beer');
      void loadVenues('wineCocktail');
    }
    if (availableModes.includes('events')) {
      void loadEvents(_controller.signal);
    }
    try {
      const module = await import('opening_hours');
      openingHoursParser = module.default ?? module;
    } catch {
      openingHoursParser = null;
    }
    updateVenueOpenStates(currentVenues);
  });

  onDestroy(() => {
    _controller?.abort();
    _controller = null;
  });

  function closeAndAbort() {
    _controller?.abort();
    _controller = null;
    // bump per-group tokens to ignore any in-flight responses
    venueFetchTokenByGroup = { beer: venueFetchTokenByGroup.beer + 1, wineCocktail: venueFetchTokenByGroup.wineCocktail + 1 };
    onClose();
  }

  // priceLevel visual not used; show actual rawPrice in SEK when available
  const currency = (_value?: 1 | 2 | 3) => '';

  function getStockholmDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
    return {
      year: parseInt(getPart('year'), 10),
      month: parseInt(getPart('month'), 10) - 1,
      day: parseInt(getPart('day'), 10),
      hour: parseInt(getPart('hour'), 10),
      minute: parseInt(getPart('minute'), 10),
    };
  }

  function getStockholmDayDifference(date1: Date, date2: Date): number {
    const p1 = getStockholmDateParts(date1);
    const p2 = getStockholmDateParts(date2);
    const d1 = new Date(Date.UTC(p1.year, p1.month, p1.day));
    const d2 = new Date(Date.UTC(p2.year, p2.month, p2.day));
    const diffTime = d1.getTime() - d2.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  function formatStockholmTime(date: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  function formatEventDateTime(startTimeStr?: string): string {
    if (!startTimeStr) return '—';
    const date = new Date(startTimeStr);
    if (Number.isNaN(date.getTime())) return startTimeStr;

    const parts = getStockholmDateParts(date);
    const now = new Date();
    const dayDiff = getStockholmDayDifference(date, now);

    // Detect if this is a date-only string (no hour/minute information, or explicitly midnight UTC)
    const isDateOnly = 
      /^\d{4}-\d{2}-\d{2}$/.test(startTimeStr) || 
      /T00:00:00/.test(startTimeStr) ||
      (startTimeStr.includes('00:00:00') && (parts.hour === 1 || parts.hour === 2 || parts.hour === 0));

    const pad = (n: number) => String(n).padStart(2, '0');
    const timeText = isDateOnly ? ' (Heldag)' : ` kl. ${pad(parts.hour)}:${pad(parts.minute)}`;

    if (dayDiff === 0) {
      return `Idag${timeText}`;
    } else if (dayDiff === 1) {
      return `Imorgon${timeText}`;
    } else {
      const weekday = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
        weekday: 'long',
      }).format(date);
      const dayAndMonth = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
        day: 'numeric',
        month: 'short',
      }).format(date);
      
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return `${capitalizedWeekday} ${dayAndMonth}${timeText}`;
    }
  }

  function formatEventRelativeShort(startTimeStr?: string): string {
    if (!startTimeStr) return '—';
    const date = new Date(startTimeStr);
    if (Number.isNaN(date.getTime())) return '—';
    
    const now = new Date();
    const dayDiff = getStockholmDayDifference(date, now);
    
    if (dayDiff === 0) return 'Idag';
    if (dayDiff === 1) return 'Imorgon';
    
    const weekday = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      weekday: 'short',
    }).format(date);
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    const day = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      day: 'numeric',
    }).format(date);

    return `${capitalizedWeekday} ${day}`;
  }

  function computeVenueOpenState(venue: Venue) {
    if (!openingHoursParser || !venue.openingHours) {
      return {
        isOpenNow: false,
        statusText: venue.openingHours ? venue.openingHours : '–',
        statusClass: 'unknown',
      };
    }

    try {
      const oh = new openingHoursParser(venue.openingHours, {
        timezone: 'Europe/Stockholm',
      });
      const isOpenNow = Boolean(oh.getState());
      const nextChange = oh.getNextChange?.(new Date());
      const nextChangeText = nextChange ? formatStockholmTime(nextChange) : '';
      const statusText = isOpenNow
        ? `Öppet nu${nextChangeText ? ` · stänger ${nextChangeText}` : ''}`
        : `Stängt${nextChangeText ? ` · öppnar ${nextChangeText}` : ''}`;

      return {
        isOpenNow,
        statusText,
        statusClass: isOpenNow ? 'open' : 'closed',
      };
    } catch {
      return {
        isOpenNow: false,
        statusText: venue.openingHours ? venue.openingHours : '–',
        statusClass: 'unknown',
      };
    }
  }

  function updateVenueOpenStates(venues: Venue[]) {
    const nextState: Record<string, { isOpenNow: boolean; statusText: string; statusClass: string }> = {};
    for (const venue of venues) {
      nextState[venue.id] = computeVenueOpenState(venue);
    }
    venueOpenState = nextState;
  }

  function openMapsAt(lat: number, lon: number, label: string) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon} ${encodeURIComponent(label)}`, '_blank', 'noopener,noreferrer');
  }

  function venueStats(venue: Venue): string {
    const parts: string[] = [];
    if (venue.openingHours) parts.push(venue.openingHours);
    if (venue.rawPrice !== undefined) parts.push(`${venue.rawPrice} kr`);
    else if (venue.priceLevel) parts.push('Prisnivå');
    if (venue.distance !== undefined) parts.push(`${Math.round(venue.distance)} m`);
    return parts.join(' · ');
  }

  function eventStats(event: EventItem): string {
    const timeText = event.startTime ? formatEventDateTime(event.startTime) : '—';
    const location = event.location || 'Stockholm';
    return `${timeText} · ${location}`;
  }

  $effect(() => {
    if (activeMode === 'venues') void loadVenues(venueGroup);
    if (activeMode === 'events') void loadEvents();
  });

  let currentVenues = $derived(venuesByGroup[venueGroup] ?? []) as Venue[];
  $effect(() => {
    updateVenueOpenStates(currentVenues);
  });
  let filteredVenues = $derived(
    currentVenues.filter((venue) => {
      if (!venue.openingHours) return true;
      const state = venueOpenState[venue.id];
      return state?.statusClass !== 'closed';
    }),
  ) as Venue[];
  let currentVenueLoading = $derived(venueLoadingByGroup[venueGroup] ?? false);
  let items = $derived(activeMode === 'venues' ? filteredVenues : events);
  let count = $derived(items.length);
  let showTabs = $derived(availableModes.length > 1);
  let title = $derived(activeMode === 'venues' ? $t.afterwork : $t.events);
  let subtitle = $derived($t.browseNearby || 'Browse nearby');
</script>

<div class="sheet-shell">
  <div class="sheet-handle"></div>

  <header class="sheet-header">
    <div class="header-copy">
      <div class="eyebrow">{$t.nearby}</div>
      <div class="title-row">
        <div class="count">{count}</div>
        <div class="copy">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>

    <button class="close-btn" type="button" onclick={() => closeAndAbort()} aria-label="Close panel">
      ×
    </button>
  </header>

  {#if showTabs}
    <div class="mode-switch" role="tablist" aria-label="Feature mode">
      {#each availableModes as mode (mode)}
        <button
          type="button"
          role="tab"
          class="mode-pill"
          class:active={activeMode === mode}
          aria-selected={activeMode === mode}
          onclick={() => (activeMode = mode)}
        >
          {mode === 'venues' ? $t.afterwork : $t.events}
        </button>
      {/each}
    </div>
  {/if}

  {#if activeMode === 'venues'}
    <div class="venue-switch" role="tablist" aria-label="Venue filter">
      <button
        type="button"
        class="venue-pill"
        class:active={venueGroup === 'beer'}
        aria-pressed={venueGroup === 'beer'}
        onclick={() => (venueGroup = 'beer')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" class="venue-icon">
          <path d="M8 4h7a3 3 0 0 1 3 3v8a5 5 0 0 1-5 5H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <path d="M7 7h10M7 11h10M9 18v2M13 18v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>{$t.beer}</span>
      </button>
      <button
        type="button"
        class="venue-pill"
        class:active={venueGroup === 'wineCocktail'}
        aria-pressed={venueGroup === 'wineCocktail'}
        onclick={() => (venueGroup = 'wineCocktail')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" class="venue-icon">
          <path d="M7 4h10l-1 6a4 4 0 0 1-3 3.3V18h3v2H8v-2h3v-4.7A4 4 0 0 1 8 10L7 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M11 4h2M12 6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>{$t.wineCocktails}</span>
      </button>
    </div>
  {/if}

  <section class="rail" aria-label={title}>
    {#if activeMode === 'venues' && currentVenueLoading && filteredVenues.length === 0}
      <div class="skeleton-list">
        {#each Array(3) as _, i}
          <div class="skeleton-card" style={`--index:${i}`}>
            <div class="card-top">
              <div class="skeleton-element skeleton-pill"></div>
              <div class="skeleton-element skeleton-metric"></div>
            </div>
            <div class="skeleton-element skeleton-title"></div>
            <div class="skeleton-element skeleton-text"></div>
            <div class="skeleton-element skeleton-text short"></div>
            <div class="skeleton-element skeleton-button"></div>
          </div>
        {/each}
      </div>
    {:else if activeMode === 'events' && eventLoading && events.length === 0}
      <div class="skeleton-list">
        {#each Array(3) as _, i}
          <div class="skeleton-card" style={`--index:${i}`}>
            <div class="card-top">
              <div class="skeleton-element skeleton-pill"></div>
              <div class="skeleton-element skeleton-metric"></div>
            </div>
            <div class="skeleton-element skeleton-title"></div>
            <div class="skeleton-element skeleton-text"></div>
            <div class="skeleton-element skeleton-text short"></div>
            <div class="skeleton-element skeleton-button"></div>
          </div>
        {/each}
      </div>
    {:else if items.length === 0}
      <div class="empty-card">{activeMode === 'venues' ? $t.noVenuesFound : $t.noEventsFound}</div>
    {:else if activeMode === 'venues'}
      {#each filteredVenues as venue, index (venue.id)}
        <article class="card" style={`--index:${index}`}>
          <div class="card-top">
            <span class="pill">{venueGroup === 'beer' ? $t.beer : $t.wineCocktails}</span>
            <span class="metric">{venue.rawPrice !== undefined ? `${venue.rawPrice} kr` : venue.distance !== undefined ? `${Math.round(venue.distance)}m` : ''}</span>
          </div>
          <h3>
            {venue.name}
            {#if venue.isSpecificWine}
              <span class="venue-flag" aria-label="Wine">🍷</span>
            {/if}
            {#if venue.isSpecificCocktail}
              <span class="venue-flag" aria-label="Cocktail">🍸</span>
            {/if}
          </h3>
          <div class="meta-row">
            {#if venue.hasOutdoorSeating}
              <span class="badge outdoor">☀️ Uteservering</span>
            {/if}
            {#if venueOpenState[venue.id]?.statusText}
              <span class={`status ${venueOpenState[venue.id]?.statusClass}`}>
                {venueOpenState[venue.id]?.statusText}
              </span>
            {/if}
          </div>
          {#if venue.address}
            <p class="support">{venue.address}</p>
          {/if}
          <p class="support">{venueStats(venue)}</p>
          <div class="actions">
            {#if venue.lat !== undefined && venue.lon !== undefined}
              {@const venueLat = venue.lat}
              {@const venueLon = venue.lon}
              <button type="button" class="ghost-btn" onclick={() => openMapsAt(venueLat, venueLon, venue.name)}>
                {$t.openInMaps}
              </button>
            {/if}
          </div>
        </article>
      {/each}
    {:else}
      {#each events as event, index (event.id)}
        <article class="card" style={`--index:${index}`}>
          <div class="card-top">
            <span class="pill">{$t.events}</span>
            <span class="metric">{event.startTime ? formatEventRelativeShort(event.startTime) : '—'}</span>
          </div>
          <h3>{event.name}</h3>
          <p class="support">{eventStats(event)}</p>
          {#if event.description}
            <p class="description">{event.description}</p>
          {/if}
          <div class="actions">
            {#if event.ticketUrl}
              <a class="ghost-btn" href={event.ticketUrl} target="_blank" rel="noopener noreferrer">
                {$t.openTickets}
              </a>
            {/if}
            {#if event.lat !== undefined && event.lon !== undefined}
              {@const eventLat = event.lat}
              {@const eventLon = event.lon}
              <button
                type="button"
                class="ghost-btn"
                onclick={() => openMapsAt(eventLat, eventLon, event.name)}
              >
                {$t.openInMaps}
              </button>
            {/if}
          </div>
        </article>
      {/each}
    {/if}
  </section>
</div>

<style>
  .sheet-shell {
    display: flex;
    flex-direction: column;
    gap: 16px;
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

  .header-copy {
    min-width: 0;
    flex: 1;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
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
    z-index: 10;
    position: relative;
  }

  .mode-switch {
    display: flex;
    gap: 8px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
  }

  .mode-pill {
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    padding: 10px 12px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .mode-pill.active {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .venue-switch {
    display: flex;
    gap: 8px;
  }

  .venue-pill {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    padding: 11px 12px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .venue-pill.active {
    background: var(--accent-subtle);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  .venue-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .rail {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    padding: 4px 2px 10px;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 2px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  .rail::-webkit-scrollbar {
    height: 8px;
  }

  .rail::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 999px;
  }

  .card,
  .empty-card {
    min-width: min(86%, 320px);
    scroll-snap-align: start;
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--surface);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    animation: card-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--index) * 70ms);
  }

  .empty-card {
    justify-content: center;
    min-height: 180px;
    color: var(--text-secondary);
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .metric {
    font-family: 'Neue Machina', sans-serif;
    font-size: 26px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--text);
  }

  .card h3 {
    margin: 0;
    font-size: 20px;
    line-height: 1.05;
    color: var(--text);
  }

  .support {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .description {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.45;
    line-clamp: 3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
    flex-wrap: wrap;
  }


  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .status.open {
    background: rgba(60, 176, 124, 0.12);
    color: #3ca07c;
  }

  .status.closed {
    background: rgba(215, 63, 91, 0.12);
    color: #d73f5b;
  }

  .status.unknown {
    background: rgba(111, 111, 111, 0.1);
    color: var(--text-secondary);
  }

  .venue-flag {
    margin-left: 8px;
    font-size: 1rem;
  }

  .badge.outdoor {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 190, 61, 0.14);
    color: #b26a00;
    font-size: 12px;
    font-weight: 700;
  }

  .ghost-btn {
    appearance: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .ghost-btn:first-child {
    background: var(--accent);
    color: #fff;
    border-color: transparent;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }

  /* Skeleton Loading Styles */
  .skeleton-list {
    display: flex;
    gap: 14px;
    width: 100%;
    overflow: hidden;
  }
  .skeleton-card {
    min-width: min(86%, 320px);
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--surface);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    min-height: 194px;
    animation: card-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--index) * 70ms);
  }
  .skeleton-element {
    background: linear-gradient(90deg, var(--border) 0%, var(--surface-emphasis, color-mix(in srgb, var(--surface) 95%, #000 5%)) 50%, var(--border) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }
  .skeleton-pill {
    width: 80px;
    height: 22px;
    border-radius: 12px;
  }
  .skeleton-metric {
    width: 60px;
    height: 22px;
    border-radius: 6px;
  }
  .skeleton-title {
    width: 70%;
    height: 18px;
    border-radius: 6px;
    margin-top: 4px;
  }
  .skeleton-text {
    width: 90%;
    height: 12px;
    border-radius: 4px;
  }
  .skeleton-text.short {
    width: 50%;
  }
  .skeleton-button {
    width: 100px;
    height: 34px;
    border-radius: 18px;
    margin-top: auto;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
