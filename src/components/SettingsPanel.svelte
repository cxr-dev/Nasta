<script lang="ts">
  import { THEMES, previewStyle } from '../themes';
  import { getT } from '../stores/localeStore.svelte';
  import gsap from 'gsap';
  import { infoCircle } from '../icons/departureIcons';
  import { getSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setAfterworkStartHour, setEventsEnabled, setGroupDisruptedSegments, setLanguage, setTheme } from '../stores/settingsStore.svelte';

  let t = $derived(getT());

  let {
    isOpen,
    onClose
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let activeEditorTab = $state<'features' | 'theme'>('features');
  let infoOpen = $state(false);
  let settings = $derived(getSettings());
  let activeLanguage = $derived(settings.language ?? 'auto');
  let activeDisruptionThreshold = $derived(settings.disruptionSeverityThreshold ?? 'warning');

  let swipeStartY = 0;

  function isReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function handleClose() {
    if (isReducedMotion()) {
      onClose();
      return;
    }
    gsap.to('.settings-sheet', {
      y: '100%',
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        gsap.set('.settings-overlay', { opacity: 0, visibility: 'hidden' });
        onClose();
      }
    });
  }

  function handleOverlayClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.settings-sheet')) return;
    handleClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleSheetHandleTouchStart(e: TouchEvent) {
    swipeStartY = e.touches[0].clientY;
  }

  function handleSheetHandleTouchMove(e: TouchEvent) {
    if (swipeStartY === 0) return;
    const dy = e.touches[0].clientY - swipeStartY;
    if (dy < 0) return;
    gsap.set('.settings-sheet', { y: `${dy}px`, overwrite: 'auto' });
  }

  function handleSheetHandleTouchEnd(e: TouchEvent) {
    if (swipeStartY === 0) return;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    swipeStartY = 0;
    if (dy > 48) {
      handleClose();
    } else {
      gsap.to('.settings-sheet', { y: '0%', duration: 0.25, ease: 'power2.out' });
    }
  }

  $effect(() => {
    if (isOpen) {
      activeEditorTab = 'features';
      if (isReducedMotion()) {
        gsap.set('.settings-overlay', { opacity: 1, visibility: 'visible' });
        gsap.set('.settings-sheet', { y: '0%' });
        return;
      }
      gsap.set('.settings-overlay', { opacity: 0, visibility: 'visible' });
      gsap.to('.settings-overlay', { opacity: 1, duration: 0.18, ease: 'power2.out' });
      gsap.fromTo('.settings-sheet', { y: '100%' }, { y: '0%', duration: 0.4, ease: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="settings-overlay" class:open={isOpen} aria-hidden={!isOpen} aria-modal="true" onclick={handleOverlayClick} onkeydown={handleKeydown} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="settings-sheet"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
  >
    <div
      class="sheet-handle"
      aria-hidden="true"
      ontouchstart={handleSheetHandleTouchStart}
      ontouchmove={handleSheetHandleTouchMove}
      ontouchend={handleSheetHandleTouchEnd}
    ></div>
    <div class="sheet-header">
      <button type="button" class="back-btn" onclick={handleClose} aria-label={t.closePanel}>
        <svg class="mobile-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        <svg class="desktop-close-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6 6 18"/>
        </svg>
      </button>
      <span class="sheet-title">{t.settings}</span>
    </div>

    <div class="tab-bar" role="tablist" aria-label={t.settings}>
      <button type="button" role="tab" class="tab" class:active={activeEditorTab === 'features'} aria-selected={activeEditorTab === 'features'} onclick={() => activeEditorTab = 'features'}>{t.tabFeatures}</button>
      <button type="button" role="tab" class="tab" class:active={activeEditorTab === 'theme'} aria-selected={activeEditorTab === 'theme'} onclick={() => activeEditorTab = 'theme'}>{t.tabTheme}</button>
    </div>

    {#if activeEditorTab === 'features'}
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
              class="toggle-btn no-scale"
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
                <button class="info-card-close" onclick={() => (infoOpen = false)} aria-label={t.closePanel}>×</button>
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
              class="toggle-btn no-scale"
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
              class="toggle-btn no-scale"
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
              class="toggle-btn no-scale"
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
              class="toggle-btn no-scale"
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
          <div class="segmented-control language-control" role="group" aria-label={t.language}>
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
                style={previewStyle(palette, 'A')}
                onclick={() => setTheme(palette.id, 'A')}
                aria-label={`${palette.name}, A`}
                aria-pressed={isActiveA}
              >
                <span class="ph-accent-bar"></span>
                <span class="ph-preview-content">
                  <span class="ph-preview-row">
                    <span class="ph-preview-route">67</span>
                    <span class="ph-preview-countdown">4 min</span>
                  </span>
                  <span class="ph-preview-row2">
                    <span class="ph-preview-dest">→ Skansen</span>
                    <span class="ph-preview-name">{palette.name}</span>
                    {#if isActiveA}
                      <span class="ph-preview-check">✓</span>
                    {/if}
                  </span>
                </span>
              </button>
              <button
                class="palette-half"
                class:active={isActiveB}
                style={previewStyle(palette, 'B')}
                onclick={() => setTheme(palette.id, 'B')}
                aria-label={`${palette.name}, B`}
                aria-pressed={isActiveB}
              >
                <span class="ph-accent-bar"></span>
                <span class="ph-preview-content">
                  <span class="ph-preview-row">
                    <span class="ph-preview-route">67</span>
                    <span class="ph-preview-countdown">4 min</span>
                  </span>
                  <span class="ph-preview-row2">
                    <span class="ph-preview-dest">→ Skansen</span>
                    <span class="ph-preview-name">{palette.name}</span>
                    {#if isActiveB}
                      <span class="ph-preview-check">✓</span>
                    {/if}
                  </span>
                </span>
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
  }

  .settings-overlay.open {
    pointer-events: auto;
  }

  .settings-sheet {
    position: absolute;
    inset: 0;
    max-width: 480px;
    margin: 0 auto;
    background: var(--bg);
    transform: translateY(100%);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .settings-sheet::-webkit-scrollbar { display: none; }

  .sheet-handle {
    width: 40px;
    height: 8px;
    border-radius: 3px;
    background: var(--border-subtle);
    margin: 8px auto 6px;
    flex-shrink: 0;
    cursor: grab;
    touch-action: manipulation;
  }

  .settings-overlay.open .settings-sheet {
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

  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
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
    background: var(--text-on-accent, #fff);
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
    width: 24px;
    height: 24px;
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

  .language-control {
    grid-template-columns: repeat(2, 1fr);
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
    border-color: var(--color-info);
    color: var(--color-info);
    background: var(--color-info-subtle);
  }

  .segment-choice.active[data-level="warning"] {
    border-color: var(--color-warning);
    color: var(--color-warning);
    background: var(--color-warning-subtle);
  }

  .segment-choice.active[data-level="critical"] {
    border-color: var(--color-critical);
    color: var(--color-critical);
    background: var(--color-critical-subtle);
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
    height: 72px;
    border: 1px solid var(--border);
  }

  .palette-half {
    flex: 1;
    display: flex;
    align-items: stretch;
    padding: 0;
    gap: 0;
    border: none;
    cursor: pointer;
    position: relative;
    transition: transform 180ms ease, filter 80ms ease, background-color 180ms ease;
    text-align: left;
    font-family: inherit;
    background-color: var(--preview-bg);
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
    background-color: color-mix(in oklch, var(--preview-accent) 15%, var(--preview-bg));
    z-index: 1;
  }

  .palette-half.active .ph-accent-bar {
    width: 6px;
    background: var(--preview-text);
  }

  .ph-accent-bar {
    width: 3px;
    flex-shrink: 0;
    background: var(--preview-border);
    border-radius: 0 2px 2px 0;
    transition: width 150ms ease, background-color 150ms ease;
  }

  .ph-preview-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    min-width: 0;
    padding: 6px 8px 6px 5px;
    gap: 3px;
  }

  .ph-preview-row,
  .ph-preview-row2 {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .ph-preview-row {
    justify-content: space-between;
  }

  .ph-preview-route {
    font-size: 14px;
    font-weight: 900;
    line-height: 1.2;
    color: var(--preview-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ph-preview-countdown {
    font-family: 'Neue Machina', sans-serif;
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
    color: var(--preview-accent);
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .ph-preview-dest {
    font-size: 9px;
    line-height: 1.3;
    color: var(--preview-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .ph-preview-name {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--preview-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ph-preview-check {
    font-size: 10px;
    font-weight: 900;
    color: var(--preview-accent);
    flex-shrink: 0;
    margin-left: 2px;
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
    background: var(--color-info);
  }

  .info-dot--warning {
    background: var(--color-warning);
  }

  .info-dot--critical {
    background: var(--color-critical);
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
    .settings-overlay {
      transition: none;
    }
    .settings-overlay.open {
      transition: none;
    }
    .settings-sheet {
      transition: none;
    }
    .settings-overlay.open .settings-sheet {
      transition: none;
    }
  }

  /* ── Tablet/desktop: fixed inspector overlay ── */
  @media (min-width: 768px) {
    .settings-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .settings-overlay.open {
      background: rgba(0, 0, 0, 0.16);
    }

    .settings-sheet {
      position: relative;
      inset: auto;
      width: min(760px, calc(100vw - 48px));
      height: min(780px, calc(100dvh - 48px));
      max-width: none;
      max-height: none;
      margin: 0;
      border: 1px solid color-mix(in oklch, var(--border-subtle) 72%, var(--bg) 28%);
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
      background: color-mix(in oklch, var(--border-subtle) 70%, var(--bg) 30%);
    }

    .settings-overlay.open .settings-sheet {
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
