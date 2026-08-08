<script lang="ts">
  import type { Segment } from "../types/page";
  import type { Departure } from "../stores/departureStore.svelte";
  import { alertTriangle, handStop, tool, cloudRain, cloudSnow, cloudLightning, windIcon, snowflake, infoCircle, moonIcon, shareGlyph } from "../icons/departureIcons";
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import MapPreview from "./MapPreview.svelte";
  import RouteStopsPreview from "./RouteStopsPreview.svelte";
  import { dismissedStore } from "../stores/dismissedStore.svelte";
  import { getDepartureUrgency, getEffectiveDisruption, getLiveMinutes } from "../lib/departureDisplay";

  import { cleanStopName as stopLabel } from "../lib/stopName";
  import TransportIcon from "./TransportIcon.svelte";
  import { longPress } from '../lib/longPress';

  let {
    segment,
    segmentId,
    departure,
    subsequent,
    hasDeparture,
    primaryDepartureText,
    siteDevs,
    isExpanded,
    isExpandable,
    topDevMessage,
    topDevType,
    userLocation,
    locationRequestInFlight,
    walkingEtaEnabled,
    openFeatureSheet,
    t,
    severity = 'normal',
    disruptionScope = null,
    isSleeping = false,
    nextDepartureTime = null,
    now = Date.now(),
    weatherSymbol = null,
    ontoggle,
    onprefetch,
    groupingMode,
    onLongPress,
    onMoreActions,
    moreActionsLabel,
    onShare,
  }: {
    segment: Segment;
    segmentId?: string;
    departure: Departure | undefined;
    subsequent: string | null;
    hasDeparture: boolean;
    primaryDepartureText: string;
    siteDevs: { message: string }[];
    isExpanded: boolean;
    isExpandable: boolean;
    topDevMessage: string;
    topDevType: string;
    userLocation: [number, number] | null;
    locationRequestInFlight: boolean;
    walkingEtaEnabled: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    t: Record<string, string>;
    severity?: 'normal' | 'affected' | 'critical';
    disruptionScope?: 'departure' | 'service' | null;
    isSleeping?: boolean;
    nextDepartureTime?: string | null;
    now?: number;
    weatherSymbol?: string | null;
    ontoggle?: () => void;
    onprefetch?: () => void;
    groupingMode?: string;
    onLongPress?: (trigger?: HTMLElement) => void;
    onMoreActions?: (trigger: HTMLElement) => void;
    moreActionsLabel?: string;
    onShare?: () => void;
  } = $props();

  function pillLabel(type: string, severity: string): string {
    if (severity === 'critical') {
      return t.disruptionCriticalShort ?? 'Kritisk';
    }
    if (type === 'general') return t.disruptionGeneral ?? type;
    if (type === 'protest') return t.disruptionProtest ?? type;
    if (type === 'technical') return t.disruptionTechnical ?? type;
    if (type === 'snow' || type === 'rain' || type === 'storm' || type === 'wind' || type === 'ice' || type === 'weather') return t.disruptionWeather ?? type;
    return type;
  }

  function disruptionIcon(type: string): string {
    if (type === 'protest') return handStop;
    if (type === 'technical') return tool;
    if (type === 'snow') return cloudSnow;
    if (type === 'rain') return cloudRain;
    if (type === 'storm') return cloudLightning;
    if (type === 'wind') return windIcon;
    if (type === 'ice') return snowflake;
    if (type === 'weather') return cloudRain;
    if (type === 'general') return alertTriangle;
    return infoCircle;
  }

  let weatherIconSvg = $derived(
    weatherSymbol === 'rain' ? cloudRain :
    weatherSymbol === 'snow' ? cloudSnow :
    weatherSymbol === 'thunder' ? cloudLightning :
    null
  );

  let panelEl: HTMLDivElement | undefined = $state();
  let collapsing = $state(false);
  let showAllMessages = $state(false);

  let urgency = $derived(departure ? getDepartureUrgency(departure, now) : 'later');
  let countdownParts = $derived.by(() => {
    const match = /^(\d+)\s+(min)$/i.exec(primaryDepartureText.trim());
    return match ? { value: match[1], unit: match[2] } : null;
  });
  let effectiveDisruption = $derived(getEffectiveDisruption(severity, siteDevs.length));
  // Do not add “Snart” when the compact formatter has already rounded the
  // same departure to “Nu” (the final 45–60 seconds).
  let urgencyLabel = $derived(
    urgency === 'imminent' && departure && getLiveMinutes(departure, now) > 0
      ? (t.departureSoon ?? 'Snart')
      : ''
  );
  let disruptionLabel = $derived(
    effectiveDisruption === 'critical' && disruptionScope === 'departure'
      ? (t.cancelledDeparture ?? 'Inställd avgång')
      : effectiveDisruption === 'critical'
        ? (t.disruptionCriticalShort ?? 'Kritisk störning')
      : effectiveDisruption === 'affected'
        ? (t.disruptionAffectedShort ?? 'Påverkad trafik')
        : ''
  );
  let disruptionScopeLabel = $derived(
    disruptionScope === 'departure'
      ? (t.disruptionDepartureScope ?? 'Den här avgången')
      : disruptionScope === 'service'
        ? (t.disruptionServiceScope ?? 'Linjen')
        : ''
  );

  let accentColor = $derived(
    effectiveDisruption === 'critical' ? 'var(--color-critical)' : effectiveDisruption === 'affected' ? 'var(--color-warning)' : 'var(--accent)'
  );

  let countdownColor = $derived(
    effectiveDisruption === 'critical'
      ? 'var(--color-critical)'
      : effectiveDisruption === 'affected'
        ? 'var(--color-warning)'
        : urgency === 'later'
          ? 'var(--text)'
          : 'var(--accent)'
  );

  let pillTextColor = $derived('var(--text-on-accent)');

  let badgeBgIntensity = $derived(
    effectiveDisruption === 'critical' ? 'var(--color-critical-subtle)' : effectiveDisruption === 'affected' ? 'var(--color-warning-subtle)' : 'var(--accent-subtle)'
  );

  let cardBg = $derived(
    siteDevs.length > 0
      ? effectiveDisruption === 'critical' ? 'var(--color-critical-bg)' : effectiveDisruption === 'affected' ? 'var(--color-warning-bg)' : 'var(--surface)'
      : ''
  );

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

  $effect(() => {
    if (!isExpanded) showAllMessages = false;
  });

  function prefetch(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onprefetch?.();
          observer.unobserve(node);
        }
      }
    }, { root: null, rootMargin: '400px', threshold: 0.1 });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    onMoreActions?.(event.currentTarget as HTMLElement);
  }

  function handleContextKey(event: KeyboardEvent) {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      onMoreActions?.(event.currentTarget as HTMLElement);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="departure-card"
  data-segment-id={segmentId}
  class:expanded={isExpanded}
  class:has-disruption={siteDevs.length > 0}
  style="background: {cardBg}"
  data-testid="segment-row"
  role="group"
  use:longPress={{ onLongPress: (event) => {
    if (!isExpanded) {
      const card = event.target instanceof HTMLElement ? event.target.closest('.departure-card') : null;
      const target = card?.querySelector<HTMLElement>('.card-main') ?? null;
      onLongPress?.(target ?? undefined);
    }
  } }}
  oncontextmenu={handleContextMenu}
  onkeydown={handleContextKey}
>
  <button
    class="card-main"
    class:station-card-main={groupingMode === 'station'}
    use:prefetch
    type="button"
    aria-expanded={isExpanded}
    aria-controls={isExpandable ? segment.id : undefined}
    onclick={() => { if (isExpandable) handleToggle(); }}
  >
    {#if groupingMode === 'station'}
      <span class="station-destination">{stopLabel(segment.direction?.destination)}</span>
      <div class="station-service-identity">
        <div class="icon-badge" style="background: {badgeBgIntensity}">
          <TransportIcon type={segment.transportType} size={18} />
        </div>
        <span class="stacked-pill">{segment.line}</span>
      </div>
      {#if subsequent}
        <span class="clock-times station-clock-times">{subsequent}</span>
      {/if}
      {#if disruptionLabel}
        <span class="disruption-summary station-disruption-summary" class:critical={effectiveDisruption === 'critical'}>
          <span class="status-dot" aria-hidden="true"></span>
          {disruptionLabel}
        </span>
      {/if}
      <div class="station-time-rail">
        {#if isSleeping}
          <svg viewBox="0 0 24 24" fill="none" class="moon-icon" aria-label={t.sleeping ?? 'Sleeping'}>
            <g>{@html moonIcon}</g>
          </svg>
          {#if nextDepartureTime}
            <span class="sleep-next">{nextDepartureTime}</span>
          {/if}
        {:else if hasDeparture}
          {#if urgencyLabel}
            <span class="urgency-label">{urgencyLabel}</span>
          {/if}
          <span class="countdown station-countdown" class:arriving-now={urgency === 'now'} style="color: {countdownColor}" data-testid="countdown-minutes">
            {#if countdownParts}
              <span class="countdown-value">{countdownParts.value}</span>
              <span class="countdown-unit">{countdownParts.unit}</span>
            {:else}
              {primaryDepartureText}
            {/if}
          </span>
        {:else}
          <span class="em-dash">—</span>
        {/if}
      </div>
    {:else}
      <div class="icon-badge" style="background: {badgeBgIntensity}">
        <TransportIcon type={segment.transportType} size={18} />
      </div>
      <div class="meta-col">
        <span class="route-number" data-testid="segment-line">{segment.line}</span>
        <span class="from-stop">{stopLabel(segment.fromStop.name)}</span>
        <span class="to-dest"><span class="route-arrow">→</span> {stopLabel(segment.direction?.destination)}</span>
        {#if disruptionLabel}
          <span class="disruption-summary" class:critical={effectiveDisruption === 'critical'}>
            <span class="status-dot" aria-hidden="true"></span>
            {disruptionLabel}
          </span>
        {/if}
      </div>
    {/if}

    {#if groupingMode !== 'station'}
      <div class="time-col">
        {#if isSleeping}
          <svg viewBox="0 0 24 24" fill="none" class="moon-icon" aria-label={t.sleeping ?? 'Sleeping'}>
            <g>{@html moonIcon}</g>
          </svg>
          {#if nextDepartureTime}
            <span class="sleep-next">{nextDepartureTime}</span>
          {/if}
        {:else if hasDeparture}
          {#if urgencyLabel}
            <span class="urgency-label">{urgencyLabel}</span>
          {/if}
          <span class="countdown" class:arriving-now={urgency === 'now'} style="color: {countdownColor}" data-testid="countdown-minutes">
            {primaryDepartureText}
          </span>
          {#if subsequent}
            <span class="clock-times">{subsequent}</span>
          {/if}
        {:else}
          <span class="em-dash">—</span>
        {/if}
        {#if weatherIconSvg}
          <svg viewBox="0 0 24 24" fill="none" class="weather-indicator" aria-label={weatherSymbol === 'rain' ? 'Rain' : weatherSymbol === 'snow' ? 'Snow' : 'Thunder'}>
            <g>{@html weatherIconSvg}</g>
          </svg>
        {/if}
      </div>
    {/if}
  </button>

  {#if siteDevs.length > 0}
    <div
      class="disrupt-strip"
      class:expanded={isExpanded}
      style="--strip-color: {accentColor}; --pill-text-color: {pillTextColor}"
    >
      <svg viewBox="0 0 24 24" fill="none" class="disrupt-icon">
        <g>{@html disruptionIcon(topDevType)}</g>
      </svg>
      {#if isExpanded}
        <div class="disrupt-body">
          {#each siteDevs.slice(0, showAllMessages ? siteDevs.length : 3) as dev (dev.message)}
            <span class="disrupt-msg-line">{dev.message}</span>
          {/each}
          {#if siteDevs.length > 3}
            <button
              type="button"
              class="show-all-btn"
              onclick={() => { showAllMessages = !showAllMessages; }}
            >
              {showAllMessages
                ? (t.showLess ?? 'Show less')
                : (t.showNMore ?? '+{n} more').replace('{n}', String(siteDevs.length - 3))}
            </button>
      {/if}
      {#if weatherIconSvg && groupingMode !== 'station'}
        <svg viewBox="0 0 24 24" fill="none" class="weather-indicator" aria-label={weatherSymbol === 'rain' ? 'Rain' : weatherSymbol === 'snow' ? 'Snow' : 'Thunder'}>
          <g>{@html weatherIconSvg}</g>
        </svg>
      {/if}
    </div>
      {:else}
        <span class="disrupt-msg">{topDevMessage}</span>
      {/if}
      {#if disruptionScopeLabel}
        <span class="disrupt-scope">{disruptionScopeLabel}</span>
      {/if}
      <span class="disrupt-pill">{pillLabel(topDevType, severity)}</span>
      {#if !isExpanded}
        <span class="disrupt-count">{siteDevs.length}</span>
      {/if}
      <button
        type="button"
        class="disrupt-dismiss"
        aria-label={topDevType === "general" ? 'Hide notice' : 'Dismiss'}
        onclick={(e: Event) => { e.stopPropagation(); e.preventDefault(); for (const dev of siteDevs) dismissedStore.dismissMessage(dev.message); }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10">
          <path d="M4 4l8 8M12 4l-8 8"/>
        </svg>
      </button>
    </div>
  {/if}

  {#if isExpanded || collapsing}
    <div class="card-secondary-actions">
      <button
        type="button"
        class="share-button"
        aria-label={t.shareDeparture ?? 'Share departure'}
        onpointerdown={(event) => event.stopPropagation()}
        onclick={(event) => { event.stopPropagation(); onShare?.(); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">{@html shareGlyph}</svg>
      </button>
      <button
        type="button"
        class="more-actions-button"
        aria-label={moreActionsLabel ?? `${t.moreActions ?? 'More actions'} for ${segment.line}`}
        onclick={(event) => { event.stopPropagation(); onMoreActions?.(event.currentTarget as HTMLElement); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
        </svg>
      </button>
    </div>
  {/if}

  {#if isExpanded || collapsing}
    <div bind:this={panelEl} class="expanded-panel" class:collapsing id={segment.id}>
      <div class="expanded-actions">
        <RouteStopsPreview {segment} />
        <MapPreview
          {segment}
          {userLocation}
          {locationRequestInFlight}
          {walkingEtaEnabled}
          {openFeatureSheet}
          {t}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .departure-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .departure-card.has-disruption {
    border-color: var(--border);
  }
  .departure-card.expanded {
    border-color: var(--accent-subtle);
  }

  .card-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    min-height: 58px;
    width: 100%;
    padding: 10px var(--transit-card-padding-inline);
    gap: 10px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .card-main:active {
    opacity: 0.95;
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    color: var(--accent);
  }

  .meta-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }
  .route-number {
    font-size: 19px;
    font-weight: 900;
    color: var(--text);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .from-stop {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .to-dest {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    overflow: hidden;
    line-height: 1.3;
  }

  .disruption-summary {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    overflow: hidden;
    color: var(--color-warning);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .disruption-summary.critical {
    color: var(--color-critical);
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: currentColor;
  }
  .route-arrow {
    color: var(--accent);
    font-weight: 700;
  }
  /* ── Station mode: original C2 destination-first card ── */
  .station-card-main {
    grid-template-columns: auto minmax(0, 1fr) 110px;
    grid-template-rows: minmax(0, 1fr) auto auto;
    align-items: stretch;
    min-height: 86px;
    padding: 12px var(--transit-card-padding-inline);
    column-gap: 10px;
    row-gap: 8px;
  }
  .station-destination {
    grid-column: 1 / 3;
    grid-row: 1;
    align-self: center;
    min-width: 0;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-wrap: pretty;
  }
  .station-service-identity {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    align-self: end;
  }
  .station-clock-times {
    grid-column: 2;
    grid-row: 2;
    min-width: 0;
    max-width: 100%;
    justify-self: center;
    align-self: center;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  .station-disruption-summary {
    grid-column: 1 / 3;
    grid-row: 3;
    justify-self: start;
  }
  .station-time-rail {
    grid-column: 3;
    grid-row: 1 / 3;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 4px;
    min-width: 0;
    min-height: 100%;
    box-sizing: border-box;
    justify-self: end;
    text-align: right;
  }
  .station-time-rail .countdown {
    font-size: clamp(32px, 4vw, 40px);
    white-space: nowrap;
  }
  .station-countdown {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 5px;
  }
  .countdown-unit {
    font-family: 'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .station-time-rail .urgency-label {
    align-self: flex-end;
    color: var(--text-muted);
  }
  .station-time-rail .sleep-next {
    text-align: right;
  }
  .stacked-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 12px;
    font-weight: 900;
    font-family: 'Neue Machina', sans-serif;
    border-radius: var(--radius-sm);
    line-height: 1;
  }
  .station-service-identity .icon-badge {
    width: 32px;
    height: 32px;
  }
  .weather-indicator {
    display: inline-flex;
    width: 12px;
    height: 12px;
    margin-top: 3px;
    align-self: flex-end;
    color: var(--text-muted);
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
    animation: weather-fade-in 0.15s ease;
  }

  @keyframes weather-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .weather-indicator,
    .countdown.arriving-now {
      animation: none;
    }
  }

  .time-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
    min-width: 58px;
    padding-left: 4px;
    position: relative;
  }
  .urgency-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .countdown {
    font-family: 'Neue Machina', sans-serif;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: clamp(-1.8px, -0.04em, -1.2px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .countdown.arriving-now {
    animation: urgency-arrival 160ms ease-out;
  }

  @keyframes urgency-arrival {
    from { opacity: 0.35; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .clock-times {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    line-height: 1;
  }
  .em-dash {
    font-family: 'Neue Machina', sans-serif;
    font-size: 28px;
    font-weight: 300;
    color: var(--text-ghost);
    letter-spacing: 0;
    line-height: 1;
  }
  .moon-icon {
    width: 26px;
    height: 26px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .sleep-next {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    line-height: 1;
    text-align: right;
  }
  .disrupt-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px 10px 18px;
    border-top: 1px solid color-mix(in oklch, var(--strip-color) 20%, var(--border));
    font-size: 12px;
    line-height: 1.3;
    background: color-mix(in oklch, var(--strip-color) 8%, var(--surface));
  }
  .disrupt-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--strip-color);
  }
  .disrupt-msg {
    flex: 1;
    min-width: 0;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .disrupt-scope {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }
  .disrupt-pill {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--pill-text-color);
    padding: 2px 7px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
    line-height: 1.2;
    background: var(--strip-color);
  }
  .disrupt-count {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
    line-height: 1;
    padding-left: 2px;
  }
  .disrupt-strip.expanded {
    align-items: flex-start;
  }
  .disrupt-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .disrupt-msg-line {
    display: block;
    color: var(--text);
    line-height: 1.3;
  }
  .disrupt-msg-line + .disrupt-msg-line {
    margin-top: 2px;
  }
  .show-all-btn {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--strip-color);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    opacity: 0.8;
    align-self: flex-start;
  }
  .show-all-btn:hover {
    opacity: 1;
  }

  .expanded-panel {
    overflow: hidden;
  }
  .expanded-panel.collapsing {
    pointer-events: none;
  }
  .card-secondary-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 48px;
    padding: 2px 8px 0;
    border-top: 1px solid var(--border);
  }
  .more-actions-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
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
  .share-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    margin-right: auto;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .share-button:hover,
  .share-button:focus-visible {
    background: var(--accent-subtle);
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .expanded-panel > .expanded-actions {
    padding: 0 var(--transit-card-padding-inline) var(--transit-card-padding-inline);
  }
  .expanded-actions {
    position: relative;
  }

  /* ── Tablet: larger type for distance viewing ── */
  @media (min-width: 768px) {
    .countdown {
      font-size: clamp(34px, 5vw, 44px);
    }

    .route-number {
      font-size: clamp(19px, 2.5vw, 24px);
    }

    .card-main {
      padding: 12px var(--transit-card-padding-inline);
      gap: 12px;
    }

    .station-card-main {
      grid-template-columns: auto minmax(0, 1fr) 118px;
      column-gap: 12px;
      row-gap: 8px;
    }
  }
</style>
