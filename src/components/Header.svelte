<script lang="ts">
  let { 
    editing = false, 
    onToggleEdit = () => {}
  }: { 
    editing?: boolean;
    onToggleEdit?: () => void;
  } = $props();
</script>

<header>
  <div class="logo">
    <svg viewBox="0 0 40 40" class="logo-icon">
      <path d="M8 20h24l-4 4m0-4l4 4" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="32" cy="20" r="3" fill="currentColor"/>
    </svg>
  </div>
  <button class="edit-btn" onclick={onToggleEdit} aria-label="Redigera rutter">
    {editing ? 'Klar' : 'Redigera'}
  </button>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    margin-bottom: 16px;
  }

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo-icon {
    width: 40px;
    height: 40px;
    color: var(--accent);
  }

  .edit-btn {
    position: absolute;
    top: 16px;
    right: 0;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    background: var(--surface);
    border-color: var(--text-secondary);
    color: var(--text);
  }
</style>
