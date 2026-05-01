<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../stores/localeStore';

  let isVisible = $state(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined = $state();

  onMount(() => {
    const handleUpdateAvailable = (event: CustomEvent) => {
      updateSW = event.detail.updateSW;
      isVisible = true;
      if (import.meta.env.DEV) console.log('[PWA] Update available');
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable as EventListener);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable as EventListener);
    };
  });

  async function handleReload() {
    if (updateSW) {
      await updateSW(true);
    }
  }

  function handleDismiss() {
    isVisible = false;
  }
</script>

{#if isVisible}
  <div class="update-banner">
    <div class="banner-content">
      <p class="banner-text">{$t.updateAvailable ?? 'Update available'}</p>
      <button class="reload-btn" onclick={handleReload}>
        {$t.reload ?? 'Reload'}
      </button>
      <button class="dismiss-btn" onclick={handleDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--accent);
    color: white;
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
    z-index: 9999;
    animation: slideUp 300ms ease-out;
  }

  .banner-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    max-width: 600px;
    margin: 0 auto;
  }

  .banner-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    flex: 1;
  }

  .reload-btn {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms ease;
    white-space: nowrap;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .reload-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .reload-btn:active {
    background: rgba(255, 255, 255, 0.15);
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .dismiss-btn:hover {
    opacity: 0.8;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 480px) {
    .banner-content {
      flex-direction: column;
      align-items: stretch;
    }

    .reload-btn {
      width: 100%;
    }

    .dismiss-btn {
      align-self: flex-end;
    }
  }
</style>
