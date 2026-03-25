<script lang="ts">
  let { 
    editing = false, 
    darkMode = true,
    onToggleEdit = () => {},
    onToggleTheme = () => {}
  }: { 
    editing?: boolean;
    darkMode?: boolean;
    onToggleEdit?: () => void;
    onToggleTheme?: () => void;
  } = $props();
</script>

<header>
  <h1>Nästa</h1>
  <div class="actions">
    <button class="theme-btn" onclick={onToggleTheme} aria-label="Toggle theme">
      {darkMode ? '☀️' : '🌙'}
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
    border-bottom: 1px solid #333;
    margin-bottom: 16px;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .theme-btn {
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    transition: background 0.2s;
  }

  .theme-btn:hover {
    background: #1a1a1a;
  }

  .edit-btn {
    background: transparent;
    border: 1px solid #444;
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .edit-btn:hover {
    background: #1a1a1a;
    border-color: #666;
  }
</style>
