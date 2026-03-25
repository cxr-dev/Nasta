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
  <h1>Nästa</h1>
  <div class="actions">
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
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
    color: var(--text);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .edit-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .edit-btn:hover {
    background: var(--surface);
    border-color: var(--text-secondary);
  }
</style>
