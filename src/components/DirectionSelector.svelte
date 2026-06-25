<script lang="ts">
  import type { TransitDeparture } from '../providers/types';
  import type { SegmentDirection } from '../types/page';
  import { getT } from '../stores/localeStore.svelte';

  let t = $derived(getT());

  let { 
    departures, 
    onSelect,
    stopSequences = {} as Record<number, string[]>
  }: { 
    departures: TransitDeparture[], 
    onSelect: (direction: SegmentDirection) => void,
    stopSequences?: Record<number, string[]>
  } = $props();

  let directions = $derived.by(() => {
    const seen = new Set<number>();
    const unique: SegmentDirection[] = [];
    for (const dep of departures) {
      if (!seen.has(dep.directionCode)) {
        seen.add(dep.directionCode);
        unique.push({
          code: dep.directionCode,
          destination: dep.destination,
          stopPointId: '',
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
    onSelect({
      ...dir,
      intermediateStops: stopSequences[code],
    });
  }
}
</script>

  <div class="direction-selector" role="radiogroup" aria-label={t.selectDirection}>
  <div class="options">
    {#each directions as dir, i (dir.code)}
      <label class="direction-option" class:selected={selectedCode === dir.code} style="--i: {i}">
        <input 
          type="radio" 
          name="direction" 
          value={dir.code} 
          bind:group={selectedCode}
          class="sr-only"
        />
        <div class="radio-circle"></div>
        <div class="direction-option-content">
          <span class="destination">
            {dir.destination}
            {#if dir.via}
              <span class="via-label"> ({t.via} {dir.via})</span>
            {/if}
          </span>
          {#if stopSequences[dir.code]?.length}
            <span class="stop-preview">{stopSequences[dir.code].slice(0, 5).join(' · ')}{#if stopSequences[dir.code].length > 5}…{/if}</span>
          {/if}
        </div>
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
    animation: optionEnter 0.3s ease-out both;
    animation-delay: calc(var(--i) * 0.05s);
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
    transform: scale(1);
  }

  .radio-circle::after {
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    transform: scale(0);
  }

  .direction-option-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .destination {
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
  }

  .stop-preview {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    line-height: 1.3;
  }

  .confirm-btn {
    padding: 14px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--text-on-accent);
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

  @keyframes optionEnter {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .direction-option {
      animation: none;
    }
    .radio-circle::after {
      transition: none;
    }
  }
</style>
