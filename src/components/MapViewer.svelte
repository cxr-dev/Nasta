<script lang="ts">
  import { getT } from "../stores/localeStore.svelte";

  let t = $derived(getT());

  let {
    isOpen,
    onClose,
    mapSrc,
  }: {
    isOpen: boolean;
    onClose: () => void;
    mapSrc: string;
  } = $props();

  let closing = $state(false);
  let mapLoaded = $state(false);
  let imgEl = $state<HTMLImageElement | undefined>(undefined);
  let containerEl = $state<HTMLDivElement | undefined>(undefined);

  // Transform state — no rotation, only scale + translate
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let minScale = $state(1);
  const maxScale = 5;

  // Pointer tracking
  let pointers = new Map<number, { x: number; y: number }>();
  let lastPinchDist = 0;
  let isDragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  const DRAG_THRESHOLD = 4;

  // Momentum
  let velocityX = 0;
  let velocityY = 0;
  let lastMoveTime = 0;
  let momentumRaf: number | null = null;

  function fitToContainer() {
    if (!imgEl || !containerEl) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const iw = imgEl.naturalWidth || 2834;
    const ih = imgEl.naturalHeight || 1984;
    const s = Math.min(cw / iw, ch / ih, 1);
    minScale = s;
    scale = s;
    tx = (cw - iw * s) / 2;
    ty = (ch - ih * s) / 2;
    velocityX = 0;
    velocityY = 0;
  }

  function lockBodyScroll(lock: boolean) {
    document.documentElement.style.overscrollBehavior = lock ? 'none' : '';
    document.documentElement.style.touchAction = lock ? 'none' : '';
  }

  $effect(() => {
    if (isOpen) {
      closing = false;
      mapLoaded = false;
      fitToContainer();
      lockBodyScroll(true);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      lockBodyScroll(false);
      document.removeEventListener('keydown', handleKeyDown);
      cancelMomentum();
    };
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleClose() {
    if (closing) return;
    closing = true;
    lockBodyScroll(false);
    setTimeout(() => {
      closing = false;
      onClose();
      lockBodyScroll(false);
    }, 150);
  }

  function onImgLoad() {
    mapLoaded = true;
    fitToContainer();
  }

  // Transform constraint — keep map visible with soft overflow margin
  function clampTransform() {
    if (!imgEl || !containerEl) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const iw = imgEl.naturalWidth || 2834;
    const ih = imgEl.naturalHeight || 1984;
    const sw = iw * scale;
    const sh = ih * scale;
    const OVERSCROLL = 100;
    const maxTx = Math.max(0, cw - sw) + OVERSCROLL;
    const maxTy = Math.max(0, ch - sh) + OVERSCROLL;
    const minTx = Math.min(0, cw - sw) - OVERSCROLL;
    const minTy = Math.min(0, ch - sh) - OVERSCROLL;
    tx = Math.max(minTx, Math.min(maxTx, tx));
    ty = Math.max(minTy, Math.min(maxTy, ty));
    const hardMaxTx = Math.max(0, cw - sw);
    const hardMaxTy = Math.max(0, ch - sh);
    const hardMinTx = Math.min(0, cw - sw);
    const hardMinTy = Math.min(0, ch - sh);
    if (tx > hardMaxTx || tx < hardMinTx || ty > hardMaxTy || ty < hardMinTy) {
      velocityX = 0;
      velocityY = 0;
      cancelMomentum();
      tx = Math.max(hardMinTx, Math.min(hardMaxTx, tx));
      ty = Math.max(hardMinTy, Math.min(hardMaxTy, ty));
    }
  }

  function startMomentum() {
    cancelMomentum();
    const FRICTION = 0.94;
    const MIN_VELOCITY = 0.3;
    function step() {
      velocityX *= FRICTION;
      velocityY *= FRICTION;
      tx += velocityX;
      ty += velocityY;
      // Spring-return if overscrolling
      if (!imgEl || !containerEl) { cancelMomentum(); return; }
      const cw = containerEl.clientWidth;
      const ch = containerEl.clientHeight;
      const iw = imgEl.naturalWidth || 2834;
      const ih = imgEl.naturalHeight || 1984;
      const sw = iw * scale;
      const sh = ih * scale;
      const hardMaxTx = Math.max(0, cw - sw);
      const hardMaxTy = Math.max(0, ch - sh);
      const hardMinTx = Math.min(0, cw - sw);
      const hardMinTy = Math.min(0, ch - sh);
      let spring = false;
      if (tx > hardMaxTx) { tx += (hardMaxTx - tx) * 0.3; spring = true; }
      if (tx < hardMinTx) { tx += (hardMinTx - tx) * 0.3; spring = true; }
      if (ty > hardMaxTy) { ty += (hardMaxTy - ty) * 0.3; spring = true; }
      if (ty < hardMinTy) { ty += (hardMinTy - ty) * 0.3; spring = true; }
      if (Math.abs(velocityX) < MIN_VELOCITY && Math.abs(velocityY) < MIN_VELOCITY && !spring) {
        cancelMomentum();
        return;
      }
      momentumRaf = requestAnimationFrame(step);
    }
    momentumRaf = requestAnimationFrame(step);
  }

  function cancelMomentum() {
    if (momentumRaf !== null) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = null;
    }
    velocityX = 0;
    velocityY = 0;
  }

  function getDist(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPointerDown(e: PointerEvent) {
    cancelMomentum();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      isDragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
    if (pointers.size === 2) {
      isDragging = false;
      const pts = [...pointers.values()];
      lastPinchDist = getDist(pts[0], pts[1]);
    }
    if (containerEl) containerEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && isDragging) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      // Detect if drag actually moved significantly
      if (!dragMoved && (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD || Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD)) {
        dragMoved = true;
      }
      tx += dx;
      ty += dy;
      const now = Date.now();
      const dt = now - lastMoveTime || 16;
      velocityX = dx / dt * 16;
      velocityY = dy / dt * 16;
      lastMoveTime = now;
      // Don't hard-clamp during drag — let user overscroll
      overScrollClamp();
    }

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const newDist = getDist(pts[0], pts[1]);
      const newCx = (pts[0].x + pts[1].x) / 2;
      const newCy = (pts[0].y + pts[1].y) / 2;
      if (lastPinchDist > 0) {
        const scaleFactor = newDist / lastPinchDist;
        const newScale = Math.max(minScale, Math.min(maxScale, scale * scaleFactor));
        const rect = containerEl!.getBoundingClientRect();
        const cx = newCx - rect.left;
        const cy = newCy - rect.top;
        tx = cx - (cx - tx) * (newScale / scale);
        ty = cy - (cy - ty) * (newScale / scale);
        scale = newScale;
        // Hard-clamp on zoom to prevent losing the map
        hardClamp();
        velocityX = 0;
        velocityY = 0;
      }
      lastPinchDist = newDist;
    }
  }

  function overScrollClamp() {
    if (!imgEl || !containerEl) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const iw = imgEl.naturalWidth || 2834;
    const ih = imgEl.naturalHeight || 1984;
    const sw = iw * scale;
    const sh = ih * scale;
    const OVERSCROLL = 120;
    const maxTx = Math.max(0, cw - sw) + OVERSCROLL;
    const maxTy = Math.max(0, ch - sh) + OVERSCROLL;
    const minTx = Math.min(0, cw - sw) - OVERSCROLL;
    const minTy = Math.min(0, ch - sh) - OVERSCROLL;
    tx = Math.max(minTx, Math.min(maxTx, tx));
    ty = Math.max(minTy, Math.min(maxTy, ty));
  }

  function hardClamp() {
    if (!imgEl || !containerEl) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const iw = imgEl.naturalWidth || 2834;
    const ih = imgEl.naturalHeight || 1984;
    const sw = iw * scale;
    const sh = ih * scale;
    const maxTx = Math.max(0, cw - sw);
    const maxTy = Math.max(0, ch - sh);
    const minTx = Math.min(0, cw - sw);
    const minTy = Math.min(0, ch - sh);
    tx = Math.max(minTx, Math.min(maxTx, tx));
    ty = Math.max(minTy, Math.min(maxTy, ty));
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && isDragging) {
      isDragging = false;
      // Soft-spring to hard bounds
      hardClamp();
      if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
        startMomentum();
      }
    }
    if (containerEl && pointers.size === 0) {
      containerEl.releasePointerCapture(e.pointerId);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    cancelMomentum();
    const rect = containerEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = -e.deltaY * 0.005;
    const newScale = Math.max(minScale, Math.min(maxScale, scale * (1 + delta)));
    tx = cx - (cx - tx) * (newScale / scale);
    ty = cy - (cy - ty) * (newScale / scale);
    scale = newScale;
    hardClamp();
  }

  function onDblClick(e: MouseEvent) {
    e.preventDefault();
    cancelMomentum();
    const rect = containerEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const targetScale = scale > minScale * 1.5 ? minScale : Math.min(maxScale, minScale * 2.5);
    tx = cx - (cx - tx) * (targetScale / scale);
    ty = cy - (cy - ty) * (targetScale / scale);
    scale = targetScale;
    hardClamp();
  }

  function onOverlayPointerDown(e: PointerEvent) {
    // Trap all pointers on the overlay to prevent browser gestures
    if (e.target === e.currentTarget) {
      e.preventDefault();
    }
  }

  function stopTouchPropagation(e: TouchEvent) {
    // Block touch events from bubbling to App.svelte's swipe handlers on <main>
    e.stopPropagation();
  }
