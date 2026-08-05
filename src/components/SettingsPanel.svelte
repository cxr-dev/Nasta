<script lang="ts">
  import { THEMES, previewStyle, getVariantName } from '../themes';
  import { getT } from '../stores/localeStore.svelte';
  import { infoCircle, arrowUpDown, layersIcon, checkIcon, clockIcon, sortAlphaIcon, sortNumericIcon, busFrontIcon, mapPinIcon, gripIcon } from '../icons/departureIcons';
  import Sheet from './Sheet.svelte';
  import { getSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setAfterworkStartHour, setEventsEnabled, setGroupingMode, setSortMode, setLanguage, setTheme, setGroupSleeping } from '../stores/settingsStore.svelte';
  import type { SortMode, GroupingMode } from '../types/page';

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

  let sortSettingsOptions = $derived([
    { mode: 'manual' as SortMode, icon: gripIcon, label: t.sortManual },
    { mode: 'time' as SortMode, icon: clockIcon, label: t.sortTime },
    { mode: 'station' as SortMode, icon: sortAlphaIcon, label: t.sortStation },
    { mode: 'line' as SortMode, icon: sortNumericIcon, label: t.sortLine },
    { mode: 'transport' as SortMode, icon: busFrontIcon, label: t.sortTransport },
    { mode: 'distance' as SortMode, icon: mapPinIcon, label: t.sortDistance },
  ]);

  let groupingSettingsOptions = $derived([
    { mode: 'none' as GroupingMode, label: t.groupNone },
    { mode: 'disrupted' as GroupingMode, label: t.groupDisrupted },
    { mode: 'station' as GroupingMode, label: t.groupStation },
    { mode: 'transport' as GroupingMode, label: t.groupTransport },
  ]);

  let openPicker = $state<'sort' | 'group' | null>(null);

  let currentSortLabel = $derived(
    sortSettingsOptions.find(o => o.mode === settings.sortMode)?.label ?? ''
  );
  let currentGroupLabel = $derived(
    groupingSettingsOptions.find(o => o.mode === settings.groupingMode)?.label ?? ''
  );

  $effect(() => {
    if (isOpen) activeEditorTab = 'features';
  });
</script>

<Sheet
  isOpen={isOpen}
  onClose={onClose}
  title={t.settings}
  closeAriaLabel={t.closePanel}
  overlayClass="settings-overlay"
  sheetClass="settings-sheet"
