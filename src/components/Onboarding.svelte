<script lang="ts">
  import type { Direction, Stop, TransportType } from "../types/route";
  import { routeStore } from "../stores/routeStore";
  import { settingsStore } from "../stores/settingsStore";
  import { t } from "../stores/localeStore";
  import SegmentSearch from "./SegmentSearch.svelte";

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state<0 | 1 | 2>(0);
  let direction = $state<Direction>("toWork");
  let duplicateReturnRoute = $state(true);
  let selectedSegment = $state<{
    line: string;
    lineName: string;
    directionText: string;
    fromStop: Stop;
    toStop: Stop;
    transportType: TransportType;
  } | null>(null);

  function pickDirection(nextDirection: Direction) {
    direction = nextDirection;
    step = 1;
  }

  function handleSelect(
    line: string,
    lineName: string,
    directionText: string,
    fromStop: Stop,
    toStop: Stop,
    transportType: TransportType,
  ) {
    selectedSegment = {
      line,
      lineName,
      directionText,
      fromStop,
      toStop,
      transportType,
    };
    step = 2;
  }

  function completeSetup() {
    if (!selectedSegment) return;

    const firstRouteId = routeStore.addRoute("Arbete", direction);
    routeStore.addSegment(firstRouteId, {
      ...selectedSegment,
      travelTimeMinutes: 0,
      transferBufferMinutes: 0,
    });

    if (duplicateReturnRoute) {
      const oppositeDirection: Direction =
        direction === "toWork" ? "fromWork" : "toWork";
      const returnRouteId = routeStore.addRoute("Arbete", oppositeDirection);
      routeStore.addSegment(returnRouteId, {
        ...selectedSegment,
        travelTimeMinutes: 0,
        transferBufferMinutes: 0,
      });
    }

    if (direction === "toWork") {
      settingsStore.setAnchor("homeAnchor", selectedSegment.fromStop.name);
      settingsStore.setAnchor("workAnchor", selectedSegment.toStop.name);
    } else {
      settingsStore.setAnchor("homeAnchor", selectedSegment.toStop.name);
      settingsStore.setAnchor("workAnchor", selectedSegment.fromStop.name);
    }

    onComplete();
  }
</script>

<div class="onboarding">
  <div class="sheet">
    {#if step === 0}
      <h1>{$t.setupDirectionTitle}</h1>
      <p class="sub">{$t.setupDirectionDesc}</p>
      <div class="stack">
        <button class="primary" onclick={() => pickDirection("toWork")}>
          {$t.setupDirectionToWork}
        </button>
        <button class="secondary" onclick={() => pickDirection("fromWork")}>
          {$t.setupDirectionFromWork}
        </button>
      </div>
    {:else if step === 1}
      <h1>{$t.setupStopTitle}</h1>
      <p class="sub">{$t.setupStopDesc}</p>
      <SegmentSearch onSelect={handleSelect} />
      <button class="ghost" onclick={() => (step = 0)}>{$t.previous}</button>
    {:else}
      <h1>{$t.setupReviewTitle}</h1>
      <p class="sub">{$t.setupReviewDesc}</p>
      {#if selectedSegment}
        <div class="summary">
          <div>{selectedSegment.fromStop.name}</div>
          <div>{selectedSegment.lineName || selectedSegment.line}</div>
          <div>{selectedSegment.directionText}</div>
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" bind:checked={duplicateReturnRoute} />
        <span>{$t.duplicateReturnRoute}</span>
      </label>
      <div class="stack">
        <button class="primary" onclick={completeSetup}>
          {$t.createFirstRoute}
        </button>
        <button class="ghost" onclick={() => (step = 1)}>{$t.previous}</button>
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

  .primary,
  .secondary,
  .ghost {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .secondary,
  .ghost {
    background: transparent;
    color: var(--text);
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

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
</style>

