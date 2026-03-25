<script lang="ts">
  import { routeStore } from '../stores/routeStore';
  import { transportOptions } from '../icons/transport';
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
    background: var(--overlay, rgba(0, 0, 0, 0.6));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }

  .modal {
    background: var(--surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 360px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    color: var(--text-primary, #fff);
  }

  .field {
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #888);
    margin-bottom: 6px;
  }

  input, select {
    width: 100%;
    padding: 12px;
    background: var(--input-bg, #222);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    color: var(--text-primary, #fff);
    font-size: 15px;
  }

  input:focus, select:focus {
    outline: none;
    border-color: var(--border-focus, #666);
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
    border: 1px solid var(--border, #444);
    color: var(--text-secondary, #888);
  }

  .cancel-btn:hover {
    border-color: var(--border-hover, #666);
    color: var(--text-primary, #fff);
  }

  .submit-btn {
    background: var(--btn-primary-bg, #fff);
    border: none;
    color: var(--btn-primary-text, #000);
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--btn-primary-hover, #eee);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>