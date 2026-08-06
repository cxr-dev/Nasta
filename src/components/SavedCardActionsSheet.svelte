<script lang="ts">
  import { tick } from 'svelte';
  import Sheet from './Sheet.svelte';
  import type { Page, Segment } from '../types/page';
  import type { SavedCardActionId } from '../lib/savedCardActions';
  import { getSavedCardActions, getSavedCardKind } from '../lib/savedCardActions';
  import { getT } from '../stores/localeStore.svelte';

  type Props = {
    isOpen: boolean;
    segment: Segment | null;
    pages: Page[];
    currentPageId: string | null;
    trigger?: HTMLElement | null;
    onClose: () => void;
    onAction: (action: SavedCardActionId) => void;
    onMove: (pageId: string) => void;
  };

  let {
    isOpen,
    segment,
    pages,
    currentPageId,
    trigger = null,
    onClose,
    onAction,
    onMove,
  }: Props = $props();

  let t = $derived(getT());
  let showingPages = $state(false);
  let actionListEl = $state<HTMLDivElement | undefined>();
  let pageListEl = $state<HTMLDivElement | undefined>();
  let presentationMode = $state<'sheet' | 'popover'>('sheet');

  $effect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updateMode = () => {
      presentationMode = window.innerWidth >= 768 && pointerQuery.matches ? 'popover' : 'sheet';
    };
    updateMode();
    pointerQuery.addEventListener('change', updateMode);
    window.addEventListener('resize', updateMode);
    return () => {
      pointerQuery.removeEventListener('change', updateMode);
      window.removeEventListener('resize', updateMode);
    };
  });

  let kind = $derived(segment ? getSavedCardKind(segment) : 'departure');
  let actions = $derived(segment ? getSavedCardActions(segment, pages, {
    edit: kind === 'journey' ? (t.editJourney ?? 'Edit journey') : (t.editDeparture ?? 'Edit departure'),
    move: t.moveToPage ?? 'Move to page',
    remove: kind === 'journey' ? (t.removeJourney ?? 'Remove journey') : (t.removeDeparture ?? 'Remove departure'),
  }) : []);
  let title = $derived(showingPages ? (t.moveToPage ?? 'Move to page') : (t.moreActions ?? 'More actions'));

  function focusInitial() {
    tick().then(() => {
      const list = showingPages ? pageListEl : actionListEl;
      list?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });
  }

  $effect(() => {
    if (!isOpen) {
      showingPages = false;
      return;
    }
    focusInitial();
  });

  function close() {
    const restoreTarget = trigger;
    showingPages = false;
    onClose();
    tick().then(() => restoreTarget?.focus());
  }

  function chooseAction(action: SavedCardActionId) {
    if (action === 'move') {
      showingPages = true;
      focusInitial();
      return;
    }
    onAction(action);
    close();
  }

  function choosePage(pageId: string) {
    if (pageId === currentPageId) return;
    showingPages = false;
    onMove(pageId);
    close();
  }
</script>

<Sheet
  {isOpen}
  title={title}
  closeAriaLabel={t.closePanel ?? 'Close panel'}
  onClose={close}
  sheetClass="saved-card-actions-sheet"
  mode={presentationMode}
  anchor={trigger}
