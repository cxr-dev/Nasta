<script lang="ts">
  import type { ArrivalInfo } from '../services/arrivalCalculator';
  
  export let arrival: ArrivalInfo | null;
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
    background: linear-gradient(135deg, #1a1a1a 0%, #111 100%);
    border: 1px solid #333;
    border-radius: 16px;
    padding: 20px;
    text-align: center;
    margin-top: 16px;
  }

  .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #666;
    margin-bottom: 4px;
  }

  .time {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -1px;
  }

  .minutes {
    font-size: 14px;
    color: #888;
    margin-top: 4px;
  }
</style>
