<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import { createHistoryView } from '../lib/historyView';
  import { focusBoundary } from '../lib/focusBoundary';

  type SurfaceState = {
    fullscreen: boolean;
    visible: boolean;
    closing: boolean;
    open: () => void;
    close: () => void;
  };

  let { id, label, active = $bindable(false), onClosed, content }: { id: string; label: string; active?: boolean; onClosed?: () => void; content: Snippet<[SurfaceState]> } = $props();

  let fullscreen = $state(false);
  let visible = $state(false);
  let closing = $state(false);
  let historyView: ReturnType<typeof createHistoryView> | null = null;

  function lockBody(lock: boolean) {
    document.documentElement.style.overscrollBehavior = lock ? 'none' : '';
    document.documentElement.style.touchAction = lock ? 'none' : '';
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function open() {
    if (fullscreen) return;
    fullscreen = true;
    active = true;
    closing = false;
    lockBody(true);
    requestAnimationFrame(() => {
      if (fullscreen) visible = true;
    });
  }

  function finishClose() {
    fullscreen = false;
    active = false;
    visible = false;
    closing = false;
    lockBody(false);
    onClosed?.();
  }

  function closeFromHistory() {
    if (!fullscreen || closing) return;
    closing = true;
    setTimeout(finishClose, reducedMotion() ? 0 : 150);
  }

  function close() {
    if (!fullscreen || closing) return;
    historyView?.back();
  }

  $effect(() => {
    historyView = createHistoryView(id, { onEnter: open, onExit: closeFromHistory });
    return () => {
      historyView?.destroy();
      lockBody(false);
    };
  });

  $effect(() => {
    if (active && !fullscreen) requestOpen();
    if (!active && fullscreen && !closing) close();
  });

  function requestOpen() {
    open();
    historyView?.enter();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && fullscreen) close();
  }

  function stopTouchPropagation(event: TouchEvent) {
    if (fullscreen) event.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="fullscreen-map-surface"
  class:fullscreen
  class:visible
  class:closing
  role={fullscreen ? 'dialog' : undefined}
  aria-modal={fullscreen ? 'true' : undefined}
  aria-label={fullscreen ? label : undefined}
  tabindex={fullscreen ? -1 : undefined}
  onkeydown={handleKeydown}
  ontouchstart={stopTouchPropagation}
  ontouchmove={stopTouchPropagation}
  ontouchend={stopTouchPropagation}
  use:focusBoundary={{ active: fullscreen, initialFocus: '[data-surface-control]' }}
>
  {@render content({ fullscreen, visible, closing, open: requestOpen, close })}
</div>

<style>
  .fullscreen-map-surface { position: relative; transition: opacity 150ms ease-out, transform 150ms cubic-bezier(0.23, 1, 0.32, 1); }
  .fullscreen-map-surface.fullscreen { position: fixed; inset: 0; z-index: var(--z-overlay); background: #000; opacity: 0; transform: scale(0.96); touch-action: none; }
  .fullscreen-map-surface.fullscreen.visible { opacity: 1; transform: scale(1); }
  .fullscreen-map-surface.closing { opacity: 0; transform: scale(0.96); }
  @media (prefers-reduced-motion: reduce) {
    .fullscreen-map-surface, .fullscreen-map-surface.fullscreen, .fullscreen-map-surface.fullscreen.visible, .fullscreen-map-surface.closing { transform: none; }
  }
</style>
