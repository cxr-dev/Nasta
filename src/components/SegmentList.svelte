<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  
  let { route }: { route: Route } = $props();
  
  function removeSegment(segmentId: string) {
    routeStore.removeSegment(route.id, segmentId);
  }
</script>

<div class="segment-list">
  {#if route.segments.length === 0}
    <p class="empty">Lägg till resesegment nedan</p>
  {:else}
    {#each route.segments as segment, index (segment.id)}
      <div class="segment">
        <div class="segment-num">{index + 1}</div>
        <div class="segment-info">
          <div class="segment-line">{segment.lineName}</div>
          <div class="segment-route">
            {segment.fromStop.name} → {segment.toStop.name}
          </div>
          <div class="segment-dir">{segment.directionText}</div>
        </div>
        <button 
          class="remove-btn" 
          onclick={() => removeSegment(segment.id)}
          aria-label="Ta bort"
        >
          ×
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .segment-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    padding: 20px;
  }

  .segment {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    background: var(--bg);
    border-radius: 10px;
    border: 1px solid var(--border);
  }

  .segment-num {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--to-work);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
  }

  .segment-info {
    flex: 1;
  }

  .segment-line {
    font-weight: 600;
    font-size: 15px;
    color: var(--text);
  }

  .segment-route {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .segment-dir {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--border);
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
  }

  .remove-btn:hover {
    background: var(--danger);
  }
</style>