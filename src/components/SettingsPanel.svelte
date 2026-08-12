<script lang="ts">
  import { tick } from 'svelte';
  import { previewStyle } from '../themes';
  import type { ThemePreference, ResolvedTheme } from '../themes';
  import { getT } from '../stores/localeStore.svelte';
  import { infoCircle, alertTriangle, bellIcon, locateIcon, arrowUpDown, wineIcon, calendarDaysIcon, languagesIcon, databaseBackupIcon, clockIcon, sortAlphaIcon, sortNumericIcon, busFrontIcon, mapPinIcon, downloadIcon, uploadIcon, trash2Icon } from '../icons/departureIcons';
  import { clearLocationSession, requestLocation } from '../services/geo';
  import Sheet from './Sheet.svelte';
  import SurfaceControl from './SurfaceControl.svelte';
  import { focusBoundary } from '../lib/focusBoundary';
  import { getSettings, subscribePersistence, retryPersistence, replaceInMemory as replaceSettingsInMemory, clearAll as clearSettings, setDisruptionAlertsEnabled, setDisruptionSeverityThreshold, setWalkingEtaEnabled, setLocationServicesEnabled, setAfterworkVenuesEnabled, setAfterworkStartHour, setEventsEnabled, setGroupingMode, setSortMode, setLanguage, setTheme, setGroupSleeping } from '../stores/settingsStore.svelte';
  import { clearAll as clearPages, getActivePageId, getPages, replaceInMemory as replacePagesInMemory, setActivePage } from '../stores/pageStore.svelte';
  import { departureStore } from '../stores/departureStore.svelte';
  import { deviationStore } from '../stores/deviationStore.svelte';
  import { clearAppOwnedData } from '../services/appDataReset';
  import { createBackupDocument, exportBackupDocument, mergePages, normalizeRestoredPages, parseBackupDocument, persistRestoredData, summarizePages, type BackupDocument } from '../services/backup';
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
  let infoTriggerEl = $state<HTMLButtonElement>();
  let settings = $derived(getSettings());
  let activeLanguage = $derived(settings.language ?? 'auto');
  let activeDisruptionThreshold = $derived(settings.disruptionSeverityThreshold ?? 'warning');
  let activeTheme = $derived(settings.theme ?? 'system');
  let persistenceFailed = $state(false);
  let backupFileInput = $state<HTMLInputElement>();
  let backupImportTriggerEl = $state<HTMLButtonElement>();
  let backupPanelEl = $state<HTMLElement>();
  let resetTriggerEl = $state<HTMLButtonElement>();
  let resetInputEl = $state<HTMLInputElement>();
  let pendingBackup = $state<BackupDocument | null>(null);
  let selectedImportMode = $state<'replace' | 'add' | null>(null);
  let dataError = $state('');
  let dataNotice = $state('');
  let resetPhrase = $state('');
  let resetDialogOpen = $state(false);

  const themeChoices: Array<{ id: ThemePreference; label: keyof typeof t; preview: ResolvedTheme; description?: keyof typeof t }> = [
    { id: 'system', label: 'themeSystem', preview: 'light', description: 'themeSystemDesc' },
    { id: 'light', label: 'themeLight', preview: 'light' },
    { id: 'dark', label: 'themeDark', preview: 'dark' },
  ];

  let sortSettingsOptions = $derived([
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

  $effect(() => {
    if (!isOpen) return;
    return subscribePersistence((failed) => {
      persistenceFailed = failed;
    });
  });

  function toggleLocationServices() {
    const enabled = !(settings.locationServicesEnabled ?? false);
    setLocationServicesEnabled(enabled);
    if (enabled) {
      void requestLocation();
    } else {
      clearLocationSession();
    }
  }

  function toggleWalkingEta() {
    const enabled = !(settings.walkingEtaEnabled ?? false);
    setWalkingEtaEnabled(enabled);
    if (enabled) void requestLocation();
  }

  function handleInfoBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) void closeDisruptionInfo();
  }

  function handleInfoKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    void closeDisruptionInfo();
  }

  function openDisruptionInfo(event: MouseEvent) {
    (event.currentTarget as HTMLButtonElement).focus();
    infoOpen = true;
  }

  async function closeDisruptionInfo() {
    infoOpen = false;
    await tick();
    infoTriggerEl?.focus();
  }

  function backupText(key: keyof typeof t, values: Record<string, string | number>): string {
    let text = String(t[key]);
    for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, String(value));
    return text;
  }

  async function exportBackup() {
    const backupDocument = createBackupDocument(getPages(), getSettings());
    const outcome = await exportBackupDocument(backupDocument);
    if (outcome === 'cancelled') return;
    if (outcome === 'failed') {
      dataNotice = '';
      dataError = t.backupExportFailed;
      return;
    }
    dataError = '';
    dataNotice = outcome === 'saved'
      ? t.backupExported
      : outcome === 'shared'
        ? t.backupShared
        : t.backupDownloaded;
  }

  async function handleBackupFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      pendingBackup = parseBackupDocument(JSON.parse(await file.text()));
      selectedImportMode = null;
      dataError = '';
      dataNotice = '';
      await tick();
      await Promise.resolve();
      backupPanelEl?.focus();
    } catch {
      pendingBackup = null;
      dataError = t.backupInvalid;
    }
  }

  async function closeBackupPreview() {
    pendingBackup = null;
    selectedImportMode = null;
    await tick();
    await Promise.resolve();
    backupImportTriggerEl?.focus();
  }

  async function selectImportMode(mode: 'replace' | 'add') {
    selectedImportMode = mode;
    await tick();
    await Promise.resolve();
    backupPanelEl?.focus();
  }

  async function openResetConfirmation() {
    resetPhrase = '';
    dataError = '';
    resetDialogOpen = true;
    await tick();
    await Promise.resolve();
    resetInputEl?.focus();
  }

  async function closeResetConfirmation() {
    resetPhrase = '';
    resetDialogOpen = false;
    await tick();
    await Promise.resolve();
    resetTriggerEl?.focus();
  }

  function confirmImport() {
    if (!pendingBackup || !selectedImportMode) return;
    const currentPages = getPages();
    const currentActivePageId = getActivePageId();
    const merged = selectedImportMode === 'add' ? mergePages(currentPages, pendingBackup.pages) : null;
    const nextPages = merged?.pages ?? normalizeRestoredPages(pendingBackup.pages);
    const nextSettings = selectedImportMode === 'replace' ? pendingBackup.settings : getSettings();

    try {
      persistRestoredData(nextPages, nextSettings);
      replacePagesInMemory(nextPages);
      if (selectedImportMode === 'add' && currentActivePageId && nextPages.some((page) => page.id === currentActivePageId)) {
        setActivePage(currentActivePageId);
      }
      if (selectedImportMode === 'replace') replaceSettingsInMemory(nextSettings);
      departureStore.clear();
      deviationStore.clear();
      pendingBackup = null;
      selectedImportMode = null;
      dataNotice = merged
        ? backupText('backupImportComplete', {
            added: merged.summary.addedPages + merged.summary.addedSegments,
            existing: merged.summary.alreadyPresent,
            kept: merged.summary.keptCurrent,
          })
        : backupText('backupImportComplete', {
            added: nextPages.length + summarizePages(nextPages).departures + summarizePages(nextPages).journeys,
            existing: 0,
            kept: 0,
          });
      dataError = '';
    } catch {
      dataError = t.persistenceFailed;
    }
  }

  async function resetLocalData() {
    if (resetPhrase !== 'RESET') return;
    try {
      departureStore.stopAutoRefresh();
      deviationStore.stopAutoRefresh();
      await clearAppOwnedData();
      clearPages();
      clearSettings();
      departureStore.clear();
      deviationStore.clear();
      resetPhrase = '';
      resetDialogOpen = false;
      pendingBackup = null;
      selectedImportMode = null;
      dataNotice = t.resetDataComplete;
      dataError = '';
      onClose();
    } catch {
      dataError = t.persistenceFailed;
    }
  }
