<script lang="ts">
  import type { Page, TransportType, Stop, SegmentDirection } from '../types/page';
  import { addSegment as storeAddSegment, renamePage, reorderPages } from '../stores/pageStore.svelte';
  import { setActivePage, createPage, deletePage } from '../stores/pageStore.svelte';
  import { getSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setAfterworkStartHour, setEventsEnabled, setGroupDisruptedSegments, setLanguage, setTheme } from '../stores/settingsStore.svelte';
  import { THEMES } from '../themes';
  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';
  import { gripVertical } from '../icons/departureIcons';

  // Page drag-and-drop state
  let pageDraggingIndex = $state<number | null>(null);
  let pageDragOverIndex = $state<number | null>(null);
  let pageDragStartY = 0;
  let pageDragStartX = 0;
  let pageDropInsertIndex = $state<number | null>(null);
  let pageIsLongPressing = $state(false);
  let pageLongPressTimer: ReturnType<typeof setTimeout> | undefined;

  function handlePageDragStart(e: DragEvent, index: number) {
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

  let activeEditorTab = $state<'pages' | 'segment' | 'features' | 'theme'>('segment');

  let page = $derived(pages.find(p => p.id === activePageId));
  let showSearch = $state(false);
  let hasManuallyClosedSearch = $state(false);
  let autoSearch = $derived(!hasManuallyClosedSearch && (!page || page.segments.length === 0));
  import { infoCircle } from '../icons/departureIcons';
  let infoOpen = $state(false);
  let showPagePicker = $state(false);
  let settings = $derived(getSettings());
  let activeLanguage = $derived(settings.language ?? 'auto');
  let activeDisruptionThreshold = $derived(settings.disruptionSeverityThreshold ?? 'warning');
  let renameId = $state<string | null>(null);
  let renameValue = $state('');
  let addBtnEl = $state<HTMLButtonElement | undefined>();
  let handleSwipeStartX = 0;
  let handleSwipeStartY = 0;
  let pagesTabEl = $state<HTMLDivElement>();

  function getPageLabel(p: Page): string {
    return p.name;
  }

  function isLightColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.5;
  }

  function addSegment(
    line: string, lineName: string, direction: SegmentDirection,
    fromStop: Stop, toStop: Stop, transportType: TransportType
  ) {
    if (!page) return;
    storeAddSegment(page.id, { line, lineName, direction, fromStop, toStop, transportType });
    showSearch = false;
    hasManuallyClosedSearch = true;
  }

  function handleCreatePage() {
    const newId = createPage(t.defaultPageName);
    setActivePage(newId);
    onSwitchPage(newId);
    activeEditorTab = 'pages';
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

  function handlePickerSelect(id: string) {
    handlePageSwitch(id);
    showPagePicker = false;
  }

  const TABS = ['pages', 'segment', 'features', 'theme'] as const;
  let swipeStartX = 0;
  let swipeStartY = 0;

  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest('input') ||
      target.closest('.drag-handle') ||
      target.closest('.hour-selector') ||
      target.closest('.info-overlay') ||
      target.closest('.segmented-control')
    ) {
      return;
    }
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (swipeStartX === 0 && swipeStartY === 0) return;

    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;

    // Reset coordinates
    swipeStartX = 0;
    swipeStartY = 0;

    // Must be horizontal gesture
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 50) return;

    const currentIdx = TABS.indexOf(activeEditorTab);

    if (dx < 0) {
      // Swipe left -> next tab
      if (currentIdx < TABS.length - 1) {
        activeEditorTab = TABS[currentIdx + 1];
      }
    } else {
      // Swipe right -> previous tab
      if (currentIdx > 0) {
        activeEditorTab = TABS[currentIdx - 1];
      }
    }
  }

  function isTabletOrDesktopViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  }

  function handleSheetHandleTouchStart(e: TouchEvent) {
    if (!isTabletOrDesktopViewport()) return;
    const touch = e.touches[0];
    handleSwipeStartX = touch.clientX;
    handleSwipeStartY = touch.clientY;
  }

  function handleSheetHandleTouchEnd(e: TouchEvent) {
    if (!isTabletOrDesktopViewport()) return;
    if (handleSwipeStartX === 0 && handleSwipeStartY === 0) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - handleSwipeStartX;
    const dy = touch.clientY - handleSwipeStartY;

    handleSwipeStartX = 0;
    handleSwipeStartY = 0;

    if (dy > 44 && dy > Math.abs(dx) * 1.1) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-overlay" class:open={isOpen} aria-hidden={!isOpen} aria-modal="true" onclick={onClose} onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="editor-sheet"
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
  >
    <div
      class="sheet-handle"
      aria-hidden="true"
      ontouchstart={handleSheetHandleTouchStart}
      ontouchend={handleSheetHandleTouchEnd}
    ></div>
    <div class="sheet-header">
      <button type="button" class="back-btn" onclick={onClose} aria-label={t.closeEditor}>
        <svg class="mobile-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        <svg class="desktop-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6 6 18"/>
        </svg>
      </button>
      <span class="sheet-title">
        {t.editingPage}: {page ? getPageLabel(page) : ''}
      </span>
    </div>

    <div class="tab-bar" role="tablist" aria-label={t.settings}>
      <button
        type="button"
        role="tab"
        class="tab"
        class:active={activeEditorTab === 'pages'}
        aria-selected={activeEditorTab === 'pages'}
        onclick={() => activeEditorTab = 'pages'}
      >
        {t.tabPages}
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        class:active={activeEditorTab === 'segment'}
        aria-selected={activeEditorTab === 'segment'}
        onclick={() => activeEditorTab = 'segment'}
      >
        {t.tabSegments}
      </button>
      <div class="tab-separator" aria-hidden="true">·</div>
      <button
        type="button"
        role="tab"
        class="tab right-group"
        class:active={activeEditorTab === 'features'}
        aria-selected={activeEditorTab === 'features'}
        onclick={() => activeEditorTab = 'features'}
      >
        {t.tabFeatures}
      </button>
      <button
        type="button"
        role="tab"
        class="tab right-group"
        class:active={activeEditorTab === 'theme'}
        aria-selected={activeEditorTab === 'theme'}
        onclick={() => activeEditorTab = 'theme'}
      >
        {t.tabTheme}
      </button>
    </div>

    {#if activeEditorTab === 'pages'}
      <div class="tab-content pages-tab" bind:this={pagesTabEl} ontouchend={handlePageTouchEnd}>
        <h3 class="section-title">{t.pages}</h3>
        <button class="add-btn" onclick={handleCreatePage}>
          + {t.add}
        </button>
        <div class="page-list">
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
            <div
              class="page-item"
              class:active={page.id === activePageId}
              class:page-dragging={pageDraggingIndex === index}
              class:page-drag-over={pageDragOverIndex === index && pageDraggingIndex !== index}
              data-page-drag-index={index}
              draggable="true"
              ondragstart={(e) => handlePageDragStart(e, index)}
              ondragover={(e) => handlePageDragOver(e, index)}
              ondrop={(e) => handlePageDrop(e, index)}
              ondragend={handlePageDragEnd}
            >
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="page-drag-handle"
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
                      <button class="add-seg-cta" onclick={() => { activeEditorTab = 'segment'; handlePageSwitch(page.id); }}>
                        {t.addSegmentsCta} →
                      </button>
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
                  aria-label={t.settings}
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
          {/each}
        </div>
      </div>

    {:else if activeEditorTab === 'segment'}
      <div class="tab-content segment-tab">
        {#if page}
          <div class="segment-page-indicator">
            <span class="spi-label">{t.pageNoun}:</span>
            <button class="spi-pill" onclick={() => showPagePicker = true}>
              {page.name}
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" class="spi-chevron">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          {#if showSearch || autoSearch}
            <div class="search-container">
              <SegmentSearch onSelect={addSegment} />
              <button class="cancel-search-btn" onclick={() => { showSearch = false; hasManuallyClosedSearch = true; }}>
                {t.cancel}
              </button>
            </div>
          {:else}
            <div class="segment-area">
              <button
                bind:this={addBtnEl}
                class="add-btn"
                onclick={() => showSearch = true}
              >
                {t.addSegment}
              </button>
              <SegmentList page={page} />
            </div>
          {/if}
        {/if}

          {#if showPagePicker}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div class="page-picker-overlay" onclick={() => showPagePicker = false} onkeydown={(e) => e.key === 'Escape' && (showPagePicker = false)} role="dialog" aria-label={t.selectAPage} tabindex="-1">
              <div class="page-picker-sheet" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (showPagePicker = false)} role="document" tabindex="-1">
                <h4 class="page-picker-title">{t.selectAPage}</h4>
                <div class="page-picker-list">
                  {#each pages as p (p.id)}
                    <button
                      class="page-picker-item"
                      class:active={p.id === activePageId}
                      onclick={() => handlePickerSelect(p.id)}
                    >
                      <span class="ppi-name">{p.name}</span>
                      <span class="ppi-count">
                        {#if p.segments.length === 0}
                          {t.segmentsCountZero}
                        {:else}
                          {t.segmentsCount.replace('{n}', String(p.segments.length))}
                        {/if}
                      </span>
                    </button>
                  {/each}
                </div>
                <button class="page-picker-cancel" onclick={() => showPagePicker = false}>
                  {t.cancel}
                </button>
              </div>
            </div>
          {/if}
      </div>

    {:else if activeEditorTab === 'features'}
      <div class="tab-content features-tab">
        <h3 class="section-title">{t.appSettings}</h3>
        <div class="feature-group">
          <h3 class="group-title">{t.disruptionAlerts}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.disruptionAlerts}</span>
              <span class="toggle-desc">{t.disruptionAlertsDesc}</span>
            </div>
            <button
              class="toggle-btn"
              class:on={settings.disruptionAlertsEnabled ?? true}
              onclick={() => setDisruptionAlertsEnabled(!(settings.disruptionAlertsEnabled ?? true))}
              aria-label={t.disruptionAlerts}
              role="switch"
              aria-checked={settings.disruptionAlertsEnabled ?? true}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
          {#if settings.disruptionAlertsEnabled ?? true}
            <div class="nested-control">
              <div class="nested-header">
                <span class="nested-name">{t.disruptionThreshold}</span>
                <button
                  class="info-btn"
                  onclick={() => (infoOpen = !infoOpen)}
                  aria-label={t.disruptionThresholdInfoAria}
                >
                  <svg viewBox="0 0 24 24" fill="none">{@html infoCircle}</svg>
                </button>
              </div>
              <div class="segmented-control" role="group" aria-label={t.disruptionThreshold}>
                <button
                  class="segment-choice"
                  class:active={activeDisruptionThreshold === 'info'}
                  onclick={() => setDisruptionSeverityThreshold('info')}
                  aria-pressed={activeDisruptionThreshold === 'info'}
                  data-level="info"
                >
                  {t.disruptionThresholdInfo}
                </button>
                <button
                  class="segment-choice"
                  class:active={activeDisruptionThreshold === 'warning'}
                  onclick={() => setDisruptionSeverityThreshold('warning')}
                  aria-pressed={activeDisruptionThreshold === 'warning'}
                  data-level="warning"
                >
                  {t.disruptionThresholdWarning}
                </button>
                <button
                  class="segment-choice"
                  class:active={activeDisruptionThreshold === 'critical'}
                  onclick={() => setDisruptionSeverityThreshold('critical')}
                  aria-pressed={activeDisruptionThreshold === 'critical'}
                  data-level="critical"
                >
                  {t.disruptionThresholdCritical}
                </button>
              </div>
            </div>
          {/if}

          {#if infoOpen}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div class="info-overlay" onclick={() => (infoOpen = false)} onkeydown={(e) => e.key === 'Escape' && (infoOpen = false)} role="dialog" aria-label={t.disruptionThresholdInfoTitle} tabindex="-1">
              <div class="info-card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (infoOpen = false)} role="document" tabindex="-1">
                <button class="info-card-close" onclick={() => (infoOpen = false)} aria-label={t.closeEditor}>×</button>
                <h4 class="info-card-title">{t.disruptionThresholdInfoTitle}</h4>

                <div class="info-level">
                  <span class="info-dot info-dot--info"></span>
                  <div class="info-level-content">
                    <strong>{t.disruptionThresholdInfo}</strong>
                    <p>{t.disruptionThresholdInfoDesc}</p>
                    <ul>
                      <li>{t.disruptionThresholdInfoExample1}</li>
                      <li>{t.disruptionThresholdInfoExample2}</li>
                      <li>{t.disruptionThresholdInfoExample3}</li>
                    </ul>
                  </div>
                </div>

                <div class="info-level">
                  <span class="info-dot info-dot--warning"></span>
                  <div class="info-level-content">
                    <strong>{t.disruptionThresholdWarning}</strong>
                    <p>{t.disruptionThresholdWarningDesc}</p>
                    <ul>
                      <li>{t.disruptionThresholdWarningExample1}</li>
                      <li>{t.disruptionThresholdWarningExample2}</li>
                      <li>{t.disruptionThresholdWarningExample3}</li>
                    </ul>
                  </div>
                </div>

                <div class="info-level">
                  <span class="info-dot info-dot--critical"></span>
                  <div class="info-level-content">
                    <strong>{t.disruptionThresholdCritical}</strong>
                    <p>{t.disruptionThresholdCriticalDesc}</p>
                    <ul>
                      <li>{t.disruptionThresholdCriticalExample1}</li>
                      <li>{t.disruptionThresholdCriticalExample2}</li>
                      <li>{t.disruptionThresholdCriticalExample3}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="feature-group">
          <h3 class="group-title">{t.groupDisruptedSegments}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.groupDisruptedSegments}</span>
              <span class="toggle-desc">{t.groupDisruptedSegmentsDesc}</span>
            </div>
            <button
              class="toggle-btn"
              class:on={settings.groupDisruptedSegments ?? false}
              onclick={() => setGroupDisruptedSegments(!(settings.groupDisruptedSegments ?? false))}
              aria-label={t.groupDisruptedSegments}
              role="switch"
              aria-checked={settings.groupDisruptedSegments ?? false}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
        </div>

        <div class="feature-group">
          <h3 class="group-title">{t.walkingEta}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.walkingEta}</span>
              <span class="toggle-desc">{t.walkingEtaDesc}</span>
            </div>
            <button
              class="toggle-btn"
              class:on={settings.walkingEtaEnabled ?? false}
              onclick={() => {
                const next = !(settings.walkingEtaEnabled ?? false);
                setWalkingEtaEnabled(next);
                setLocationServicesEnabled(next);
              }}
              aria-label={t.walkingEta}
              role="switch"
              aria-checked={settings.walkingEtaEnabled ?? false}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
        </div>

        <div class="feature-group">
          <h3 class="group-title">{t.afterwork}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.afterwork}</span>
              <span class="toggle-desc">{t.afterworkVenuesDesc}</span>
            </div>
            <button
              class="toggle-btn"
              class:on={settings.afterworkVenuesEnabled ?? false}
              onclick={() => setAfterworkVenuesEnabled(!(settings.afterworkVenuesEnabled ?? false))}
              aria-label={t.afterwork}
              role="switch"
              aria-checked={settings.afterworkVenuesEnabled ?? false}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
          {#if settings.afterworkVenuesEnabled}
            <div class="nested-control">
              <span class="nested-name">{t.afterworkStartTime}</span>
              <div class="hour-selector" role="group" aria-label={t.afterworkStartTime}>
                {#each [14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as hour (hour)}
                  <button
                    class="hour-choice"
                    class:active={(settings.afterworkStartHour ?? 15) === hour}
                    onclick={() => setAfterworkStartHour(hour)}
                    aria-pressed={(settings.afterworkStartHour ?? 15) === hour}
                  >
                    {hour}:00
                  </button>
          {/each}
          {#if pageDraggingIndex !== null && pageDropInsertIndex === pages.length && pageDropInsertIndex !== pageDraggingIndex}
            <div class="drop-indicator" role="presentation">
              <div class="drop-indicator-line"></div>
              <div class="drop-ghost">
                <div class="drop-ghost-icon">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75zM3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V5.5h-2.75A1.75 1.75 0 018 3.75V1.5H3.75zm6.75.062V3.75c0 .138.112.25.25.25h2.188l-.013-.013-2.425-2.425z"/>
                  </svg>
                </div>
                <span class="drop-ghost-label">{pages[pageDraggingIndex].name}</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
          {/if}
        </div>

        <div class="feature-group">
          <h3 class="group-title">{t.events}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.events}</span>
              <span class="toggle-desc">{t.eventsDesc}</span>
            </div>
            <button
              class="toggle-btn"
              class:on={settings.eventsEnabled ?? false}
              onclick={() => setEventsEnabled(!(settings.eventsEnabled ?? false))}
              aria-label={t.events}
              role="switch"
              aria-checked={settings.eventsEnabled ?? false}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
        </div>

        <div class="feature-group">
          <h3 class="group-title">{t.language}</h3>
          <div class="segmented-control" role="group" aria-label={t.language}>
            <button
              class="segment-choice"
              class:active={activeLanguage === 'en'}
              onclick={() => setLanguage('en')}
              aria-pressed={activeLanguage === 'en'}
            >
              {t.languageEnglish}
            </button>
            <button
              class="segment-choice"
              class:active={activeLanguage === 'sv'}
              onclick={() => setLanguage('sv')}
              aria-pressed={activeLanguage === 'sv'}
            >
              {t.languageSwedish}
            </button>
          </div>
        </div>
      </div>

    {:else if activeEditorTab === 'theme'}
      <div class="tab-content theme-tab">
        <h3 class="section-title">{t.appSettings}</h3>
        <h3 class="section-title">{t.theme}</h3>
        <div class="theme-list">
          {#each THEMES as palette (palette.id)}
            {@const activeTheme = settings.theme ?? 'default'}
            {@const activeVariant = settings.themeVariant ?? 'A'}
            {@const isActiveA = activeTheme === palette.id && activeVariant === 'A'}
            {@const isActiveB = activeTheme === palette.id && activeVariant === 'B'}
            <div class="palette-card">
              <button
                class="palette-half"
                class:active={isActiveA}
                style="background:{palette.colorA}"
                onclick={() => setTheme(palette.id, 'A')}
                aria-label={`${palette.name}, A`}
                aria-pressed={isActiveA}
              >
                <span class="ph-swatch" style="background:{palette.variants.A.surface}; box-shadow: 0 0 0 1px {palette.variants.A.isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)'}"></span>
                <span class="ph-accent" style="background:{palette.variants.A.accent}; box-shadow: 0 0 0 1px {palette.variants.A.isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)'}"></span>
                <span class="ph-label" style="color:{palette.variants.A.isLight ? '#000' : '#fff'}">{palette.name}</span>
                {#if isActiveA}
                  <span class="ph-check" style="color:{palette.variants.A.isLight ? '#000' : '#fff'}">✓</span>
                {/if}
              </button>
              <button
                class="palette-half"
                class:active={isActiveB}
                style="background:{palette.colorB}"
                onclick={() => setTheme(palette.id, 'B')}
                aria-label={`${palette.name}, B`}
                aria-pressed={isActiveB}
              >
                <span class="ph-swatch" style="background:{palette.variants.B.surface}; box-shadow: 0 0 0 1px {palette.variants.B.isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)'}"></span>
                <span class="ph-accent" style="background:{palette.variants.B.accent}; box-shadow: 0 0 0 1px {palette.variants.B.isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)'}"></span>
                <span class="ph-label" style="color:{palette.variants.B.isLight ? '#000' : '#fff'}">{palette.name}</span>
                {#if isActiveB}
                  <span class="ph-check" style="color:{palette.variants.B.isLight ? '#000' : '#fff'}">✓</span>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 260;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 180ms ease, background 180ms ease, visibility 0s linear 180ms;
  }

  .editor-overlay.open {
    pointer-events: auto;
    opacity: 1;
    visibility: visible;
    transition: opacity 180ms ease, background 180ms ease, visibility 0s linear 0s;
  }

  .editor-sheet {
    position: absolute;
    inset: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--bg);
    transform: translateY(100%);
    transition: transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .editor-sheet::-webkit-scrollbar { display: none; }

  .sheet-handle {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: var(--border-subtle);
    margin: 8px auto 0;
    flex-shrink: 0;
    cursor: grab;
  }

  .editor-overlay.open .editor-sheet {
    transform: translateY(0);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 16px 12px;
    padding-top: calc(16px + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    padding: 0;
  }

  .back-btn:hover { background: var(--border); }

  .desktop-close-icon {
    display: none;
  }

  .sheet-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    padding: 0 12px;
  }

  .tab {
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    padding: 12px 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    position: relative;
    transition: color 0.15s;
  }

  .tab::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 8px;
    right: 8px;
    height: 2.5px;
    border-radius: 2px 2px 0 0;
    background: var(--accent);
    transform: scaleX(0);
    transition: transform 0.2s ease;
  }

  .tab.active {
    color: var(--accent);
  }

  .tab.active::after {
    transform: scaleX(1);
  }

  .tab-separator {
    display: flex;
    align-items: center;
    color: var(--border);
    font-size: 14px;
    user-select: none;
    padding: 0 2px;
  }

  .tab.right-group:not(.active) {
    color: var(--text-secondary);
  }

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
  }

  .page-drag-handle:active {
    cursor: grabbing;
  }

  .page-drag-handle.long-pressing {
    color: var(--accent);
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
    background: color-mix(in srgb, var(--accent) 8%, transparent);
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

  .add-seg-cta {
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font-size: 11px;
    font-weight: 700;
    font-family: inherit;
    transition: opacity 150ms;
  }

  .add-seg-cta:hover {
    opacity: 0.7;
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
    gap: 4px;
    flex-shrink: 0;
  }

  .page-action-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms, background 150ms;
  }

  .page-action-btn:hover {
    color: var(--text);
    background: var(--border);
  }

  .page-action-btn.danger:hover {
    color: #dc2626;
    background: #fef2f2;
  }

  /* Segment tab */
  .segment-area {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    transition: background 150ms ease;
  }

  .add-btn:active {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .search-container {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cancel-search-btn {
    width: 100%;
    padding: 10px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }

  .cancel-search-btn:hover {
    background: var(--border);
  }

  .segment-tab {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .segment-page-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px 4px;
  }

  .spi-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .spi-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    padding: 4px 10px;
    transition: border-color 150ms, background 150ms;
  }

  .spi-pill:hover {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .spi-chevron {
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .page-picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.35);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
  }

  .page-picker-sheet {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    max-width: 480px;
    width: 100%;
    max-height: 70vh;
    overflow-y: auto;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
    animation: picker-slide-up 0.25s ease-out;
  }

  @keyframes picker-slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-picker-sheet {
      animation: none;
    }
  }

  .page-picker-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 12px 0;
    text-align: center;
  }

  .page-picker-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .page-picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: border-color 150ms, background 150ms;
    width: 100%;
  }

  .page-picker-item:hover {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .page-picker-item.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .ppi-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .ppi-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .page-picker-item.active .ppi-name {
    color: var(--accent);
  }

  .page-picker-cancel {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 150ms;
  }

  .page-picker-cancel:hover {
    background: var(--border);
  }

  /* Features tab */
  .features-tab {
    padding: 16px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .feature-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .group-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .toggle-desc {
    font-size: 12px;
    color: var(--text-muted);
  }

  .toggle-btn {
    position: relative;
    width: 44px;
    height: 26px;
    border-radius: 13px;
    border: none;
    background: var(--border);
    cursor: pointer;
    transition: background 200ms ease;
    flex-shrink: 0;
    padding: 0;
  }

  .toggle-btn.on {
    background: var(--accent);
  }

  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 200ms ease;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }

  .toggle-btn.on .toggle-knob {
    transform: translateX(18px);
  }

  .nested-control {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  .nested-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .info-btn {
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms ease, background 150ms ease;
  }

  .info-btn:hover {
    color: var(--accent);
    background: var(--accent-subtle);
  }

  .nested-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .segmented-control {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .segment-choice {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .segment-choice.active[data-level="info"] {
    border-color: #3B82F6;
    color: #3B82F6;
    background: rgba(59, 130, 246, 0.10);
  }

  .segment-choice.active[data-level="warning"] {
    border-color: #E67E22;
    color: #E67E22;
    background: rgba(230, 126, 34, 0.10);
  }

  .segment-choice.active[data-level="critical"] {
    border-color: #E74C3C;
    color: #E74C3C;
    background: rgba(231, 76, 60, 0.10);
  }

  .hour-selector {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }

  .hour-choice {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    border-radius: 10px;
    padding: 10px 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
  }

  .hour-choice.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-subtle);
  }

  /* Theme tab */
  .theme-tab {
    padding: 16px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .palette-card {
    display: flex;
    border-radius: 12px;
    overflow: hidden;
    height: 64px;
    border: 1px solid var(--border);
  }

  .palette-half {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 6px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: transform 180ms ease, filter 80ms ease, box-shadow 180ms ease;
    text-align: left;
  }

  .palette-half:hover {
    transform: scale(1.03);
    z-index: 1;
  }

  .palette-half:active {
    transform: scale(0.97);
    filter: brightness(0.9);
  }

  .palette-half.active {
    box-shadow: inset 0 0 0 3px rgba(255,255,255,0.5), inset 0 0 0 5px rgba(0,0,0,0.12);
    z-index: 2;
  }

  .ph-swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ph-accent {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ph-label {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ph-check {
    font-size: 12px;
    font-weight: 900;
    flex-shrink: 0;
  }

  .info-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
  }

  .info-card {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    max-width: 360px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
  }

  .info-card-close {
    position: absolute;
    top: 12px;
    right: 12px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: color 150ms ease, background 150ms ease;
  }

  .info-card-close:hover {
    color: var(--text);
    background: var(--accent-subtle);
  }

  .info-card-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 16px 0;
    padding-right: 24px;
  }

  .info-level {
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
  }

  .info-level:last-child {
    margin-bottom: 0;
  }

  .info-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 5px;
  }

  .info-dot--info {
    background: #3B82F6;
  }

  .info-dot--warning {
    background: #E67E22;
  }

  .info-dot--critical {
    background: #E74C3C;
  }

  .info-level-content {
    flex: 1;
    min-width: 0;
  }

  .info-level-content strong {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    display: block;
    margin-bottom: 2px;
  }

  .info-level-content p {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 4px 0;
    line-height: 1.4;
  }

  .info-level-content ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .info-level-content li {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
    padding-left: 12px;
    position: relative;
  }

  .info-level-content li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--text-ghost);
  }

  @media (prefers-reduced-motion: reduce) {
    .page-item {
      transition: none;
    }
    .drop-ghost {
      animation: none;
    }
  }

  /* ── Tablet/desktop: fixed inspector overlay ── */
  @media (min-width: 768px) {
    .editor-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .editor-overlay.open {
      background: rgba(0, 0, 0, 0.16);
    }

    .editor-sheet {
      position: relative;
      inset: auto;
      width: min(760px, calc(100vw - 48px));
      height: min(780px, calc(100dvh - 48px));
      max-width: none;
      max-height: none;
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, #fff 28%);
      border-radius: 28px;
      box-shadow:
        0 24px 80px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.32);
      transform: translateY(20px) scale(0.985);
      opacity: 0;
    }

    .sheet-handle {
      width: 44px;
      margin-top: 10px;
      background: color-mix(in srgb, var(--border-subtle) 70%, #fff 30%);
    }

    .editor-overlay.open .editor-sheet {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    .sheet-header {
      padding-top: 16px;
    }

    .back-btn {
      width: 40px;
      height: 40px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset;
    }

    .back-btn:hover {
      background: var(--accent-subtle);
    }

    .mobile-close-icon {
      display: none;
    }

    .desktop-close-icon {
      display: block;
    }

    .tab-bar {
      padding: 0 16px;
    }
  }
</style>
