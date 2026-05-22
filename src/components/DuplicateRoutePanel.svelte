<script lang="ts">
  import type { Route, Segment } from '../types/route';
  import type { Departure } from '../types/departure';
  import { routeStore } from '../stores/routeStore';
  import { getDepartures } from '../services/slApi';
  import { t } from '../stores/localeStore';
  import DirectionSelector from './DirectionSelector.svelte';

  let { 
    baseRouteId, 
    pendingRoute,
    onComplete,
    onCancel
  }: { 
    baseRouteId: string;
    pendingRoute: Omit<Route, "id">;
    onComplete: () => void;
    onCancel: () => void;
  } = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);

  // We need to fetch departures for each segment to let the user confirm the direction
  // But for simplicity, we might just fetch for the first segment if there's only one,
  // or fetch for all segments and store their resolved directions.
  
  type SegmentState = {
    originalSegment: Segment;
    departures: Departure[];
    selectedDirectionCode: number | null;
  };

  let segmentStates = $state<SegmentState[]>([]);
  let currentSegmentIndex = $state(0);

  $effect(() => {
    let active = true;
    async function load() {
      loading = true;
      error = null;
      try {
        const states: SegmentState[] = [];
        // The pendingRoute segments are already reversed in order
        for (const seg of pendingRoute.segments) {
          // Fetch departures for the new pickup stop (seg.fromStop)
          const { departures } = await getDepartures(seg.fromStop.siteId, 240);
          // Filter to just this line
          const lineDeps = departures.filter((d: Departure) => d.line === seg.line);
          
          // Suggest opposite direction: if original was 1, suggest 2
          const origDirectionCode = seg.direction?.code;
          const suggestedCode = origDirectionCode === 1 ? 2 : (origDirectionCode === 2 ? 1 : null);
          
          let selected = suggestedCode;
          // Verify suggested code exists in departures
          if (selected !== null && !lineDeps.some((d: Departure) => d.direction_code === selected)) {
            selected = lineDeps[0]?.direction_code ?? null;
          }

          states.push({
            originalSegment: seg,
            departures: lineDeps,
            selectedDirectionCode: selected,
          });
        }
        if (active) {
          segmentStates = states;
          loading = false;
        }
      } catch (e) {
        if (active) {
          if (import.meta.env.DEV) console.error("Failed to load departures for duplication", e);
          error = $t.failedToFetchDepartures;
          loading = false;
        }
      }
    }
    load();
    return () => { active = false; };
  });

  function handleDirectionSelect(dir: { code: number, destination: string, stopPointId: string }) {
    segmentStates[currentSegmentIndex].selectedDirectionCode = dir.code;
    
    if (currentSegmentIndex < segmentStates.length - 1) {
      currentSegmentIndex++;
    } else {
      saveRoute();
    }
  }

  function saveRoute() {
    // Generate new segments with confirmed directions
    const confirmedSegments = segmentStates.map((state) => {
      const dep = state.departures.find(d => d.direction_code === state.selectedDirectionCode);
      return {
        ...state.originalSegment,
        id: crypto.randomUUID(),
        direction: {
          code: state.selectedDirectionCode || 1,
          destination: dep?.destination || state.originalSegment.direction?.destination || '',
          stopPointId: dep?.stop_point_id || '',
        }
      };
    });

    // Create the route
    const newRouteId = routeStore.addRoute(pendingRoute.name, pendingRoute.direction);
    
    // Add segments
    for (const seg of confirmedSegments) {
      routeStore.addSegment(newRouteId, seg);
    }
    
    onComplete();
  }
</script>

<div class="duplicate-panel">
  <div class="panel-header">
    <h4>{$t.createReturnTrip ?? 'Skapa returresa'}</h4>
    <button class="cancel-btn" onclick={onCancel}>{$t.cancel}</button>
  </div>

  {#if loading}
    <div class="loading-skeleton">
      {#each Array(3) as _}
        <div class="skeleton-row">
          <div class="skeleton-badge"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-time"></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if segmentStates.length > 0}
    {@const currentState = segmentStates[currentSegmentIndex]}
    <div class="segment-step">
      <div class="step-info">
        <span class="step-count">
          {#if segmentStates.length > 1}
            Del {currentSegmentIndex + 1} av {segmentStates.length}:
          {/if}
        </span>
        <span class="step-line">{currentState.originalSegment.line}</span>
        {$t.from} <strong>{currentState.originalSegment.fromStop.name}</strong>
      </div>
      
      <DirectionSelector 
        departures={currentState.departures} 
        onSelect={handleDirectionSelect} 
      />
    </div>
  {/if}
</div>

<style>
  .duplicate-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    margin: 0 16px 16px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .cancel-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
  }

  .error {
    text-align: center;
    padding: 16px;
    color: #dc2626;
  }

  .segment-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step-info {
    font-size: 15px;
    color: var(--text);
  }

  .step-line {
    font-weight: 600;
    padding: 2px 6px;
    background: var(--accent-subtle);
    border-radius: 4px;
    margin-right: 6px;
  }
  .loading-skeleton { padding: 12px 0; }
  .skeleton-row { display: flex; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--border); }
  .skeleton-badge { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(90deg, var(--accent-subtle) 0%, var(--border) 50%, var(--accent-subtle) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  .skeleton-line { flex: 1; height: 14px; margin: 0 12px; border-radius: 4px; background: linear-gradient(90deg, var(--border) 0%, var(--surface) 50%, var(--border) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  .skeleton-time { width: 80px; height: 32px; border-radius: 4px; background: linear-gradient(90deg, var(--border) 0%, var(--surface) 50%, var(--border) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
