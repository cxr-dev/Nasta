<script lang="ts">
  import type { Page, Segment } from '../types/page';
  import { removeSegment as storeRemoveSegment, reorderSegments } from '../stores/pageStore.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import { gripVertical } from '../icons/departureIcons';
  import TransportIcon from './TransportIcon.svelte';
  import gsap from 'gsap';

  let t = $derived(getT());

  let { page, onAddSegment }: { page: Page; onAddSegment?: () => void } = $props();

let listEl = $state<HTMLDivElement>();

  let draggingIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let dropInsertIndex = $state<number | null>(null);
  let isLongPressing = $state(false);
  let dragStartY = 0;
  let dragStartX = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Swipe-to-delete state ─────────────────────────────────────────────────
  const SWIPE_THRESHOLD = 8;
  const REVEAL_THRESHOLD = 60;
  const COMMIT_THRESHOLD = 120;
  const DELETE_ACTION_WIDTH = 80;

  let swipingSegmentId = $state<string | null>(null);
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeCurrentDx = 0;
  let swipeIntent = $state(false);
  let revealedSegmentId = $state<string | null>(null);

  function handleSegmentTouchStart(e: TouchEvent, segmentId: string) {
    // Ignore if drag-handle was the target (stopPropagation already blocks, but be safe)
    if ((e.target as HTMLElement).closest('.drag-handle')) return;
    if (draggingIndex !== null) return;
    if (e.touches.length !== 1) return;

    // Dismiss previously revealed segment
    if (revealedSegmentId && revealedSegmentId !== segmentId) {
      const prevEl = document.querySelector(`[data-swipe-id="${revealedSegmentId}"]`) as HTMLElement | null;
      if (prevEl) {
        gsap.killTweensOf(prevEl);
        gsap.to(prevEl, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      }
      revealedSegmentId = null;
    }

    swipingSegmentId = segmentId;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeIntent = false;
  }

  function handleSegmentTouchMove(e: TouchEvent, segmentId: string) {
    if (swipingSegmentId !== segmentId) return;
    if (e.touches.length !== 1) {
      cancelSwipe();
      return;
    }

    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;

    // Vertical takes priority → cancel swipe
    if (!swipeIntent && Math.abs(dy) > Math.abs(dx)) {
      cancelSwipe();
      return;
    }
    // Horizontal deadzone
    if (!swipeIntent && Math.abs(dx) < SWIPE_THRESHOLD) return;

    swipeIntent = true;
    e.preventDefault(); // prevent scroll while swiping

    // Only allow swiping left (negative dx), clamp to -COMMIT_THRESHOLD
    const clampedDx = Math.max(dx, -COMMIT_THRESHOLD);
    swipeCurrentDx = clampedDx;
    const el = document.querySelector(`[data-swipe-id="${segmentId}"]`) as HTMLElement | null;
    if (el) {
      gsap.set(el, { x: clampedDx });
    }
  }

  function handleSegmentTouchEnd(e: TouchEvent, segmentId: string) {
    if (swipingSegmentId !== segmentId) return;

    const dx = swipeCurrentDx;

    const el = document.querySelector(`[data-swipe-id="${segmentId}"]`) as HTMLElement | null;

    if (!swipeIntent || dx > -REVEAL_THRESHOLD) {
      // Not enough movement — snap back
      if (el) {
        gsap.killTweensOf(el);
        gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      }
      revealedSegmentId = null;
    } else if (dx <= -COMMIT_THRESHOLD) {
      // Full swipe → delete
      navigator.vibrate?.(10);
      if (el) {
        gsap.killTweensOf(el);
        gsap.to(el, {
          x: -el.offsetWidth,
          opacity: 0,
          duration: 0.25,
          ease: 'power2.out',
          onComplete: () => removeSegment(segmentId),
        });
      } else {
        removeSegment(segmentId);
      }
      revealedSegmentId = null;
    } else {
      // Partial swipe → reveal delete action
      if (el) {
        gsap.killTweensOf(el);
        gsap.to(el, { x: -DELETE_ACTION_WIDTH, duration: 0.2, ease: 'power2.out' });
      }
      revealedSegmentId = segmentId;
    }

    swipingSegmentId = null;
    swipeStartX = 0;
    swipeStartY = 0;
    swipeCurrentDx = 0;
    swipeIntent = false;
  }

  function cancelSwipe() {
    const el = swipingSegmentId
      ? (document.querySelector(`[data-swipe-id="${swipingSegmentId}"]`) as HTMLElement | null)
      : null;
    if (el) {
      gsap.killTweensOf(el);
      gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
    }
    swipingSegmentId = null;
    swipeStartX = 0;
    swipeStartY = 0;
    swipeCurrentDx = 0;
    swipeIntent = false;
  }

  // Reset revealed segment when page changes (via $effect tracking page.id)
  $effect(() => {
    revealedSegmentId = null;
  });

  function removeSegment(segmentId: string) {
    storeRemoveSegment(page.id, segmentId);
  }

  // ── HTML5 Drag (desktop) ──────────────────────────────────────────────────
  function handleDragStart(e: DragEvent, index: number) {
    // Dismiss any revealed segment before initiating drag
    dismissRevealed();
    draggingIndex = index;
    dropInsertIndex = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
    const el = e.currentTarget as HTMLElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      dropInsertIndex = e.clientY < midY ? index : index + 1;
    }
  }

  function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== toIndex) {
      reorderSegments(page.id, draggingIndex, toIndex);
    }
    draggingIndex = null;
    dragOverIndex = null;
    dropInsertIndex = null;
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dropInsertIndex = null;
  }

  // ── Touch Drag (mobile) — attached to the handle element ─────────────────
  function handleHandleTouchStart(e: TouchEvent, index: number) {
    e.stopPropagation(); // prevent the card's expand click from firing
    if (e.touches.length !== 1) return;
    // Dismiss any revealed segment before dragging
    dismissRevealed();
    draggingIndex = index;
    dropInsertIndex = null;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    const el = document.querySelector(`[data-drag-index="${index}"]`) as HTMLElement | null;
    if (el) {
      el.style.pointerEvents = 'none';
    }
    // long-press haptic
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      isLongPressing = true;
      navigator.vibrate?.(15);
      gsap.to('.drag-handle', {
        scale: 1.05,
        duration: 0.1,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
      });
    }, 300);
  }

  function handleTouchMove(e: TouchEvent) {
    if (draggingIndex === null) return;
    e.preventDefault(); // prevent scroll while dragging
    const touch = e.touches[0];
    if (Math.hypot(touch.clientX - dragStartX, touch.clientY - dragStartY) > 8) {
      clearTimeout(longPressTimer);
    }
    if (isLongPressing) isLongPressing = false;
    const el = document.querySelector(`[data-drag-index="${draggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, {
        x: touch.clientX - dragStartX,
        y: touch.clientY - dragStartY,
        duration: 0.08,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const item = element.closest('[data-drag-index]') as HTMLElement | null;
      if (item) {
        const newIndex = parseInt(item.getAttribute('data-drag-index') ?? '0', 10);
        if (!isNaN(newIndex) && newIndex !== dragOverIndex) {
          dragOverIndex = newIndex;
        }
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        dropInsertIndex = touch.clientY < midY ? newIndex : newIndex + 1;
      }
    }
  }

  function finishTouchDrag(commit: boolean) {
    if (draggingIndex === null) return;
    clearTimeout(longPressTimer);
    isLongPressing = false;
    const el = document.querySelector(`[data-drag-index="${draggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, { x: 0, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      el.style.pointerEvents = '';
    }
    if (commit && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      reorderSegments(page.id, draggingIndex, dragOverIndex);
    }
    draggingIndex = null;
    dragOverIndex = null;
    dropInsertIndex = null;
  }

  function handleTouchEnd() {
    finishTouchDrag(true);
  }

  function handleTouchCancel() {
    finishTouchDrag(false);
  }

  $effect(() => {
    const el = listEl;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  });

  function dismissRevealed() {
    if (!revealedSegmentId) return;
    const el = document.querySelector(`[data-swipe-id="${revealedSegmentId}"]`) as HTMLElement | null;
    if (el) {
      gsap.killTweensOf(el);
      gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
    }
    revealedSegmentId = null;
  }

  function primaryLineText(segment: Segment): string {
    const fallback = segment.line;
    if (!segment.lineName) return fallback;
    return segment.lineName;
  }

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="segment-list"
  role="list"
  bind:this={listEl}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchCancel}
