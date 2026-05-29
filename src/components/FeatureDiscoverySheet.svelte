<script lang="ts">
  import { onMount } from 'svelte';
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

  $effect(() => {
    if (!availableModes.includes(activeMode)) {
      activeMode = availableModes[0] ?? 'venues';
    }
  });

  async function loadVenues(group: VenueGroup) {
    if (venueLoadingByGroup[group] || venueLoadedByGroup[group]) return;
    venueLoadingByGroup = { ...venueLoadingByGroup, [group]: true };
    try {
      const types: Array<'beer' | 'wine' | 'cocktail'> = group === 'beer' ? ['beer'] : ['wine', 'cocktail'];
      const loadedVenues = await fetchNearbyVenues(lat, lon, 2000, types);
      venuesByGroup = { ...venuesByGroup, [group]: loadedVenues };
      venueLoadedByGroup = { ...venueLoadedByGroup, [group]: true };
    } catch {
      venuesByGroup = { ...venuesByGroup, [group]: [] };
    } finally {
      venueLoadingByGroup = { ...venueLoadingByGroup, [group]: false };
    }
  }

  async function loadEvents() {
    if (eventLoading || events.length > 0) return;
    eventLoading = true;
    try {
      events = await fetchNearbyEvents(lat, lon, 5000);
    } catch {
      events = [];
    } finally {
      eventLoading = false;
    }
  }

  onMount(() => {
    activeMode = defaultMode;
    if (!availableModes.includes(activeMode)) {
      activeMode = availableModes[0] ?? 'venues';
    }
    if (availableModes.includes('venues')) void loadVenues(venueGroup);
    if (availableModes.includes('events')) void loadEvents();
  });

  const currency = (value: 1 | 2 | 3) => '€'.repeat(value);

  function formatTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function openMapsAt(lat: number, lon: number, label: string) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon} ${encodeURIComponent(label)}`, '_blank', 'noopener,noreferrer');
  }

  function venueStats(venue: Venue): string {
    return `${venue.openingHours} · ${currency(venue.priceLevel)} · ${Math.round(venue.distance)} m`;
  }

  function eventStats(event: EventItem): string {
    const start = formatTime(event.startTime);
    const location = event.location || 'Stockholm';
    return `${start} · ${location}`;
  }

  $effect(() => {
    if (activeMode === 'venues') void loadVenues(venueGroup);
    if (activeMode === 'events') void loadEvents();
  });

  let currentVenues = $derived(venuesByGroup[venueGroup] ?? []);
  let currentVenueLoading = $derived(venueLoadingByGroup[venueGroup] ?? false);
  let items = $derived(activeMode === 'venues' ? currentVenues : events);
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
          {#if label || destination}
            <span class="context">{label}{#if label && destination} → {/if}{destination}</span>
          {/if}
        </div>
      </div>
    </div>

    <button class="close-btn" type="button" onclick={() => onClose()} aria-label="Close panel">
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
    {#if activeMode === 'venues' && currentVenueLoading && currentVenues.length === 0}
      <div class="empty-card">Loading venues…</div>
    {:else if activeMode === 'events' && eventLoading && events.length === 0}
      <div class="empty-card">Loading events…</div>
    {:else if items.length === 0}
      <div class="empty-card">{activeMode === 'venues' ? $t.noVenuesFound : $t.noEventsFound}</div>
    {:else if activeMode === 'venues'}
      {#each currentVenues as venue, index (venue.id)}
        <article class="card" style={`--index:${index}`}>
          <div class="card-top">
            <span class="pill">{venueGroup === 'beer' ? $t.beer : $t.wineCocktails}</span>
            <span class="metric">{Math.round(venue.distance)}m</span>
          </div>
          <h3>{venue.name}</h3>
          <p class="support">{venueStats(venue)}</p>
          <div class="actions">
            <button type="button" class="ghost-btn" onclick={() => openMapsAt(venue.lat, venue.lon, venue.name)}>
              {$t.openInMaps}
            </button>
          </div>
        </article>
      {/each}
    {:else}
      {#each events as event, index (event.id)}
        <article class="card" style={`--index:${index}`}>
          <div class="card-top">
            <span class="pill">{$t.events}</span>
            <span class="metric">{formatTime(event.startTime)}</span>
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

  .context {
    display: inline-flex;
    margin-top: 10px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
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
</style>
