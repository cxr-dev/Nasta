<script lang="ts">
  import type { Page } from '../types/page';
  import { renamePage, reorderPages } from '../stores/pageStore.svelte';
  import { setActivePage, createPage, deletePage } from '../stores/pageStore.svelte';
  import { getActivePage } from '../stores/pageStore.svelte';

  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());
  import Sheet from './Sheet.svelte';
  import { gripVertical } from '../icons/departureIcons';

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
    if (target?.closest('.page-actions, .page-drag-handle, .page-rename-input')) return;
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
    } else if (currentX <= -PAGE_COMMIT_THRESHOLD) {
      navigator.vibrate?.(10);
      if (el) {
        gsap.killTweensOf(el);
        gsap.to(el, { x: -el.offsetWidth, opacity: 0, duration: 0.2, ease: 'power2.out', onComplete: () => handleDeletePage(pageId) });
      } else { handleDeletePage(pageId); }
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
    clearTimeout(pageLongPressTimer);
    if (pageIsLongPressing) pageIsLongPressing = false;
    const touch = e.touches[0];
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

  function handlePageTouchEnd() {
    if (pageDraggingIndex === null) return;
    clearTimeout(pageLongPressTimer);
    pageIsLongPressing = false;
    const el = document.querySelector(`[data-page-drag-index="${pageDraggingIndex}"]`) as HTMLElement | null;
    if (el) {
      gsap.to(el, { x: 0, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
      el.style.pointerEvents = '';
    }
    if (pageDragOverIndex !== null && pageDraggingIndex !== pageDragOverIndex) {
      handleReorderPage(pageDraggingIndex, pageDragOverIndex);
    }
    pageDraggingIndex = null;
    pageDragOverIndex = null;
    pageDropInsertIndex = null;
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

  let page = $derived(pages.find(p => p.id === activePageId));
  let renameId = $state<string | null>(null);
  let renameValue = $state('');
  let pagesTabEl = $state<HTMLDivElement>();

  function getPageLabel(p: Page): string {
    return p.name;
  }

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
  }

  function handleReorderPage(fromIndex: number, toIndex: number) {
    reorderPages(fromIndex, toIndex);
  }

  function startRename(id: string, currentName: string) {
    renameId = id;
    renameValue = currentName;
  }

  function handlePageSwitch(id: string) {
    setActivePage(id);
    onSwitchPage(id);
  }

</script>

<Sheet
  isOpen={isOpen}
  onClose={onClose}
  title={`${t.managePages ?? t.editingPage}: ${page ? getPageLabel(page) : ''}`}
  closeAriaLabel={t.closeEditor}
  overlayClass="editor-overlay"
  sheetClass="editor-sheet"
>
      <div
        class="tab-content pages-tab"
        bind:this={pagesTabEl}
        ontouchend={handlePageTouchEnd}
        role="region"
        aria-label={t.pages}
      >
        <h3 class="section-title">{t.pages}</h3>
        <button class="add-btn" onclick={handleCreatePage}>
          + {t.add}
        </button>
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
                  onclick={() => { navigator.vibrate?.(10); handleDeletePage(page.id); }}
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
                class:page-dragging={pageDraggingIndex === index}
                class:page-drag-over={pageDragOverIndex === index && pageDraggingIndex !== index}
                data-page-drag-index={index}
                data-page-swipe-id={page.id}
                draggable="true"
                ondragstart={(e) => handlePageDragStart(e, index)}
                ondragover={(e) => handlePageDragOver(e, index)}
                ondrop={(e) => handlePageDrop(e, index)}
                ondragend={handlePageDragEnd}
                ontouchstart={(e) => handlePageSwipeTouchStart(e, page.id)}
                ontouchmove={(e) => handlePageSwipeTouchMove(e, page.id)}
                ontouchend={(e) => handlePageSwipeTouchEnd(e, page.id)}
              >
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="page-drag-handle no-scale"
                class:long-pressing={pageIsLongPressing}
                aria-hidden="true"
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
                  onkeydown={(e) => {
                    if (e.key === 'Enter') handleRenamePage(page.id, renameValue);
                    if (e.key === 'Escape') renameId = null;
                  }}
                  onblur={() => handleRenamePage(page.id, renameValue)}
                />
              {:else}
                <div class="page-info-wrap">
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
                  onclick={() => startRename(page.id, page.name)}
                  aria-label={t.renamePage ?? 'Rename page'}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61z"/>
                  </svg>
                </button>
                {#if pages.length > 1}
                  <button
                    class="page-action-btn danger"
                    onclick={() => handleDeletePage(page.id)}
                    aria-label={t.remove}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                      <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M4 4v9.5a1 1 0 001 1h6a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          </div>
          {/each}
        </div>
      </div>

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
    background: var(--accent-subtle);
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

  .page-action-btn.danger:hover {
    color: var(--color-error);
    background: color-mix(in oklch, var(--color-error) 10%, transparent);
  }

  .add-btn {
    position: relative;
    width: 100%;
    padding: 12px;
    border: 1.5px dashed var(--accent);
    border-radius: 12px;
    background: transparent;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
    transition: background 150ms ease;
  }

  .add-btn:active {
    background: color-mix(in oklch, var(--accent) 10%, transparent);
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
  }

</style>