>
  {#if !page.segments || page.segments.length === 0}
    {#if onAddSegment}
      <button
        class="empty-cta"
        onclick={onAddSegment}
        aria-label={t.addSegmentHint}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>{t.addSegmentHint}</span>
      </button>
    {:else}
      <p class="empty">{t.addSegmentHint}</p>
    {/if}
  {:else}
    {#each page.segments as segment, index (segment.id)}
      {@const isSwiping = swipingSegmentId === segment.id}
      {@const isDropHere = draggingIndex !== null && dropInsertIndex === index && dropInsertIndex !== draggingIndex}
      {#if isDropHere}
        <div class="drop-indicator" role="presentation">
          <div class="drop-indicator-line"></div>
          <div class="drop-ghost">
            <div class="drop-ghost-icon">
              <TransportIcon type={page.segments[draggingIndex!].transportType} size={16} />
            </div>
            <span class="drop-ghost-label">{primaryLineText(page.segments[draggingIndex!])}</span>
          </div>
        </div>
      {/if}
      <!-- Swipe container -->
      <div class="segment-swipe-container">
        <!-- Delete action behind -->
        <div
          class="segment-delete-action"
          class:visible={revealedSegmentId === segment.id || (isSwiping && swipeIntent)}
          aria-hidden={revealedSegmentId !== segment.id}
          onclick={() => {
            navigator.vibrate?.(10);
            removeSegment(segment.id);
          }}
          role="button"
          tabindex={revealedSegmentId === segment.id ? 0 : -1}
        >
          <span>{t.remove}</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="segment"
          class:dragging={draggingIndex === index}
          class:drag-over={dragOverIndex === index && draggingIndex !== index}
          data-drag-index={index}
          data-swipe-id={segment.id}
          draggable="true"
          role="listitem"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          ontouchstart={(e) => handleSegmentTouchStart(e, segment.id)}
          ontouchmove={(e) => handleSegmentTouchMove(e, segment.id)}
          ontouchend={(e) => handleSegmentTouchEnd(e, segment.id)}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="segment-body"
          >
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="drag-handle no-scale"
              class:long-pressing={isLongPressing}
              aria-hidden="true"
              ontouchstart={(e) => handleHandleTouchStart(e, index)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                {@html gripVertical}
              </svg>
            </div>
            <div class="segment-icon">
              <TransportIcon type={segment.transportType} size={18} />
            </div>
            <div class="segment-meta">
              <div class="segment-line">
                <span class="line-name">{primaryLineText(segment)}</span>
                <span class="seg-dest">
                  {segment.fromStop.name} → {segment.direction?.destination ?? segment.toStop.name}
                </span>
              </div>
              <div class="segment-dir">{segment.direction?.destination}</div>
            </div>
            <div class="segment-right">
              <button
                type="button"
                class="segment-delete-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  navigator.vibrate?.(10);
                  removeSegment(segment.id);
                }}
                aria-label={t.remove}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M4 4v9.5a1 1 0 001 1h6a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" fill="none"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    {/each}
    {#if draggingIndex !== null && dropInsertIndex === page.segments.length && dropInsertIndex !== draggingIndex}
      <div class="drop-indicator" role="presentation">
        <div class="drop-indicator-line"></div>
        <div class="drop-ghost">
          <div class="drop-ghost-icon">
            <TransportIcon type={page.segments[draggingIndex].transportType} size={16} />
          </div>
          <span class="drop-ghost-label">{primaryLineText(page.segments[draggingIndex])}</span>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .segment-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    padding: 20px;
  }

  .empty-cta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 16px;
    border-radius: var(--radius-md);
    border: 2px dashed var(--border);
    background: transparent;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .empty-cta:hover,
  .empty-cta:active {
    background: var(--accent-subtle);
    border-color: var(--accent);
  }

  /* ── Swipe container ─────────────────────────────────────────────── */
  .segment-swipe-container {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-md);
  }

  .segment-delete-action {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-error);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
    font-family: inherit;
    border: none;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .segment-delete-action.visible {
    opacity: 1;
  }

  .segment-delete-action:active {
    opacity: 0.8;
  }

  .segment {
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    z-index: 1;
  }

  .segment.dragging {
    opacity: 0.5;
  }

  .segment.drag-over {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .segment-body {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 14px;
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .segment-body:hover {
    background: var(--accent-subtle);
  }

  .segment-icon {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .segment-meta {
    flex: 1;
    min-width: 0;
  }

  .segment-line {
    font-weight: 700;
    font-size: 15px;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .line-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .segment-dir {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 1px;
  }

  .segment-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .seg-dest {
    font-size: 13px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .drag-handle {
    color: var(--text-muted);
    cursor: grab;
    padding: 4px 2px;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .segment-delete-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 150ms, background 150ms;
    -webkit-tap-highlight-color: transparent;
    font-family: inherit;
  }

  .segment-delete-btn:hover {
    color: var(--color-error);
    background: color-mix(in oklch, var(--color-error) 10%, transparent);
  }

  .drop-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    pointer-events: none;
  }

  .drop-indicator-line {
    flex: 1;
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
    opacity: 0.6;
  }

  .drop-ghost {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1.5px dashed var(--accent);
    background: color-mix(in oklch, var(--accent) 8%, transparent);
    opacity: 0.5;
    flex-shrink: 0;
    animation: ghost-in 0.2s ease-out;
  }

  .drop-ghost-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-subtle);
    color: var(--accent);
    flex-shrink: 0;
  }

  .drop-ghost-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .drag-handle.long-pressing {
    color: var(--accent);
  }

  @keyframes ghost-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 0.5;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .segment {
      transition: none;
    }
    .segment-delete-action {
      transition: none;
    }
    .drop-ghost {
      animation: none;
    }
  }
</style>
