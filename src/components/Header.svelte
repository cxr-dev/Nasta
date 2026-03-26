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

  h1 {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -1px;
    color: var(--text);
    text-align: center;
    flex: 1;
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
