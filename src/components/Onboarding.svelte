<script lang="ts">
  import type { Stop, TransportType, SegmentDirection } from "../types/route";
  import { routeStore } from "../stores/routeStore";
  import { t } from "../stores/localeStore";
  import SegmentSearch from "./SegmentSearch.svelte";

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state<0 | 1>(0);
  let selectedSegment = $state<{
    line: string;
    lineName: string;
    direction: SegmentDirection;
    fromStop: Stop;
    toStop: Stop;
    transportType: TransportType;
  } | null>(null);

  function handleSelect(
    line: string,
    lineName: string,
    direction: SegmentDirection,
    fromStop: Stop,
    toStop: Stop,
    transportType: TransportType,
  ) {
    selectedSegment = {
      line,
      lineName,
      direction,
      fromStop,
      toStop,
      transportType,
    };
    step = 1;
  }

  function completeSetup() {
    if (!selectedSegment) return;

    const firstRouteId = routeStore.addRoute("Arbete");
    routeStore.addSegment(firstRouteId, {
      ...selectedSegment,
      travelTimeMinutes: 0,
      transferBufferMinutes: 0,
    });

    onComplete();
  }
</script>

<div class="onboarding">
  <div class="sheet">
    {#if step === 0}
      <h1>{$t.setupStopTitle}</h1>
      <p class="sub">{$t.setupStopDesc}</p>
      <SegmentSearch onSelect={handleSelect} />
    {:else}
      <h1>{$t.setupReviewTitle}</h1>
      <p class="sub">{$t.setupReviewDesc}</p>
      {#if selectedSegment}
        <div class="summary">
          <div>{selectedSegment.fromStop.name}</div>
          <div>{selectedSegment.lineName || selectedSegment.line}</div>
          <div>{selectedSegment.direction.destination}</div>
        </div>
      {/if}
      <div class="stack">
        <button class="primary" onclick={completeSetup}>
          {$t.createFirstRoute}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    background: linear-gradient(160deg, #f3f4f6, #e5e7eb);
    display: grid;
    place-items: center;
    padding: 20px;
    z-index: 9999;
  }

  .sheet {
    inline-size: min(100%, 420px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h1 {
    font-size: 22px;
    line-height: 1.2;
  }

  .sub {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 8px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .primary {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-family: inherit;
    cursor: pointer;
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .summary {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }

</style>
