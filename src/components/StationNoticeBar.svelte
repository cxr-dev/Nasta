<script lang="ts">
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import { infoCircle } from '../icons/departureIcons';
  import type { StationAlert } from '../types/deviation';
  import { dismissedStore } from '../stores/dismissedStore.svelte';

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

  let dismissedSet = $state<Set<string>>(new Set());
  $effect(() => {
    const unsub = dismissedStore.subscribe((ids) => {
      dismissedSet = ids;
    });
    return unsub;
  });

  // Group alerts by station name, stripping redundant leading "StationName: " prefix
  // from message text and deduplicating identical messages within a group.
  // Each entry carries alert.id so the dismiss button can dismiss by stable ID.
  // Also filter out dismissed alerts.
  let grouped = $derived.by(() => {
    const map = new Map<string, Array<{ msg: string; alertId: string }>>();

    for (const alert of alerts) {
      // Skip dismissed alerts
      if (dismissedSet.has(alert.id)) continue;

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
        if (!list.some(m => m.msg.toLowerCase() === normalised)) {
          list.push({ msg, alertId: alert.id });
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
            <div class="station-header">
              {#if group.station}
                <span class="station-heading">{group.station}</span>
              {/if}
            </div>
            <ul class="message-list" role="list">
              {#each group.messages as { msg, alertId } (alertId + msg)}
                <li class="message-item">
                  <span class="message-text">{msg}</span>
                  <button
                    type="button"
                    class="dismiss-btn"
                    aria-label={t.dismissNotice ?? 'Dismiss'}
                    onclick={() => dismissedStore.dismiss(alertId)}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
                      <path d="M4 4l8 8M12 4l-8 8"/>
                    </svg>
                  </button>
                </li>
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
    width: 100%;
    margin: 0 0 8px;
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
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding-right: 2px;
  }

  .message-text {
    flex: 1;
  }

  .dismiss-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    color: var(--text-muted);
    margin-top: 1px;
    opacity: 0.6;
    transition: opacity 0.15s, color 0.15s;
  }

  .dismiss-btn:hover {
    opacity: 1;
    color: var(--text);
  }

  .dismiss-btn:active {
    opacity: 0.8;
  }

  .station-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
