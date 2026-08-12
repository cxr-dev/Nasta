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
  import { shareGlyph } from '../icons/departureIcons';
  import JourneyRouteOverview from './JourneyRouteOverview.svelte';

  let {
    journeyMeta,
    segmentId,
    isExpanded = false,
    now = Date.now(),
    ontoggle,
    onAction,
    onLongPress,
    onMoreActions,
    moreActionsLabel,
    onShare,
  }: {
    journeyMeta: JourneyMeta;
    segmentId?: string;
    isExpanded?: boolean;
    now?: number;
    ontoggle?: () => void;
    onAction?: (action: SavedJourneyAction) => void;
    onLongPress?: (trigger?: HTMLElement) => void;
    onMoreActions?: (trigger: HTMLElement) => void;
    moreActionsLabel?: string;
    onShare?: () => void;
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
  let selectedLegIndex = $state(-1);
  let expandedStopsLegIndex = $state<number | null>(null);
  let activeLegIndex = $derived.by(() => {
    if (journeyMeta.status !== 'active') return -1;
    const index = displayLegs.findIndex((leg) => now < leg.arrivalTime);
    return index === -1 ? Math.max(0, displayLegs.length - 1) : index;
  });
  let focusedLegIndex = $derived(selectedLegIndex >= 0 ? selectedLegIndex : activeLegIndex >= 0 ? activeLegIndex : 0);
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
    if (supplied.length > 0 || index === 0 || index >= displayLegs.length) return supplied;
    const previous = displayLegs[index - 1];
    const next = displayLegs[index];
    const durationMin = Math.max(0, Math.round((next.departureTime - previous.arrivalTime) / 60_000));
    return [{ beforeLegIndex: index, kind: 'transfer', durationMin }];
  }

  function showConnection(): boolean {
    return true;
  }

  function connectionLabel(connection: JourneyConnection): string {
    const duration = formatDuration(connection.walkDurationMin ?? connection.durationMin);
    if (connection.kind === 'walk') {
      const distance = formatDistance(connection.walkDistanceMeters);
      const template = t.journeyWalkTo ?? 'Walk {duration} · {distance} to {stop}';
      return template
        .replace(distance ? '{distance}' : ' · {distance}', distance)
        .replace('{duration}', duration)
        .replace('{stop}', connection.destName ?? '');
    }
    return `${t.transfer ?? 'Transfer'}${connection.durationMin > 0 ? ` · ${duration}` : ''}${connection.destName ? ` · ${connection.destName}` : ''}`;
  }

  function transferSummary(): string {
    if (journeyMeta.transfers === 0) {
      return `${t.journeyDirect ?? 'Direct'} · ${t.journeyNoTransfers ?? 'No transfers'}`;
    }
    return `${journeyMeta.transfers} ${journeyMeta.transfers > 1 ? (t.transfers ?? 'transfers') : (t.transfer ?? 'transfer')}`;
  }

  function transferShortLabel(): string {
    if (journeyMeta.transfers === 0) return t.journeyDirect ?? 'Direct';
    return `${journeyMeta.transfers} ${journeyMeta.transfers > 1 ? (t.transfers ?? 'transfers') : (t.transfer ?? 'transfer')}`;
  }

  function nextStepLabel(): string {
    const index = activeLegIndex >= 0 ? activeLegIndex : 0;
    const connection = connectionsBefore(index)[0];
    if (connection) return connectionLabel(connection);
    const leg = displayLegs[index];
    if (!leg) return t.journeyNextAction ?? 'Follow the next part of the journey';
    return `${boardAt(leg.originName)} · ${leg.lineName}`;
  }

  let nextStep = $derived.by(() => nextStepLabel());

  function selectLeg(index: number) {
    selectedLegIndex = selectedLegIndex === index ? -1 : index;
    if (selectedLegIndex !== index) expandedStopsLegIndex = null;
  }

  function toggleStops(index: number) {
    expandedStopsLegIndex = expandedStopsLegIndex === index ? null : index;
  }

  function boardAt(stop: string): string {
    return (t.journeyBoardAt ?? 'Board at {stop}').replace('{stop}', stop);
  }

  function getOffAt(stop: string): string {
    return (t.journeyGetOffAt ?? 'Get off at {stop}').replace('{stop}', stop);
  }

  function towards(destination: string): string {
    return (t.journeyTowards ?? 'toward {destination}').replace('{destination}', destination);
  }

  function hasTrainPosition(transportType: TransportType): boolean {
    return transportType === 'metro' || transportType === 'train' || transportType === 'tram';
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
  data-segment-id={segmentId}
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
    aria-label={`${journeyMeta.originLabel} → ${journeyMeta.destLabel}, ${formatTime(depTime)} – ${formatTime(arrTime)}, ${formatDuration(journeyDuration)}, ${transferSummary()}`}
    onclick={() => handleToggle()}
  >
    <div class="card-body">
      {#if statusLabel}<div class="card-top"><span class="card-kicker">{statusLabel}</span></div>{/if}

      <div class="journey-summary-top">
        <div class="journey-route-identity">
          {#if displayLegs[0]}
            <span class="line-badge" aria-label={displayLegs[0].lineName}>
              <TransportIcon type={displayLegs[0].transportType} size={13} />
              <span>{displayLegs[0].line}</span>
            </span>
          {/if}
          <div class="journey-endpoints">
            <span>{journeyMeta.originLabel}</span>
            <span class="endpoint-arrow" aria-hidden="true">→</span>
            <span class="dest-label">{journeyMeta.destLabel}</span>
          </div>
        </div>
        <span class="summary-chevron" aria-hidden="true">›</span>
      </div>

      <div class="journey-summary-bottom">
        <span class="countdown">{departureCountdown}<small>{t.journeyDepart ?? 'departs'}</small></span>
        <span class="time-range">{formatTime(depTime)} – {formatTime(arrTime)}</span>
        <span class="journey-stats" aria-hidden="true">
          <span class="journey-stat duration">{formatDuration(journeyDuration)}</span>
          <span class="journey-stat transfers">{transferShortLabel()}</span>
        </span>
      </div>

      {#if isMissedNoticeVisible && journeyMeta.status === 'planned'}
        <div class="missed-notice" role="status">
          {t.journeyMissedNext ?? 'Förra resan gick — visar nästa resa'}
        </div>
      {/if}

    </div>
  </button>

  {#if isExpanded || collapsing}
    <div id={panelId} class="expanded-panel" class:collapsing bind:this={panelEl}>
      <div class="journey-detail-header">
        {#if journeyMeta.status === 'active'}
          <span class="active-now">{t.journeyCurrentLeg ?? 'Nuvarande del'}</span>
        {/if}
        <div class="journey-detail-actions">
          <button
            type="button"
            class="share-button"
            aria-label={t.shareJourney ?? 'Share journey'}
            onpointerdown={(event) => event.stopPropagation()}
            onclick={(event) => { event.stopPropagation(); onShare?.(); }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">{@html shareGlyph}</svg>
          </button>
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
      </div>
      <div class="journey-detail-summary" aria-label={t.journeyOverview ?? 'Journey overview'}>
        <span><strong>{formatTime(depTime)}</strong><small>{t.journeyDepart ?? 'departs'}</small></span>
        <span><strong>{formatTime(arrTime)}</strong><small>{t.journeyArrive ?? 'arrives'}</small></span>
        <span><strong>{formatDuration(journeyDuration)}</strong><small>{t.journeyDuration ?? 'duration'}</small></span>
        <span><strong>{journeyMeta.transfers}</strong><small>{t.journeyChange ?? 'change'}</small></span>
      </div>
      <JourneyRouteOverview
        legs={displayLegs}
        focusedLegIndex={focusedLegIndex}
        onSelectLeg={selectLeg}
        overviewLabel={t.journeyOverview ?? 'Journey overview'}
        tapLegLabel={t.journeyTapLeg ?? 'Tap a leg to focus it'}
      />
      <ol class="timeline">
        {#each displayLegs as leg, i (leg.departureTime + '-' + i)}
          {#each connectionsBefore(i).filter(showConnection) as connection, connectionIndex (`${connection.beforeLegIndex}-${connection.kind}-${connectionIndex}`)}
            <li class="connection-row" class:walk={connection.kind === 'walk'}>
              <span class="connection-time">{formatDuration(connection.durationMin)}</span>
              <span class="connection-track" aria-hidden="true"></span>
              <span class="connection-label">
                {#if connection.kind === 'walk'}
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="1" /><path d="M7 21l3-4" /><path d="M16 21l-2-4l-3-3l1-6" /><path d="M6 12l2-3l4-1l3 3l3 1" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
                {/if}
                {connectionLabel(connection)}
              </span>
            </li>
          {/each}
          <li class="leg-row" class:current={i === activeLegIndex} class:selected={i === focusedLegIndex} aria-current={i === activeLegIndex ? 'step' : undefined}>
            <button
              type="button"
              class="leg-select"
              aria-pressed={i === focusedLegIndex}
              onclick={() => selectLeg(i)}
            >
              <div class="leg-times"><time>{formatTime(leg.departureTime)}</time><time>{formatTime(leg.arrivalTime)}</time></div>
              <span class="leg-track"><span class="leg-dot"></span></span>
              <div class="leg-info">
                <div class="leg-header">
                  <TransportIcon type={leg.transportType} size={12} />
                  <span class="leg-line-name">{leg.lineName}</span>
                  <span class="leg-direction-name">{towards(leg.directionName)}</span>
                  <span class="leg-open" aria-hidden="true">{i === focusedLegIndex ? '⌃' : '⌄'}</span>
                </div>
                <div class="leg-route">
                  <span class="route-from">{boardAt(leg.originName)}</span>
                  <span class="route-arrow" aria-hidden="true">→</span>
                  <span>{getOffAt(leg.destName)}</span>
                </div>
                {#if leg.stops && leg.stops.length > 0 && i !== focusedLegIndex}
                  <div class="stop-preview">
                    <span class="stop-preview-label">{t.journeyViaStops ?? 'Via'}</span>
                    <span class="stop-preview-names">{leg.stops.slice(0, 3).join(' → ')}</span>
                    {#if leg.stops.length > 3}
                      <span class="stop-preview-more">+{leg.stops.length - 3} {t.journeyMoreStops ?? 'stops'}</span>
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
            </button>
            {#if i === focusedLegIndex && leg.stops && leg.stops.length > 0}
              <div class="stop-sequence">
                <span class="stop-sequence-label">{(t.journeyStopsCount ?? '{count} stops').replace('{count}', String(leg.stops.length))}</span>
                <div class="stop-sequence-list">
                  {#each (expandedStopsLegIndex === i ? leg.stops : leg.stops.slice(0, 3)) as stop, stopIndex (stop + stopIndex)}
                    <span class="stop-sequence-stop"><span aria-hidden="true"></span>{stop}</span>
                  {/each}
                </div>
                {#if leg.stops.length > 3}
                  <button type="button" class="stop-sequence-toggle" onclick={(event) => { event.stopPropagation(); toggleStops(i); }}>
                    {expandedStopsLegIndex === i ? (t.journeyHideStops ?? 'Hide stops') : (t.journeyShowStops ?? 'Show stops')}
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
        {#each connectionsBefore(displayLegs.length).filter(showConnection) as connection, connectionIndex (`${connection.beforeLegIndex}-${connection.kind}-${connectionIndex}`)}
          <li class="connection-row" class:walk={connection.kind === 'walk'}>
            <span class="connection-time">{formatDuration(connection.durationMin)}</span>
            <span class="connection-track" aria-hidden="true"></span>
            <span class="connection-label">
              {#if connection.kind === 'walk'}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="1" /><path d="M7 21l3-4" /><path d="M16 21l-2-4l-3-3l1-6" /><path d="M6 12l2-3l4-1l3 3l3 1" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
              {/if}
              {connectionLabel(connection)}
            </span>
          </li>
        {/each}
      </ol>
      <div class="journey-actions">
        <div class="journey-next-step">
          <span class="next-step-label">{t.journeyNextStep ?? 'Next step'}</span>
          <strong>{nextStep}</strong>
        </div>
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
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
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
    padding: 12px var(--transit-card-padding-inline) 11px;
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
    flex-shrink: 0;
  }

  .journey-summary-top,
  .journey-summary-bottom {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .journey-summary-top {
    justify-content: space-between;
    gap: 8px;
  }

  .journey-route-identity {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }

  .line-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 34px;
    height: 28px;
    padding: 0 6px;
    border-radius: var(--radius-sm, 8px);
    background: var(--journey-primary, var(--accent));
    color: var(--journey-on-primary, var(--text-on-accent));
    font-size: 12px;
    font-weight: 800;
  }

  .summary-chevron {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 24px;
    font-weight: 400;
    line-height: 1;
  }

  .journey-endpoints {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--text);
    font-size: 14px;
    font-weight: 750;
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
    color: var(--journey-primary, var(--accent));
    font-weight: 800;
    flex-shrink: 0;
  }

  .journey-summary-bottom {
    gap: 10px;
    margin-top: 10px;
  }

  .journey-summary-bottom .time-range {
    flex: 0 0 auto;
    font-size: 15px;
  }

  .journey-summary-bottom .journey-stats {
    margin-left: auto;
  }

  .countdown {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    color: var(--journey-primary, var(--accent));
    font-family: 'Neue Machina', sans-serif;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .countdown small {
    color: var(--text-muted);
    font-family: 'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .journey-stats {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .journey-stat {
    white-space: nowrap;
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

  .expanded-panel {
    border-top: 1px solid var(--border);
    padding: 12px var(--transit-card-padding-inline);
    overflow: hidden;
  }

  .expanded-panel.collapsing {
    pointer-events: none;
  }

  .journey-detail-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    margin: 4px 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--surface);
  }

  .journey-detail-summary span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
    padding: 9px 6px;
    text-align: center;
  }

  .journey-detail-summary span + span {
    border-left: 1px solid var(--border);
  }

  .journey-detail-summary strong {
    color: var(--text);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .journey-detail-summary small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    border-radius: var(--radius-sm, 8px);
  }

  .leg-row.selected {
    background: color-mix(in oklch, var(--journey-primary, var(--accent)) 8%, var(--surface));
  }

  .leg-select {
    display: grid;
    grid-template-columns: 44px 14px minmax(0, 1fr);
    column-gap: 8px;
    width: 100%;
    min-height: 58px;
    padding: 5px 6px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .leg-select:focus-visible,
  .stop-sequence-toggle:focus-visible {
    outline: 2px solid var(--journey-primary, var(--accent));
    outline-offset: -2px;
  }

  .leg-row.current .leg-dot {
    background: var(--journey-primary, var(--accent));
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--journey-primary, var(--accent)) 18%, transparent);
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
    background: var(--journey-primary, var(--accent));
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

  .leg-open {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
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

  .stop-sequence {
    margin: 0 8px 8px 58px;
    padding: 8px 10px 9px;
    border-top: 1px solid var(--border);
  }

  .stop-sequence-label {
    display: block;
    margin-bottom: 5px;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
  }

  .stop-sequence-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .stop-sequence-stop {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .stop-sequence-stop span {
    width: 5px;
    height: 5px;
    border: 1px solid var(--journey-primary, var(--accent));
    border-radius: 50%;
    background: var(--surface);
  }

  .stop-sequence-toggle {
    min-height: 32px;
    margin-top: 4px;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--journey-primary, var(--accent));
    font: inherit;
    font-size: 11px;
    font-weight: 750;
    cursor: pointer;
  }

  .journey-detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -8px -8px 4px 0;
    color: var(--text);
    font-size: 13px;
  }

  .journey-detail-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
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

  .share-button {
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
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .more-actions-button:hover {
      background: var(--accent-subtle);
      color: var(--accent);
    }
    .share-button:hover {
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

  .share-button:focus-visible {
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

  .journey-next-step {
    display: flex;
    flex: 1 1 100%;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: var(--radius-md, 12px);
    background: var(--journey-primary, var(--accent));
    color: var(--journey-on-primary, var(--text-on-accent));
  }

  .next-step-label {
    color: color-mix(in oklch, var(--journey-on-primary, var(--text-on-accent)) 72%, transparent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .journey-next-step strong {
    overflow: hidden;
    font-size: 13px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    .journey-summary-bottom {
      gap: 7px;
    }

    .journey-summary-bottom .time-range {
      font-size: 13px;
    }

    .journey-summary-bottom .journey-stats {
      gap: 4px;
      font-size: 10px;
    }

    .leg-select,
    .connection-row { grid-template-columns: 42px 12px minmax(0, 1fr); column-gap: 7px; }

    .stop-sequence { margin-left: 52px; }
  }
</style>
