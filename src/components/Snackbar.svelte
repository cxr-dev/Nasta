<script lang="ts">
  import SurfaceControl from './SurfaceControl.svelte';

  let {
    message,
    actionLabel = '',
    onAction,
    onClose,
    closeLabel = 'Dismiss',
    closing = false,
  }: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    onClose?: () => void;
    closeLabel?: string;
    closing?: boolean;
  } = $props();
</script>

<div class="snackbar" class:closing role="status" aria-live="polite">
  <span>{message}</span>
  {#if actionLabel && onAction}
    <button type="button" onclick={onAction}>{actionLabel}</button>
  {/if}
  {#if onClose}
    <SurfaceControl class="snackbar-close" kind="close" label={closeLabel} onclick={onClose} />
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
    opacity: 1;
    transform: translateY(0);
    transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 180ms cubic-bezier(0.23, 1, 0.32, 1);

    @starting-style {
      opacity: 0;
      transform: translateY(100%);
    }
  }

  .snackbar.closing {
    opacity: 0;
    transform: translateY(100%);
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

  .snackbar :global(.surface-control.snackbar-close) {
    color: var(--text-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .snackbar,
    .snackbar.closing {
      transition: opacity 160ms ease;
      transform: none;
    }
  }
</style>
