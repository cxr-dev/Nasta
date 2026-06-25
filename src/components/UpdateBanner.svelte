<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());

  let isVisible = $state(false);
  let bannerEl = $state<HTMLDivElement | undefined>();

  $effect(() => {
    if (isVisible && bannerEl) {
      gsap.fromTo(bannerEl,
        { y: '100%', opacity: 0 },
        { y: '0%', opacity: 1, duration: 0.3, ease: 'back.out(1.4)' }
      );
    }
  });

  onMount(() => {
    const handleUpdateAvailable = () => {
      isVisible = true;
      if (import.meta.env.DEV) console.log('[PWA] Update available');
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  });

  async function handleReload() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  function handleDismiss() {
    if (bannerEl) {
      gsap.to(bannerEl, {
        y: '100%',
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => { isVisible = false; }
      });
    } else {
      isVisible = false;
    }
  }
</script>

{#if isVisible}
  <div class="update-banner" bind:this={bannerEl}>
    <div class="banner-content">
      <p class="banner-text">{t.updateAvailable}</p>
      <button class="reload-btn" onclick={handleReload}>
        {t.reload}
      </button>
      <button class="dismiss-btn" onclick={handleDismiss} aria-label={t.dismissHint}>
        ✕
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: calc(36px + env(safe-area-inset-bottom, 0px));
    left: 16px;
    right: 16px;
    background: var(--accent);
    color: var(--text-on-accent);
    padding: 12px 16px;
    border-radius: var(--radius-md);
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
    z-index: var(--z-toast);
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
    background: color-mix(in srgb, var(--text-on-accent) 20%, transparent);
    color: var(--text-on-accent);
    border: 1px solid color-mix(in srgb, var(--text-on-accent) 30%, transparent);
    border-radius: var(--radius-sm);
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
    background: color-mix(in srgb, var(--text-on-accent) 30%, transparent);
  }

  .reload-btn:active {
    background: color-mix(in srgb, var(--text-on-accent) 15%, transparent);
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: var(--text-on-accent);
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