>
  {#snippet children()}
    {#if showingPages}
      <div class="sheet-content" aria-label={t.moveToPage ?? 'Move to page'}>
        <div bind:this={pageListEl} class="action-list" role="listbox" aria-label={t.moveToPage ?? 'Move to page'}>
          {#each pages as page (page.id)}
            <button
              type="button"
              class="page-option"
              class:current={page.id === currentPageId}
              aria-current={page.id === currentPageId ? 'page' : undefined}
              aria-disabled={page.id === currentPageId}
              disabled={page.id === currentPageId}
              onclick={() => choosePage(page.id)}
            >
              <span>{page.name}</span>
              {#if page.id === currentPageId}<span class="current-label">{t.currentPage ?? 'Current page'}</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="sheet-content">
        <div class="action-context">
          {#if segment?.journeyMeta}
            <strong>{t.savedJourneyLabel ?? 'Journey to'} {segment.journeyMeta.destLabel}</strong>
            <span>{segment.journeyMeta.originLabel} → {segment.journeyMeta.destLabel}</span>
          {:else if segment}
            <strong>{(t.lineLabel ?? 'Line {line}').replace('{line}', segment.line)}</strong>
            <span>{segment.fromStop.name} → {segment.direction.destination}</span>
          {/if}
        </div>
        <div bind:this={actionListEl} class="action-list">
          {#each actions as action (action.id)}
            <button
              type="button"
              class="action-button"
              class:destructive={action.destructive}
              onclick={() => chooseAction(action.id)}
            >
              {action.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/snippet}
</Sheet>

<style>
  .sheet-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
    overflow-y: auto;
  }

  .action-context {
    display: grid;
    gap: 3px;
    margin: 0 4px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.35;
  }

  .action-context strong {
    color: var(--text);
    font-size: 14px;
    font-weight: 750;
  }

  .action-context span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-list {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--surface);
  }

  .action-button,
  .page-option {
    min-height: 56px;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 15px;
    font-weight: 650;
    padding: 10px 16px;
    text-align: left;
  }

  .action-button:last-child,
  .page-option:last-child {
    border-bottom: 0;
  }

  .action-button:hover,
  .action-button:focus-visible,
  .page-option:hover:not(:disabled),
  .page-option:focus-visible:not(:disabled),
  .page-option:hover:not(:disabled),
  .page-option:focus-visible:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-subtle);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .action-button.destructive {
    color: var(--color-critical, #b42318);
  }

  .page-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .page-option.current {
    color: var(--text-muted);
    cursor: default;
  }

  .current-label {
    font-size: 12px;
    font-weight: 500;
  }

  :global(.sheet.saved-card-actions-sheet) {
    bottom: 0;
    height: auto;
    max-height: min(62dvh, 440px);
    min-height: 0;
    border-radius: 22px 22px 0 0;
  }

  :global(.sheet.saved-card-actions-sheet .mobile-close-icon) {
    display: none;
  }

  :global(.sheet.saved-card-actions-sheet .desktop-close-icon) {
    display: block;
  }

  @media (max-width: 767px) {
    :global(.sheet.saved-card-actions-sheet) {
      left: 0 !important;
      top: auto !important;
      right: 0 !important;
    }
  }

  @media (min-width: 768px) {
    :global(.sheet-overlay:has(.sheet.saved-card-actions-sheet)) {
      display: block;
      padding: 0;
      background: transparent;
    }

    :global(.sheet.saved-card-actions-sheet.popover) {
      position: fixed;
      inset: auto;
      width: 320px;
      height: auto;
      max-height: min(70dvh, 520px);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
      transform: none !important;
      opacity: 1 !important;
    }

    :global(.sheet.saved-card-actions-sheet.popover .sheet-handle),
    :global(.sheet.saved-card-actions-sheet.popover .sheet-header > .icon-btn) {
      display: none;
    }

    .sheet-content {
      padding: 12px;
    }
  }

  @media (min-width: 768px) {
    :global(.sheet-overlay:has(.sheet.saved-card-actions-sheet.touch-sheet)) {
      display: block;
      padding: 0;
      background: transparent;
    }

    :global(.sheet.saved-card-actions-sheet.touch-sheet) {
      position: fixed;
      inset: auto 0 0;
      width: 100%;
      height: auto;
      max-height: min(78dvh, 620px);
      border-radius: 22px 22px 0 0;
      transform: translateY(100%) !important;
      opacity: 1;
    }

    :global(.sheet-overlay.open .sheet.saved-card-actions-sheet.touch-sheet) {
      transform: translateY(0) !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-button,
    .page-option {
      transition: none;
    }
  }
</style>
