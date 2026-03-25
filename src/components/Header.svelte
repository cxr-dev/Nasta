<script lang="ts">
  let editing = false;
  
  function toggleEdit() {
    editing = !editing;
  }
  
  export function setEditing(value: boolean) {
    editing = value;
  }
</script>

<header>
  <h1>Nästa</h1>
  <button class="edit-btn" on:click={toggleEdit} aria-label="Redigera rutter">
    {editing ? 'Klar' : 'Redigera'}
  </button>
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
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
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
