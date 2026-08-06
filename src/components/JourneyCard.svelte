<script lang="ts">
  import type { TransportType } from '../types/page';
  import TransportIcon from './TransportIcon.svelte';
  import TrainPosition from './TrainPosition.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import gsap from 'gsap';
  import { tick } from 'svelte';
  import type { JourneyConnection, JourneyMeta } from '../types/journey';
  import type { SavedJourneyAction } from '../lib/savedJourneyLifecycle';
  import { longPress } from '../lib/longPress';

  let {
    journeyMeta,
    isExpanded = false,
    now = Date.now(),
    ontoggle,
    onAction,
    onLongPress,
    onMoreActions,
    moreActionsLabel,
  }: {
    journeyMeta: JourneyMeta;
    isExpanded?: boolean;
    now?: number;
    ontoggle?: () => void;
    onAction?: (action: SavedJourneyAction) => void;
    onLongPress?: (trigger?: HTMLElement) => void;
    onMoreActions?: (trigger: HTMLElement) => void;
    moreActionsLabel?: string;
  } = $props();

  let t = $derived(getT());

  let activeSnapshot = $derived(journeyMeta.status === 'active' ? journeyMeta.activeSnapshot : undefined);
  let displayLegs = $derived(activeSnapshot?.legs ?? journeyMeta.legs);
  let displayConnections = $derived(activeSnapshot?.connections ?? journeyMeta.connections ?? []);
  let depTime = $derived(activeSnapshot?.plannedDepartureTime ?? journeyMeta.departureTime ?? displayLegs[0]?.departureTime ?? 0);
  let arrTime = $derived(activeSnapshot?.plannedArrivalTime ?? journeyMeta.arrivalTime ?? displayLegs.at(-1)?.arrivalTime ?? 0);
  let journeyDuration = $derived(depTime > 0 && arrTime >= depTime
    ? Math.max(1, Math.ceil((arrTime - depTime) / 60_000))
    : journeyMeta.totalDurationMin);
  let departureMinutes = $derived(Math.max(0, Math.ceil((depTime - now) / 60000)));
  let departureCountdown = $derived(depTime <= now + 45000 ? 'Nu' : `${departureMinutes} min`);
  let isPlannedExpired = $derived(journeyMeta.status === 'planned' && depTime > 0 && depTime <= now);
  let activeLegIndex = $derived.by(() => {
    if (journeyMeta.status !== 'active') return -1;
    const index = displayLegs.findIndex((leg) => now < leg.arrivalTime);
    return index === -1 ? Math.max(0, displayLegs.length - 1) : index;
  });
  let isMissedNoticeVisible = $derived(Boolean(journeyMeta.lastMissedAt && now - journeyMeta.lastMissedAt < 120000));
  let statusLabel = $derived(
    journeyMeta.status === 'active'
      ? (t.journeyActive ?? 'Pågående resa')
      : ''
  );
  let panelId = $derived(`journey-details-${journeyMeta.journeyId}`);

  function formatTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function formatDistance(distance: number | undefined): string {
    if (!distance) return '';
    return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
  }

  function connectionsBefore(index: number): JourneyConnection[] {
    const supplied = displayConnections.filter((connection) => connection.beforeLegIndex === index);
    const walking = supplied.filter((connection) => connection.kind === 'walk');
    if (walking.length > 0) {
      const walk = walking[0];
      const connectionDuration = supplied
        .filter((connection) => connection.kind === 'transfer')
        .reduce((total, connection) => total + connection.durationMin, 0);
      const durationMin = walk.durationMin + connectionDuration;
      return [{ ...walk, durationMin, walkDurationMin: durationMin }];
    }
    if (supplied.length > 0 || index === 0 || index >= displayLegs.length) return supplied;
    const previous = displayLegs[index - 1];
    const next = displayLegs[index];
    const durationMin = Math.max(0, Math.round((next.departureTime - previous.arrivalTime) / 60_000));
    return [{ beforeLegIndex: index, kind: 'transfer', durationMin }];
  }

  function showConnection(connection: JourneyConnection): boolean {
    return connection.beforeLegIndex > 0 && connection.beforeLegIndex < displayLegs.length
      ? true
      : connection.durationMin >= 2;
  }

  function connectionLabel(connection: JourneyConnection): string {
    const duration = formatDuration(connection.walkDurationMin ?? connection.durationMin);
    if (connection.kind === 'walk') {
      const distance = formatDistance(connection.walkDistanceMeters);
      return `${t.walking ?? 'Walk'} · ${duration}${distance ? ` · ${distance}` : ''}`;
    }
    return `${t.transfer ?? 'Transfer'}${connection.durationMin > 0 ? ` · ${duration}` : ''}`;
  }

  function hasTrainPosition(transportType: TransportType): boolean {
    return transportType === 'metro' || transportType === 'train' || transportType === 'tram';
  }

  function legOriginName(index: number, name: string): string {
    return index === 0 ? journeyMeta.originLabel : name;
  }

  function legDestName(index: number, name: string): string {
    return index === displayLegs.length - 1 ? journeyMeta.destLabel : name;
  }

  let panelEl: HTMLDivElement | undefined = $state();
  let collapsing = $state(false);

  function handleToggle() {
    if (isExpanded) {
      const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) { ontoggle?.(); return; }
      collapsing = true;
      tick().then(() => {
        if (!panelEl) { collapsing = false; ontoggle?.(); return; }
        gsap.to(panelEl, {
          height: 0, opacity: 0,
          duration: 0.2, ease: 'power2.in',
          onComplete: () => {
            collapsing = false;
            ontoggle?.();
          },
        });
      });
    } else {
      ontoggle?.();
    }
  }

  $effect(() => {
    if (!isExpanded || !panelEl) return;
    const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) return;
    gsap.fromTo(panelEl,
      { height: 0, opacity: 0 },
      { height: 'auto', opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'height,opacity' },
    );
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article
  class="journey-card"
  class:expanded={isExpanded}
  class:active={journeyMeta.status === 'active'}
  role="group"
  use:longPress={{ onLongPress: (event) => {
    if (!isExpanded) {
      const card = event.target instanceof HTMLElement ? event.target.closest('.journey-card') : null;
      const target = card?.querySelector<HTMLElement>('.card-main') ?? null;
      onLongPress?.(target ?? undefined);
    }
  } }}
  oncontextmenu={(event) => { event.preventDefault(); onMoreActions?.(event.currentTarget as HTMLElement); }}
  onkeydown={(event) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      onMoreActions?.(event.currentTarget as HTMLElement);
    }
  }}
