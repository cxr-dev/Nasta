<script lang="ts">
  import { searchSites } from '../services/slApi';
  import type { SiteSearchResult } from '../types/departure';
  
  let { onSelect = () => {} }: { onSelect?: (site: SiteSearchResult) => void } = $props();
  
  let query = $state('');
  let allResults = $state<SiteSearchResult[]>([]);
  let results = $state<SiteSearchResult[]>([]);
  let loading = $state(false);
  let showResults = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;
  
  function fuzzyMatch(text: string, searchTerm: string): boolean {
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedSearch = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    if (normalizedText.includes(normalizedSearch)) return true;
    
    let searchIdx = 0;
    for (let i = 0; i < normalizedText.length && searchIdx < normalizedSearch.length; i++) {
      if (normalizedText[i] === normalizedSearch[searchIdx]) {
        searchIdx++;
      }
    }
    return searchIdx === normalizedSearch.length;
  }
  
  function filterResults(apiResults: SiteSearchResult[], searchTerm: string): SiteSearchResult[] {
    if (!searchTerm) return apiResults;
    
    const exact = apiResults.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const fuzzy = apiResults.filter(r => !exact.includes(r) && fuzzyMatch(r.name, searchTerm));
    
    return [...exact, ...fuzzy];
  }
  
  async function handleInput() {
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
      allResults = [];
      results = [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      loading = true;
      showResults = true;
      try {
        allResults = await searchSites(query);
        results = filterResults(allResults, query).slice(0, 10);
      } catch (e) {
        console.error('Search failed:', e);
        allResults = [];
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
    allResults = [];
    showResults = false;
  }
  
  function handleBlur() {
    setTimeout(() => showResults = false, 200);
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
            <span class="site-name">{site.name}</span>
            <span class="site-type">{site.type}</span>
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
    justify-content: space-between;
    align-items: center;
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

  .site-name {
    font-size: 15px;
  }

  .site-type {
    font-size: 12px;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
  }
</style>