>
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

        <!-- Location Section -->
        <div class="feature-group">
          <h3 class="group-title">{t.location}</h3>
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.locationServices}</span>
            </div>
            <button
              class="toggle-btn no-scale"
              class:on={settings.locationServicesEnabled ?? false}
              onclick={() => setLocationServicesEnabled(!(settings.locationServicesEnabled ?? false))}
              aria-label={t.locationServices}
              role="switch"
              aria-checked={settings.locationServicesEnabled ?? false}
            >
              <span class="toggle-knob"></span>
            </button>
          </label>
          {#if settings.locationServicesEnabled}
            <label class="toggle-row sub-row">
              <div class="toggle-label">
                <span class="toggle-name">{t.walkingEta}</span>
                <span class="toggle-desc">{t.walkingEtaDesc}</span>
              </div>
              <button
                class="toggle-btn no-scale"
                class:on={settings.walkingEtaEnabled ?? false}
                onclick={() => setWalkingEtaEnabled(!(settings.walkingEtaEnabled ?? false))}
                aria-label={t.walkingEta}
                role="switch"
                aria-checked={settings.walkingEtaEnabled ?? false}
              >
                <span class="toggle-knob"></span>
              </button>
            </label>
          {/if}
        </div>

        <!-- Sort & Group Section -->
        <div class="feature-group">
          <h3 class="group-title">{t.sortGroupSection}</h3>

          <!-- Sort picker -->
          <div class="picker-row">
            <button
              class="picker-trigger"
              onclick={() => openPicker = openPicker === 'sort' ? null : 'sort'}
              aria-expanded={openPicker === 'sort'}
              aria-controls="sort-picker-options"
            >
              <span class="picker-label">{t.sortBy}</span>
              <span class="picker-value">{currentSortLabel}</span>
              <span class="picker-chevron" class:open={openPicker === 'sort'}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                </svg>
              </span>
            </button>
            {#if openPicker === 'sort'}
              <div class="picker-options" id="sort-picker-options" role="listbox" aria-label={t.sortBy}>
                {#each sortSettingsOptions as opt}
                  {@const disabled = opt.mode === 'distance' && !(settings.locationServicesEnabled ?? false)}
                  <button
                    class="picker-option"
                    class:selected={settings.sortMode === opt.mode}
                    disabled={disabled}
                    onclick={() => { setSortMode(opt.mode); openPicker = null; }}
                    role="option"
                    aria-selected={settings.sortMode === opt.mode}
                  >
                    <span class="picker-check" class:visible={settings.sortMode === opt.mode}>
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                        <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                    <span class="picker-option-label">{opt.label}</span>
                    {#if disabled}
                      <span class="picker-hint">{t.sortDistanceDisabled}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Group picker -->
          <div class="picker-row">
            <button
              class="picker-trigger"
              onclick={() => openPicker = openPicker === 'group' ? null : 'group'}
              aria-expanded={openPicker === 'group'}
              aria-controls="group-picker-options"
            >
              <span class="picker-label">{t.groupBy}</span>
              <span class="picker-value">{currentGroupLabel}</span>
              <span class="picker-chevron" class:open={openPicker === 'group'}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                </svg>
              </span>
            </button>
            {#if openPicker === 'group'}
              <div class="picker-options" id="group-picker-options" role="listbox" aria-label={t.groupBy}>
                {#each groupingSettingsOptions as opt}
                  <button
                    class="picker-option"
                    class:selected={settings.groupingMode === opt.mode}
                    onclick={() => { setGroupingMode(opt.mode); openPicker = null; }}
                    role="option"
                    aria-selected={settings.groupingMode === opt.mode}
                  >
                    <span class="picker-check" class:visible={settings.groupingMode === opt.mode}>
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                        <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                    <span class="picker-option-label">{opt.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Group sleeping toggle -->
          <label class="toggle-row">
            <div class="toggle-label">
              <span class="toggle-name">{t.groupSleeping}</span>
              <span class="toggle-desc">{t.groupSleepingDesc}</span>
            </div>
            <button
              class="toggle-btn no-scale"
              class:on={settings.groupSleeping ?? false}
              onclick={() => setGroupSleeping(!(settings.groupSleeping ?? false))}
              aria-label={t.groupSleeping}
              role="switch"
              aria-checked={settings.groupSleeping ?? false}
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
                aria-label={getVariantName(palette.id, 'A')}
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
                    <span class="ph-preview-name">{getVariantName(palette.id, 'A')}</span>
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
                aria-label={getVariantName(palette.id, 'B')}
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
                    <span class="ph-preview-name">{getVariantName(palette.id, 'B')}</span>
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
</Sheet>

<style>
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

  .sub-row {
    padding-left: 8px;
  }

  /* Existing styles continue */
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

  /* Sort & Group picker dropdowns */
  .picker-row {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    overflow: hidden;
  }

  .picker-row + .picker-row {
    margin-top: 8px;
  }

  .picker-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    background: none;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .picker-label {
    color: var(--text-secondary);
    font-weight: 500;
    flex-shrink: 0;
  }

  .picker-value {
    margin-left: auto;
    font-weight: 600;
    color: var(--accent);
  }

  .picker-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .picker-chevron.open {
    transform: rotate(180deg);
  }

  .picker-options {
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 4px;
    gap: 2px;
    background: var(--surface);
  }

  .picker-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: none;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 8px;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.1s;
  }

  .picker-option:hover {
    background: var(--accent-subtle);
  }

  .picker-option.selected {
    font-weight: 600;
    color: var(--accent);
  }

  .picker-option:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .picker-check {
    width: 18px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .picker-check.visible {
    opacity: 1;
  }

  .picker-option-label {
    flex: 1;
  }

  .picker-hint {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
    flex-shrink: 0;
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

  /* ── Tablet/desktop: fixed inspector overlay ── */
  @media (min-width: 768px) {
    .tab-bar {
      padding: 0 16px;
    }
  }
</style>
