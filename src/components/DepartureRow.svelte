<script lang="ts">
  import type { Segment } from "../types/page";
  import type { Departure } from "../stores/departureStore.svelte";
  import { transportIcons } from "../icons/transport";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import MapPreview from "./MapPreview.svelte";
  import DisruptionList from "./DisruptionList.svelte";
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
    index,
    userLocation,
    locationRequestInFlight,
    walkingEtaEnabled,
    openFeatureSheet,
    t,
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
    index: number;
    userLocation: [number, number] | null;
    locationRequestInFlight: boolean;
    walkingEtaEnabled: boolean;
    openFeatureSheet?: ((segment: Segment) => void) | null;
    t: Record<string, string>;
    ontoggle?: (index: number) => void;
    onprefetch?: () => void;
  } = $props();

  function getTransportIcon(type: TransportType): string {
    return transportIcons[type] ?? transportIcons.bus;
  }

  function stopLabel(name?: string): string {
    if (!name) return "";
    const cleaned = name.replace(/^[^,]+,\s*/u, "").trim();
    return cleaned || name;
  }

  function scrollExpandedIntoView(node: HTMLElement, isExpanded: boolean) {
    const scrollPanelAboveBottomBar = (panel: HTMLElement) => {
      const container = node.closest('.scroll-container') as HTMLElement | null;
      const bottomBar = document.querySelector('.floating-action-bar') as HTMLElement | null;
      if (!container || !bottomBar) return;

      const panelRect = panel.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const bottomBarHeight = bottomBar.getBoundingClientRect().height;
      const gap = 16;

      const desiredBottom = containerRect.bottom - bottomBarHeight - gap;
      const currentBottom = panelRect.bottom;
      
      const delta = currentBottom - desiredBottom;

      if (delta > 0) {
        container.scrollBy({ top: delta, behavior: 'smooth' });
      }
    };

    const attachAndScroll = () => {
      const panel = node.querySelector('.expanded-panel') as HTMLElement | null;
      if (!panel) return;

      let handled = false;
      const onEnd = () => {
        if (handled) return;
        handled = true;
        panel.removeEventListener('introend', onEnd);
        panel.removeEventListener('transitionend', onEnd);
        panel.removeEventListener('animationend', onEnd);
        scrollPanelAboveBottomBar(panel);
      };

      panel.addEventListener('introend', onEnd, { once: true });
      panel.addEventListener('transitionend', onEnd, { once: true });
      panel.addEventListener('animationend', onEnd, { once: true });

      setTimeout(onEnd, 350);
    };

    if (isExpanded) {
      requestAnimationFrame(attachAndScroll);
    }

    return {
      update(nextExpanded: boolean) {
        if (nextExpanded) {
          requestAnimationFrame(attachAndScroll);
        }
      },
    };
  }

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

  import type { TransportType } from "../types/page";
</script>

