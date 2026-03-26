<script lang="ts">
  import type { Route, TransportType, Stop } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  import { fade, fly, scale } from 'svelte/transition';
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';
  
  let { route, isFullScreen = false, onClose = () => {} }: { 
    route: Route; 
    isFullScreen?: boolean;
    onClose?: () => void;
  } = $props();

  let showSearch = $state(false);
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function addSegment(
    line: string,
    lineName: string,
    directionText: string,
    fromStop: Stop,
    toStop: Stop,
    transportType: TransportType
  ) {
    routeStore.addSegment(route.id, {
      line,
      lineName,
      directionText,
      fromStop,
      toStop,
      transportType
    });
    showSearch = false;
  }

  function handleDragStart(e: DragEvent, index: number) {
    draggedIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      routeStore.reorderSegments(route.id, draggedIndex, toIndex);
    }
    draggedIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dragOverIndex = null;
  }

  function reverseRoute() {
    const segments = [...route.segments].reverse();
    segments.forEach((segment, newIndex) => {
      routeStore.removeSegment(route.id, segment.id);
    });
    segments.forEach(segment => {
      routeStore.addSegment(route.id, {
        line: segment.line,
        lineName: segment.lineName,
        directionText: segment.directionText,
        fromStop: segment.toStop,
        toStop: segment.fromStop,
        transportType: segment.transportType
      });
    });
  }

  function deleteSegment(segmentId: string) {
    routeStore.removeSegment(route.id, segmentId);
  }
</script>

<div class="route-editor" class:fullscreen={isFullScreen}>
  {#if isFullScreen}
    <div class="modal-header">
      <button class="close-btn" onclick={onClose} aria-label="Stäng">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
        </svg>
      </button>
      <h2>Redigera: {route.name}</h2>
    </div>
  {:else}
    <div class="editor-header">
      <h2>{route.name}</h2>
      <p class="direction-hint">
        {route.direction === 'toWork' ? 'Till arbetet' : 'Hem från arbetet'}
      </p>
    </div>
  {/if}

  {#if route.segments.length > 0}
    <div class="segment-list">
      <h3>Dina segment</h3>
      <p class="hint">Drag för att flytta • Tryck för att ta bort</p>
      
      {#each route.segments as segment, index (segment.id)}
        <div 
          class="segment-item"
          class:dragging={draggedIndex === index}
          class:drag-over={dragOverIndex === index}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          role="listitem"
        >
          <div class="drag-handle">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
            </svg>
          </div>
          
          <div class="segment-info">
            <span class="segment-line">{segment.line}</span>
            <span class="segment-route">{segment.fromStop.name} → {segment.toStop.name}</span>
          </div>
          
          <button 
            class="delete-segment" 
            onclick={() => deleteSegment(segment.id)}
            aria-label="Ta bort segment"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="add-segment">
    {#if !showSearch}
      <button class="add-btn" onclick={() => showSearch = true}>
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
        </svg>
        Lägg till segment
      </button>
    {:else}
      <div class="search-container" in:fly={{ y: 20, duration: 200 }}>
        <SegmentSearch onSelect={addSegment} />
        <button class="cancel-search" onclick={() => showSearch = false}>
          Avbryt
        </button>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="reverse-btn" onclick={reverseRoute}>
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" fill="currentColor"/>
      </svg>
      Vänd rutt
    </button>
    <button class="test-btn">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M8 5v14l11-7z" fill="currentColor"/>
      </svg>
      Testa rutt
    </button>
  </div>
</div>

<style>
  .route-editor {
    background: var(--surface, #FFFFFF);
    border-radius: 16px;
    padding: 20px;
  }

  .route-editor.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0;
    z-index: 2000;
    background: var(--bg, #FAFBFC);
    overflow-y: auto;
    padding: 20px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border, #E5E7EB);
  }

  .close-btn {
    background: transparent;
    border: none;
    padding: 8px;
    cursor: pointer;
    border-radius: 8px;
    color: var(--text, #1F2937);
  }

  .close-btn:hover {
    background: var(--border, #E5E7EB);
  }

  .editor-header {
    margin-bottom: 20px;
  }

  h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
    color: var(--text, #1F2937);
  }

  .direction-hint {
    font-size: 14px;
    color: var(--text-secondary, #6B7280);
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary, #6B7280);
    margin-bottom: 8px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-secondary, #6B7280);
    opacity: 0.7;
    margin-bottom: 16px;
  }

  .segment-list {
    margin-bottom: 24px;
  }

  .segment-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: var(--surface, #FFFFFF);
    border: 1px solid var(--border, #E5E7EB);
    border-radius: 12px;
    margin-bottom: 8px;
    cursor: grab;
    transition: all 0.2s ease;
  }

  .segment-item:hover {
    border-color: var(--accent, #2563EB);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1);
  }

  .segment-item.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }

  .segment-item.drag-over {
    border-color: var(--accent, #2563EB);
    background: var(--accent-light, #DBEAFE);
  }

  .drag-handle {
    color: var(--text-secondary, #6B7280);
    cursor: grab;
  }

  .segment-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .segment-line {
    background: var(--text, #1F2937);
    color: var(--surface, #FFFFFF);
    font-size: 13px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    min-width: 28px;
    text-align: center;
  }

  .segment-route {
    font-size: 14px;
    color: var(--text, #1F2937);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-segment {
    background: transparent;
    border: none;
    padding: 6px;
    cursor: pointer;
    border-radius: 6px;
    color: var(--danger, #DC2626);
    opacity: 0.6;
    transition: all 0.2s ease;
  }

  .delete-segment:hover {
    opacity: 1;
    background: rgba(220, 38, 38, 0.1);
  }

  .add-segment {
    margin-bottom: 20px;
  }

  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: var(--accent-light, #DBEAFE);
    border: 2px dashed var(--accent, #2563EB);
    border-radius: 12px;
    color: var(--accent, #2563EB);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-btn:hover {
    background: var(--accent, #2563EB);
    color: white;
    border-style: solid;
  }

  .search-container {
    background: var(--surface, #FFFFFF);
    border: 1px solid var(--border, #E5E7EB);
    border-radius: 12px;
    padding: 16px;
  }

  .cancel-search {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    background: transparent;
    border: 1px solid var(--border, #E5E7EB);
    border-radius: 8px;
    color: var(--text-secondary, #6B7280);
    font-size: 14px;
    cursor: pointer;
  }

  .actions {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--border, #E5E7EB);
  }

  .reverse-btn,
  .test-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reverse-btn {
    background: var(--border, #E5E7EB);
    border: none;
    color: var(--text, #1F2937);
  }

  .reverse-btn:hover {
    background: var(--text-secondary, #6B7280);
    color: white;
  }

  .test-btn {
    background: var(--accent, #2563EB);
    border: none;
    color: white;
  }

  .test-btn:hover {
    background: #1D4ED8;
  }

  @media (prefers-reduced-motion: reduce) {
    .segment-item,
    .add-btn {
      transition: none;
    }
  }
</style>