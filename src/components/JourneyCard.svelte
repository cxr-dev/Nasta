<script lang="ts">
  import type { TransportType } from '../types/page';
  import TransportIcon from './TransportIcon.svelte';
  import TrainPosition from './TrainPosition.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import gsap from 'gsap';
  import { tick } from 'svelte';
  import type { JourneyMeta } from '../types/journey';
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

  let displayLegs = $derived(journeyMeta.status === 'active' && journeyMeta.activeSnapshot
    ? journeyMeta.activeSnapshot.legs
    : journeyMeta.legs);
  let depTime = $derived(displayLegs[0]?.departureTime ?? 0);
  let arrTime = $derived(displayLegs.length > 0
    ? displayLegs[displayLegs.length - 1].arrivalTime
    : 0);
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
      : (t.journeyNext ?? 'Nästa resa')
  );

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
  <button class="card-main" onclick={() => handleToggle()}>
    <div class="card-body">
      <div class="card-top">
        <span class="card-kicker">{statusLabel}</span>
      </div>

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
        <span class="duration">{formatDuration(journeyMeta.totalDurationMin)}</span>
        <span class="transfers">
          {journeyMeta.transfers === 0
            ? (t.direct ?? 'Direct')
            : `${journeyMeta.transfers} ${journeyMeta.transfers > 1 ? (t.transfers ?? 'transfers') : (t.transfer ?? 'transfer')}`}
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
            <TrainPosition position={displayLegs[0].platformPosition} />
          {/if}
        </div>
      {/if}
    </div>
  </button>

  {#if isExpanded || collapsing}
    <div class="expanded-panel" class:collapsing bind:this={panelEl}>
      <div class="journey-detail-header">
        <div>
          <span class="detail-kicker">{journeyMeta.originLabel}</span>
          <span class="detail-arrow" aria-hidden="true">→</span>
          <strong>{journeyMeta.destLabel}</strong>
        </div>
        <button
          type="button"
          class="more-actions-button"
          aria-label={moreActionsLabel ?? `More actions for journey to ${journeyMeta.destLabel}`}
          onclick={(event) => { event.stopPropagation(); onMoreActions?.(event.currentTarget as HTMLElement); }}
        >
          <span aria-hidden="true">•••</span>
        </button>
        {#if journeyMeta.status === 'active'}
          <span class="active-now">{t.journeyCurrentLeg ?? 'Nuvarande del'}</span>
        {/if}
      </div>
      <div class="timeline">
        {#each displayLegs as leg, i}
          <div class="leg-row" class:current={i === activeLegIndex}>
            <span class="leg-dot"></span>
            <div class="leg-info">
              <div class="leg-header">
                <TransportIcon type={leg.transportType} size={12} />
                <span class="leg-line-name">{leg.lineName}</span>
                <span class="leg-time">
                  {formatTime(leg.departureTime)} → {formatTime(leg.arrivalTime)}
                </span>
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
          </div>
        {/each}
      </div>
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

  .journey-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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
    padding: 12px 14px;
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

  .endpoint-arrow,
  .detail-arrow {
    color: var(--accent);
    font-weight: 800;
    flex-shrink: 0;
  }

  .duration {
    font-family: 'Neue Machina', sans-serif;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    flex-shrink: 0;
    line-height: 1;
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

  .primary-leg {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 0;
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
    padding: 12px 14px 12px 18px;
    overflow: hidden;
  }

  .expanded-panel.collapsing {
    pointer-events: none;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .leg-row {
    display: flex;
    gap: 10px;
    position: relative;
  }

  .leg-row.current .leg-dot {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-subtle);
  }

  .leg-row.current .leg-info {
    color: var(--text);
  }

  .leg-row:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 14px;
    bottom: -16px;
    width: 1px;
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

  .leg-time {
    margin-left: auto;
    color: var(--text-muted);
    flex-shrink: 0;
  }

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
    margin-bottom: 12px;
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

  .more-actions-button:hover,
  .more-actions-button:focus-visible {
    background: var(--accent-subtle);
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .detail-kicker {
    color: var(--text-secondary);
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
    min-height: 38px;
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

  @media (min-width: 768px) {
    .duration {
      font-size: 15px;
    }
  }
</style>
