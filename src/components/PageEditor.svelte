<script lang="ts">
  import type { Page, TransportType, Stop, SegmentDirection } from '../types/page';
  import { addSegment as storeAddSegment, renamePage, reorderPages } from '../stores/pageStore.svelte';
  import { setActivePage, createPage, deletePage, getDefaultName } from '../stores/pageStore.svelte';
  import { getSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setEventsEnabled, setLanguage, setTheme } from '../stores/settingsStore.svelte';
  import { THEMES } from '../themes';
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

  let page = $derived(pages.find(p => p.id === activePageId));
  let showSearch = $state(false);
  let hasManuallyClosedSearch = $state(false);
let autoSearch = $derived(!hasManuallyClosedSearch && (!page || page.segments.length === 0));
  let hintDismissed = $state(false);
  let settings = $derived(getSettings());
  let activeLanguage = $derived(settings.language ?? 'auto');
  let activeDisruptionThreshold = $derived(settings.disruptionSeverityThreshold ?? 'warning');
  let showPageManager = $state(false);
  let renameId = $state<string | null>(null);
  let renameValue = $state('');

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
    showPageManager = true;
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
      {#if pages.length > 0}
        <button
          class="page-manager-toggle"
          onclick={() => showPageManager = !showPageManager}
          aria-label={t.settings}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path d="M5 10a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
          </svg>
        </button>
      {/if}
    </div>

    {#if showPageManager}
      <div class="page-manager">
        <h3 class="page-manager-title">{t.pages ?? 'Pages'}</h3>
        <div class="page-list">
          {#each pages as page, index (page.id)}
            <div class="page-item" class:active={page.id === activePageId}>
              <button
                class="page-select-btn"
                onclick={() => handlePageSwitch(page.id)}
                aria-current={page.id === activePageId ? 'page' : undefined}
              >
                <span class="page-index">{index + 1}</span>
                {#if renameId === page.id}
                  <input
                    type="text"
                    class="page-rename-input"
                    bind:value={renameValue}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenamePage(page.id, renameValue);
                      }
                      if (e.key === 'Escape') {
                        renameId = null;
                      }
                    }}
                    onblur={() => handleRenamePage(page.id, renameValue)}
                    
                  />
                {:else}
                  <span class="page-name">{page.name}</span>
                {/if}
              </button>
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
                      <path d="M2 4h12M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M4 4v9.5a1 1 0 001 1h6a1 1 0 001-1V4"/>
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
    {/if}

    {#if page}
      {#if showSearch || autoSearch}
        <div class="search-container">
          {#if onboardingHighlight && !hintDismissed}
            <div class="onboarding-hint" role="tooltip" aria-live="polite">
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
          <button class="add-btn"             class:onboarding-highlight={onboardingHighlight && (!page || page.segments.length === 0)} onclick={() => showSearch = true}>
            {t.addSegment}
          </button>
        </div>
      {/if}
    {/if}

    <div class="settings-section">
      <h2 class="settings-title">{t.settings}</h2>

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
        <div class="setting-block nested">
          <div class="toggle-label">
            <span class="toggle-name">{t.disruptionThreshold}</span>
            <span class="toggle-desc">{t.disruptionThresholdDesc}</span>
          </div>
          <div class="segmented-control" role="group" aria-label={t.disruptionThreshold}>
            <button
              class="segment-choice"
              class:active={activeDisruptionThreshold === 'info'}
              onclick={() => setDisruptionSeverityThreshold('info')}
              aria-pressed={activeDisruptionThreshold === 'info'}
            >
              {t.disruptionThresholdInfo}
            </button>
            <button
              class="segment-choice"
              class:active={activeDisruptionThreshold === 'warning'}
              onclick={() => setDisruptionSeverityThreshold('warning')}
              aria-pressed={activeDisruptionThreshold === 'warning'}
            >
              {t.disruptionThresholdWarning}
            </button>
            <button
              class="segment-choice"
              class:active={activeDisruptionThreshold === 'critical'}
              onclick={() => setDisruptionSeverityThreshold('critical')}
              aria-pressed={activeDisruptionThreshold === 'critical'}
            >
              {t.disruptionThresholdCritical}
            </button>
          </div>
        </div>
      {/if}

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

      <div class="setting-block">
        <div class="toggle-label">
          <span class="toggle-name">{t.language} (App)</span>
          <span class="toggle-desc">App interface language.</span>
        </div>
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

      <div class="theme-section">
        <h3 class="theme-title">{t.theme}</h3>
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
                <span class="ph-name" style="color:{isLightColor(palette.colorA) ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)'}">{palette.name}</span>
                <span class="ph-dot" style="background:{palette.colorB}; box-shadow: 0 0 0 2px {isLightColor(palette.colorA) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)'}"></span>
                {#if isActiveA}
                  <span class="ph-check" style="color:{isLightColor(palette.colorA) ? '#000' : '#fff'}">✓</span>
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
                <span class="ph-name" style="color:{isLightColor(palette.colorB) ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)'}">{palette.name}</span>
                <span class="ph-dot" style="background:{palette.colorA}; box-shadow: 0 0 0 2px {isLightColor(palette.colorB) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)'}"></span>
                {#if isActiveB}
                  <span class="ph-check" style="color:{isLightColor(palette.colorB) ? '#000' : '#fff'}">✓</span>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
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
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
  scrollbar-width: none; 
  -ms-overflow-style: none;
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
}

.page-manager-toggle {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--accent-subtle);
  border-radius: 8px;
  color: var(--accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.page-manager-toggle:hover {
  background: var(--border);
}

.segment-area {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}

.add-btn {
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
  flex: 1;
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

/* Page Manager */
.page-manager {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.page-manager-title {
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
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  transition: border-color 150ms;
}

.page-item.active {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.page-select-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  color: var(--text);
  min-width: 0;
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

.page-name {
  font-size: 14px;
  font-weight: 600;
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

/* Settings section */
.settings-section {
  margin: 0 16px calc(env(safe-area-inset-bottom) + 140px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: 16px;
  border-top: 1px solid var(--border);
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

.toggle-btn:disabled {
  cursor: not-allowed;
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

.theme-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-block.nested {
  margin: -4px 0 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.theme-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.theme-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.segment-choice.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-subtle);
}

.palette-card {
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  height: 68px;
}

.palette-half {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 8px;
  border: none;
  cursor: pointer;
  position: relative;
  transition: transform 180ms ease, filter 80ms ease, box-shadow 180ms ease;
  text-align: left;
}

.palette-half:hover {
  transform: scale(1.02);
  z-index: 1;
}

.palette-half:active {
  transform: scale(0.96);
  filter: brightness(0.9);
}

.palette-half.active {
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.55), inset 0 0 0 5px rgba(0,0,0,0.15);
}

.palette-half .ph-check {
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.palette-half.active .ph-check {
  transform: scale(1);
}

.ph-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ph-check {
  font-size: 13px;
  font-weight: 900;
  flex-shrink: 0;
}

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
  animation: hint-slide-in 250ms ease-out;
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
  color: #fff;
  background: var(--accent);
}

.add-btn.onboarding-highlight {
  box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35);
  animation: pulse-ring 1300ms ease-out infinite;
}

.add-btn.onboarding-highlight::after {
  content: '';
  position: absolute;
  top: -8px;
  right: -8px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.4);
  animation: pulse-dot 1300ms ease-out infinite;
}

@keyframes hint-slide-in {
  0% {
    transform: translateX(-50%) translateY(20px);
    opacity: 0;
  }
  60% {
    transform: translateX(-50%) translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.34); }
  80% { box-shadow: 0 0 0 12px rgba(23, 23, 23, 0); }
  100% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
}

@keyframes pulse-dot {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35); }
  75% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(23, 23, 23, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
}

</style>