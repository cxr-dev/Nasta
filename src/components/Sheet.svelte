<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import gsap from 'gsap';
  import IconButton from './IconButton.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    closeAriaLabel: string;
    overlayClass?: string;
    sheetClass?: string;
    mode?: 'sheet' | 'popover';
    anchor?: HTMLElement | null;
    onSheetTouchStart?: (e: TouchEvent) => void;
    onSheetTouchEnd?: (e: TouchEvent) => void;
    children: Snippet;
  }

  let {
    isOpen,
    onClose,
    title,
    closeAriaLabel,
    overlayClass = '',
    sheetClass = '',
    mode = 'sheet',
    anchor = null,
    onSheetTouchStart,
    onSheetTouchEnd,
    children,
  }: Props = $props();

  let overlayEl = $state<HTMLDivElement | undefined>();
  let sheetEl = $state<HTMLDivElement | undefined>();
  let dragging = $state(false);
  let dragStartY = $state(0);
  let popoverStyle = $state('');
  let restoreFocusEl = $state<HTMLElement | null>(null);

  const SWIPE_THRESHOLD = 48;

  function updatePopoverPosition() {
    if (mode !== 'popover' || !anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    const margin = 12;
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(rect.bottom + 8, window.innerHeight - 360 - margin));
    popoverStyle = `left:${left}px;top:${top}px;`;
  }

  $effect(() => {
    if (!isOpen || mode !== 'popover') return;
    updatePopoverPosition();
    const handleResize = () => updatePopoverPosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  });

  function handleOverlayClick(e: MouseEvent) {
    if (!overlayEl) return;
    const target = e.target as Node;
    if (target === overlayEl || (sheetEl && !sheetEl.contains(target))) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key !== 'Tab' || !sheetEl) return;
    const focusable = Array.from(sheetEl.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      e.preventDefault();
      sheetEl.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (isOpen) {
      restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      tick().then(() => {
        sheetEl?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        )?.focus();
      });
      return;
    }

    const target = restoreFocusEl;
    restoreFocusEl = null;
    if (target?.isConnected) tick().then(() => target.focus());
  });

  function handleSheetTouchStart(e: TouchEvent) {
    onSheetTouchStart?.(e);
  }

  function handleSheetTouchEnd(e: TouchEvent) {
    onSheetTouchEnd?.(e);
  }

  function handleHandleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    dragging = true;
    dragStartY = e.touches[0].clientY;
  }

  function handleHandleTouchMove(e: TouchEvent) {
    if (!dragging || !sheetEl) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (dy < 0) return;
    gsap.set(sheetEl, { y: dy, overwrite: 'auto' });
  }

  function handleHandleTouchEnd(e: TouchEvent) {
    if (!dragging || !sheetEl) {
      dragging = false;
      dragStartY = 0;
      return;
    }

    const dy = e.changedTouches[0].clientY - dragStartY;

    if (dy > SWIPE_THRESHOLD) {
      gsap.to(sheetEl, {
        y: '100%',
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          onClose();
          dragging = false;
          dragStartY = 0;
        },
      });
    } else {
      gsap.to(sheetEl, {
        y: 0,
        duration: 0.25,
        ease: 'power2.out',
        onComplete: () => {
          if (sheetEl) sheetEl.style.transform = '';
          dragging = false;
          dragStartY = 0;
        },
      });
    }
  }

  // Clear inline transform after a non-drag close so CSS base state matches.
  $effect(() => {
    if (!isOpen && sheetEl && !dragging) {
      sheetEl.style.transform = '';
    }
  });

  $effect(() => {
    return () => {
      if (sheetEl) gsap.killTweensOf(sheetEl);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={overlayEl}
  class="sheet-overlay {overlayClass}"
  class:open={isOpen}
  aria-hidden={!isOpen}
  inert={!isOpen}
  aria-modal="true"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={sheetEl}
    class="sheet {sheetClass}"
    class:popover={mode === 'popover'}
    style={mode === 'popover' ? popoverStyle : undefined}
    class:dragging
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
    ontouchstart={handleSheetTouchStart}
    ontouchend={handleSheetTouchEnd}
  >
    <div
      class="sheet-handle"
      aria-hidden="true"
      ontouchstart={handleHandleTouchStart}
      ontouchmove={handleHandleTouchMove}
      ontouchend={handleHandleTouchEnd}
    ></div>

    <div class="sheet-header">
      <IconButton onclick={onClose} ariaLabel={closeAriaLabel}>
        <svg class="mobile-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        <svg class="desktop-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6 6 18"/>
        </svg>
      </IconButton>
      <span class="sheet-title">{title}</span>
    </div>

    {@render children()}
  </div>
</div>

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 180ms ease, background 180ms ease, visibility 0s linear 180ms;
  }

  .sheet-overlay.open {
    pointer-events: auto;
    opacity: 1;
    visibility: visible;
    transition: opacity 180ms ease, background 180ms ease, visibility 0s linear 0s;
  }

  .sheet {
    position: absolute;
    inset: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--bg);
    transform: translateY(100%);
    transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .sheet::-webkit-scrollbar {
    display: none;
  }

  .sheet-overlay.open .sheet {
    transform: translateY(0);
  }

  .sheet.dragging {
    transition: none !important;
  }

  .sheet-handle {
    width: 40px;
    height: 8px;
    border-radius: 3px;
    background: var(--border-subtle);
    margin: 8px auto 6px;
    flex-shrink: 0;
    cursor: grab;
    touch-action: manipulation;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 16px 12px;
    padding-top: calc(16px + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .desktop-close-icon {
    display: none;
  }

  .sheet-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-overlay,
    .sheet-overlay.open,
    .sheet,
    .sheet-overlay.open .sheet,
    .sheet.dragging {
      transition: none !important;
    }
  }

  @media (min-width: 768px) {
    .sheet-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .sheet-overlay.open {
      background: rgba(0, 0, 0, 0.16);
    }

    .sheet {
      position: relative;
      inset: auto;
      width: min(760px, calc(100vw - 48px));
      height: min(780px, calc(100dvh - 48px));
      max-width: none;
      max-height: none;
      margin: 0;
      border: 1px solid color-mix(in oklch, var(--border-subtle) 72%, var(--bg) 28%);
      border-radius: 28px;
      box-shadow:
        0 24px 80px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.32);
      transform: translateY(20px) scale(0.985);
      opacity: 0;
    }

    .sheet-handle {
      width: 44px;
      margin-top: 10px;
      background: color-mix(in oklch, var(--border-subtle) 70%, var(--bg) 30%);
    }

    .sheet-overlay.open .sheet {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    .sheet-header {
      padding-top: 16px;
    }

    .mobile-close-icon {
      display: none;
    }

    .desktop-close-icon {
      display: block;
    }
  }
</style>
