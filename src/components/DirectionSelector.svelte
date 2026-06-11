<script lang="ts">
  import type { Departure } from '../types/departure';
  import type { SegmentDirection } from '../types/page';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());

  let { 
    departures, 
    onSelect 
  }: { 
    departures: Departure[], 
    onSelect: (direction: SegmentDirection) => void 
  } = $props();

  let directions = $derived.by(() => {
    const seen = new Set<number>();
    const unique: SegmentDirection[] = [];
    for (const dep of departures) {
      if (!seen.has(dep.direction_code)) {
        seen.add(dep.direction_code);
        // TODO: When SL API provides intermediate stops in direction object,
        // format as "Destination (via Intermediate)" for augmented labels
        unique.push({
          code: dep.direction_code,
          destination: dep.destination,
          stopPointId: dep.stop_point_id || '',
        });
      }
    }
    // Sort by direction code to ensure consistent order
    return unique.sort((a, b) => a.code - b.code);
  });

 let selectedCode = $state<number | string | null>(null);

function handleConfirm() {
  if (selectedCode === null) return;
  const code = Number(selectedCode);
  const dir = directions.find(d => d.code === code);
  if (dir) {
    onSelect(dir);
  }
}
</script>

  <div class="direction-selector" role="radiogroup" aria-label={t.selectDirection}>
  <div class="options">
    {#each directions as dir (dir.code)}
      <label class="direction-option" class:selected={selectedCode === dir.code}>
        <input 
          type="radio" 
          name="direction" 
          value={dir.code} 
          bind:group={selectedCode}
          class="sr-only"
        />
        <div class="radio-circle"></div>
        <span class="destination">
          {dir.destination}
          {#if dir.via}
            <span class="via-label"> ({t.via} {dir.via})</span>
          {/if}
        </span>
      </label>
    {/each}
  </div>
  
  <button 
    class="confirm-btn" 
    disabled={selectedCode === null}
    onclick={handleConfirm}
  >
    {t.confirm}
  </button>
</div>

<style>
  .direction-selector {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .direction-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .direction-option:hover {
    border-color: var(--accent);
  }

  .direction-option.selected {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .radio-circle {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s;
  }

  input[type="radio"]:focus-visible + .radio-circle {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .direction-option.selected .radio-circle {
    border-color: var(--accent);
  }

  .direction-option.selected .radio-circle::after {
    content: '';
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
  }

  .destination {
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
  }

  .confirm-btn {
    padding: 14px;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 16px;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
    touch-action: manipulation;
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .confirm-btn:not(:disabled):active {
    transform: scale(0.98);
  }
</style>
