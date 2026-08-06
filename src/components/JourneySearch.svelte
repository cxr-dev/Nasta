<script lang="ts">
  import type { Journey, JourneyQuery, JourneyRouteType, JourneyTimeMode } from '../types/journey';
  import type { LocationSuggestion } from '../services/journeyService';
  import { DEFAULT_JOURNEY_ROUTE_TYPE, searchJourneys, searchLocations } from '../services/journeyService';
  import { getT } from '../stores/localeStore.svelte';
  import TransportIcon from './TransportIcon.svelte';
  import TrainPosition from './TrainPosition.svelte';
  import JourneyCard from './JourneyCard.svelte';
  import { arrowDownUp, chevronDown } from '../icons/departureIcons';
  import gsap from 'gsap';

  let {
    onSelect,
    instanceId = 'journey',
    initialQuery,
  }: {
    onSelect?: (journey: Journey) => boolean | void;
    instanceId?: string;
    initialQuery?: JourneyQuery;
  } = $props();

  let t = $derived(getT());
  let originId = $derived(`${instanceId}-origin`);
  let destinationId = $derived(`${instanceId}-dest`);
  let advancedOptionsId = $derived(`${instanceId}-advanced-options`);

  let origin = $state('');
  let dest = $state('');
  let originCoord = $state<[number, number] | undefined>(undefined);
  let destCoord = $state<[number, number] | undefined>(undefined);
  let originType = $state<'stop' | 'address' | null>(null);
  let destType = $state<'stop' | 'address' | null>(null);
  let results = $state<Journey[]>([]);
  let previewJourneyId = $state<string | null>(null);
  let searching = $state(false);
  let noResults = $state(false);
  let searchAttempted = $state(false);
  let timeMode = $state<JourneyTimeMode>('now');
  let travelDate = $state('');
  let travelTime = $state('');
  let advancedOpen = $state(false);
  let transportModes = $state<Array<'bus' | 'metro' | 'train' | 'tram' | 'boat'>>(['bus', 'metro', 'train', 'tram', 'boat']);
  let maxChanges = $state(3);
  let routeType = $state<JourneyRouteType>('leasttime');
  const journeyTransportModes = ['bus', 'metro', 'train', 'tram', 'boat'] as const;
  let initialisedQuery = $state(false);

  $effect(() => {
    if (!initialQuery || initialisedQuery) return;
    initialisedQuery = true;
    origin = initialQuery.origin;
    dest = initialQuery.destination;
    originCoord = initialQuery.originCoord;
    destCoord = initialQuery.destinationCoord;
    originType = initialQuery.originCoord ? 'address' : null;
    destType = initialQuery.destinationCoord ? 'address' : null;
    timeMode = initialQuery.timeMode ?? 'now';
    travelDate = initialQuery.date ?? '';
    travelTime = initialQuery.time ?? '';
    transportModes = initialQuery.transportModes ? [...initialQuery.transportModes] : [...journeyTransportModes];
    maxChanges = initialQuery.maxChanges ?? 3;
    routeType = initialQuery.routeType ?? DEFAULT_JOURNEY_ROUTE_TYPE;
    advancedOpen = true;
  });

  let advancedSummary = $derived.by(() => {
    const modeSummary = transportModes.length === 0 || transportModes.length === journeyTransportModes.length
      ? (t.journeyAllModes ?? 'Alla färdsätt')
      : (t.journeyModesSelected ?? '{count} färdsätt').replace('{count}', String(transportModes.length));
    const changesSummary = maxChanges >= 3
      ? (t.journeyAnyChanges ?? 'Upp till 3 byten')
      : (t.journeyUpToChanges ?? 'Upp till {count} byten').replace('{count}', String(maxChanges));
    const routeSummary = routeType === 'leastinterchange'
      ? (t.journeyFewestChanges ?? 'Färre byten')
      : routeType === 'leastwalking'
        ? (t.journeyLeastWalking ?? 'Minst gång')
        : (t.journeyFastest ?? 'Snabbast');
    return `${modeSummary} · ${changesSummary} · ${routeSummary}`;
  });

  // Autocomplete
  let originFocused = $state(false);
  let destFocused = $state(false);
  let originSuggestions = $state<LocationSuggestion[]>([]);
  let destSuggestions = $state<LocationSuggestion[]>([]);
  let originLoading = $state(false);
  let destLoading = $state(false);
  let originSelectedIdx = $state(-1);
  let destSelectedIdx = $state(-1);

  let originDebounce: ReturnType<typeof setTimeout>;
  let destDebounce: ReturnType<typeof setTimeout>;
  let originAbort: AbortController | null = null;
  let destAbort: AbortController | null = null;
  let resultsAbort: AbortController | null = null;
  let searchGeneration = 0;

  // Step progress
  let journeyStep = $derived(
    results.length > 0 ? 'results' : originCoord ? 'destination' : 'origin'
  );
  let journeyStepIndex = $derived(
    journeyStep === 'origin' ? 0 : journeyStep === 'destination' ? 1 : 2
  );
  let journeyStepLabels = $derived([t.journeyStepOrigin, t.journeyStepDestination, t.journeyStepChoose]);
  let progressEl = $state<HTMLDivElement | undefined>();
  let contentEl = $state<HTMLDivElement | undefined>();

  function formatDuration(min: number): string {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function formatTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function localDateValue(date = new Date()): string {
    const year = date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric' });
    const month = date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', month: '2-digit' });
    const day = date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: '2-digit' });
    return `${year}-${month}-${day}`;
  }

  function localTimeValue(date = new Date()): string {
    return date.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
  }

  function ensureTimedDefaults() {
    if (!travelDate) travelDate = localDateValue();
    if (!travelTime) travelTime = localTimeValue();
  }

  function swapDirections() {
    originAbort?.abort();
    destAbort?.abort();
    const oldOrigin = origin;
    origin = dest;
    dest = oldOrigin;
    const oldCoord = originCoord;
    originCoord = destCoord;
    destCoord = oldCoord;
    const oldType = originType;
    originType = destType;
    destType = oldType;
    originSuggestions = [];
    destSuggestions = [];
    originSelectedIdx = -1;
    destSelectedIdx = -1;
    originFocused = false;
    destFocused = false;
    results = [];
    previewJourneyId = null;
    noResults = false;
    searchAttempted = false;
  }

  function onOriginInput() {
    clearTimeout(originDebounce);
    originSelectedIdx = -1;
    originCoord = undefined;
    originType = null;
    const q = origin.trim();
    if (q.length < 2) {
      originSuggestions = [];
      originLoading = false;
      return;
    }
    originDebounce = setTimeout(async () => {
      originAbort?.abort();
      originAbort = new AbortController();
      originLoading = true;
      try {
        const suggestions = await searchLocations(q, originAbort.signal);
        if (originAbort.signal.aborted) return;
        originSuggestions = suggestions;
      } catch {
        // aborted, ignore
      } finally {
        if (!originAbort.signal.aborted) originLoading = false;
      }
    }, 300);
  }

  function onDestInput() {
    clearTimeout(destDebounce);
    destSelectedIdx = -1;
    destCoord = undefined;
    destType = null;
    const q = dest.trim();
    if (q.length < 2) {
      destSuggestions = [];
      destLoading = false;
      return;
    }
    destDebounce = setTimeout(async () => {
      destAbort?.abort();
      destAbort = new AbortController();
      destLoading = true;
      try {
        const suggestions = await searchLocations(q, destAbort.signal);
        if (destAbort.signal.aborted) return;
        destSuggestions = suggestions;
      } catch {
        // aborted
      } finally {
        if (!destAbort.signal.aborted) destLoading = false;
      }
    }, 300);
  }

  function selectOriginSuggestion(s: LocationSuggestion) {
    origin = s.name;
    originCoord = s.coord;
    originType = s.type;
    originSuggestions = [];
    originFocused = false;
    originSelectedIdx = -1;
  }

  function selectDestSuggestion(s: LocationSuggestion) {
    dest = s.name;
    destCoord = s.coord;
    destType = s.type;
    destSuggestions = [];
    destFocused = false;
    destSelectedIdx = -1;
  }

  function onOriginKeydown(e: KeyboardEvent) {
    if (!originFocused || originSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      originSelectedIdx = Math.min(originSelectedIdx + 1, originSuggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      originSelectedIdx = Math.max(originSelectedIdx - 1, -1);
    } else if (e.key === 'Enter' && originSelectedIdx >= 0) {
      e.preventDefault();
      selectOriginSuggestion(originSuggestions[originSelectedIdx]);
    } else if (e.key === 'Escape') {
      originSuggestions = [];
      originFocused = false;
      originSelectedIdx = -1;
    }
  }

  function onDestKeydown(e: KeyboardEvent) {
    if (!destFocused || destSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      destSelectedIdx = Math.min(destSelectedIdx + 1, destSuggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      destSelectedIdx = Math.max(destSelectedIdx - 1, -1);
    } else if (e.key === 'Enter' && destSelectedIdx >= 0) {
      e.preventDefault();
      selectDestSuggestion(destSuggestions[destSelectedIdx]);
    } else if (e.key === 'Escape') {
      destSuggestions = [];
      destFocused = false;
      destSelectedIdx = -1;
    }
  }

  async function doSearch() {
    if (!origin.trim() || !dest.trim()) return;

    resultsAbort?.abort();
    const controller = new AbortController();
    resultsAbort = controller;
    const generation = ++searchGeneration;

    searching = true;
    noResults = false;
    searchAttempted = true;
    previewJourneyId = null;

    try {
      const journeys = await searchJourneys({
        origin: origin.trim(),
        dest: dest.trim(),
        originCoord,
        destCoord,
        timeMode,
        date: timeMode === 'now' ? undefined : travelDate,
        time: timeMode === 'now' ? undefined : travelTime,
        transportModes,
        maxChanges,
        routeType,
        signal: controller.signal,
      });

      if (generation !== searchGeneration || controller !== resultsAbort) return;

      if (journeys.length === 0) {
        results = [];
        noResults = true;
      } else {
        results = journeys;
      }
    } catch (e: any) {
      if (generation === searchGeneration && controller === resultsAbort && e?.name !== 'AbortError') {
        results = [];
        noResults = true;
      }
    } finally {
      if (generation === searchGeneration && controller === resultsAbort) {
        searching = false;
      }
    }
  }

  function selectJourney(journey: Journey) {
    previewJourneyId = previewJourneyId === journey.id ? null : journey.id;
  }

  function addPreviewedJourney(journey: Journey) {
    onSelect?.(journey);
  }

  function journeyMetaForPreview(journey: Journey) {
    return {
      journeyId: journey.id,
      originLabel: journey.originLabel,
      destLabel: journey.destLabel,
      query: journey.query ?? {
        origin: journey.originLabel,
        destination: journey.destLabel,
        routeType: DEFAULT_JOURNEY_ROUTE_TYPE,
      },
      status: 'planned' as const,
      totalDurationMin: journey.totalDurationMin,
      transfers: journey.transfers,
      departureTime: journey.departureTime,
      arrivalTime: journey.arrivalTime,
      connections: journey.connections,
      updatedAt: Date.now(),
      legs: journey.legs,
    };
  }

  // GSAP animations for step progress
  $effect(() => {
    const idx = journeyStepIndex;
    if (!progressEl) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const dot = progressEl.querySelector(`[data-step="${idx}"]`) as HTMLElement | null;
    if (dot) {
      gsap.fromTo(dot, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
    }
    if (idx > 0) {
      const fill = progressEl.querySelector(`[data-connector="${idx - 1}"] .step-connector-fill`) as HTMLElement | null;
      if (fill) {
        gsap.to(fill, { scaleX: 1, duration: 0.25, ease: 'power2.out', transformOrigin: 'left center' });
      }
    }
  });

  $effect(() => {
    if (!contentEl) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const s = journeyStep;
    gsap.fromTo(contentEl, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
  });
</script>

<div class="journey-search">
  <div class="step-progress" bind:this={progressEl}>
    {#each journeyStepLabels as label, i}
      <div class="step-node" class:active={journeyStepIndex >= i} class:completed={journeyStepIndex > i}>
        <div class="step-dot" data-step={i}>
          {#if journeyStepIndex > i}
            <svg viewBox="0 0 12 12" width="8" height="8" fill="none"><path d="M3 6l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {/if}
        </div>
        <span class="step-label">{label}</span>
      </div>
      {#if i < 2}
        <div class="step-connector-wrap">
          <div class="step-connector" data-connector={i}>
            <div class="step-connector-fill"></div>
          </div>
        </div>
      {/if}
    {/each}
  </div>
  <div class="step-content" bind:this={contentEl}>
  <div class="search-fields">
    <div class="location-fields">
    <!-- Origin field -->
    <div class="field-wrap">
      <label class="field-label" for={originId}>{t.from}</label>
      <div class="autocomplete-wrap">
        <div class="field-input-wrap">
          {#if originType && !originFocused}
            <span class="input-icon">
              {#if originType === 'stop'}
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                  <circle cx="7" cy="7" r="3" />
                  <path d="M7 1v2m0 8v2M1 7h2m8 0h2" />
                </svg>
              {:else}
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" />
                  <circle cx="7" cy="5" r="1.5" />
                </svg>
              {/if}
            </span>
          {/if}
          <input
            id={originId}
            type="text"
            class="field-input"
            class:has-icon={!!originType}
            placeholder={t.journeyAddressPlaceholder}
            bind:value={origin}
            oninput={onOriginInput}
            onfocus={() => { originFocused = true; }}
            onblur={() => { setTimeout(() => { originFocused = false; }, 150); }}
            onkeydown={onOriginKeydown}
            autocomplete="off"
          />
        </div>
        {#if originFocused && (originLoading || originSuggestions.length > 0)}
          <div class="suggestions">
            {#if originLoading}
              <div class="suggestion-msg">{t.journeySearching}</div>
            {:else}
              {#each originSuggestions as s, idx}
                <button
                  class="suggestion-item"
                  class:selected={idx === originSelectedIdx}
                  onmousedown={() => selectOriginSuggestion(s)}
                >
                  <span class="sug-icon">
                    {#if s.type === 'stop'}
                      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                        <circle cx="7" cy="7" r="3" />
                        <path d="M7 1v2m0 8v2M1 7h2m8 0h2" />
                      </svg>
                    {:else}
                      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" />
                        <circle cx="7" cy="5" r="1.5" />
                      </svg>
                    {/if}
                  </span>
                  <div class="sug-text">
                    <span class="sug-name">{s.name}</span>
                    <span class="sug-detail">{s.detail}</span>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Destination field -->
    <div class="field-wrap">
      <label class="field-label" for={destinationId}>{t.journeyTo}</label>
      <div class="autocomplete-wrap">
        <div class="field-input-wrap">
          {#if destType && !destFocused}
            <span class="input-icon">
              {#if destType === 'stop'}
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                  <circle cx="7" cy="7" r="3" />
                  <path d="M7 1v2m0 8v2M1 7h2m8 0h2" />
                </svg>
              {:else}
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" />
                  <circle cx="7" cy="5" r="1.5" />
                </svg>
              {/if}
            </span>
          {/if}
          <input
            id={destinationId}
            type="text"
            class="field-input"
            class:has-icon={!!destType}
            placeholder={t.journeyAddressPlaceholder}
            bind:value={dest}
            oninput={onDestInput}
            onfocus={() => { destFocused = true; }}
            onblur={() => { setTimeout(() => { destFocused = false; }, 150); }}
            onkeydown={onDestKeydown}
            autocomplete="off"
          />
        </div>
        {#if destFocused && (destLoading || destSuggestions.length > 0)}
          <div class="suggestions">
            {#if destLoading}
              <div class="suggestion-msg">{t.journeySearching}</div>
            {:else}
              {#each destSuggestions as s, idx}
                <button
                  class="suggestion-item"
                  class:selected={idx === destSelectedIdx}
                  onmousedown={() => selectDestSuggestion(s)}
                >
                  <span class="sug-icon">
                    {#if s.type === 'stop'}
                      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                        <circle cx="7" cy="7" r="3" />
                        <path d="M7 1v2m0 8v2M1 7h2m8 0h2" />
                      </svg>
                    {:else}
                      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" />
                        <circle cx="7" cy="5" r="1.5" />
                      </svg>
                    {/if}
                  </span>
                  <div class="sug-text">
                    <span class="sug-name">{s.name}</span>
                    <span class="sug-detail">{s.detail}</span>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>
    </div>

    <div class="swap-connector" aria-hidden="false">
      <button type="button" class="field-arrow" onclick={swapDirections} aria-label={t.journeySwap ?? 'Byt riktning'} title={t.journeySwap ?? 'Byt riktning'}>
        <span class="field-arrow-visual">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
            {@html arrowDownUp}
          </svg>
        </span>
      </button>
    </div>
  </div>

  <button
    class="search-btn"
    disabled={!origin.trim() || !dest.trim() || searching || (timeMode !== 'now' && (!travelDate || !travelTime))}
    onclick={doSearch}
  >
    {searching ? t.journeySearching : t.journeyFindRoute}
  </button>

  <div class="time-options" aria-label={t.journeyTimeMode ?? 'När vill du åka?'}>
    <span class="options-label">{t.journeyTimeMode ?? 'När vill du åka?'}</span>
    <div class="time-mode-row" role="radiogroup">
      <button type="button" class:active={timeMode === 'now'} role="radio" aria-checked={timeMode === 'now'} onclick={() => timeMode = 'now'}>
        {t.journeyDepartNow ?? 'Åk nu'}
      </button>
      <button type="button" class:active={timeMode === 'departure'} role="radio" aria-checked={timeMode === 'departure'} onclick={() => { timeMode = 'departure'; ensureTimedDefaults(); }}>
        {t.journeyDepartureTime ?? 'Avgångstid'}
      </button>
      <button type="button" class:active={timeMode === 'arrival'} role="radio" aria-checked={timeMode === 'arrival'} onclick={() => { timeMode = 'arrival'; ensureTimedDefaults(); }}>
        {t.journeyArrivalTime ?? 'Ankomsttid'}
      </button>
    </div>
    {#if timeMode !== 'now'}
      <div class="datetime-row">
        <label>{t.journeyDate ?? 'Datum'}<input type="date" min={localDateValue()} bind:value={travelDate} /></label>
        <label>{t.journeyTime ?? 'Tid'}<input type="time" bind:value={travelTime} /></label>
      </div>
    {/if}
  </div>

  <button type="button" class="advanced-toggle" aria-expanded={advancedOpen} aria-controls="journey-advanced-options" onclick={() => advancedOpen = !advancedOpen}>
    <span class="advanced-toggle-copy">
      <span class="advanced-title">{t.journeyAdvanced ?? 'Avancerat'}</span>
      <span class="advanced-summary">{advancedSummary}</span>
    </span>
    <svg class:open={advancedOpen} class="advanced-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      {@html chevronDown}
    </svg>
  </button>
  {#if advancedOpen}
    <div id={advancedOptionsId} class="advanced-options">
      <fieldset class="filter-group">
        <legend>{t.journeyModes ?? 'Färdsätt'}</legend>
        <div class="mode-options" role="group" aria-label={t.journeyModes ?? 'Färdsätt'}>
          {#each [['bus', t.transportBus], ['metro', t.transportMetro], ['train', t.transportTrain], ['tram', t.transportTram], ['boat', t.transportBoat]] as [mode, label]}
            <label class="filter-option" class:selected={transportModes.includes(mode as typeof transportModes[number])}>
              <input type="checkbox" checked={transportModes.includes(mode as typeof transportModes[number])} onchange={(event) => {
              const checked = (event.currentTarget as HTMLInputElement).checked;
              transportModes = checked
                ? [...transportModes, mode as typeof transportModes[number]]
                : transportModes.filter((item) => item !== mode);
              }} />
              <span class="filter-check" aria-hidden="true">✓</span>
              <TransportIcon type={mode as typeof transportModes[number]} size={17} />
              <span>{label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      <fieldset class="filter-group">
        <legend>{t.journeyMaxChanges ?? 'Max byten'}</legend>
        <div class="segmented-options" role="radiogroup" aria-label={t.journeyMaxChanges ?? 'Max byten'}>
          {#each [[0, '0'], [1, '1'], [2, '2'], [3, '3+']] as [value, label]}
            <label class="segment-option" class:selected={maxChanges === value}>
              <input type="radio" name="journey-max-changes" value={value} checked={maxChanges === value} onchange={() => maxChanges = value as number} />
              <span>{label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      <fieldset class="filter-group">
        <legend>{t.journeyRoutePreference ?? 'Prioritera'}</legend>
        <div class="preference-options" role="radiogroup" aria-label={t.journeyRoutePreference ?? 'Prioritera'}>
          {#each [['leasttime', t.journeyFastest ?? 'Snabbast'], ['leastinterchange', t.journeyFewestChanges ?? 'Färre byten'], ['leastwalking', t.journeyLeastWalking ?? 'Minst gång']] as [value, label]}
            <label class="preference-option" class:selected={routeType === value}>
              <input type="radio" name="journey-route-preference" value={value} checked={routeType === value} onchange={() => routeType = value as JourneyRouteType} />
              <span class="preference-indicator" aria-hidden="true"></span>
              <span>{label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    </div>
  {/if}

  {#if noResults}
    <p class="status-text">{t.journeyNoRoutes}</p>
  {/if}

  {#if results.length > 0}
    <div class="results-list">
      {#each results as journey}
        <button class="result-card" class:selected={previewJourneyId === journey.id} onclick={() => selectJourney(journey)} aria-expanded={previewJourneyId === journey.id}>
          <div class="result-header">
            <span class="result-dest">{journey.destLabel}</span>
            <span class="result-duration">{formatDuration(journey.totalDurationMin)}</span>
          </div>
          <div class="result-time">
            {formatTime(journey.departureTime)} – {formatTime(journey.arrivalTime)}
          </div>
          <div class="result-legs">
            {#each journey.legs as leg, i}
              {#if i > 0}
                <span class="leg-sep">→</span>
              {/if}
              <span class="leg-chip">
                <TransportIcon type={leg.transportType} size={11} />
                {leg.lineName}
              </span>
            {/each}
          </div>
          <div class="result-pos">
            {#if journey.legs[0]}
              <TrainPosition position={journey.legs[0].platformPosition} />
            {/if}
            {#if journey.transfers > 0}
              <span class="transfer-note">{journey.transfers} transfer{journey.transfers > 1 ? 's' : ''}</span>
            {/if}
          </div>
        </button>
        {#if previewJourneyId === journey.id}
          <div class="journey-preview">
            <JourneyCard
              journeyMeta={journeyMetaForPreview(journey)}
              isExpanded={true}
              ontoggle={() => (previewJourneyId = null)}
            />
            <button class="add-journey-btn" type="button" onclick={() => addPreviewedJourney(journey)}>
              {t.addJourney ?? 'Lägg till resa'}
            </button>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  </div>
</div>

<style>
  .journey-search {
    padding: 12px 16px 16px;
  }

  .step-content {
    display: flex;
    flex-direction: column;
  }

  .search-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    column-gap: 12px;
    align-items: stretch;
    margin-bottom: 8px;
    position: relative;
  }

  .location-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .swap-connector {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-height: 0;
    margin-top: 17px;
  }

  .field-arrow {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    padding: 0;
    cursor: pointer;
    transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
  }

  .field-arrow-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-emphasis);
    transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
  }

  .field-arrow-visual svg {
    width: 20px;
    height: 20px;
  }

  .field-arrow:hover,
  .field-arrow:focus-visible {
    color: var(--accent);
    outline: none;
  }

  .field-arrow:hover .field-arrow-visual,
  .field-arrow:focus-visible .field-arrow-visual {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .field-arrow:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
    display: block;
  }

  .autocomplete-wrap {
    position: relative;
  }

  .field-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    display: flex;
    pointer-events: none;
    z-index: 1;
  }

  .field-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
  }

  .field-input.has-icon {
    padding-left: 30px;
  }

  .field-input:focus {
    border-color: var(--accent);
  }

  .field-input::placeholder {
    color: var(--text-muted);
  }

  .suggestions {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    z-index: 10;
    max-height: 260px;
    overflow-y: auto;
  }

  .suggestion-msg {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font: inherit;
  }

  .suggestion-item:hover,
  .suggestion-item.selected {
    background: var(--accent-subtle);
  }

  .sug-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .sug-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sug-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sug-detail {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search-btn {
    width: 100%;
    min-height: 44px;
    padding: 10px 16px;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    margin-bottom: 12px;
    order: 3;
  }

  .time-options { order: 1; margin: 2px 0 8px; }
  .options-label, .advanced-options legend {
    display: block;
    margin-bottom: 6px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
  }
  .time-mode-row { display: flex; gap: 4px; }
  .time-mode-row button {
    flex: 1;
    min-height: 38px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    color: var(--text-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .time-mode-row button.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--text);
    font-weight: 700;
  }
  .datetime-row { display: flex; gap: 8px; margin-top: 8px; }
  .datetime-row label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
  }
  .datetime-row input {
    min-height: 38px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .advanced-toggle {
    order: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 8px 0;
    border: 0;
    border-top: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .advanced-toggle-copy {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    text-align: left;
  }

  .advanced-title {
    color: var(--text);
    flex: 0 0 auto;
  }

  .advanced-summary {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .advanced-summary {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .advanced-chevron {
    flex: 0 0 auto;
    color: var(--text-secondary);
    transition: transform 150ms ease, color 150ms ease;
  }

  .advanced-chevron.open {
    transform: rotate(180deg);
    color: var(--accent);
  }

  .advanced-toggle:hover .advanced-chevron,
  .advanced-toggle:focus-visible .advanced-chevron {
    color: var(--accent);
  }

  .advanced-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .advanced-options {
    order: 2;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--surface-emphasis);
  }

  .filter-group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .filter-group + .filter-group {
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .filter-group legend {
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .mode-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .filter-option,
  .segment-option,
  .preference-option {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  .filter-option {
    gap: 7px;
    padding: 6px 8px;
  }

  .filter-option:hover,
  .segment-option:hover,
  .preference-option:hover {
    border-color: var(--accent);
  }

  .filter-option.selected,
  .segment-option.selected,
  .preference-option.selected {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--text);
  }

  .filter-option:focus-within,
  .segment-option:focus-within,
  .preference-option:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .filter-option input,
  .segment-option input,
  .preference-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .filter-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    flex: 0 0 auto;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    color: transparent;
    font-size: 11px;
    line-height: 1;
  }

  .filter-option.selected .filter-check {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .segmented-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .segment-option {
    justify-content: center;
    padding: 6px;
  }

  .preference-options {
    display: grid;
    gap: 6px;
  }

  .preference-option {
    gap: 8px;
    padding: 6px 10px;
  }

  .preference-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    border: 1px solid var(--border-subtle);
    border-radius: 50%;
  }

  .preference-option.selected .preference-indicator {
    border: 4px solid var(--accent);
  }

  .search-btn:disabled {
    opacity: 1;
    border: 1px solid var(--border);
    background: var(--surface-emphasis);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .status-text {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    padding: 16px 0;
    order: 4;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    order: 4;
  }

  .result-card {
    display: block;
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .result-card:hover,
  .result-card:focus-visible {
    border-color: var(--accent);
    outline: none;
  }

  .result-card.selected {
    background: var(--accent-subtle);
  }

  .journey-preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: -4px 0 4px;
  }

  .add-journey-btn {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-on-accent);
    font: inherit;
    font-size: 14px;
    font-weight: 750;
    cursor: pointer;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2px;
  }

  .result-dest {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .result-duration {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }

  .result-time {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .result-legs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .leg-sep {
    color: var(--text-muted);
    font-size: 12px;
  }

  .leg-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: var(--radius-full, 999px);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .result-pos {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .transfer-note {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Step progress */
  .step-progress {
    display: flex;
    align-items: flex-start;
    padding: 0 0 8px 0;
    width: 100%;
  }

  .step-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .step-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, border-color 0.2s ease, width 0.2s ease, height 0.2s ease;
  }

  .step-node.active .step-dot {
    width: 12px;
    height: 12px;
    background: var(--accent);
    border-color: var(--accent);
  }

  .step-node.completed .step-dot {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--text-on-accent);
  }

  .step-connector-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    padding-top: 4px;
    margin: 0 5px;
  }

  .step-connector {
    height: 2px;
    width: 100%;
    background: var(--border);
    overflow: hidden;
  }

  .step-connector-fill {
    height: 100%;
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: left center;
  }

  /* CSS fallback: fill connector instantly when adjacent step is completed. */
  .step-node.completed + .step-connector-wrap .step-connector-fill {
    transform: scaleX(1);
  }

  .step-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
