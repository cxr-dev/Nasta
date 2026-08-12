<script lang="ts">
  import type { Page } from '../types/page';
  import { renamePage, reorderPages } from '../stores/pageStore.svelte';
  import { setActivePage, createPage, deletePage } from '../stores/pageStore.svelte';

  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';
  import { longPress } from '../lib/longPress';

  let t = $derived(getT());
  import Sheet from './Sheet.svelte';
  import { gripVertical, moreHorizontal, checkIcon } from '../icons/departureIcons';

  // Page drag-and-drop state
  let pageDraggingIndex = $state<number | null>(null);
  let pageDragOverIndex = $state<number | null>(null);
  let pageDragStartY = 0;
  let pageDragStartX = 0;
  let pageDropInsertIndex = $state<number | null>(null);
  let pageIsLongPressing = $state(false);
  let pageLongPressTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Page swipe-to-delete ──────────────────────────────────────────────────
  const PAGE_SWIPE_THRESHOLD = 8;
  const PAGE_REVEAL_THRESHOLD = 60;
  const PAGE_COMMIT_THRESHOLD = 120;
  const PAGE_DELETE_WIDTH = 76;

  let swipingPageId = $state<string | null>(null);
  let pageSwipeStartX = 0;
  let pageSwipeStartY = 0;
  let pageSwipeCurrentDx = 0;
  let pageSwipeIntent = $state(false);
  let revealedPageId = $state<string | null>(null);

  function handlePageSwipeTouchStart(e: TouchEvent, pageId: string) {
    const target = e.target as Element | null;
    if (target?.closest('.page-actions, .page-drag-handle, .page-rename-input, .page-rename-actions')) return;
    if (pageDraggingIndex !== null) return;
    if (e.touches.length !== 1) return;
    if (revealedPageId && revealedPageId !== pageId) {
      const prevEl = document.querySelector(`[data-page-swipe-id="${revealedPageId}"]`) as HTMLElement | null;
      if (prevEl) { gsap.killTweensOf(prevEl); gsap.to(prevEl, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' }); }
      revealedPageId = null;
    }
    swipingPageId = pageId;
    pageSwipeStartX = e.touches[0].clientX;
    pageSwipeStartY = e.touches[0].clientY;
    pageSwipeIntent = false;
  }

  function handlePageSwipeTouchMove(e: TouchEvent, pageId: string) {
    if (swipingPageId !== pageId) return;
    if (e.touches.length !== 1) { cancelPageSwipe(); return; }
    const dx = e.touches[0].clientX - pageSwipeStartX;
    const dy = e.touches[0].clientY - pageSwipeStartY;
    if (!pageSwipeIntent && Math.abs(dy) > Math.abs(dx)) { cancelPageSwipe(); return; }
    if (!pageSwipeIntent && Math.abs(dx) < PAGE_SWIPE_THRESHOLD) return;
    pageSwipeIntent = true;
    e.preventDefault();
    const clampedDx = Math.max(dx, -PAGE_COMMIT_THRESHOLD);
    pageSwipeCurrentDx = clampedDx;
    const el = document.querySelector(`[data-page-swipe-id="${pageId}"]`) as HTMLElement | null;
    if (el) gsap.set(el, { x: clampedDx });
  }

  function handlePageSwipeTouchEnd(e: TouchEvent, pageId: string) {
    if (swipingPageId !== pageId) return;
    if (pages.length <= 1) { cancelPageSwipe(); return; }
    const el = document.querySelector(`[data-page-swipe-id="${pageId}"]`) as HTMLElement | null;
    const currentX = pageSwipeCurrentDx;
    if (!pageSwipeIntent || currentX > -PAGE_REVEAL_THRESHOLD) {
      if (el) { gsap.killTweensOf(el); gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' }); }
      revealedPageId = null;
    } else {
      if (el) { gsap.killTweensOf(el); gsap.to(el, { x: -PAGE_DELETE_WIDTH, duration: 0.2, ease: 'power2.out' }); }
      revealedPageId = pageId;
    }
    swipingPageId = null; pageSwipeStartX = 0; pageSwipeStartY = 0; pageSwipeCurrentDx = 0; pageSwipeIntent = false;
  }

  function cancelPageSwipe() {
    const el = swipingPageId ? (document.querySelector(`[data-page-swipe-id="${swipingPageId}"]`) as HTMLElement | null) : null;
    if (el) { gsap.killTweensOf(el); gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' }); }
    swipingPageId = null; pageSwipeStartX = 0; pageSwipeStartY = 0; pageSwipeCurrentDx = 0; pageSwipeIntent = false;
  }

  function dismissPageRevealed() {
    if (!revealedPageId) return;
    const el = document.querySelector(`[data-page-swipe-id="${revealedPageId}"]`) as HTMLElement | null;
    if (el) { gsap.killTweensOf(el); gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' }); }
    revealedPageId = null;
  }

  function handlePageDragStart(e: DragEvent, index: number) {
    dismissPageRevealed();
    pageDraggingIndex = index;
    pageDropInsertIndex = null;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handlePageDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    pageDragOverIndex = index;
    const el = e.currentTarget as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      pageDropInsertIndex = e.clientY < midY ? index : index + 1;
    }
  }

  function handlePageDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (pageDraggingIndex !== null && pageDraggingIndex !== toIndex) {
      handleReorderPage(pageDraggingIndex, toIndex);
    }
    pageDraggingIndex = null;
    pageDragOverIndex = null;
    pageDropInsertIndex = null;
  }

  function handlePageDragEnd() {
    pageDraggingIndex = null;
    pageDragOverIndex = null;
    pageDropInsertIndex = null;
  }

  function handlePageHandleTouchStart(e: TouchEvent, index: number) {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    dismissPageRevealed();
    pageDraggingIndex = index;
    pageDropInsertIndex = null;
    pageDragStartX = e.touches[0].clientX;
    pageDragStartY = e.touches[0].clientY;
    const el = document.querySelector(`[data-page-drag-index="${index}"]`) as HTMLElement | null;
    if (el) {
      el.style.pointerEvents = 'none';
    }
    // long-press haptic
    clearTimeout(pageLongPressTimer);
    pageLongPressTimer = setTimeout(() => {
      pageIsLongPressing = true;
      navigator.vibrate?.(15);
      gsap.to('.page-drag-handle', {
        scale: 1.05,
        duration: 0.1,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
      });
    }, 300);
  }

  function handlePageTouchMove(e: TouchEvent) {
    if (pageDraggingIndex === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (Math.hypot(touch.clientX - pageDragStartX, touch.clientY - pageDragStartY) > 8) {
      clearTimeout(pageLongPressTimer);
    }
    if (pageIsLongPressing) pageIsLongPressing = false;
    const el = document.querySelector(`[data-page-drag-index="${pageDraggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, {
        x: touch.clientX - pageDragStartX,
        y: touch.clientY - pageDragStartY,
        duration: 0.08,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const item = element.closest('[data-page-drag-index]') as HTMLElement | null;
      if (item) {
        const newIndex = parseInt(item.getAttribute('data-page-drag-index') ?? '0', 10);
        if (!isNaN(newIndex) && newIndex !== pageDragOverIndex) {
          pageDragOverIndex = newIndex;
        }
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        pageDropInsertIndex = touch.clientY < midY ? newIndex : newIndex + 1;
      }
    }
  }

  function finishPageTouchDrag(commit: boolean) {
    if (pageDraggingIndex === null) return;
    clearTimeout(pageLongPressTimer);
    pageIsLongPressing = false;
    const el = document.querySelector(`[data-page-drag-index="${pageDraggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, { x: 0, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      el.style.pointerEvents = '';
    }
    if (commit && pageDragOverIndex !== null && pageDraggingIndex !== pageDragOverIndex) {
      handleReorderPage(pageDraggingIndex, pageDragOverIndex);
    }
    pageDraggingIndex = null;
    pageDragOverIndex = null;
    pageDropInsertIndex = null;
  }

  function handlePageTouchEnd() {
    finishPageTouchDrag(true);
  }

  function handlePageTouchCancel() {
    finishPageTouchDrag(false);
  }

  $effect(() => {
    const el = pagesTabEl;
    if (!el) return;
    el.addEventListener('touchmove', handlePageTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handlePageTouchMove);
  });

  let {
    pages,
    activePageId,
    isOpen,
    onClose,
    onSwitchPage
  }: {
    pages: Page[];
    activePageId: string;
    isOpen: boolean;
    onClose: () => void;
    onSwitchPage: (pageId: string) => void;
  } = $props();

  let renameId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl = $state<HTMLInputElement | undefined>();
  let pagesTabEl = $state<HTMLDivElement>();
  let pageMenuAnchor = $state<HTMLElement | null>(null);
  let menuState = $state<{ pageId: string; view: 'menu' | 'delete' } | null>(null);
  let menuPage = $derived(pages.find(p => p.id === menuState?.pageId) ?? null);
  let menuPresentationMode = $state<'sheet' | 'popover'>('sheet');

  $effect(() => {
    if (!menuState || typeof window === 'undefined') return;
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updateMode = () => {
      menuPresentationMode = window.innerWidth >= 768 && pointerQuery.matches ? 'popover' : 'sheet';
    };
    updateMode();
    pointerQuery.addEventListener('change', updateMode);
    window.addEventListener('resize', updateMode);
    return () => {
      pointerQuery.removeEventListener('change', updateMode);
      window.removeEventListener('resize', updateMode);
    };
  });

  function handleCreatePage() {
    const newId = createPage(t.defaultPageName);
    setActivePage(newId);
    onSwitchPage(newId);
  }

  function handleDeletePage(id: string) {
    if (pages.length <= 1) return;
    deletePage(id);
    const remaining = pages.filter(p => p.id !== id);
    if (remaining.length > 0) {
      onSwitchPage(remaining[0].id);
    }
  }

  function handleRenamePage(id: string, name: string) {
    if (!name.trim()) return;
    renamePage(id, name.trim());
    renameId = null;
    renameValue = '';
    document.querySelector<HTMLElement>(`[data-page-more-btn="${id}"]`)?.focus();
  }

  function cancelRename() {
    const id = renameId;
    renameId = null;
    renameValue = '';
    if (id) {
      document.querySelector<HTMLElement>(`[data-page-more-btn="${id}"]`)?.focus();
    }
  }

  function openPageMenu(pageId: string) {
    cancelPageSwipe();
    dismissPageRevealed();
    pageMenuAnchor = document.querySelector<HTMLElement>(`[data-page-more-btn="${pageId}"]`);
    menuState = { pageId, view: 'menu' };
  }

  function requestDeletePage(pageId: string) {
    navigator.vibrate?.(10);
    dismissPageRevealed();
    pageMenuAnchor = document.querySelector<HTMLElement>(`[data-page-more-btn="${pageId}"]`);
    menuState = { pageId, view: 'delete' };
  }

  function closePageMenu() {
    menuState = null;
  }

  function showDeleteConfirm() {
    if (!menuState) return;
    menuState = { pageId: menuState.pageId, view: 'delete' };
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('.page-menu-action.destructive')?.focus();
    });
  }

  function confirmDelete() {
    if (!menuState) return;
    const id = menuState.pageId;
    menuState = null;
    handleDeletePage(id);
  }

  function startRenameFromMenu(id: string) {
    const page = pages.find(p => p.id === id);
    menuState = null;
    if (!page) return;
    renameId = id;
    renameValue = page.name;
    queueMicrotask(() => renameInputEl?.focus());
  }

  function handleReorderPage(fromIndex: number, toIndex: number) {
    reorderPages(fromIndex, toIndex);
  }

  function handlePageSwitch(id: string) {
    setActivePage(id);
    onSwitchPage(id);
  }

</script>

<Sheet
  isOpen={isOpen}
  onClose={onClose}
  title={t.managePages ?? t.editingPage}
  closeAriaLabel={t.closeEditor}
  overlayClass="editor-overlay"
  sheetClass="editor-sheet"
>
      <div
        class="tab-content pages-tab"
        bind:this={pagesTabEl}
        ontouchend={handlePageTouchEnd}
        ontouchcancel={handlePageTouchCancel}
        role="region"
        aria-label={t.pages}
      >
        <h3 class="section-title">{t.pages}</h3>
        <div class="page-list" role="list">
          {#each pages as page, index (page.id)}
            {@const isDropHere = pageDraggingIndex !== null && pageDropInsertIndex === index && pageDropInsertIndex !== pageDraggingIndex}
            {#if isDropHere}
              <div class="drop-indicator" role="presentation">
                <div class="drop-indicator-line"></div>
                <div class="drop-ghost">
                  <div class="drop-ghost-icon">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zM3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V5.5h-2.75A1.75 1.75 0 018 3.75V1.5H3.75zm6.75.062V3.75c0 .138.112.25.25.25h2.188l-.013-.013-2.425-2.425z"/>
                    </svg>
                  </div>
                  <span class="drop-ghost-label">{pages[pageDraggingIndex!].name}</span>
                </div>
              </div>
            {/if}
            <div class="page-swipe-container">
              {#if pages.length > 1}
                <div
                  class="page-delete-action"
                  class:page-delete-visible={revealedPageId === page.id || (swipingPageId === page.id && pageSwipeIntent)}
                  aria-hidden={revealedPageId !== page.id}
                  onclick={() => requestDeletePage(page.id)}
                  role="button"
                  tabindex={revealedPageId === page.id ? 0 : -1}
                >
                  <span>{t.remove}</span>
                </div>
              {/if}
              <div
                class="page-item"
                role="listitem"
                aria-label={page.name}
                class:active={page.id === activePageId}
                class:renaming={renameId === page.id}
                class:page-dragging={pageDraggingIndex === index}
                class:page-drag-over={pageDragOverIndex === index && pageDraggingIndex !== index}
                data-page-drag-index={index}
                data-page-swipe-id={page.id}
                ondragover={(e) => handlePageDragOver(e, index)}
                ondrop={(e) => handlePageDrop(e, index)}
                ontouchstart={(e) => handlePageSwipeTouchStart(e, page.id)}
                ontouchmove={(e) => handlePageSwipeTouchMove(e, page.id)}
                ontouchend={(e) => handlePageSwipeTouchEnd(e, page.id)}
              >
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="page-drag-handle no-scale"
                class:long-pressing={pageIsLongPressing}
                aria-hidden="true"
                draggable="true"
                ondragstart={(e) => handlePageDragStart(e, index)}
                ondragend={handlePageDragEnd}
                ontouchstart={(e) => handlePageHandleTouchStart(e, index)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  {@html gripVertical}
                </svg>
              </div>
              <div class="page-index">{index + 1}</div>
              {#if renameId === page.id}
                <input
                  type="text"
                  class="page-rename-input"
                  bind:value={renameValue}
                  bind:this={renameInputEl}
                  enterkeyhint="done"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') handleRenamePage(page.id, renameValue);
                    if (e.key === 'Escape') cancelRename();
                  }}
                />
                <div class="page-rename-actions">
                  <button
                    type="button"
                    class="page-rename-btn"
                    aria-label={t.cancel}
                    onclick={cancelRename}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="page-rename-btn"
                    aria-label={t.confirm}
                    onclick={() => handleRenamePage(page.id, renameValue)}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      {@html checkIcon}
                    </svg>
                  </button>
                </div>
              {:else}
                <div class="page-info-wrap" use:longPress={{ onLongPress: () => openPageMenu(page.id) }}>
                  <button
                    class="page-name-btn"
                    onclick={() => handlePageSwitch(page.id)}
                    aria-current={page.id === activePageId ? 'page' : undefined}
                  >
                    {page.name}
                  </button>
                  <div class="page-seg-count">
                    {#if page.segments.length === 0}
                      <span class="seg-count-zero">{t.segmentsCountZero}</span>
                    {:else}
                      <span class="seg-count">{t.segmentsCount.replace('{n}', String(page.segments.length))}</span>
                    {/if}
                  </div>
                </div>
              {/if}
              <div class="page-actions">
                <button
                  class="page-action-btn"
                  data-page-more-btn={page.id}
                  onclick={() => openPageMenu(page.id)}
                  aria-label={t.moreActions}
                  aria-haspopup="menu"
                  aria-expanded={menuState?.pageId === page.id && menuState?.view === 'menu'}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    {@html moreHorizontal}
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {/each}
        </div>
        <button class="add-btn" onclick={handleCreatePage}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>{t.addPage}</span>
        </button>
      </div>

      {#if menuState}
        <Sheet
          isOpen={true}
          onClose={closePageMenu}
          title={menuState.view === 'delete' ? t.deletePageConfirmTitle : t.moreActions}
          closeAriaLabel={t.closeActions}
          mode={menuPresentationMode}
          anchor={pageMenuAnchor}
          sheetClass="page-actions-menu"
          initialFocusSelector=".page-menu-action"
          restoreFocusOnClose={menuState.view === 'delete'}
          onSheetTouchStart={(e) => e.stopPropagation()}
          onSheetTouchEnd={(e) => e.stopPropagation()}
        >
          {#if menuState.view === 'delete'}
            <div class="sheet-content">
              <p class="page-menu-delete-desc">
                {(menuPage?.segments.length ?? 0) === 0
                  ? t.deletePageConfirmDescEmpty.replace('{name}', menuPage?.name ?? '')
                  : t.deletePageConfirmDesc
                      .replace('{name}', menuPage?.name ?? '')
                      .replace('{n}', String(menuPage?.segments.length ?? 0))}
              </p>
              <div class="action-list">
                <button class="page-menu-action destructive" onclick={confirmDelete}>
                  {t.deletePage}
                </button>
                <button class="page-menu-action" onclick={closePageMenu}>
                  {t.cancel}
                </button>
              </div>
            </div>
          {:else}
            <div class="sheet-content">
              <div class="action-list">
                <button class="page-menu-action" onclick={() => startRenameFromMenu(menuState!.pageId)}>
                  {t.renamePageShort}
                </button>
                {#if pages.length > 1}
                  <button class="page-menu-action destructive" onclick={showDeleteConfirm}>
                    {t.deletePage}
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </Sheet>
      {/if}
</Sheet>

<style>
  /* Tab content */
  .tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tab-content::-webkit-scrollbar {
    display: none;
  }

  /* Pages tab */
  .pages-tab {
    padding: 16px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .page-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    margin-bottom: 12px;
  }

  .page-item {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    transition: border-color 150ms;
  }

  .page-item.active {
    border-color: var(--accent);
    background: color-mix(in oklch, var(--accent) 4%, var(--surface));
  }

  .page-item.renaming {
    background: color-mix(in oklch, var(--accent) 4%, var(--surface));
  }

  .page-item.page-dragging {
    opacity: 0.5;
  }

  .page-item.page-drag-over {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .page-drag-handle {
    color: var(--text-muted);
    cursor: grab;
    padding: 4px 2px;
    user-select: none;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .page-drag-handle:active {
    cursor: grabbing;
  }

  .page-drag-handle.long-pressing {
    color: var(--accent);
  }

  /* Page swipe-to-delete */
  .page-swipe-container {
    position: relative;
    overflow: hidden;
    border-radius: 10px;
  }

  .page-delete-action {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 76px;
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
    border-radius: 0 10px 10px 0;
    pointer-events: none;
  }

  .page-delete-action.page-delete-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .page-delete-action:active {
    opacity: 0.8;
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

  .page-index {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: var(--accent-subtle);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .page-item.active .page-index {
    background: var(--accent);
    color: var(--bg);
  }

  .page-info-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .page-name-btn {
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    text-align: left;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page-seg-count {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .page-item.active .page-seg-count {
    color: var(--accent);
  }

  .seg-count,
  .seg-count-zero {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .page-rename-input {
    flex: 1;
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    background: var(--surface);
    color: var(--text);
    outline: none;
    min-width: 0;
  }

  .page-rename-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .page-rename-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: var(--surface);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .page-rename-btn:hover {
    color: var(--text);
    background: var(--border);
  }

  .page-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .page-action-btn {
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms, background 150ms;
    -webkit-tap-highlight-color: transparent;
  }

  .page-action-btn:hover {
    color: var(--text);
    background: var(--border);
  }

  .add-btn {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--surface);
    color: var(--accent);
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    transition: background 150ms ease;
  }

  .add-btn:active {
    background: color-mix(in oklch, var(--accent) 10%, var(--surface));
  }

  .add-btn:hover {
    background: color-mix(in oklch, var(--accent) 6%, var(--surface));
  }

  /* Page action sheet — mirrors SavedCardActionsSheet */
  .sheet-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px 16px;
    overflow-y: auto;
  }

  .action-list {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--surface);
  }

  .page-menu-action {
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
    -webkit-tap-highlight-color: transparent;
  }

  .page-menu-action:last-child {
    border-bottom: 0;
  }

  .page-menu-action:hover,
  .page-menu-action:focus-visible {
    border-color: var(--accent);
    background: var(--accent-subtle);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .page-menu-action.destructive {
    color: var(--color-critical, #b42318);
  }

  .page-menu-delete-desc {
    margin: 0;
    padding: 4px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-secondary);
    overflow-wrap: break-word;
  }

  :global(.sheet.page-actions-menu) {
    bottom: 0;
    height: auto;
    max-height: min(70dvh, 480px);
    min-height: 0;
    border-radius: 22px 22px 0 0;
    --safe-area-inset-top: 0px;
  }

  @media (max-width: 767px) {
    :global(.sheet.page-actions-menu) {
      left: 0 !important;
      top: auto !important;
      right: 0 !important;
    }
  }

  @media (min-width: 768px) {
    :global(.sheet-overlay:has(.sheet.page-actions-menu)) {
      display: block;
      padding: 0;
      background: transparent;
    }

    :global(.sheet.page-actions-menu.popover) {
      position: fixed;
      inset: auto;
      width: 320px;
      height: auto;
      max-height: min(70dvh, 520px);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
      transform: scale(0.97) !important;
      transform-origin: top center;
      opacity: 0 !important;
      transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1) !important;
    }

    :global(.sheet-overlay.open .sheet.page-actions-menu.popover) {
      transform: scale(1) !important;
      opacity: 1 !important;
    }

    :global(.sheet.page-actions-menu.popover .sheet-handle) {
      display: none;
    }

    :global(.sheet-overlay:has(.sheet.page-actions-menu.touch-sheet)) {
      display: block;
      padding: 0;
      background: transparent;
    }

    :global(.sheet.page-actions-menu.touch-sheet) {
      position: fixed;
      inset: auto 0 0;
      width: 100%;
      height: auto;
      max-height: min(78dvh, 620px);
      border-radius: 22px 22px 0 0;
      transform: translateY(100%) !important;
      opacity: 1;
    }

    :global(.sheet-overlay.open .sheet.page-actions-menu.touch-sheet) {
      transform: translateY(0) !important;
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .page-item {
      transition: none;
    }
    .page-delete-action {
      transition: none;
    }
    .drop-ghost {
      animation: none;
    }
    .page-menu-action {
      transition: none;
    }
    :global(.sheet.page-actions-menu.popover),
    :global(.sheet-overlay.open .sheet.page-actions-menu.popover) {
      transition: opacity 160ms ease !important;
      transform: none !important;
    }
  }

</style>
