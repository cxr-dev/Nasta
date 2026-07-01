<script lang="ts">
  import type { Segment } from "../types/page";
  import type { Departure } from "../stores/departureStore.svelte";
  import { alertTriangle, handStop, tool, cloudRain, cloudSnow, cloudLightning, windIcon, snowflake, infoCircle, moonIcon } from "../icons/departureIcons";
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import MapPreview from "./MapPreview.svelte";
  import { dismissedStore } from "../stores/dismissedStore.svelte";
  import { getWeatherForStation } from "../services/weatherCache";

  import { cleanStopName as stopLabel } from "../lib/stopName";
  import TransportIcon from "./TransportIcon.svelte";

  let {
    segment,
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
    isSleeping = false,
    nextDepartureTime = null,
    ontoggle,
    onprefetch,
    groupingMode,
  }: {
    segment: Segment;
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
    isSleeping?: boolean;
    nextDepartureTime?: string | null;
    ontoggle?: () => void;
    onprefetch?: () => void;
    groupingMode?: string;
  } = $props();

  let weatherSymbol = $state<string | null>(null);

  $effect(() => {
    const coord = segment.fromStop.coord;
    if (!coord) return;
    const [lat, lon] = coord;
    getWeatherForStation(lat, lon).then((s) => {
      weatherSymbol = s;
    });
  });

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

  let isImminent = $derived(primaryDepartureText === 'Nu' || primaryDepartureText === 'Now');
  let isSoon = $derived(primaryDepartureText === '1 min');

  let accentColor = $derived(
    severity === 'critical' ? 'var(--color-critical)' : severity === 'affected' ? 'var(--color-warning)' : 'var(--accent)'
  );

  let pillTextColor = $derived('var(--text-on-accent)');

  let badgeBgIntensity = $derived(
    severity === 'critical' ? 'var(--color-critical-subtle)' : severity === 'affected' ? 'var(--color-warning-subtle)' : 'var(--accent-subtle)'
  );

  let cardBg = $derived(
    siteDevs.length > 0
      ? severity === 'critical' ? 'var(--color-critical-bg)' : severity === 'affected' ? 'var(--color-warning-bg)' : 'var(--surface)'
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
    }, { root: null, rootMargin: '150px', threshold: 0.1 });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }
</script>

<div
  class="departure-card"
  class:expanded={isExpanded}
  class:has-disruption={siteDevs.length > 0}
  style="background: {cardBg}"
  data-testid="segment-row"
  aria-expanded={isExpanded}
>
  <button
    class="card-main"
    use:prefetch
    type="button"
    aria-expanded={isExpanded}
    aria-controls={isExpandable ? segment.id : undefined}
    onclick={() => { if (isExpandable) handleToggle(); }}
  >
    <div class="accent-bar" class:imminent={isImminent} class:soon={isSoon} style="background: {accentColor}"></div>

    <div class="icon-badge" style="background: {badgeBgIntensity}">
      <TransportIcon type={segment.transportType} size={18} />
    </div>

    <div class="meta-col">
      {#if groupingMode === 'station'}
        <div class="route-dest-combo">
          <span class="route-pill">{segment.line}</span>
          <span class="dest-text"><span class="route-arrow">→</span> {stopLabel(segment.direction?.destination)}</span>
        </div>
      {:else}
        <span class="route-number" data-testid="segment-line">{segment.line}</span>
        <span class="from-stop">{stopLabel(segment.fromStop.name)}</span>
        <span class="to-dest"><span class="route-arrow">→</span> {stopLabel(segment.direction?.destination)}</span>
      {/if}
    </div>

    <div class="time-col">
      {#if isSleeping}
        <svg viewBox="0 0 24 24" fill="none" class="moon-icon" aria-label={t.sleeping ?? 'Sleeping'}>
          <g>{@html moonIcon}</g>
        </svg>
        {#if nextDepartureTime}
          <span class="sleep-next">{nextDepartureTime}</span>
        {/if}
      {:else if hasDeparture}
        <span class="countdown" style="color: {accentColor}" data-testid="countdown-minutes">{primaryDepartureText}</span>
        {#if subsequent}
          <span class="clock-times">{subsequent}</span>
        {/if}
      {:else}
        <span class="em-dash">—</span>
      {/if}
      {#if weatherIconSvg && groupingMode !== 'station'}
        <svg viewBox="0 0 24 24" fill="none" class="weather-indicator" aria-label={weatherSymbol === 'rain' ? 'Rain' : weatherSymbol === 'snow' ? 'Snow' : 'Thunder'}>
          <g>{@html weatherIconSvg}</g>
        </svg>
      {/if}
    </div>
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
          {#each siteDevs.slice(0, showAllMessages ? siteDevs.length : 3) as dev}
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

  {#if (isExpanded || collapsing) && hasDeparture}
    <div bind:this={panelEl} class="expanded-panel" class:collapsing id={segment.id}>
      <div class="expanded-actions">
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
    display: flex;
    align-items: center;
    min-height: 58px;
    width: 100%;
    padding: 10px 14px 10px 0;
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

  .accent-bar {
    width: 4px;
    min-height: 58px;
    border-radius: 0 2px 2px 0;
    flex-shrink: 0;
    align-self: stretch;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .route-arrow {
    color: var(--accent);
    font-weight: 700;
  }
  .route-dest-combo {
    display: flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .route-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 24px;
    padding: 0 6px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 13px;
    font-weight: 900;
    font-family: 'Neue Machina', sans-serif;
    border-radius: 4px;
    line-height: 1;
    flex-shrink: 0;
  }
  .dest-text {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dest-text .route-arrow {
    color: var(--accent);
    font-weight: 700;
    margin-right: 2px;
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
    .weather-indicator {
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
    padding-left: 4px;
    position: relative;
  }
  .countdown {
    font-family: 'Neue Machina', sans-serif;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: clamp(-1.8px, -0.04em, -1.2px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
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

  .accent-bar.imminent {
    animation: pulse-glow 1.2s ease-in-out infinite;
  }
  .accent-bar.soon {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; filter: brightness(1.3); }
  }

  .expanded-panel {
    border-top: 1px solid var(--border);
    overflow: hidden;
  }
  .expanded-panel.collapsing {
    pointer-events: none;
  }
  .expanded-panel > .expanded-actions {
    padding: 0 14px 14px;
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
      padding: 12px 16px 12px 0;
      gap: 12px;
    }
  }
</style>
