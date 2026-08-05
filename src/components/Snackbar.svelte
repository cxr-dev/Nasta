<script lang="ts">
  let {
    message,
    actionLabel = '',
    onAction,
    onClose,
  }: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    onClose?: () => void;
  } = $props();
</script>

<div class="snackbar" role="status" aria-live="polite">
  <span>{message}</span>
  {#if actionLabel && onAction}
    <button type="button" onclick={onAction}>{actionLabel}</button>
  {/if}
  {#if onClose}
    <button type="button" class="snackbar-close" aria-label="Close" onclick={onClose}>×</button>
  {/if}
</div>

<style>
  .snackbar {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 16px;
    z-index: var(--z-toast, 80);
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    max-width: 480px;
    margin: 0 auto;
    padding: 8px 10px 8px 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-emphasis, var(--surface));
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
    color: var(--text);
    font-size: 14px;
  }

  .snackbar span { flex: 1; }

  .snackbar button {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-weight: 750;
  }

  .snackbar button:hover,
  .snackbar button:focus-visible {
    background: var(--accent-subtle);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .snackbar .snackbar-close {
    min-width: 32px;
    width: 32px;
    color: var(--text-muted);
    font-size: 20px;
  }
</style>
