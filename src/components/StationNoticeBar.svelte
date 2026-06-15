<script lang="ts">
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import { infoCircle } from '../icons/departureIcons';
  import type { StationAlert } from '../types/deviation';

  let {
    alerts,
    t,
  }: {
    alerts: StationAlert[];
    t: Record<string, string>;
  } = $props();

  let expanded = $state(false);
  let panelEl = $state<HTMLDivElement | undefined>();
  let collapsing = $state(false);

  // Group alerts by station name, stripping redundant leading "StationName: " prefix
  // from message text and deduplicating identical messages within a group.
  let grouped = $derived.by(() => {
    const map = new Map<string, string[]>();

    for (const alert of alerts) {
      // An alert may cover multiple stations; use each station as a key
      const stations = alert.stations.length > 0 ? alert.stations : [''];
      for (const station of stations) {
        if (!map.has(station)) map.set(station, []);
        const list = map.get(station)!;

        // Strip leading "StationName: " prefix (case-insensitive) if the
        // message already starts with the station name.
        let msg = alert.message.trim();
        if (station) {
          const prefix = `${station.trim()}: `;
          if (msg.toLowerCase().startsWith(prefix.toLowerCase())) {
            msg = msg.slice(prefix.length).trim();
          }
        }

        // Deduplicate identical messages within the same station group
        const normalised = msg.toLowerCase();
        if (!list.some(m => m.toLowerCase() === normalised)) {
          list.push(msg);
        }
      }
    }

    return [...map.entries()]
      .map(([station, messages]) => ({ station, messages }))
      .filter(g => g.messages.length > 0);
  });

  // Total unique messages across all groups — used for the badge count so it
  // matches exactly what is shown when the panel opens.
  let totalMessageCount = $derived(grouped.reduce((sum, g) => sum + g.messages.length, 0));

  async function toggle() {
    if (expanded) {
      // Collapse
      const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm || !panelEl) { expanded = false; return; }
      collapsing = true;
      gsap.to(panelEl, {
        height: 0, opacity: 0,
        duration: 0.2, ease: 'power2.in',
        onComplete: () => { collapsing = false; expanded = false; },
      });
    } else {
      expanded = true;
      await tick();
      if (!panelEl) return;
      const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) return;
      gsap.fromTo(panelEl,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'height,opacity' },
      );
    }
  }
</script>

{#if grouped.length > 0}
  <div class="notice-bar" class:expanded>
    <button
      type="button"
      class="notice-row"
      onclick={toggle}
      aria-expanded={expanded}
      aria-label={t.stationNoticesToggle}
    >
      <svg viewBox="0 0 24 24" fill="none" class="notice-icon" aria-hidden="true">
        <g>{@html infoCircle}</g>
      </svg>
      <span class="notice-label">{t.sectionStationNotices}</span>
      <span class="notice-count">{totalMessageCount}</span>
      <svg
        class="chevron"
        class:flipped={expanded}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    {#if expanded || collapsing}
      <div bind:this={panelEl} class="notice-panel" class:collapsing>
        {#each grouped as group (group.station)}
          <div class="station-group">
            {#if group.station}
              <span class="station-heading">{group.station}</span>
            {/if}
            <ul class="message-list" role="list">
              {#each group.messages as msg (msg)}
                <li class="message-item">{msg}</li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .notice-bar {
    margin: 0 14px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
  }

  .notice-row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 9px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
    color: var(--text-secondary);
    min-height: 40px;
  }

  .notice-row:active {
    opacity: 0.8;
  }

  .notice-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .notice-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    flex: 1;
  }

  .notice-count {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-on-accent);
    background: var(--accent);
    border-radius: 999px;
    padding: 1px 6px;
    line-height: 1.5;
    flex-shrink: 0;
  }

  .chevron {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .chevron.flipped {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron { transition: none; }
  }

  .notice-panel {
    border-top: 1px solid var(--border);
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .notice-panel.collapsing {
    pointer-events: none;
  }

  .station-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .station-heading {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.01em;
  }

  .message-list {
    margin: 0;
    padding: 0 0 0 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    list-style: none;
  }

  .message-item {
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-secondary);
    position: relative;
  }

  .message-item::before {
    content: '·';
    position: absolute;
    left: -10px;
    color: var(--text-muted);
  }
</style>
