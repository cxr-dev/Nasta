<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());

  let isVisible = $state(false);
  let dismissed = $state(false);
  let bannerEl = $state<HTMLDivElement | undefined>();

  $effect(() => {
    if (isVisible && bannerEl) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        gsap.set(bannerEl, { y: '0%', opacity: 1 });
      } else {
        gsap.fromTo(bannerEl,
          { y: '100%', opacity: 0 },
          { y: '0%', opacity: 1, duration: 0.2, ease: 'power2.out' }
        );
      }
    }
  });

  onMount(() => {
    const handleUpdateAvailable = () => {
      if (dismissed) return;
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
    if (!reg?.waiting) {
      window.location.reload();
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: number;
      const finish = () => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        window.clearTimeout(timeoutId);
        resolve();
      };
      timeoutId = window.setTimeout(finish, 2500);
      navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });

    window.location.reload();
  }

  function handleDismiss() {
    dismissed = true;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      isVisible = false;
      return;
    }
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
  <div class="update-banner" bind:this={bannerEl} role="status" aria-live="polite">
    <div class="banner-content">
      <p class="banner-text">{t.updateAvailable}</p>
      <button class="reload-btn" onclick={handleReload}>
        {t.reload}
      </button>
      <button class="dismiss-btn" onclick={handleDismiss} aria-label={t.dismissHint}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    left: 16px;
    right: 16px;
    background: var(--surface-raised, var(--surface));
    color: var(--text);
    border: 1px solid var(--accent-subtle);
    padding: 8px 10px 8px 14px;
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
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
    background: var(--accent);
    color: var(--text-on-accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    min-height: 44px;
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease;
    white-space: nowrap;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .reload-btn:hover {
    background: color-mix(in oklch, var(--accent) 85%, var(--text));
  }

  .reload-btn:active {
    background: color-mix(in oklch, var(--accent) 75%, var(--text));
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .dismiss-btn:hover {
    opacity: 0.8;
  }

</style>