</script>

{#if isOpen}
  <div
    class="map-overlay"
    class:closing
    role="dialog"
    aria-modal="true"
    aria-label={t.mapViewerLabel}
    tabindex="-1"
    onpointerdown={onOverlayPointerDown}
    ontouchstart={stopTouchPropagation}
    ontouchmove={stopTouchPropagation}
    ontouchend={stopTouchPropagation}
  >
    <button
      type="button"
      class="close-btn"
      onclick={handleClose}
      aria-label={t.closeMap}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="map-viewport"
      bind:this={containerEl}
      onwheel={onWheel}
      ondblclick={onDblClick}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      {#if !mapLoaded}
        <div class="map-loading">
          <div class="skeleton-spinner"></div>
        </div>
      {/if}
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <img
        bind:this={imgEl}
        class="map-img"
        class:loaded={mapLoaded}
        src={mapSrc}
        alt={t.mapViewerLabel}
        style="transform: translate3d({tx}px, {ty}px, 0) scale({scale}); transform-origin: 0 0;"
        onload={onImgLoad}
        draggable="false"
      />
    </div>
  </div>
{/if}

<style>
  .map-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #343b41;
    opacity: 1;
    transform: scale(1);
    transition: opacity 150ms ease-out, transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    overscroll-behavior: none;

    @starting-style {
      opacity: 0;
      transform: scale(0.96);
    }
  }
  .map-overlay.closing {
    opacity: 0;
    transform: scale(0.96);
  }
  .close-btn {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border: none;
    border-radius: 8px;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    color: rgba(255,255,255,0.85);
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;
    touch-action: auto;
  }
  .close-btn:active {
    transform: scale(0.92);
    background: rgba(0,0,0,0.7);
  }
  .close-btn svg {
    width: 18px;
    height: 18px;
  }
  .map-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
    position: relative;
  }
  .map-viewport:active {
    cursor: grabbing;
  }
  .map-img {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0;
    transition: opacity 150ms ease;
    image-rendering: auto;
  }
  .map-img.loaded {
    opacity: 1;
  }
  .map-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .skeleton-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255,255,255,0.15);
    border-top-color: rgba(255,255,255,0.55);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .map-overlay {
      transition: opacity 160ms ease;
      transform: none;
    }
    .map-overlay.closing {
      opacity: 0;
      transform: none;
    }
    .skeleton-spinner {
      animation: none;
      opacity: 0.5;
    }
  }
</style>
