<script lang="ts">
  import type { Segment } from "../types/page";
  import type { Departure } from "../stores/departureStore.svelte";
  import { transportIcons } from "../icons/transport";
  import { alertTriangle, handStop, tool, cloudRain, cloudSnow, cloudLightning, windIcon, snowflake, infoCircle, moonIcon } from "../icons/departureIcons";
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import MapPreview from "./MapPreview.svelte";
  import DisruptionList from "./DisruptionList.svelte";
  import { cleanStopName as stopLabel } from "../lib/stopName";

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
  } = $props();

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  import type { TransportType } from "../types/page";

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

  let panelEl: HTMLDivElement | undefined = $state();
  let collapsing = $state(false);

  let isImminent = $derived(primaryDepartureText === 'Nu' || primaryDepartureText === 'Now');
  let isSoon = $derived(primaryDepartureText === '1 min');

  let accentColor = $derived(
    severity === 'critical' ? '#e74c3c' : severity === 'affected' ? '#e8950a' : 'var(--accent)'
  );

  let pillTextColor = $derived(
    severity === 'critical' ? '#fff' : severity === 'affected' ? '#292929' : 'var(--text-on-accent)'
  );

  let badgeBgIntensity = $derived(
    severity === 'critical' ? 'rgba(231, 76, 60, 0.18)' : severity === 'affected' ? 'rgba(232, 149, 10, 0.18)' : 'var(--accent-subtle)'
  );

  let cardBg = $derived(
    siteDevs.length > 0
      ? severity === 'critical' ? 'rgba(231, 76, 60, 0.06)' : severity === 'affected' ? 'rgba(232, 149, 10, 0.05)' : ''
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
    onclick={() => { if (isExpandable) handleToggle(); }}
  >
    <div class="accent-bar" class:imminent={isImminent} class:soon={isSoon} style="background: {accentColor}"></div>

    <div class="icon-badge" style="background: {badgeBgIntensity}">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <g>{@html getTransportIcon(segment.transportType)}</g>
      </svg>
    </div>

    <div class="meta-col">
      <span class="route-number" data-testid="segment-line">{segment.line}</span>
      <span class="from-stop">{stopLabel(segment.fromStop.name)}</span>
      <span class="to-dest">→ {stopLabel(segment.direction?.destination)}</span>
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
    </div>
  </button>

  {#if siteDevs.length > 0}
    <div class="disrupt-strip" style="--strip-color: {accentColor}; --pill-text-color: {pillTextColor}">
      <svg viewBox="0 0 24 24" fill="none" class="disrupt-icon">
        <g>{@html disruptionIcon(topDevType)}</g>
      </svg>
      <span class="disrupt-msg">{topDevMessage}</span>
      <span class="disrupt-pill">{pillLabel(topDevType, severity)}</span>
    </div>
  {/if}

  {#if isExpanded || collapsing}
    <div bind:this={panelEl} class="expanded-panel" class:collapsing>
      <div class="expanded-actions">
        {#if hasDeparture}
          <MapPreview
            {segment}
            {userLocation}
            {locationRequestInFlight}
            {walkingEtaEnabled}
            {openFeatureSheet}
            {t}
          />
        {:else}
          <DisruptionList {siteDevs} {t} />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .departure-card {
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .departure-card.has-disruption {
    border-color: transparent;
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
    border-radius: 8px;
    flex-shrink: 0;
    color: var(--accent);
  }
  .icon-badge svg {
    width: 18px;
    height: 18px;
  }

  .meta-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;
    gap: 1px;
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
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .to-dest {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
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
    letter-spacing: -1.5px;
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
    border-top: 1px solid color-mix(in srgb, var(--strip-color) 20%, var(--border));
    font-size: 12px;
    line-height: 1.3;
    background: color-mix(in srgb, var(--strip-color) 8%, var(--surface));
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
    color: var(--strip-color);
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
    border-radius: 10px;
    flex-shrink: 0;
    line-height: 1.2;
    background: var(--strip-color);
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
