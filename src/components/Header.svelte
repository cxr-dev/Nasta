<script lang="ts">
  let { 
    editing = false, 
    darkMode = true,
    onToggleEdit = () => {},
    onToggleTheme = () => {},
    onAddRoute = () => {},
    addRouteBtnRef = $bindable(null)
  }: { 
    editing?: boolean;
    darkMode?: boolean;
    onToggleEdit?: () => void;
    onToggleTheme?: () => void;
    onAddRoute?: () => void;
    addRouteBtnRef?: HTMLButtonElement | null;
  } = $props();
</script>

<header>
  <h1>Nästa</h1>
  <div class="actions">
    <button class="add-btn" onclick={onAddRoute} aria-label="Lägg till rutt" bind:this={addRouteBtnRef}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
    <button class="theme-btn" onclick={onToggleTheme} aria-label="Toggle theme">
      {#if darkMode}
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
        </svg>
      {/if}
    </button>
    <button class="edit-btn" onclick={onToggleEdit} aria-label="Redigera rutter">
      {editing ? 'Klar' : 'Redigera'}
    </button>
  </div>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--border, #333);
    margin-bottom: 16px;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
    color: var(--text-primary, #fff);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .add-btn, .theme-btn {
    background: transparent;
    border: 1px solid var(--border, #444);
    color: var(--text-primary, #fff);
    width: 36px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .add-btn svg, .theme-btn svg {
    width: 20px;
    height: 20px;
  }

  .add-btn:hover, .theme-btn:hover {
    background: var(--surface, #1a1a1a);
    border-color: var(--border-hover, #666);
  }

  .edit-btn {
    background: transparent;
    border: 1px solid var(--border, #444);
    color: var(--text-primary, #fff);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .edit-btn:hover {
    background: var(--surface, #1a1a1a);
    border-color: var(--border-hover, #666);
  }
</style>