</script>

<Sheet
  isOpen={isOpen}
  onClose={onClose}
  title={t.settings}
  closeAriaLabel={t.closeSettings}
  overlayClass="settings-overlay"
  sheetClass="settings-sheet"
>
    <div class="tab-bar" role="tablist" aria-label={t.settings}>
      <button type="button" role="tab" class="tab" class:active={activeEditorTab === 'features'} aria-selected={activeEditorTab === 'features'} onclick={() => activeEditorTab = 'features'}>{t.tabFeatures}</button>
      <button type="button" role="tab" class="tab" class:active={activeEditorTab === 'theme'} aria-selected={activeEditorTab === 'theme'} onclick={() => activeEditorTab = 'theme'}>{t.tabTheme}</button>
    </div>

    {#if persistenceFailed}
      <div class="persistence-notice" role="status" aria-live="polite">
        <span>{t.persistenceFailed}</span>
        <button type="button" onclick={() => retryPersistence()}>{t.retry}</button>
      </div>
    {/if}

    {#if activeEditorTab === 'features'}
      <div class="tab-content features-tab">
        <div class="feature-group">
          <label class="toggle-row">
            <span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html bellIcon}</svg></span>
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
                  bind:this={infoTriggerEl}
                  class="info-btn"
                  onclick={openDisruptionInfo}
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
            <div class="info-overlay" onclick={handleInfoBackdrop} onkeydown={handleInfoKeydown} role="dialog" aria-label={t.disruptionThresholdInfoTitle} tabindex="-1">
              <div class="info-card" role="document" tabindex="-1" use:focusBoundary={{ active: true, initialFocus: '[data-surface-control]' }}>
                <SurfaceControl class="info-card-close" kind="close" label={t.closeInfo} onclick={closeDisruptionInfo} />
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
          <label class="toggle-row">
            <span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html locateIcon}</svg></span>
            <div class="toggle-label">
              <span class="toggle-name">{t.locationServices}</span>
            </div>
            <button
              class="toggle-btn no-scale"
              class:on={settings.locationServicesEnabled ?? false}
              onclick={toggleLocationServices}
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
                onclick={toggleWalkingEta}
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
          <h3 class="group-title"><span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html arrowUpDown}</svg></span>{t.sortGroupSection}</h3>

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
          <label class="toggle-row">
            <span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html wineIcon}</svg></span>
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
          <label class="toggle-row">
            <span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html calendarDaysIcon}</svg></span>
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
          <h3 class="group-title"><span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html languagesIcon}</svg></span>{t.language}</h3>
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

        <div class="feature-group data-group">
          <h3 class="group-title"><span class="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html databaseBackupIcon}</svg></span>{t.dataBackup}</h3>
          <p class="data-description">{t.dataBackupDesc}</p>
          <div class="backup-actions">
            <button type="button" class="data-action backup-action" aria-label={t.exportBackup} onclick={exportBackup}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html downloadIcon}</svg>
              <span>{t.exportAction}</span>
            </button>
            <button bind:this={backupImportTriggerEl} type="button" class="data-action backup-action" aria-label={t.importBackup} onclick={() => backupFileInput?.click()}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html uploadIcon}</svg>
              <span>{t.importAction}</span>
            </button>
            <input
              bind:this={backupFileInput}
              class="visually-hidden-input"
              type="file"
              accept="application/json,.json"
              aria-label={t.backupFile}
              onchange={handleBackupFile}
            />
          </div>
          <p class="data-export-hint">{t.backupExportHint}</p>

          {#if dataNotice}
            <p class="data-status" role="status" aria-live="polite">{dataNotice}</p>
          {/if}
          {#if dataError}
            <p class="data-status data-status-error" role="alert">{dataError}</p>
          {/if}

          {#if pendingBackup}
            <section bind:this={backupPanelEl} class="data-dialog" aria-labelledby="backup-import-title" tabindex="-1">
              <p class="data-dialog-copy">
                {backupText('backupPreview', {
                  date: new Date(pendingBackup.exportedAt).toLocaleString(),
                  ...summarizePages(pendingBackup.pages),
                })}
              </p>
              {#if !selectedImportMode}
                <h4 id="backup-import-title" class="data-dialog-label">{t.backupImportMode}</h4>
                <div class="data-mode-list">
                  <button type="button" class="data-mode" aria-label={t.backupReplace} onclick={() => void selectImportMode('replace')}>
                    <span>{t.backupReplace}</span><small>{t.backupReplaceDesc}</small>
                  </button>
                  <button type="button" class="data-mode" aria-label={t.backupAdd} onclick={() => void selectImportMode('add')}>
                    <span>{t.backupAdd}</span><small>{t.backupAddDesc}</small>
                  </button>
                </div>
                <button type="button" class="data-action secondary data-dialog-dismiss" onclick={() => void closeBackupPreview()}>{t.cancel}</button>
              {:else}
                <h4 id="backup-import-title" class="data-dialog-label">{t.backupImportMode}</h4>
                <p class="data-dialog-copy">{selectedImportMode === 'replace' ? t.backupReplaceDesc : t.backupAddDesc}</p>
                <div class="data-dialog-actions">
                  <button type="button" class="data-action secondary" onclick={() => void closeBackupPreview()}>{t.cancel}</button>
                  <button type="button" class="data-action" onclick={confirmImport}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html uploadIcon}</svg>
                    <span>{t.importAction}</span>
                  </button>
                </div>
              {/if}
            </section>
          {/if}

          <div class="danger-zone">
            <h4>{t.resetData}</h4>
            <p>{t.resetDataDesc}</p>
            <button bind:this={resetTriggerEl} type="button" class="danger-action" onclick={() => void openResetConfirmation()}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html trash2Icon}</svg>
              <span>{t.resetData}</span>
            </button>
          </div>

          {#if resetDialogOpen}
            <section class="data-dialog danger-dialog" aria-labelledby="reset-data-title" aria-describedby="reset-data-warning">
              <h4 id="reset-data-title">{t.resetDataDialogTitle}</h4>
              <div class="reset-safeguard" role="note">
                <span class="reset-safeguard-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{@html alertTriangle}</svg></span>
                <div class="reset-safeguard-copy">
                  <p id="reset-data-warning">{t.resetDataWarning}</p>
                  <p>{t.resetDataDialogDesc}</p>
                </div>
                <button type="button" class="data-action reset-export-action" onclick={exportBackup}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html downloadIcon}</svg>
                  <span>{t.exportBeforeReset}</span>
                </button>
              </div>
              <label class="reset-label" for="reset-confirmation">{t.resetDataConfirmLabel}</label>
              <input bind:this={resetInputEl} id="reset-confirmation" class="reset-input" type="text" autocomplete="off" value={resetPhrase} oninput={(event) => resetPhrase = (event.currentTarget as HTMLInputElement).value} />
              <div class="data-dialog-actions">
                <button type="button" class="data-action secondary" onclick={() => void closeResetConfirmation()}>{t.cancel}</button>
                <button type="button" class="danger-action" aria-label={t.resetDataConfirmButton} disabled={resetPhrase !== 'RESET'} onclick={resetLocalData}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{@html trash2Icon}</svg>
                  <span>{t.deleteAction}</span>
                </button>
              </div>
            </section>
          {/if}
        </div>
      </div>

    {:else if activeEditorTab === 'theme'}
      <div class="tab-content theme-tab">
        <h3 class="section-title">{t.themeSettings}</h3>
        <div class="theme-list" role="group" aria-label={t.theme}>
          {#each themeChoices as choice (choice.id)}
            {@const isActive = activeTheme === choice.id}
            <button
              class="theme-choice"
              class:active={isActive}
              style={previewStyle(choice.preview)}
              onclick={() => setTheme(choice.id)}
              aria-pressed={isActive}
            >
              <span class="theme-preview" aria-hidden="true">
                <span class="theme-preview-header">
                  <span class="theme-preview-route">67</span>
                  <span class="theme-preview-countdown">4 min</span>
                </span>
                <span class="theme-preview-detail">→ Skansen</span>
              </span>
              <span class="theme-choice-copy">
                <span class="theme-choice-label">{t[choice.label]}</span>
                {#if choice.description}
                  <span class="theme-choice-description">{t[choice.description]}</span>
                {/if}
              </span>
              {#if isActive}<span class="theme-check" aria-hidden="true">✓</span>{/if}
            </button>
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

  /* Features tab */
  .features-tab {
    padding: 16px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .feature-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: 16px;
  }

  .feature-group + .feature-group {
    margin-top: 20px;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
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
    flex: 1;
  }

  .feature-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--text-muted);
  }

  .feature-icon svg {
    width: 16px;
    height: 16px;
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

  .language-control .segment-choice {
    min-height: 44px;
  }

  .language-control .segment-choice.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-subtle);
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

  .theme-choice {
    display: flex;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    min-height: 82px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: border-color 150ms ease, background-color 150ms ease, transform 120ms ease;
  }

  .theme-choice:hover {
    background: var(--surface-hover);
  }

  .theme-choice:active {
    transform: scale(0.99);
  }

  .theme-choice.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .theme-preview {
    display: flex;
    flex: 0 0 142px;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    padding: 9px 10px;
    border: 1px solid var(--preview-border);
    border-radius: 7px;
    background: var(--preview-bg);
    color: var(--preview-text);
  }

  .theme-preview-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }

  .theme-preview-route {
    font-size: 14px;
    font-weight: 800;
  }

  .theme-preview-countdown {
    color: var(--preview-accent);
    font-family: 'Neue Machina', sans-serif;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: -0.03em;
    white-space: nowrap;
  }

  .theme-preview-detail {
    color: var(--preview-text-muted);
    font-size: 10px;
  }

  .theme-choice-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
  }

  .theme-choice-label {
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
  }

  .theme-choice-description {
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.3;
  }

  .theme-check {
    align-self: center;
    color: var(--accent);
    font-size: 16px;
    font-weight: 800;
    padding: 0 4px;
  }

  @media (max-width: 360px) {
    .theme-preview {
      flex-basis: 124px;
      padding-inline: 8px;
    }
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

  :global(.surface-control.info-card-close) {
    position: absolute;
    top: 12px;
    right: 12px;
    color: var(--text-muted);
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
  .data-group {
    gap: 10px;
  }
  .data-description,
  .data-dialog-copy,
  .danger-zone p,
  .danger-dialog p {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
    margin: 0 0 10px;
  }
  .data-export-hint {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.4;
    margin: 0;
  }
  .backup-actions,
  .data-dialog-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .data-action,
  .danger-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .data-action:hover { background: var(--surface-hover); }
  .data-action.secondary { color: var(--text-secondary); }
  .backup-action {
    border-radius: 10px;
    background: var(--bg);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }
  .backup-action svg,
  .data-action svg,
  .danger-action svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .data-dialog-dismiss {
    justify-self: start;
  }
  .data-action:disabled,
  .danger-action:disabled { opacity: 0.45; cursor: not-allowed; }
  .danger-action {
    border-color: var(--color-critical);
    color: var(--color-critical);
    background: transparent;
  }
  .data-status {
    color: var(--accent);
    font-size: 12px;
    line-height: 1.4;
    margin: 10px 0 0;
  }
  .data-status-error { color: var(--color-critical); }
  .visually-hidden-input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .data-dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }
  .data-dialog-label,
  .reset-label {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }
  .data-dialog-label {
    margin: 0;
  }
  .data-mode-list { display: grid; gap: 8px; }
  .data-mode {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .data-mode span { color: var(--accent); font-size: 12px; font-weight: 700; }
  .data-mode small { color: var(--text-secondary); font-size: 11px; line-height: 1.35; }
  .danger-zone {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid color-mix(in srgb, var(--color-critical) 35%, var(--border));
  }
  .danger-zone h4,
  .danger-dialog h4 { color: var(--text); font-size: 13px; margin: 0; }
  .danger-dialog { border-color: var(--color-critical); }
  .reset-safeguard {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px 10px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-warning-subtle) 62%, var(--bg));
  }
  .reset-safeguard-icon {
    display: flex;
    align-items: flex-start;
    padding-top: 1px;
    color: var(--color-warning);
  }
  .reset-safeguard-icon svg {
    width: 16px;
    height: 16px;
  }
  .reset-safeguard-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .reset-safeguard-copy p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
  }
  .reset-safeguard-copy p:first-child {
    color: var(--text);
    font-weight: 600;
  }
  .reset-export-action {
    grid-column: 1 / -1;
    min-height: 44px;
    border-color: color-mix(in srgb, var(--color-warning) 55%, var(--border));
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
  }
  .reset-export-action:hover { background: var(--surface-hover); }
  .reset-input {
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  .persistence-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 10px 16px 0;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }
  .persistence-notice button {
    min-height: 32px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }
</style>
