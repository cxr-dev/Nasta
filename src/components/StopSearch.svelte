<script lang="ts">
  import { searchSites } from '../services/slApi';
  import type { SiteSearchResult } from '../types/departure';
  
  let { onSelect = () => {}, transportMode = 'all' }: { 
    onSelect?: (site: SiteSearchResult) => void;
    transportMode?: string;
  } = $props();
  
  let query = $state('');
  let results = $state<SiteSearchResult[]>([]);
  let loading = $state(false);
  let showResults = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;
  
  async function handleInput() {
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
      results = [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      loading = true;
      showResults = true;
      try {
        results = await searchSites(query, transportMode);
      } catch (e) {
        console.error('Search failed:', e);
        results = [];
      } finally {
        loading = false;
      }
    }, 300);
  }
  
  function selectSite(site: SiteSearchResult) {
    onSelect(site);
    query = '';
    results = [];
    showResults = false;
  }
  
  function handleBlur() {
    setTimeout(() => showResults = false, 200);
  }
  
  function getTransportIcon(mode?: string): string {
    if (!mode) return 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1 .55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31-2.69-6-6-6S4 2.69 4 6v10zm9 0c0 .88-.39 1.67-1 2.22V20c0 .55-.45 1-1 1-.55 0-1-.45-1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31 2.69-6 6-6s6 2.69 6 6v10zm-9-10v10';
    switch (mode) {
      case 'metro': return 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z';
      case 'train': return 'M4 15c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8H4v7zm8-5h-2v2h2v-2zm0 3h-2v2h2v-2zm0 3h-2v2h2v-2zM7.5 6h9v1h-9V6z';
      case 'ship': return 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z';
      default: return 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1 .55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31-2.69-6-6-6S4 2.69 4 6v10zm9 0c0 .88-.39 1.67-1 2.22V20c0 .55-.45 1-1 1-.55 0-1-.45-1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31 2.69-6 6-6s6 2.69 6 6v10zm-9-10v10';
    }
  }
</script>

<div class="stop-search">
  <input
    type="text"
    bind:value={query}
    oninput={handleInput}
    onfocus={() => query.length >= 2 && (showResults = true)}
    onblur={handleBlur}
    placeholder="Sök hållplats..."
    class="search-input"
  />
  
  {#if showResults && (results.length > 0 || loading)}
    <div class="results">
      {#if loading}
        <div class="loading">Söker...</div>
      {:else if results.length === 0}
        <div class="no-results">Inga resultat</div>
      {:else}
        {#each results as site}
          <button 
            class="result-item"
            onmousedown={() => selectSite(site)}
          >
            <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={getTransportIcon(site.transportModes?.[0])} />
            </svg>
            <span class="site-name">{site.name}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .stop-search {
    position: relative;
    margin-bottom: 16px;
  }

  .search-input {
    width: 100%;
    padding: 14px 16px;
    background: var(--input-bg, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    color: var(--text-primary, #fff);
    font-size: 16px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: var(--border-focus, #666);
  }

  .search-input::placeholder {
    color: var(--text-secondary, #555);
  }

  .results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 100;
  }

  .loading, .no-results {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary, #666);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text-primary, #fff);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .result-item:hover {
    background: var(--surface-hover, #252525);
  }

  .transport-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--text-secondary, #888);
  }

  .site-name {
    font-size: 15px;
  }
</style>
