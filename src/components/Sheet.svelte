<script module lang="ts">
  let nextSheetId = 0;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import SurfaceControl from './SurfaceControl.svelte';
  import { focusBoundary } from '../lib/focusBoundary';
  import { portal } from '../lib/portal';
  import { createMotionSpring } from '../lib/motionSpring';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    closeAriaLabel: string;
    overlayClass?: string;
    sheetClass?: string;
    mode?: 'sheet' | 'popover';
    anchor?: HTMLElement | null;
    initialFocusSelector?: string;
    onSheetTouchStart?: (e: TouchEvent) => void;
    onSheetTouchEnd?: (e: TouchEvent) => void;
    restoreFocusOnClose?: boolean;
    onExitComplete?: () => void;
    showHeader?: boolean;
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
    initialFocusSelector = '[data-surface-control]',
    onSheetTouchStart,
    onSheetTouchEnd,
    restoreFocusOnClose = true,
    onExitComplete,
    showHeader = true,
    children,
  }: Props = $props();

  let overlayEl = $state<HTMLDivElement | undefined>();
  let sheetEl = $state<HTMLDivElement | undefined>();
  let dragging = $state(false);
  let dragStartY = $state(0);
  let dragStartOffset = $state(0);
  let dragLastY = $state(0);
  let dragLastTime = $state(0);
  let sheetY = $state(0);
  let closing = false;
  let popoverStyle = $state('');
  const titleId = `sheet-title-${++nextSheetId}`;
  let portalEnabled = $derived(mode === 'popover');

  function travel(): number {
    return Math.max(1, sheetEl?.getBoundingClientRect().height ?? window.innerHeight);
  }

  const runner = createMotionSpring({
    clock: {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
    initial: 0,
    onFrame: (sample) => { sheetY = sample.position; },
    onRest: () => {
      if (!closing) return;
      closing = false;
      onExitComplete?.();
    },
  });

  function settleOpen(): void {
    closing = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runner.jump(0);
      return;
    }
    runner.retarget(0);
  }

  function settleClosed(): void {
    closing = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runner.jump(travel());
      closing = false;
      onExitComplete?.();
      return;
    }
    runner.retarget(travel());
  }

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
    e.stopPropagation();
    if (!overlayEl) return;
    const target = e.target as Node;
    if (target === overlayEl || (sheetEl && !sheetEl.contains(target))) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      onClose();
    }
  }

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
    dragStartOffset = runner.pause().position;
    dragLastY = dragStartY;
    dragLastTime = performance.now();
  }

  function handleHandleTouchMove(e: TouchEvent) {
    if (!dragging || !sheetEl) return;
    const dy = e.touches[0].clientY - dragStartY;
    const resisted = dy < 0 ? dy * 0.25 : dy;
    runner.jump(Math.max(0, dragStartOffset + resisted));
    dragLastY = e.touches[0].clientY;
    dragLastTime = performance.now();
  }

  function handleHandleTouchEnd(e: TouchEvent) {
    if (!dragging || !sheetEl) {
      dragging = false;
      dragStartY = 0;
      return;
    }

    const now = performance.now();
    const dy = e.changedTouches[0].clientY - dragStartY;
    const velocity = Math.max(-2.5, Math.min(2.5, (e.changedTouches[0].clientY - dragLastY) / Math.max(1, now - dragLastTime)));
    const shouldClose = sheetY + velocity * 180 > travel() * 0.25;
    dragging = false;
    dragStartY = 0;
    if (shouldClose) onClose();
    else settleOpen();
  }

  $effect(() => {
    if (mode === 'popover') return;
    if (isOpen) settleOpen();
    else if (!dragging) settleClosed();
  });

  $effect(() => {
    return () => {
      runner.destroy();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={overlayEl}
  use:portal={portalEnabled}
  class="sheet-overlay {overlayClass}"
  class:open={isOpen}
  aria-hidden={!isOpen}
  inert={!isOpen}
  aria-modal="true"
  aria-labelledby={titleId}
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
    class:touch-sheet={mode === 'sheet'}
    style={mode === 'popover' ? popoverStyle : `transform:translate3d(0, ${sheetY}px, 0);`}
    class:dragging
    use:focusBoundary={{ active: isOpen, initialFocus: initialFocusSelector, restore: restoreFocusOnClose }}
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

    {#if showHeader}
      <div class="sheet-header">
        <span id={titleId} class="sheet-title">{title}</span>
        <SurfaceControl kind="close" label={closeAriaLabel} onclick={onClose} />
      </div>
    {/if}
    {#if !showHeader}<span id={titleId} class="sr-only">{title}</span>{/if}

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
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: var(--safe-area-inset-bottom);
  }

  .sheet::-webkit-scrollbar {
    display: none;
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
    padding-top: calc(16px + var(--safe-area-inset-top));
    border-bottom: 1px solid var(--border);
    background: var(--bg);
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

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  @media (prefers-reduced-motion: reduce) {
    .sheet-overlay,
    .sheet-overlay.open {
      transition: opacity 160ms ease, background-color 160ms ease, visibility 0s linear 0s !important;
    }

    .sheet { transition: none !important; }
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
      opacity: 0;
    }

    .sheet-handle {
      width: 44px;
      margin-top: 10px;
      background: color-mix(in oklch, var(--border-subtle) 70%, var(--bg) 30%);
    }

    .sheet-overlay.open .sheet {
      opacity: 1;
    }

    .sheet-header {
      padding-top: 16px;
    }

  }
</style>
