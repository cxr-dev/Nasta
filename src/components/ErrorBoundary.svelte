<script lang="ts">
  let { children, fallbackMessage }: { 
    children: any; 
    fallbackMessage?: string;
  } = $props();

  let hasError = $state(false);
  let errorMessage = $state('An unexpected error occurred');

  function reload() {
    hasError = false;
    window.location.reload();
  }
</script>

<svelte:window onerror={() => { hasError = true; }} />

{#if hasError}
  <div class="error-boundary">
    <div class="error-content">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2>Something went wrong</h2>
      <p>{fallbackMessage || errorMessage}</p>
      <button onclick={reload}>
        Reload App
      </button>
    </div>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .error-boundary {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg, #FAFAF9);
    padding: 20px;
    z-index: 9999;
  }

  .error-content {
    text-align: center;
    max-width: 320px;
  }

  .error-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    color: var(--text-ghost, rgba(0,0,0,0.13));
  }

  .error-icon svg {
    width: 100%;
    height: 100%;
  }

  h2 {
    font-family: 'Neue Machina', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: var(--text, #171717);
    margin: 0 0 8px;
  }

  p {
    font-size: 14px;
    color: var(--text-secondary, rgba(0,0,0,0.55));
    margin: 0 0 24px;
    line-height: 1.5;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--accent, #171717);
    color: #fff;
    border: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }

  button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  button:active {
    transform: translateY(0);
  }
</style>