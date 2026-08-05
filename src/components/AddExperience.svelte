<script lang="ts">
  import type { SegmentDirection, Stop, TransportType } from '../types/page';
  import type { Journey } from '../types/journey';
  import type { Segment } from '../types/page';
  import { getT } from '../stores/localeStore.svelte';
  import { mapPinIconPaths, routeIconPaths } from '../icons/departureIcons';
  import IconButton from './IconButton.svelte';
  import SegmentSearch from './SegmentSearch.svelte';
  import JourneySearch from './JourneySearch.svelte';

  type AddTab = 'stop' | 'route';
  type Variant = 'drawer' | 'embedded';

  type Props = {
    idPrefix: string;
    variant?: Variant;
    closeAriaLabel?: string;
    onClose: () => void;
    mode?: 'add' | 'edit';
    editSegment?: Segment;
    editKind?: 'departure' | 'journey';
    onStopSelect: (
      line: string,
      lineName: string,
      direction: SegmentDirection,
      fromStop: Stop,
      toStop: Stop,
      transportType: TransportType,
    ) => boolean | void;
    onJourneySelect: (journey: Journey) => boolean | void;
  };

  let {
    idPrefix,
    variant = 'drawer',
    closeAriaLabel,
    onClose,
    onStopSelect,
    onJourneySelect,
    mode = 'add',
    editSegment,
    editKind,
  }: Props = $props();

  let t = $derived(getT());
  let activeTab = $state<AddTab>('stop');
  $effect(() => {
    if (mode === 'edit') activeTab = editKind === 'journey' ? 'route' : 'stop';
  });
  let closeLabel = $derived(closeAriaLabel ?? t.closePanel);

  let stopPanelId = $derived(`${idPrefix}-stop-panel`);
  let routePanelId = $derived(`${idPrefix}-route-panel`);
  let stopTabId = $derived(`${idPrefix}-stop-tab`);
  let routeTabId = $derived(`${idPrefix}-route-tab`);
</script>

<div
  class="add-experience"
  class:drawer={variant === 'drawer'}
  class:embedded={variant === 'embedded'}
  data-testid="add-experience"
>
  <div class="add-experience-header">
    <div class="add-experience-title-row">
      <h2 class="add-experience-title">{mode === 'edit' ? (editKind === 'journey' ? (t.editJourney ?? 'Edit journey') : (t.editDeparture ?? 'Edit departure')) : t.addSegment}</h2>
      <IconButton class="add-experience-close" onclick={onClose} ariaLabel={closeLabel}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </IconButton>
    </div>

    {#if mode === 'add'}
    <div class="add-experience-tabs" role="tablist" aria-label={t.addSegment}>
      <button
        type="button"
        class="add-experience-tab"
        class:active={activeTab === 'stop'}
        role="tab"
        id={stopTabId}
        aria-label={t.tabStop}
        aria-selected={activeTab === 'stop'}
        aria-controls={stopPanelId}
        onclick={() => activeTab = 'stop'}
      >
        <span class="add-experience-tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d={mapPinIconPaths.pin} />
            <circle cx={mapPinIconPaths.center.cx} cy={mapPinIconPaths.center.cy} r={mapPinIconPaths.center.r} />
          </svg>
        </span>
        <span class="add-experience-tab-copy">
          <span class="add-experience-tab-title">{t.tabStop}</span>
          <span class="add-experience-tab-description">{t.tabStopDesc}</span>
        </span>
      </button>

      <button
        type="button"
        class="add-experience-tab"
        class:active={activeTab === 'route'}
        role="tab"
        id={routeTabId}
        aria-label={t.tabRoute}
        aria-selected={activeTab === 'route'}
        aria-controls={routePanelId}
        onclick={() => activeTab = 'route'}
      >
        <span class="add-experience-tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx={routeIconPaths.start.cx} cy={routeIconPaths.start.cy} r={routeIconPaths.start.r} />
            <path d={routeIconPaths.route} />
            <circle cx={routeIconPaths.end.cx} cy={routeIconPaths.end.cy} r={routeIconPaths.end.r} />
          </svg>
        </span>
        <span class="add-experience-tab-copy">
          <span class="add-experience-tab-title">{t.tabRoute}</span>
          <span class="add-experience-tab-description">{t.tabRouteDesc}</span>
        </span>
      </button>
    </div>
    {/if}
  </div>

  <div
    id={stopPanelId}
    class="add-experience-panel"
    role="tabpanel"
    aria-labelledby={stopTabId}
    aria-label={t.tabStop}
    hidden={mode === 'edit' ? editKind !== 'departure' : activeTab !== 'stop'}
  >
    <SegmentSearch instanceId={`${idPrefix}-stop`} onSelect={onStopSelect} initialSegment={mode === 'edit' && editKind === 'departure' ? editSegment : undefined} />
  </div>

  <div
    id={routePanelId}
    class="add-experience-panel"
    role="tabpanel"
    aria-labelledby={routeTabId}
    aria-label={t.tabRoute}
    hidden={mode === 'edit' ? editKind !== 'journey' : activeTab !== 'route'}
  >
    <JourneySearch instanceId={`${idPrefix}-journey`} onSelect={onJourneySelect} initialQuery={mode === 'edit' && editKind === 'journey' ? editSegment?.journeyMeta?.query : undefined} />
  </div>
</div>

<style>
  .add-experience {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .add-experience-header {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .add-experience.drawer .add-experience-header {
    padding: 14px 8px 10px;
  }

  .add-experience.embedded .add-experience-header {
    padding: 0 0 10px;
  }

  .add-experience-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    gap: 12px;
  }

  .add-experience-title {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
  }

  :global(.icon-btn.add-experience-close) {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
  }

  .add-experience-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .add-experience-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 56px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface-emphasis);
    color: var(--text-secondary);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .add-experience-tab.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--text);
  }

  .add-experience-tab:hover,
  .add-experience-tab:focus-visible {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .add-experience-tab:active {
    transform: scale(0.99);
  }

  .add-experience-tab-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    border-radius: 7px;
    background: var(--surface);
    color: var(--text-muted);
  }

  .add-experience-tab-icon svg {
    width: 17px;
    height: 17px;
  }

  .add-experience-tab.active .add-experience-tab-icon {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .add-experience-tab-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .add-experience-tab-title {
    color: inherit;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
  }

  .add-experience-tab-description {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-experience-tab.active .add-experience-tab-description {
    color: var(--text-secondary);
  }

  .add-experience-panel[hidden] {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .add-experience-tab {
      transition: none;
    }

    .add-experience-tab:active {
      transform: none;
    }
  }
</style>
