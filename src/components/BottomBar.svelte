<script lang="ts">
  import { t } from '../stores/localeStore';

  let {
    arrivalTime,
    editing,
    onclick,
    activeRouteDirection
  }: {
    arrivalTime: string | null;
    editing: boolean;
    onclick: () => void;
    activeRouteDirection: 'toWork' | 'fromWork';
  } = $props();
</script>

<div class="bottom-bar">
  {#if arrivalTime && !editing}
    <div class="arrival-info">
      <span class="arrival-label">{$t.arriving}</span>
      <span class="arrival-time">{arrivalTime}</span>
    </div>
  {/if}
  <button
    class="action-btn"
    class:is-editing={editing}
    {onclick}
    aria-label={editing ? $t.saveAriaLabel : $t.editAriaLabel}
  >
    {#if editing}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16.707 3.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 11.586 14.293 5.293a1 1 0 011.414 0z"/>
        <path d="M4 16v2h12v-2"/>
      </svg>
      <span>{$t.save}</span>
    {:else}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3h5M12 8h5M12 13h5M7 3l-4 4M7 8l-4 4M7 13l-4 4"/>
      </svg>
      <span>{$t.edit}</span>
    {/if}
  </button>
</div>

<style>
  .bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-width: 480px;
    margin: 0 auto;
    padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 200;
  }

  .arrival-info {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .arrival-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .arrival-time {
    font-family: 'Neue Machina', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .action-btn {
    width: 100%;
    padding: 14px 20px;
    background: var(--accent-subtle);
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn svg {
    width: 18px;
    height: 18px;
  }

  .action-btn:hover {
    opacity: 0.80;
  }

  .action-btn.is-editing {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .action-btn.is-editing:hover {
    opacity: 0.88;
  }
</style>