>
  <button
    class="card-main"
    type="button"
    aria-expanded={isExpanded}
    aria-controls={panelId}
    aria-label={`${journeyMeta.originLabel} → ${journeyMeta.destLabel}, ${formatTime(depTime)} – ${formatTime(arrTime)}, ${formatDuration(journeyDuration)}, ${journeyMeta.transfers === 0 ? (t.direct ?? 'Direct') : `${journeyMeta.transfers} ${journeyMeta.transfers > 1 ? (t.transfers ?? 'transfers') : (t.transfer ?? 'transfer')}`}`}
    onclick={() => handleToggle()}
  >
    <div class="card-body">
      {#if statusLabel}<div class="card-top"><span class="card-kicker">{statusLabel}</span></div>{/if}

      <div class="journey-endpoints">
        <span>{journeyMeta.originLabel}</span>
        <span class="endpoint-arrow" aria-hidden="true">→</span>
        <span class="dest-label">{journeyMeta.destLabel}</span>
      </div>

      <div class="card-meta">
        <span class="countdown">{departureCountdown}</span>
        <span class="time-range">
          {formatTime(depTime)} – {formatTime(arrTime)}
        </span>
        <span class="journey-stats" aria-hidden="true">
          <span class="journey-stat duration">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatDuration(journeyDuration)}
          </span>
          <span class="journey-stat transfers">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="6" x2="6" y1="3" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            {journeyMeta.transfers === 0
              ? (t.direct ?? 'Direct')
              : `${journeyMeta.transfers} ${journeyMeta.transfers > 1 ? (t.transfers ?? 'transfers') : (t.transfer ?? 'transfer')}`}
          </span>
        </span>
      </div>

      {#if isMissedNoticeVisible && journeyMeta.status === 'planned'}
        <div class="missed-notice" role="status">
          {t.journeyMissedNext ?? 'Förra resan gick — visar nästa resa'}
        </div>
      {/if}

      {#if displayLegs[0]}
        <div class="primary-leg">
          <TransportIcon type={displayLegs[0].transportType} size={14} />
          <span class="leg-line">{displayLegs[0].lineName}</span>
          <span class="leg-direction">{displayLegs[0].directionName}</span>
          {#if hasTrainPosition(displayLegs[0].transportType)}
            <svg class="train-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="16" height="16" x="4" y="3" rx="2" />
              <path d="M4 11h16M8 19l-2 2M16 19l2 2M8 7h.01M16 7h.01" />
            </svg>
            <TrainPosition position={displayLegs[0].platformPosition} />
          {/if}
        </div>
      {/if}
    </div>
  </button>

  {#if isExpanded || collapsing}
    <div id={panelId} class="expanded-panel" class:collapsing bind:this={panelEl}>
      <div class="journey-detail-header">
        {#if journeyMeta.status === 'active'}
          <span class="active-now">{t.journeyCurrentLeg ?? 'Nuvarande del'}</span>
        {:else}
          <span></span>
        {/if}
        <button
          type="button"
          class="more-actions-button"
          aria-label={moreActionsLabel ?? `More actions for journey to ${journeyMeta.destLabel}`}
          onclick={(event) => { event.stopPropagation(); onMoreActions?.(event.currentTarget as HTMLElement); }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
          </svg>
        </button>
      </div>
      <ol class="timeline">
        {#each displayLegs as leg, i (leg.departureTime + '-' + i)}
          {#each connectionsBefore(i).filter(showConnection) as connection, connectionIndex (`${connection.beforeLegIndex}-${connection.kind}-${connectionIndex}`)}
            <li class="connection-row" class:walk={connection.kind === 'walk'}>
              <span class="connection-time">{formatDuration(connection.durationMin)}</span>
              <span class="connection-track" aria-hidden="true"></span>
              <span class="connection-label">
                {#if connection.kind === 'walk'}
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16v-2.38c0-.8.5-1.54 1.26-1.82l2.12-.7c.57-.18 1.16.07 1.4.6l.63 1.41c.23.5.04 1.1-.43 1.37l-1.83 1.03c-.4.23-.65.65-.65 1.11V19a2 2 0 0 0 2 2h.5" /><path d="M14 19v-2.38c0-.8.5-1.54 1.26-1.82l2.12-.7c.57-.18 1.16.07 1.4.6l.63 1.41c.23.5.04 1.1-.43 1.37l-1.83 1.03c-.4.23-.65.65-.65 1.11V22" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
                {/if}
                {connectionLabel(connection)}
              </span>
            </li>
          {/each}
          <li class="leg-row" class:current={i === activeLegIndex} aria-current={i === activeLegIndex ? 'step' : undefined}>
            <div class="leg-times"><time>{formatTime(leg.departureTime)}</time><time>{formatTime(leg.arrivalTime)}</time></div>
            <span class="leg-track"><span class="leg-dot"></span></span>
            <div class="leg-info">
              <div class="leg-header">
                <TransportIcon type={leg.transportType} size={12} />
                <span class="leg-line-name">{leg.lineName}</span>
                <span class="leg-direction-name">{leg.directionName}</span>
              </div>
              <div class="leg-route">
                <span class="route-from">{legOriginName(i, leg.originName)}</span>
                <span class="route-arrow" aria-hidden="true">→</span>
                <span>{legDestName(i, leg.destName)}</span>
              </div>
              {#if leg.stops && leg.stops.length > 0}
                <div class="stop-preview">
                  <span class="stop-preview-label">{t.journeyViaStops ?? 'Via'}</span>
                  <span class="stop-preview-names">{leg.stops.slice(0, 3).join(' → ')}</span>
                  {#if leg.stops.length > 3}
                    <span class="stop-preview-more">+{leg.stops.length - 3} {t.journeyMoreStops ?? 'hållplatser'}</span>
                  {/if}
                </div>
              {/if}
              {#if hasTrainPosition(leg.transportType)}
                <div class="leg-position">
                  <span>{t.journeyBestPosition ?? 'Best place on the train'}</span>
                  <TrainPosition position={leg.platformPosition} />
                </div>
              {/if}
            </div>
          </li>
        {/each}
        {#each connectionsBefore(displayLegs.length).filter(showConnection) as connection, connectionIndex (`${connection.beforeLegIndex}-${connection.kind}-${connectionIndex}`)}
          <li class="connection-row" class:walk={connection.kind === 'walk'}>
            <span class="connection-time">{formatDuration(connection.durationMin)}</span>
            <span class="connection-track" aria-hidden="true"></span>
            <span class="connection-label">
              {#if connection.kind === 'walk'}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16v-2.38c0-.8.5-1.54 1.26-1.82l2.12-.7c.57-.18 1.16.07 1.4.6l.63 1.41c.23.5.04 1.1-.43 1.37l-1.83 1.03c-.4.23-.65.65-.65 1.11V19a2 2 0 0 0 2 2h.5" /><path d="M14 19v-2.38c0-.8.5-1.54 1.26-1.82l2.12-.7c.57-.18 1.16.07 1.4.6l.63 1.41c.23.5.04 1.1-.43 1.37l-1.83 1.03c-.4.23-.65.65-.65 1.11V22" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
              {/if}
              {connectionLabel(connection)}
            </span>
          </li>
        {/each}
      </ol>
      <div class="journey-actions">
        {#if journeyMeta.status === 'active'}
          <p class="next-action">{t.journeyNextAction ?? 'Följ nästa del av resan'}</p>
          <button type="button" class="journey-action primary" onclick={(event) => { event.stopPropagation(); onAction?.('complete'); }}>
            {t.journeyComplete ?? 'Resan klar'}
          </button>
          <button type="button" class="journey-action" onclick={(event) => { event.stopPropagation(); onAction?.('cancel'); }}>
            {t.journeyCancel ?? 'Avsluta resa'}
          </button>
        {:else}
          {#if isPlannedExpired}
            <p class="next-action">{t.journeyUpdating ?? 'Uppdaterar nästa avgång…'}</p>
            <button type="button" class="journey-action" onclick={(event) => { event.stopPropagation(); onAction?.('start-late'); }}>
              {t.journeyStartMissed ?? 'Jag hann med den resan'}
            </button>
          {:else}
            <button type="button" class="journey-action primary" onclick={(event) => { event.stopPropagation(); onAction?.('start'); }}>
              {t.journeyStart ?? 'Starta resa'}
            </button>
          {/if}
          {#if isMissedNoticeVisible && journeyMeta.lastMissedJourney}
            <button type="button" class="journey-action" onclick={(event) => { event.stopPropagation(); onAction?.('start-missed'); }}>
              {t.journeyStartMissed ?? 'Jag hann med den resan'}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</article>

<style>
  .journey-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    overflow: hidden;
    position: relative;
    transition: box-shadow 0.2s ease;
  }

  .journey-card:focus-within {
    border-color: color-mix(in oklch, var(--accent) 55%, var(--border));
  }

  .card-main:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: inherit;
  }

  @media (hover: hover) and (pointer: fine) {
    .journey-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
  }

  .journey-card.active {
    border-color: color-mix(in oklch, var(--accent) 55%, var(--border));
    background: color-mix(in oklch, var(--accent-subtle) 28%, var(--surface));
  }

  .card-main {
    display: flex;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .card-body {
    flex: 1;
    padding: 12px var(--transit-card-padding-inline);
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .card-kicker {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }

  .journey-endpoints {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 8px;
    color: var(--text-secondary);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .journey-endpoints span:first-child,
  .journey-endpoints span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .endpoint-arrow {
    color: var(--accent);
    font-weight: 800;
    flex-shrink: 0;
  }

  .card-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .time-range {
    color: var(--text);
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .countdown {
    color: var(--accent);
    font-family: 'Neue Machina', sans-serif;
    font-size: 19px;
    font-weight: 900;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }

  .journey-stats {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-muted);
  }

  .journey-stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .journey-stat svg,
  .train-icon {
    flex: 0 0 auto;
  }

  .primary-leg {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 0;
  }

  .primary-leg .train-icon {
    color: var(--text-muted);
    margin-left: auto;
  }

  .missed-notice {
    color: var(--text-secondary);
    background: var(--surface-emphasis);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 9px;
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.3;
  }

  .leg-line {
    font-weight: 600;
    color: var(--text);
  }

  .leg-direction {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .expanded-panel {
    border-top: 1px solid var(--border);
    padding: 12px var(--transit-card-padding-inline);
    overflow: hidden;
  }

  .expanded-panel.collapsing {
    pointer-events: none;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .leg-row {
    display: grid;
    grid-template-columns: 44px 14px minmax(0, 1fr);
    column-gap: 8px;
    position: relative;
  }

  .leg-row.current .leg-dot {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-subtle);
  }

  .leg-row.current .leg-info {
    color: var(--text);
  }

  .leg-track {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .leg-track::after,
  .connection-track::after {
    content: '';
    position: absolute;
    top: 11px;
    bottom: -14px;
    left: 50%;
    width: 1px;
    transform: translateX(-50%);
    background: var(--border);
  }

  .leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    margin-top: 3px;
    position: relative;
    z-index: 1;
  }

  .leg-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }

  .leg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }

  .leg-line-name {
    font-weight: 600;
    color: var(--text);
  }

  .leg-direction-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
  }

  .leg-times,
  .connection-time {
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .leg-times { display: flex; flex-direction: column; gap: 3px; }

  .leg-times time:last-child { color: var(--text-secondary); }

  .connection-row {
    display: grid;
    grid-template-columns: 44px 14px minmax(0, 1fr);
    column-gap: 8px;
    align-items: center;
    min-height: 22px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .connection-track { position: relative; height: 100%; }

  .connection-label { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }

  .connection-row.walk .connection-label { color: var(--text-secondary); }

  .leg-route {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .leg-position {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .stop-preview {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.3;
    min-width: 0;
  }

  .stop-preview-label {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-weight: 700;
  }

  .stop-preview-names {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stop-preview-more {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .journey-detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: -8px -8px 4px 0;
    color: var(--text);
    font-size: 13px;
  }

  .more-actions-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 18px;
    letter-spacing: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .more-actions-button:hover {
      background: var(--accent-subtle);
      color: var(--accent);
    }
  }

  .more-actions-button:focus-visible {
    background: var(--accent-subtle);
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .active-now {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .journey-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 16px;
  }

  .next-action {
    flex: 1 1 100%;
    margin: 0 0 2px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .journey-action {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .journey-action.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .route-arrow {
    color: var(--accent);
    font-weight: 800;
  }

  @media (max-width: 420px) {
    .card-meta {
      gap: 6px;
    }

    .journey-stats {
      flex-basis: 100%;
    }

    .leg-row,
    .connection-row { grid-template-columns: 42px 12px minmax(0, 1fr); column-gap: 7px; }
  }
</style>
