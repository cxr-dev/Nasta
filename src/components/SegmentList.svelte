<script lang="ts">
  import type { Page, Segment, TransportType } from '../types/page';
  import { removeSegment as storeRemoveSegment, reorderSegments } from '../stores/pageStore.svelte';
  import { getT } from '../stores/localeStore.svelte';
  import { gripVertical } from '../icons/departureIcons';
  import TransportIcon from './TransportIcon.svelte';
  import gsap from 'gsap';

  let t = $derived(getT());

  let { page }: { page: Page } = $props();

let listEl = $state<HTMLDivElement>();

  let expandedId = $state<string | null>(null);
  let draggingIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let dropInsertIndex = $state<number | null>(null);
  let isLongPressing = $state(false);
  let dragStartY = 0;
  let dragStartX = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function removeSegment(segmentId: string) {
    if (expandedId === segmentId) expandedId = null;
    storeRemoveSegment(page.id, segmentId);
  }

  // ── HTML5 Drag (desktop) ──────────────────────────────────────────────────
  function handleDragStart(e: DragEvent, index: number) {
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
    clearTimeout(longPressTimer);
    if (isLongPressing) isLongPressing = false;
    const touch = e.touches[0];
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

  function handleTouchEnd() {
    if (draggingIndex === null) return;
    clearTimeout(longPressTimer);
    isLongPressing = false;
    const el = document.querySelector(`[data-drag-index="${draggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, { x: 0, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      el.style.pointerEvents = '';
    }
    if (dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      reorderSegments(page.id, draggingIndex, dragOverIndex);
    }
    draggingIndex = null;
    dragOverIndex = null;
    dropInsertIndex = null;
  }

  $effect(() => {
    const el = listEl;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  });

  function getLineBadge(transportType: TransportType, line: string): string {
    switch (transportType) {
      case 'metro': return `T${line}`;
      case 'train': return `J${line}`;
      default: return '';
    }
  }

  function primaryLineText(segment: Segment): string {
    const fallback = segment.line;
    if (!segment.lineName) return fallback;
    return segment.lineName;
  }

  function showLineBadge(segment: Segment): boolean {
    const badge = getLineBadge(segment.transportType, segment.line);
    if (!badge) return false;
    return !primaryLineText(segment).includes(badge);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="segment-list"
  role="list"
  bind:this={listEl}
  ontouchend={handleTouchEnd}
>
  {#if !page.segments || page.segments.length === 0}
    <p class="empty">{t.addSegmentHint}</p>
  {:else}
    {#each page.segments as segment, index (segment.id)}
      {@const isExpanded = expandedId === segment.id}
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
      <div
        class="segment"
        class:expanded={isExpanded}
        class:dragging={draggingIndex === index}
        class:drag-over={dragOverIndex === index && draggingIndex !== index}
        data-drag-index={index}
        draggable="true"
        role="listitem"
        ondragstart={(e) => handleDragStart(e, index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="segment-body"
          onclick={() => { if (draggingIndex === null) toggleExpand(segment.id); }}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(segment.id); }}
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
          aria-label={`${primaryLineText(segment)} ${segment.fromStop.name} → ${segment.toStop.name}`}
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
              {#if !isExpanded}
                <span class="seg-dest">
                  {segment.fromStop.name} → {segment.direction?.destination ?? segment.toStop.name}
                </span>
              {:else if showLineBadge(segment)}
                <span class="seg-badge">{getLineBadge(segment.transportType, segment.line)}</span>
              {/if}
            </div>
            {#if isExpanded}
              <div class="segment-route">
                {segment.fromStop.name} → {segment.toStop.name}
              </div>
              <div class="segment-dir">{segment.direction?.destination}</div>
              <button
                type="button"
                class="remove-btn"
                onclick={() => removeSegment(segment.id)}
                aria-label={t.remove}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M4 4v9.5a1 1 0 001 1h6a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" fill="none"/>
                </svg>
                {t.remove}
              </button>
            {/if}
          </div>
          <div class="segment-right">
            <span class="expand-chevron" class:open={isExpanded}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </span>
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

  .segment {
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-tap-highlight-color: transparent;
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

  .segment.expanded .segment-body {
    align-items: flex-start;
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

  .seg-badge {
    font-size: 10px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 6px;
    background: var(--accent-subtle);
    color: var(--accent);
    flex-shrink: 0;
  }

  .segment-route {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 2px;
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

  .expand-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .expand-chevron.open {
    transform: rotate(180deg);
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

  .remove-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .remove-btn:hover {
    color: var(--color-error);
    border-color: var(--color-error);
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
    .expand-chevron {
      transition: none;
    }
    .segment {
      transition: none;
    }
    .drop-ghost {
      animation: none;
    }
  }
</style>
