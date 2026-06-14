<script lang="ts">
  import type { Page, TransportType, Stop, SegmentDirection } from '../types/page';
  import { addSegment as storeAddSegment, renamePage, reorderPages } from '../stores/pageStore.svelte';
  import { setActivePage, createPage, deletePage, getDefaultName } from '../stores/pageStore.svelte';
  import { getSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setAfterworkStartHour, setEventsEnabled, setLanguage, setTheme } from '../stores/settingsStore.svelte';
  import { THEMES } from '../themes';
  import gsap from 'gsap';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';

  let {
    pages,
    activePageId,
    isOpen,
    onClose,
    onSwitchPage,
    onboardingHighlight = false
  }: {
    pages: Page[];
    activePageId: string;
    isOpen: boolean;
    onClose: () => void;
    onSwitchPage: (pageId: string) => void;
    onboardingHighlight?: boolean;
  } = $props();

  let activeEditorTab = $state<'pages' | 'segment' | 'features' | 'theme'>('segment');

  let page = $derived(pages.find(p => p.id === activePageId));
  let showSearch = $state(false);
  let hasManuallyClosedSearch = $state(false);
  let autoSearch = $derived(!hasManuallyClosedSearch && (!page || page.segments.length === 0));
  import { infoCircle } from '../icons/departureIcons';
  let hintDismissed = $state(false);
  let infoOpen = $state(false);
  let settings = $derived(getSettings());
  let activeLanguage = $derived(settings.language ?? 'auto');
  let activeDisruptionThreshold = $derived(settings.disruptionSeverityThreshold ?? 'warning');
  let renameId = $state<string | null>(null);
  let renameValue = $state('');
  let hintEl = $state<HTMLDivElement | undefined>();
  let addBtnEl = $state<HTMLButtonElement | undefined>();
  let dotEl = $state<HTMLSpanElement | undefined>();

  $effect(() => {
    if (!hintEl) return;
    gsap.fromTo(hintEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  });

  $effect(() => {
    if (!addBtnEl) return;
    const ring = gsap.to(addBtnEl, {
      boxShadow: '0 0 0 12px rgba(23,23,23,0)',
      duration: 1.3,
      ease: 'power1.inOut',
      repeat: -1,
      yoyo: true,
    });
    return () => ring.kill();
  });

  $effect(() => {
    if (!dotEl) return;
    const dot = gsap.to(dotEl, {
      scale: 1.15,
      boxShadow: '0 0 0 10px rgba(23,23,23,0)',
      duration: 0.8,
      ease: 'power1.inOut',
      repeat: -1,
      yoyo: true,
    });
    return () => dot.kill();
  });

  function getPageLabel(p: Page): string {
    return p.name;
  }

  function isLightColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.5;
  }

  function dismissOnboardingHint() {
    localStorage.setItem('nasta_onboarding_seen', 'true');
    hintDismissed = true;
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
    const name = getDefaultName();
    const newId = createPage(name);
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
</script>

<div class="editor-overlay" class:open={isOpen} aria-hidden={!isOpen}>
  <div class="editor-sheet">
    <div class="sheet-header">
      <button class="back-btn" onclick={onClose} aria-label={t.closeEditor}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <span class="sheet-title">
        {t.editingPage}: {page ? getPageLabel(page) : ''}
      </span>
    </div>

    <div class="tab-bar" role="tablist" aria-label={t.settings}>
      {#each (['pages', 'segment', 'features', 'theme'] as const) as tab (tab)}
        {@const label =
          tab === 'pages' ? t.tabPages :
          tab === 'segment' ? t.tabSegments :
          tab === 'features' ? t.tabFeatures :
          t.tabTheme}
        <button
          type="button"
          role="tab"
          class="tab"
          class:active={activeEditorTab === tab}
          aria-selected={activeEditorTab === tab}
          onclick={() => activeEditorTab = tab}
        >
          {label}
        </button>
      {/each}
    </div>

    {#if activeEditorTab === 'pages'}
      <div class="tab-content pages-tab">
        <h3 class="section-title">{t.pages}</h3>
        <div class="page-list">
          {#each pages as page, index (page.id)}
            <div class="page-item" class:active={page.id === activePageId}>
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
                <button
                  class="page-name-btn"
                  onclick={() => handlePageSwitch(page.id)}
                  aria-current={page.id === activePageId ? 'page' : undefined}
                >
                  {page.name}
                </button>
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
                {#if index > 0}
                  <button
                    class="page-action-btn"
                    onclick={() => handleReorderPage(index, index - 1)}
                    aria-label={t.settings}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                      <path d="M8 2l-5 5h10L8 2zM8 14l5-5H3l5 5z"/>
                    </svg>
                  </button>
                {/if}
                {#if index < pages.length - 1}
                  <button
                    class="page-action-btn"
                    onclick={() => handleReorderPage(index, index + 1)}
                    aria-label={t.settings}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" transform="rotate(180)">
                      <path d="M8 2l-5 5h10L8 2zM8 14l5-5H3l5 5z"/>
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        <button class="add-page-btn" onclick={handleCreatePage}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          {t.add}
        </button>
      </div>

    {:else if activeEditorTab === 'segment'}
      <div class="tab-content">
        {#if page}
          {#if showSearch || autoSearch}
            <div class="search-container">
              {#if onboardingHighlight && !hintDismissed}
                <div bind:this={hintEl} class="onboarding-hint" role="tooltip" aria-live="polite">
                  <div class="hint-badge">{t.onboardingHintNew}</div>
                  <span>{t.onboardingHintText}</span>
                  <button onclick={dismissOnboardingHint} aria-label={t.dismissHint}>×</button>
                </div>
              {/if}
              <SegmentSearch onSelect={addSegment} />
              <button class="cancel-search-btn" onclick={() => { showSearch = false; hasManuallyClosedSearch = true; }}>
                {t.cancel}
              </button>
            </div>
          {:else}
            <div class="segment-area">
              <SegmentList page={page} />
              <button
                bind:this={addBtnEl}
                class="add-btn"
                class:onboarding-highlight={onboardingHighlight && (!page || page.segments.length === 0)}
                onclick={() => showSearch = true}
              >
                {t.addSegment}
                {#if onboardingHighlight && (!page || page.segments.length === 0)}
                  <span bind:this={dotEl} class="pulse-dot-el"></span>
                {/if}
              </button>
            </div>
          {/if}
        {/if}
      </div>

    {:else if activeEditorTab === 'features'}
      <div class="tab-content features-tab">
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
    z-index: 100;
    pointer-events: none;
  }

  .editor-overlay.open {
    pointer-events: auto;
  }

  .editor-sheet {
    position: absolute;
    inset: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--bg);
    transform: translateY(100%);
    transition: transform 200ms ease-out;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .editor-sheet::-webkit-scrollbar { display: none; }

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

  .page-name-btn {
    flex: 1;
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

  .add-page-btn {
    width: 100%;
    padding: 10px;
    border: 1.5px dashed var(--border-subtle);
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: border-color 150ms, color 150ms;
  }

  .add-page-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
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
    border: 1.5px dashed var(--border-subtle);
    border-radius: 12px;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 150ms, color 150ms;
  }

  .add-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
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

  /* Onboarding hint */
  .onboarding-hint {
    position: relative;
    margin-bottom: -4px;
    z-index: 300;
    background: linear-gradient(135deg, color-mix(in srgb, var(--surface) 90%, #fff), color-mix(in srgb, var(--accent-subtle) 25%, #fff));
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
    border-radius: 16px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .onboarding-hint span {
    font-size: 13px;
    color: var(--text);
    font-weight: 600;
  }

  .onboarding-hint button {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }

  .hint-badge {
    flex-shrink: 0;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 3px 7px;
    color: var(--text-on-accent);
    background: var(--accent);
  }

  .add-btn.onboarding-highlight {
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35);
  }

  .pulse-dot-el {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.4);
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
    .pulse-dot-el {
      display: none;
    }
  }
</style>
