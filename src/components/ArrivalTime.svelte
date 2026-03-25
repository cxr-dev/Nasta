<script lang="ts">
  import type { ArrivalInfo } from '../services/arrivalCalculator';
  
  let { arrival }: { arrival: ArrivalInfo | null } = $props();
</script>

{#if arrival}
  <div class="arrival-box">
    <div class="label">Ankomst</div>
    <div class="time">{arrival.arrivalTime}</div>
    <div class="minutes">{arrival.totalMinutes} min</div>
  </div>
{/if}

<style>
  .arrival-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    margin-top: 16px;
  }

  .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .time {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -1px;
    color: var(--text);
  }

  .minutes {
    font-size: 14px;
    color: var(--text-secondary);
    margin-top: 4px;
  }
</style>
