<script lang="ts">
  import type { Route, TransportType, Stop } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  import { settingsStore } from '../stores/settingsStore';
  import { THEMES } from '../themes';
  import { t } from '../stores/localeStore';
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';

  let {
    routes,
    activeRouteId,
    isOpen,
    onClose,
    onSwitchRoute
  }: {
    routes: Route[];
    activeRouteId: string;
    isOpen: boolean;
    onClose: () => void;
    onSwitchRoute: (routeId: string) => void;
  } = $props();

  let route = $derived(routes.find(r => r.id === activeRouteId));
  let otherRoute = $derived(routes.find(r => r.id !== activeRouteId));
  let showSearch = $state(false);
  let settings = $derived($settingsStore);
  let activeLanguage = $derived(settings.language ?? 'auto');

  function getRouteLabel(r: Route): string {
    return r.direction === 'toWork' ? $t.toWork : $t.home;
  }

  function isLightColor(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.5;
  }

  function addSegment(
    line: string, lineName: string, directionText: string,
    fromStop: Stop, toStop: Stop, transportType: TransportType
  ) {
    if (!route) return;
    routeStore.addSegment(route.id, { line, lineName, directionText, fromStop, toStop, transportType });
    showSearch = false;
  }
</script>

<div class="editor-overlay" class:open={isOpen} aria-hidden={!isOpen}>
  <div class="editor-sheet">
    <div class="sheet-header">
      <button class="back-btn" onclick={onClose} aria-label={$t.closeEditor}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <span class="sheet-title">
        {$t.editingRoute}: {route ? getRouteLabel(route) : ''}
      </span>
    </div>

    {#if route}
      {#if showSearch}
        <div class="search-container">
          <SegmentSearch onSelect={addSegment} />
          <button class="cancel-search-btn" onclick={() => showSearch = false}>
            {$t.cancel}
          </button>
        </div>
      {:else}
        <div class="segment-area">
          <SegmentList route={route} />
          <button class="add-btn" onclick={() => showSearch = true}>
            {$t.addSegment}
          </button>
        </div>
      {/if}
    {/if}

    {#if otherRoute}
      <button class="switch-route-btn" onclick={() => onSwitchRoute(otherRoute!.id)}>
        {$t.switchTo}: {getRouteLabel(otherRoute)}
      </button>
    {/if}

    <div class="settings-section">
      <h2 class="settings-title">{$t.settings}</h2>

      <label class="toggle-row">
        <div class="toggle-label">
          <span class="toggle-name">{$t.showNotifications}</span>
          <span class="toggle-desc">{$t.notificationsDesc}</span>
        </div>
        <button
          class="toggle-btn"
          class:on={settings.showNotifications ?? true}
          onclick={() => settingsStore.toggleNotifications()}
          aria-label={$t.showNotifications}
          role="switch"
          aria-checked={settings.showNotifications ?? true}
        >
          <span class="toggle-knob"></span>
        </button>
      </label>

      <div class="setting-block">
        <div class="toggle-label">
          <span class="toggle-name">{$t.language}</span>
        </div>
        <div class="segmented-control" role="group" aria-label={$t.language}>
          <button
            class="segment-choice"
            class:active={activeLanguage === 'auto'}
            onclick={() => settingsStore.setLanguage('auto')}
            aria-pressed={activeLanguage === 'auto'}
          >
            {$t.languageAuto}
          </button>
          <button
            class="segment-choice"
            class:active={activeLanguage === 'en'}
            onclick={() => settingsStore.setLanguage('en')}
            aria-pressed={activeLanguage === 'en'}
          >
            {$t.languageEnglish}
          </button>
          <button
            class="segment-choice"
            class:active={activeLanguage === 'sv'}
            onclick={() => settingsStore.setLanguage('sv')}
            aria-pressed={activeLanguage === 'sv'}
          >
            {$t.languageSwedish}
          </button>
        </div>
      </div>

      <div class="theme-section">
        <h3 class="theme-title">{$t.theme}</h3>
        <div class="theme-list">
          {#each THEMES as palette}
            {@const activeTheme = settings.theme ?? 'default'}
            {@const activeVariant = settings.themeVariant ?? 'A'}
            {@const isActiveA = activeTheme === palette.id && activeVariant === 'A'}
            {@const isActiveB = activeTheme === palette.id && activeVariant === 'B'}
            <div class="palette-card">
              <!-- Left half = variant A -->
              <button
                class="palette-half"
                class:active={isActiveA}
                style="background:{palette.colorA}"
                onclick={() => settingsStore.setTheme(palette.id, 'A')}
                aria-label={`${palette.name}, A`}
                aria-pressed={isActiveA}
              >
                <span class="ph-name" style="color:{isLightColor(palette.colorA) ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)'}">{palette.name}</span>
                <span class="ph-dot" style="background:{palette.colorB}; box-shadow: 0 0 0 2px {isLightColor(palette.colorA) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)'}"></span>
                {#if isActiveA}
                  <span class="ph-check" style="color:{isLightColor(palette.colorA) ? '#000' : '#fff'}">✓</span>
                {/if}
              </button>
              <!-- Right half = variant B -->
              <button
                class="palette-half"
                class:active={isActiveB}
                style="background:{palette.colorB}"
                onclick={() => settingsStore.setTheme(palette.id, 'B')}
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

.sheet-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.segment-area {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.switch-route-btn {
  margin: 0 16px 16px;
  padding: 11px;
  border: 1.5px solid var(--border-subtle);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 150ms, color 150ms;
}

.switch-route-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Settings section */
.settings-section {
  margin: 0 16px 32px;
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

/* Single card = two clickable halves side by side */
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
  transition: filter 80ms ease;
  text-align: left;
}

.palette-half:active {
  filter: brightness(0.88);
}

/* Inset glow ring when selected */
.palette-half.active {
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.55), inset 0 0 0 5px rgba(0,0,0,0.15);
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
</style>
