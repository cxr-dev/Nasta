<script lang="ts">
  import { searchSites } from '../services/slApi';
  import type { SiteSearchResult } from '../types/departure';
  
  let { onSelect = () => {} }: { onSelect?: (site: SiteSearchResult) => void } = $props();
  
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
        results = await searchSites(query);
      } catch (e) {
        console.error('Search failed:', e);
        results = [];
      } finally {
        loading = false;
      }
    }, 200);
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

<div class="search-box">
  <input
    type="text"
    bind:value={query}
    oninput={handleInput}
    onfocus={() => query.length >= 2 && (showResults = true)}
    onblur={handleBlur}
    placeholder="Sök hållplats..."
    class="input"
  />
  
  {#if showResults && (results.length > 0 || loading)}
    <div class="results">
      {#if loading}
        <div class="msg">Söker...</div>
      {:else if results.length === 0}
        <div class="msg">Inga resultat</div>
      {:else}
        {#each results as site}
          <button class="item" onmousedown={() => selectSite(site)}>
            <span class="name">{site.name}</span>
            {#if site.note}<span class="note">{site.note}</span>{/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .search-box {
    position: relative;
    margin-bottom: 16px;
  }

  .input {
    width: 100%;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 16px;
    outline: none;
  }

  .input:focus {
    border-color: var(--accent);
  }

  .input::placeholder {
    color: var(--text-secondary);
  }

  .results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-top: 4px;
    max-height: 280px;
    overflow-y: auto;
    z-index: 100;
  }

  .msg {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }

  .item:hover {
    background: var(--border);
  }

  .name {
    font-size: 15px;
  }

  .note {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
