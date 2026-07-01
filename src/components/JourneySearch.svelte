<script lang="ts">
  import type { Journey } from '../types/journey';
  import type { LocationSuggestion } from '../services/journeyService';
  import { searchJourneys, searchStopSuggestions, searchAddressSuggestions } from '../services/journeyService';
  import { getT } from '../stores/localeStore.svelte';
  import TransportIcon from './TransportIcon.svelte';
  import TrainPosition from './TrainPosition.svelte';

  let {
    onSelect,
  }: {
    onSelect?: (journey: Journey) => void;
  } = $props();

  let t = $derived(getT());

  let origin = $state('');
  let dest = $state('');
  let originCoord = $state<[number, number] | undefined>(undefined);
  let destCoord = $state<[number, number] | undefined>(undefined);
  let originType = $state<'stop' | 'address' | null>(null);
  let destType = $state<'stop' | 'address' | null>(null);
  let results = $state<Journey[]>([]);
  let searching = $state(false);
  let noResults = $state(false);
  let searchAttempted = $state(false);

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
        const [stops, addresses] = await Promise.all([
          searchStopSuggestions(q, originAbort.signal),
          searchAddressSuggestions(q),
        ]);
        if (originAbort.signal.aborted) return;
        const stopNames = new Set(stops.map((s: LocationSuggestion) => s.name.toLowerCase()));
        const filteredAddresses = addresses.filter(
          (a: LocationSuggestion) => !stopNames.has(a.name.toLowerCase()),
        );
        originSuggestions = [...stops, ...filteredAddresses].slice(0, 8);
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
        const [stops, addresses] = await Promise.all([
          searchStopSuggestions(q, destAbort.signal),
          searchAddressSuggestions(q),
        ]);
        if (destAbort.signal.aborted) return;
        const stopNames = new Set(stops.map((s: LocationSuggestion) => s.name.toLowerCase()));
        const filteredAddresses = addresses.filter(
          (a: LocationSuggestion) => !stopNames.has(a.name.toLowerCase()),
        );
        destSuggestions = [...stops, ...filteredAddresses].slice(0, 8);
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
    resultsAbort = new AbortController();

    searching = true;
    noResults = false;
    searchAttempted = true;
    results = [];

    try {
      const journeys = await searchJourneys({
        origin: origin.trim(),
        dest: dest.trim(),
        originCoord,
        destCoord,
        signal: resultsAbort.signal,
      });

      if (journeys.length === 0) {
        noResults = true;
      } else {
        results = journeys;
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        noResults = true;
      }
    } finally {
      searching = false;
    }
  }

  function selectJourney(journey: Journey) {
    onSelect?.(journey);
  }
</script>

<div class="journey-search">
  <div class="search-fields">
    <!-- Origin field -->
    <div class="field-wrap">
      <label class="field-label" for="journey-origin">{t.from}</label>
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
            id="journey-origin"
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

    <div class="field-arrow">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </div>

    <!-- Destination field -->
    <div class="field-wrap">
      <label class="field-label" for="journey-dest">{t.journeyTo}</label>
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
            id="journey-dest"
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

  <button
    class="search-btn"
    disabled={!origin.trim() || !dest.trim() || searching}
    onclick={doSearch}
  >
    {searching ? t.journeySearching : t.journeyFindRoute}
  </button>

  {#if noResults}
    <p class="status-text">{t.journeyNoRoutes}</p>
  {/if}

  {#if results.length > 0}
    <div class="results-list">
      {#each results as journey}
        <button class="result-card" onclick={() => selectJourney(journey)}>
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
      {/each}
    </div>
  {/if}
</div>

<style>
  .journey-search {
    padding: 12px 16px 16px;
  }

  .search-fields {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
    position: relative;
  }

  .field-arrow {
    display: flex;
    justify-content: center;
    color: var(--text-muted);
    padding: 2px 0;
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
    padding: 10px;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    margin-bottom: 12px;
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-text {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    padding: 16px 0;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
</style>