<div class="departure-item" class:expanded={isExpanded} use:scrollExpandedIntoView={isExpanded}>
  <button
    class="departure-row"
    use:prefetch
    data-testid="segment-row"
    class:expandable={isExpandable}
    class:expanded={isExpanded}
    type="button"
    aria-expanded={isExpanded}
    onclick={() => {
      if (isExpandable) ontoggle?.(index);
    }}
    style="--delay: {Math.min(index, 3) * 40}ms"
  >
    <div class="row-left">
      <div class="transport-badge" data-type={segment.transportType}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <g>{@html getTransportIcon(segment.transportType)}</g>
        </svg>
      </div>

      <div class="line-details">
        <span class="line-info" data-testid="segment-line" class:hidden={isExpanded}>{segment.line}</span>
        <div class="stop-route-container" class:hidden={isExpanded}>
          <span class="stop-route">{stopLabel(segment.fromStop.name)} → {stopLabel(segment.direction?.destination)}</span>
        </div>
      </div>
    </div>

    <div class="row-right">
      {#if hasDeparture}
        {#if !isExpanded}
        <div class="time-stack">
          <div class="primary-time">
            <span class="minutes" data-testid="countdown-minutes">{primaryDepartureText}</span>
          </div>
          {#if subsequent}
            <div class="secondary-time"><span class="more">{subsequent}</span></div>
          {/if}
            {#if siteDevs.length > 0}
              <div class="event-chip event-{topDevType}">
                {#if topDevType === "protest"}
                  <svg viewBox="0 0 24 24" class="event-icon protest-icon" aria-hidden="true">
                    <path d="M6 20v-5m0-6V4m0 5 8 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <rect x="14" y="9" width="5" height="5" rx="1" fill="currentColor" />
                  </svg>
                {:else if topDevType === "technical"}
                  <svg viewBox="0 0 24 24" class="event-icon tech-icon" aria-hidden="true">
                    <path d="M12 2v4m0 12v4m7-10h-4M9 12H5m10.5-5.5-3 3m-1 5-3 3m7 0-3-3m-1-5-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                {:else if topDevType === "weather"}
                  <svg viewBox="0 0 24 24" class="event-icon weather-icon" aria-hidden="true">
                    <path d="M8 16a4 4 0 1 1 .8-7.92A5 5 0 0 1 18 10a3 3 0 1 1 0 6H8Z" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path d="M9 18v3m3-3v3m3-3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" class="event-icon" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                {/if}
                <span>{topDevType === "general" ? t.disruptionGeneral : topDevType}</span>
              </div>
            {/if}
        </div>
        {/if}
      {:else}
        {#if siteDevs.length > 0}
          <div class="site-deviation-badge" class:active={isExpanded}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12" y2="17.01"/>
            </svg>
          </div>
        {:else}
          <div class="no-departure">—</div>
        {/if}
      {/if}
    </div>
  </button>

  {#if isExpanded}
    <div class="expanded-panel" transition:slide={{ duration: 280, easing: cubicOut }}>
      <div class="expanded-actions">
        {#if hasDeparture}
          <MapPreview
            {segment}
            {primaryDepartureText}
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
  .departure-item {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 8px 0;
  }
  .departure-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 16px;
    border-radius: 22px;
    border: 1px solid transparent;
    animation: rowIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--delay, 0ms);
    contain: layout style;
    width: 100%;
    background: var(--surface);
    text-align: left;
    transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease;
  }
  .departure-item.expanded .departure-row {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    margin-bottom: 0;
    border-bottom: 1px solid var(--border);
  }
  .expanded-panel {
    border: 1px solid var(--border);
    border-top: none;
    border-bottom-left-radius: 22px;
    border-bottom-right-radius: 22px;
    background: var(--surface);
    overflow: hidden;
  }
  .expanded-panel > .expanded-actions {
    padding: 0 16px 16px;
  }
  .departure-row.expandable {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .departure-row.expandable:hover,
  .departure-row.expandable:focus-visible {
    background: var(--surface-emphasis);
    border-color: var(--border);
  }
  .departure-row.expandable:active {
    opacity: 0.95;
    transform: translateY(1px);
  }
  .departure-row.expanded {
    border-color: var(--accent-subtle);
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.13);
  }
  @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .row-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding-right: 12px; }
  .row-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-shrink: 0; text-align: right; min-width: fit-content; padding-left: 8px; }
  .transport-badge { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; background: var(--accent-subtle); color: var(--accent); }
  .transport-badge svg { width: 20px; height: 20px; }
  .line-details { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line-info { font-size: 15px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route { font-size: 13px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stop-route-container { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .stop-route-container.hidden { display: none; }
  .expanded-actions { position: relative; }
  .time-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .primary-time { display: flex; align-items: baseline; gap: 4px; line-height: 1; position: relative; }
  .minutes { font-family: "Neue Machina", sans-serif; font-size: clamp(56px, 14vw, 68px); font-weight: 800; letter-spacing: -2.5px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .secondary-time { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .more { color: var(--text-muted); font-size: 12px; }
  .no-departure { font-family: "Neue Machina", sans-serif; font-size: 48px; font-weight: 300; color: var(--text-ghost); letter-spacing: 0; line-height: 1; }
  .site-deviation-badge { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; color: #f59e0b; background: color-mix(in srgb, #f59e0b 12%, transparent); border-radius: 12px; transition: transform 0.2s ease; }
  .site-deviation-badge.active { transform: scale(1.1) rotate(5deg); background: #f59e0b; color: #fff; }
  .site-deviation-badge svg { width: 22px; height: 22px; }
  .event-chip {
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
    opacity: 0.9;
  }
  .event-icon { width: 14px; height: 14px; }
  .protest-icon { animation: bob 1.8s ease-in-out infinite; transform-origin: 6px 18px; }
  .tech-icon { animation: spinSlow 2.6s linear infinite; transform-origin: 12px 12px; }
  .weather-icon { animation: drift 2.2s ease-in-out infinite; }
  @keyframes bob { 0%,100% { transform: rotate(-2deg) translateY(0); } 50% { transform: rotate(2deg) translateY(-1px); } }
  @keyframes spinSlow { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
  @keyframes drift { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-1px);} }
  @media (prefers-reduced-motion: reduce) {
    .protest-icon, .tech-icon, .weather-icon { animation: none !important; }
  }
</style>
