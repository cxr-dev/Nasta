<script lang="ts">
  import Sheet from './Sheet.svelte';
  import type { Page, Segment } from '../types/page';
  import { reorderSegments } from '../stores/pageStore.svelte';
  import { getT } from '../stores/localeStore.svelte';

  let {
    isOpen,
    page,
    onClose,
  }: { isOpen: boolean; page: Page | null; onClose: () => void } = $props();

  let t = $derived(getT());
  let dragIndex = $state<number | null>(null);

  function move(index: number, delta: number) {
    if (!page) return;
    const target = index + delta;
    if (target < 0 || target >= page.segments.length) return;
    reorderSegments(page.id, index, target);
  }

  function drop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      dragIndex = null;
      return;
    }
    if (page) reorderSegments(page.id, dragIndex, index);
    dragIndex = null;
  }

  function label(segment: Segment): string {
    return segment.journeyMeta
      ? `Journey · ${segment.journeyMeta.destLabel}`
      : `Departure · ${segment.line} · ${segment.fromStop.name}`;
  }
</script>

<Sheet {isOpen} title={t.reorderCards ?? 'Reorder cards'} closeAriaLabel={t.closePanel ?? 'Close panel'} {onClose}>
  {#snippet children()}
    <div class="order-content">
      <p class="order-description">{t.manualOrderDescription ?? 'Manual order is saved for this page. Grouping changes how cards are presented while preserving this order.'}</p>
      {#if page}
        <ol class="order-list" aria-label={t.reorderCards ?? 'Reorder cards'}>
          {#each page.segments as segment, index (segment.id)}
            <li
              class="order-row"
              draggable="true"
              ondragstart={() => dragIndex = index}
              ondragover={(event) => event.preventDefault()}
              ondrop={() => drop(index)}
              ondragend={() => dragIndex = null}
            >
              <button class="drag-handle" type="button" aria-label={`${t.reorderCards ?? 'Reorder cards'}: ${label(segment)}`}>
                <span aria-hidden="true">☷</span>
              </button>
              <span class="order-label">{label(segment)}</span>
              <button type="button" class="move-button" disabled={index === 0} aria-label={`${t.moveUp ?? 'Move up'}: ${label(segment)}`} onclick={() => move(index, -1)}>↑</button>
              <button type="button" class="move-button" disabled={index === page.segments.length - 1} aria-label={`${t.moveDown ?? 'Move down'}: ${label(segment)}`} onclick={() => move(index, 1)}>↓</button>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/snippet}
</Sheet>

<style>
  .order-content { padding: 16px; overflow: auto; }
  .order-description { margin: 0 0 14px; color: var(--text-muted); font-size: 13px; line-height: 1.45; }
  .order-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .order-row { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 6px; border: 1px solid var(--border); border-radius: var(--radius-md, 12px); background: var(--surface); }
  .drag-handle, .move-button { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; border: 0; border-radius: 9px; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 18px; }
  .drag-handle { cursor: grab; touch-action: none; }
  .order-label { flex: 1; min-width: 0; color: var(--text); font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .move-button:disabled { color: var(--text-ghost); cursor: default; opacity: .45; }
  .drag-handle:hover, .drag-handle:focus-visible, .move-button:hover:not(:disabled), .move-button:focus-visible:not(:disabled) { background: var(--accent-subtle); color: var(--accent); outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
