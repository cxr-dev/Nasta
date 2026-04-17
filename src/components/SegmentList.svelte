<script lang="ts">
  import type { Route, Segment, TransportType } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  import { transportIcons } from '../icons/transport';
  import { t } from '../stores/localeStore';
  
  let { route }: { route: Route } = $props();
  
  let draggingIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  
  function removeSegment(segmentId: string) {
    routeStore.removeSegment(route.id, segmentId);
  }

  function updateTransferBuffer(segmentId: string, value: string) {
    const parsed = Number.parseInt(value, 10);
    const nextValue = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    routeStore.updateSegmentTransferBuffer(route.id, segmentId, nextValue);
  }
  
  function handleDragStart(e: DragEvent, index: number) {
    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }
  
  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
  }
  
  function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== toIndex) {
      routeStore.reorderSegments(route.id, draggingIndex, toIndex);
    }
    draggingIndex = null;
    dragOverIndex = null;
  }
  
  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
  }
  
  function handleTouchStart(e: TouchEvent, index: number) {
    draggingIndex = index;
  }
  
  function handleTouchMove(e: TouchEvent) {
    if (draggingIndex === null) return;
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const item = element.closest('[data-drag-index]');
      if (item) {
        const newIndex = parseInt(item.getAttribute('data-drag-index') || '0', 10);
        if (!isNaN(newIndex) && newIndex !== dragOverIndex) {
          dragOverIndex = newIndex;
        }
      }
    }
  }
  
  function handleTouchEnd() {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      routeStore.reorderSegments(route.id, draggingIndex, dragOverIndex);
    }
    draggingIndex = null;
    dragOverIndex = null;
  }
  
  function getIcon(type: string): string {
    return transportIcons[type as keyof typeof transportIcons] || transportIcons.bus;
  }

  function getLineBadge(transportType: TransportType, line: string): string {
    switch (transportType) {
      case 'metro': return `T${line}`;
      case 'train': return `J${line}`;
      default: return line;
    }
  }

</script>

<div class="segment-list">
  {#if !route.segments || route.segments.length === 0}
    <p class="empty">{$t.addSegmentHint}</p>
  {:else}
    {#each route.segments as segment, index (segment.id)}
      <div 
        class="segment"
        class:dragging={draggingIndex === index}
        class:drag-over={dragOverIndex === index}
        data-drag-index={index}
        draggable="true"
        role="listitem"
        ondragstart={(e) => handleDragStart(e, index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
        ontouchstart={(e) => handleTouchStart(e, index)}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
      >
        <div class="drag-handle">⋮⋮</div>
        <div class="segment-icon" data-type={segment.transportType}>
          <svg viewBox="0 0 24 24" fill="currentColor" class="transport-icon">
            {@html getIcon(segment.transportType)}
          </svg>
        </div>
        <div class="segment-info">
          <div class="segment-line">
            {segment.lineName}
            <span class="seg-badge">{getLineBadge(segment.transportType, segment.line)}</span>
          </div>
          <div class="segment-route">
            {segment.fromStop.name} → {segment.toStop.name}
          </div>
          <div class="segment-dir">{segment.directionText}</div>
          {#if index < route.segments.length - 1}
            <label class="buffer-row">
              <span class="buffer-label">{$t.transferBuffer}</span>
              <div class="buffer-input-wrap">
                <input
                  class="buffer-input"
                  type="number"
                  min="0"
                  max="60"
                  value={segment.transferBufferMinutes ?? 0}
                  oninput={(e) => updateTransferBuffer(segment.id, (e.currentTarget as HTMLInputElement).value)}
                  aria-label={`${$t.transferBuffer}: ${segment.fromStop.name}`}
                />
                <span class="buffer-unit">{$t.minutesShort}</span>
              </div>
            </label>
          {/if}
        </div>
        <button 
          class="remove-btn" 
          onclick={() => removeSegment(segment.id)}
          aria-label={$t.remove}
        >
          ×
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .segment-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    padding: 20px;
  }

  .segment {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    background: var(--bg);
    border-radius: 10px;
    border: 1px solid var(--border);
    cursor: grab;
    touch-action: none;
    transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  }

  .segment.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }

  .segment.drag-over {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .drag-handle {
    color: var(--text-secondary);
    font-size: 18px;
    cursor: grab;
    padding: 4px;
  }

  .segment-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .segment-icon {
    background: var(--accent-subtle);
  }

  .segment-icon .transport-icon {
    width: 18px;
    height: 18px;
    fill: var(--accent);
  }

  .segment-info {
    flex: 1;
    min-width: 0;
  }

  .segment-line {
    font-weight: 600;
    font-size: 15px;
    color: var(--text);
  }

  .segment-route {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .segment-dir {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .buffer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
  }

  .buffer-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .buffer-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .buffer-input {
    width: 56px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    text-align: right;
  }

  .buffer-unit {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background: var(--danger);
  }

  .seg-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    border-radius: 5px;
    padding: 2px 6px;
    margin-left: 6px;
    background: var(--accent-subtle);
    color: var(--accent);
  }
</style>
