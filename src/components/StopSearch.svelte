<script lang="ts">
  import { searchSites } from '../services/slApi';
  import type { SiteSearchResult } from '../types/departure';
  
  export let onSelect: (site: SiteSearchResult) => void = () => {};
  
  let query = '';
  let results: SiteSearchResult[] = [];
  let loading = false;
  let showResults = false;
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
        results = await searchSites(query);
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
</script>

<div class="stop-search">
  <input
    type="text"
    bind:value={query}
    on:input={handleInput}
    on:focus={() => query.length >= 2 && (showResults = true)}
    on:blur={handleBlur}
    placeholder="Sök hållplats..."
    class="search-input"
  />
  
  {#if showResults && (results.length > 0 || loading)}
    <div class="results">
      {#if loading}
        <div class="loading">Söker...</div>
      {:else}
        {#each results as site}
          <button 
            class="result-item"
            on:mousedown={() => selectSite(site)}
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
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    color: #fff;
    font-size: 16px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: #666;
  }

  .search-input::placeholder {
    color: #555;
  }

  .results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 100;
  }

  .loading {
    padding: 16px;
    text-align: center;
    color: #666;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .result-item:hover {
    background: #252525;
  }

  .site-name {
    font-size: 15px;
  }

  .site-type {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
  }
</style>
