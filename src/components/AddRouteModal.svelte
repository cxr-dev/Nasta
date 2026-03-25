<script lang="ts">
  import { routeStore } from '../stores/routeStore';
  import type { TransportType } from '../types/route';
  
  let { onClose = () => {}, triggerRef = null }: { 
    onClose?: () => void; 
    triggerRef?: HTMLElement | null;
  } = $props();
  
  let name = $state('');
  let transportType = $state<TransportType>('bus');
  let modalRef = $state<HTMLDivElement | null>(null);
  
  function handleSubmit(e: Event) {
    e.preventDefault();
    if (name.trim()) {
      routeStore.addRoute(name.trim(), transportType);
      onClose();
      triggerRef?.focus();
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
      triggerRef?.focus();
    }
  }
  
  const transportOptions: { value: TransportType; label: string; icon: string }[] = [
    { value: 'bus', label: 'Buss', icon: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1 .55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31-2.69-6-6-6S4 2.69 4 6v10zm9 0c0 .88-.39 1.67-1 2.22V20c0 .55-.45 1-1 1-.55 0-1-.45-1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31 2.69-6 6-6s6 2.69 6 6v10zm-9-10v10' },
    { value: 'train', label: 'Tåg', icon: 'M4 15c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8H4v7zm8-5h-2v2h2v-2zm0 3h-2v2h2v-2zm0 3h-2v2h2v-2zM7.5 6h9v1h-9V6z' },
    { value: 'metro', label: 'Tunnelbana', icon: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z' },
    { value: 'boat', label: 'Färja', icon: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z' }
  ];
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div 
  class="modal-backdrop" 
  onclick={onClose} 
  onkeydown={handleKeyDown}
  role="presentation"
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div 
    class="modal" 
    onclick={(e) => e.stopPropagation()} 
    onkeydown={() => {}} 
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="modal-title"
    tabindex="-1"
    bind:this={modalRef}
  >
    <h2 id="modal-title">Lägg till rutt</h2>
    <form onsubmit={handleSubmit}>
      <div class="field">
        <label for="route-name">Namn</label>
        <input 
          id="route-name"
          type="text" 
          bind:value={name} 
          placeholder="t.ex. Jobb, Hem, Skola"
          required
        />
      </div>
      
      <div class="field">
        <label for="transport-type">Färdsätt</label>
        <select id="transport-type" bind:value={transportType}>
          {#each transportOptions as opt}
            <option value={opt.value}>
              {opt.label}
            </option>
          {/each}
        </select>
      </div>
      
      <div class="actions">
        <button type="button" class="cancel-btn" onclick={onClose}>Avbryt</button>
        <button type="submit" class="submit-btn" disabled={!name.trim()}>Lägg till</button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }

  .modal {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 360px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    color: #fff;
  }

  .field {
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #888;
    margin-bottom: 6px;
  }

  input, select {
    width: 100%;
    padding: 12px;
    background: #222;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    font-size: 15px;
  }

  input:focus, select:focus {
    outline: none;
    border-color: #666;
  }

  .actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .cancel-btn, .submit-btn {
    flex: 1;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid #444;
    color: #888;
  }

  .cancel-btn:hover {
    border-color: #666;
    color: #fff;
  }

  .submit-btn {
    background: #fff;
    border: none;
    color: #000;
  }

  .submit-btn:hover:not(:disabled) {
    background: #eee;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>