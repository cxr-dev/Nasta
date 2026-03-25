<script lang="ts">
  import type { Route, TransportType, Stop } from '../types/route';
  import { routeStore } from '../stores/routeStore';
  import SegmentSearch from './SegmentSearch.svelte';
  import SegmentList from './SegmentList.svelte';
  
  let { route }: { route: Route } = $props();
  
  function addSegment(
    line: string,
    lineName: string,
    directionText: string,
    fromStop: Stop,
    toStop: Stop,
    transportType: TransportType
  ) {
    routeStore.addSegment(route.id, {
      line,
      lineName,
      directionText,
      fromStop,
      toStop,
      transportType
    });
  }
</script>

<div class="route-editor">
  <h2>Redigera: {route.name}</h2>
  <p class="direction-hint">
    {route.direction === 'toWork' ? 'Till arbetet' : 'Hem från arbetet'}
  </p>
  
  <SegmentList {route} />
  
  <div class="add-segment">
    <h3>Lägg till segment</h3>
    <SegmentSearch onSelect={addSegment} />
  </div>
</div>

<style>
  .route-editor {
    background: var(--surface);
    border-radius: 12px;
    padding: 20px;
    margin-top: 16px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--text);
  }

  .direction-hint {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .add-segment {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  h3 {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }
</style>