<script lang="ts">
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
    <div class="arrival-row">
      <span class="arrival-label">Anländer</span>
      <span class="arrival-time">{arrivalTime}</span>
    </div>
  {/if}
  <button
    class="redigera-btn"
    class:work={activeRouteDirection === 'toWork'}
    class:home={activeRouteDirection === 'fromWork'}
    class:is-editing={editing}
    {onclick}
    aria-label={editing ? 'Avsluta redigering' : 'Redigera rutter'}
  >
    {editing ? 'Klar' : 'Redigera'}
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
    padding: 8px 14px calc(8px + env(safe-area-inset-bottom));
    background: var(--bg);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 200;
  }

  .arrival-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    background: var(--surface);
    border-radius: 12px;
    border: 1px solid var(--border);
  }

  .arrival-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .arrival-time {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .redigera-btn {
    width: 100%;
    padding: 11px 0;
    background: transparent;
    border: 1.5px solid var(--border-subtle);
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    color: #64748B;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 150ms ease, color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .redigera-btn.work:hover {
    border-color: rgba(30, 58, 138, 0.3);
    color: var(--route-work);
  }

  .redigera-btn.home:hover {
    border-color: rgba(6, 95, 70, 0.3);
    color: var(--route-home);
  }

  .redigera-btn.is-editing {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
