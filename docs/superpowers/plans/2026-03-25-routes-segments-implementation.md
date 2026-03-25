# Routes & Segments Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "stops" model with a "segments" model where each segment has a line (e.g., "Buss 76") with direction, and implement the create/edit flow for routes with automatic reverse route generation.

**Architecture:** 
- Update `types/route.ts` to define `Segment` with line, direction, fromStop, toStop
- Replace `Route.stops` with `Route.segments`
- Update routeStore to manage segments and create reverse routes
- Create new `SegmentSearch.svelte` that shows all departures from a stop with line + direction
- Update UI components to display segments instead of stops

**Tech Stack:** Svelte 5, TypeScript, SL Transport API

---

## File Structure

- **Create:** 
  - `src/components/SegmentSearch.svelte` - New search component showing departures per line
  - `src/types/route.ts` (new) - New type definitions
  - `src/components/SegmentList.svelte` - Display segments in a route
  - `src/components/CreateRouteModal.svelte` - New route creation flow

- **Modify:**
  - `src/types/route.ts` - Update to use segments
  - `src/stores/routeStore.ts` - Add segment management, reverse route creation
  - `src/services/storage.ts` - Handle new data format migration
  - `src/App.svelte` - Update to show new route/segment UI
  - `src/components/RouteSelector.svelte` - Use new route structure
  - `src/components/RouteEditor.svelte` - Replace with segment editing

- **Delete:**
  - `src/components/StopSearch.svelte` - Replaced by SegmentSearch
  - `src/components/AddRouteModal.svelte` - Replaced by CreateRouteModal

---

## Chunk 1: Data Model & Types

### Task 1: Update Route Types

**Files:**
- Modify: `src/types/route.ts:1-15`

- [ ] **Step 1: Create backup of current types**

```bash
cp src/types/route.ts src/types/route.ts.backup
```

- [ ] **Step 2: Write new type definitions**

```typescript
// src/types/route.ts
export type Direction = 'toWork' | 'fromWork';

export interface Stop {
  id: string;
  name: string;
  siteId: string;
}

export interface Segment {
  id: string;
  line: string;           // Line number/designation (e.g., "76", "2", "Färja")
  lineName: string;       // Full name (e.g., "Buss 76")
  directionText: string;  // Direction (e.g., "mot Norra Hammarbyhamnen")
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
}

export interface Route {
  id: string;
  name: string;
  direction: Direction;
  segments: Segment[];
}

export type TransportType = 'bus' | 'train' | 'metro' | 'boat';
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/types/route.ts
git commit -m "refactor: update route types to use segments model"
```

---

## Chunk 2: Store & Storage

### Task 2: Update routeStore

**Files:**
- Modify: `src/stores/routeStore.ts:1-80`

- [ ] **Step 1: Write failing test first**

```typescript
// src/stores/routeStore.test.ts (create new)
import { describe, it, expect, beforeEach } from 'vitest';
import { routeStore, selectedRouteId } from './routeStore';

describe('routeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    routeStore.initialize();
  });

  it('should create route with segments', () => {
    routeStore.addRoute('Arbete', 'toWork');
    const routes = routeStore.getAll();
    expect(routes).toHaveLength(1);
    expect(routes[0].direction).toBe('toWork');
    expect(routes[0].segments).toEqual([]);
  });

  it('should create reverse route automatically', () => {
    routeStore.addRoute('Arbete', 'toWork');
    const routes = routeStore.getAll();
    expect(routes).toHaveLength(2); // toWork + fromWork
    expect(routes[1].direction).toBe('fromWork');
  });

  it('should add segment to route', () => {
    routeStore.addRoute('Arbete', 'toWork');
    routeStore.addSegment('Arbete', {
      line: '76',
      lineName: 'Buss 76',
      directionText: 'mot Norra Hammarbyhamnen',
      fromStop: { id: '1', name: 'Lindarängsvägen', siteId: '1010' },
      toStop: { id: '2', name: 'Kungsträdgården', siteId: '1020' },
      transportType: 'bus'
    });
    const routes = routeStore.getAll();
    expect(routes[0].segments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/stores/routeStore.test.ts
```
Expected: FAIL - routeStore methods not defined

- [ ] **Step 3: Implement routeStore with new methods**

```typescript
// src/stores/routeStore.ts
import { writable, derived, get } from 'svelte/store';
import type { Route, Segment, Direction, TransportType, Stop } from '../types/route';
import { loadRoutes, saveRoutes } from '../services/storage';

function createRouteStore() {
  const initial = loadRoutes();
  const { subscribe, set, update } = writable<Route[]>(initial);

  return {
    subscribe,
    getAll: () => get({ subscribe }),
    
    addRoute: (name: string, direction: Direction) => {
      const newRoute: Route = {
        id: crypto.randomUUID(),
        name,
        direction,
        segments: []
      };
      
      update(routes => {
        const updated = [...routes, newRoute];
        
        // Auto-create reverse route if toWork
        if (direction === 'toWork') {
          const reverseRoute: Route = {
            id: crypto.randomUUID(),
            name: name,
            direction: 'fromWork',
            segments: []
          };
          updated.push(reverseRoute);
        }
        
        saveRoutes(updated);
        return updated;
      });
    },
    
    removeRoute: (id: string) => {
      update(routes => {
        const updated = routes.filter(r => r.id !== id);
        saveRoutes(updated);
        return updated;
      });
    },
    
    addSegment: (routeId: string, segment: Omit<Segment, 'id'>) => {
      const newSegment: Segment = {
        ...segment,
        id: crypto.randomUUID()
      };
      
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, segments: [...route.segments, newSegment] };
          }
          return route;
        });
        
        // Sync reverse route (mirror segments)
        const route = routes.find(r => r.id === routeId);
        if (route && route.direction === 'toWork') {
          const reverseSegments = [...route.segments, newSegment].map(s => ({
            ...s,
            id: crypto.randomUUID(),
            fromStop: s.toStop,
            toStop: s.fromStop
          })).reverse();
          
          updated.forEach(r => {
            if (r.direction === 'fromWork' && r.name === route.name) {
              r.segments = reverseSegments;
            }
          });
        }
        
        saveRoutes(updated);
        return updated;
      });
    },
    
    removeSegment: (routeId: string, segmentId: string) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { 
              ...route, 
              segments: route.segments.filter(s => s.id !== segmentId) 
            };
          }
          return route;
        });
        
        // Sync reverse route
        const route = routes.find(r => r.id === routeId);
        if (route && route.direction === 'toWork') {
          updated.forEach(r => {
            if (r.direction === 'fromWork' && r.name === route.name) {
              const segmentIndex = route.segments.findIndex(s => s.id === segmentId);
              if (segmentIndex >= 0) {
                r.segments = r.segments.filter((_, i) => i !== segmentIndex);
              }
            }
          });
        }
        
        saveRoutes(updated);
        return updated;
      });
    },
    
    initialize: () => {
      const stored = loadRoutes();
      if (stored.length === 0) {
        const toWork: Route = {
          id: crypto.randomUUID(),
          name: 'Arbete',
          direction: 'toWork',
          segments: []
        };
        const fromWork: Route = {
          id: crypto.randomUUID(),
          name: 'Arbete',
          direction: 'fromWork',
          segments: []
        };
        set([toWork, fromWork]);
        saveRoutes([toWork, fromWork]);
      }
    }
  };
}

export const routeStore = createRouteStore();
export const selectedRouteId = writable<string | null>(null);
export const selectedRoute = derived(
  [routeStore, selectedRouteId],
  ([$routes, $selectedId]) => $selectedId ? $routes.find(r => r.id === $selectedId) : $routes[0]
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test src/stores/routeStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/routeStore.ts src/stores/routeStore.test.ts
git commit -m "feat: update routeStore with segments and reverse route"
```

---

## Chunk 3: API & Departures

### Task 3: Update SL API for departures

**Files:**
- Modify: `src/services/slApi.ts:95-113`

- [ ] **Step 1: Write failing test**

```typescript
// src/services/slApi.test.ts - add test
it('should get departures with line info', async () => {
  const deps = await getDepartures('1020'); // Kungsträdgården
  expect(deps.length).toBeGreaterThan(0);
  expect(deps[0]).toHaveProperty('line');
  expect(deps[0]).toHaveProperty('destination');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/services/slApi.test.ts
```

- [ ] **Step 3: Enhance getDepartures to return more line details**

```typescript
// src/services/slApi.ts - update getDepartures
export async function getDepartures(siteId: string): Promise<Departure[]> {
  const response = await fetch(`${TRANSPORT_URL}/sites/${siteId}/departures`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return (data.departures || []).map((dep: any) => {
    let minutes = dep.timeToDeparture;
    if (minutes === undefined && dep.expected) {
      minutes = Math.max(0, Math.floor((new Date(dep.expected).getTime() - Date.now()) / 60000));
    }
    return {
      line: dep.line?.designation || dep.line?.name || '',
      lineName: dep.line?.name || '',  // Add this
      destination: dep.destination || '',
      directionText: dep.direction || '',  // Add this
      minutes: minutes ?? 0,
      time: dep.scheduled || dep.expected || '',
      deviation: dep.deviation,
      transportType: getTransportType(dep.line?.transportMode)
    };
  });
}

function getTransportType(mode: string): TransportType {
  switch (mode?.toLowerCase()) {
    case 'bus': return 'bus';
    case 'train': case 'rail': return 'train';
    case 'metro': return 'metro';
    case 'boat': case 'ferry': return 'boat';
    default: return 'bus';
  }
}
```

- [ ] **Step 4: Update types**

```typescript
// src/types/departure.ts - update Departure interface
export interface Departure {
  line: string;
  lineName: string;
  destination: string;
  directionText: string;
  minutes: number;
  time: string;
  deviation?: string;
  transportType: TransportType;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test src/services/slApi.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/services/slApi.ts src/types/departure.ts
git commit -m "feat: enhance departures with line details and direction"
```

---

## Chunk 4: New Search Component

### Task 4: Create SegmentSearch component

**Files:**
- Create: `src/components/SegmentSearch.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import { searchSites, getDepartures } from '../services/slApi';
  import type { SiteSearchResult, Departure } from '../types/departure';
  import type { TransportType } from '../types/route';
  
  let { 
    onSelect = (line: string, lineName: string, directionText: string, fromStop: Stop, toStop: Stop, transportType: TransportType) => {}
  }: { 
    onSelect?: (line: string, lineName: string, directionText: string, fromStop: Stop, toStop: Stop, transportType: TransportType) => void
  } = $props();
  
  interface Stop {
    id: string;
    name: string;
    siteId: string;
  }
  
  let query = $state('');
  let stations = $state<SiteSearchResult[]>([]);
  let departures = $state<Departure[]>([]);
  let selectedStation = $state<SiteSearchResult | null>(null);
  let loading = $state(false);
  let loadingDeps = $state(false);
  let step = $state<'search' | 'select'>('search');
  let debounceTimer: ReturnType<typeof setTimeout>;
  
  async function handleInput() {
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
      stations = [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      loading = true;
      try {
        stations = await searchSites(query);
      } catch (e) {
        console.error('Search failed:', e);
        stations = [];
      } finally {
        loading = false;
      }
    }, 200);
  }
  
  async function selectStation(station: SiteSearchResult) {
    selectedStation = station;
    step = 'select';
    loadingDeps = true;
    
    try {
      departures = await getDepartures(station.siteId);
      // Group by line + direction
      departures = departures.filter((d, i, arr) => 
        arr.findIndex(x => x.line === d.line && x.destination === d.destination) === i
      );
    } catch (e) {
      console.error('Failed to load departures:', e);
      departures = [];
    } finally {
      loadingDeps = false;
    }
  }
  
  function handleSelect(departure: Departure) {
    onSelect(
      departure.line,
      departure.lineName,
      departure.directionText,
      { id: crypto.randomUUID(), name: selectedStation!.name, siteId: selectedStation!.siteId },
      { id: crypto.randomUUID(), name: departure.destination, siteId: '' }, // toStop will be set by next search
      departure.transportType
    );
    reset();
  }
  
  function reset() {
    query = '';
    stations = [];
    departures = [];
    selectedStation = null;
    step = 'search';
  }
  
  function goBack() {
    step = 'search';
    departures = [];
  }
</script>

<div class="segment-search">
  {#if step === 'search'}
    <input
      type="text"
      bind:value={query}
      oninput={handleInput}
      placeholder="Sök hållplats..."
      class="input"
    />
    
    {#if loading}
      <div class="msg">Söker...</div>
    {:else if stations.length > 0}
      <div class="results">
        {#each stations as station}
          <button class="item" onmousedown={() => selectStation(station)}>
            <span class="name">{station.name}</span>
            <span class="arrow">→</span>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="departures-view">
      <button class="back" onmousedown={goBack}>
        ← Tillbaka
      </button>
      <h3>{selectedStation?.name}</h3>
      
      {#if loadingDeps}
        <div class="msg">Laddar avgångar...</div>
      {:else if departures.length === 0}
        <div class="msg">Inga avgångar hittades</div>
      {:else}
        <div class="departures-list">
          {#each departures as dep}
            <button class="dep-item" onmousedown={() => handleSelect(dep)}>
              <div class="dep-line">{dep.line}</div>
              <div class="dep-info">
                <span class="dep-dest">{dep.destination}</span>
                <span class="dep-dir">{dep.directionText}</span>
              </div>
              <div class="dep-select">Välj →</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .segment-search {
    margin-bottom: 16px;
  }

  .input {
    width: 100%;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 16px;
    outline: none;
  }

  .input:focus {
    border-color: var(--accent);
  }

  .msg {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
  }

  .results {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-top: 4px;
    max-height: 280px;
    overflow-y: auto;
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-size: 15px;
  }

  .item:hover {
    background: var(--border);
  }

  .arrow {
    color: var(--accent);
  }

  .departures-view {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .back {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 12px;
    padding: 0;
  }

  h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text);
  }

  .departures-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dep-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .dep-item:hover {
    border-color: var(--accent);
  }

  .dep-line {
    font-weight: 600;
    font-size: 16px;
    min-width: 40px;
    color: var(--text);
  }

  .dep-info {
    flex: 1;
  }

  .dep-dest {
    display: block;
    font-size: 15px;
    color: var(--text);
  }

  .dep-dir {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .dep-select {
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }
</style>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SegmentSearch.svelte
git commit -m "feat: add SegmentSearch component with departures"
```

---

## Chunk 5: Route Editor & UI Updates

### Task 5: Create SegmentList component

**Files:**
- Create: `src/components/SegmentList.svelte`

- [ ] **Step 1: Write the component**

```svelte
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
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 8px;
  }

  .segment-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
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
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SegmentList.svelte
git commit -m "feat: add SegmentList component"
```

---

### Task 6: Update RouteEditor

**Files:**
- Modify: `src/components/RouteEditor.svelte:1-70`

- [ ] **Step 1: Replace content**

```svelte
<script lang="ts">
  import type { Route } from '../types/route';
  import type { TransportType, Stop } from '../types/route';
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
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RouteEditor.svelte
git commit -m "feat: update RouteEditor to use segments"
```

---

## Chunk 6: Main UI Integration

### Task 7: Update App.svelte and RouteSelector

**Files:**
- Modify: `src/App.svelte:1-150`
- Modify: `src/components/RouteSelector.svelte:1-103`

- [ ] **Step 1: Update RouteSelector**

```svelte
<!-- src/components/RouteSelector.svelte -->
<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  
  let { 
    onSelect = () => {},
    editing = false,
    onDeleteRoute = () => {}
  }: { 
    onSelect?: (routeId: string) => void;
    editing?: boolean;
    onDeleteRoute?: (routeId: string) => void;
  } = $props();
  
  let routes = $derived($routeStore);
  let selected = $derived($selectedRouteId);
  
  function selectRoute(id: string) {
    selectedRouteId.set(id);
    onSelect(id);
  }
  
  function handleDelete(e: Event, routeId: string) {
    e.stopPropagation();
    onDeleteRoute(routeId);
  }
</script>

<div class="tabs" role="tablist" aria-label="Rutter">
  {#each routes as route (route.id)}
    <div 
      class="tab"
      class:active={selected === route.id}
      onclick={() => selectRoute(route.id)}
      onkeydown={(e) => e.key === 'Enter' && selectRoute(route.id)}
      role="tab"
      tabindex="0"
      aria-selected={selected === route.id}
    >
      <span class="name">
        {route.name}
        <span class="direction-label">
          {route.direction === 'toWork' ? '→' : '←'}
        </span>
      </span>
      {#if editing && routes.length > 2}
        <button 
          class="delete"
          onclick={(e) => handleDelete(e, route.id)}
          aria-label="Ta bort rutt"
        >
          ×
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .tab:hover {
    border-color: var(--text-secondary);
    color: var(--text);
  }

  .tab.active {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
  }

  .name {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .direction-label {
    font-size: 12px;
    opacity: 0.7;
  }

  .delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--danger);
    color: #fff;
    font-size: 14px;
    line-height: 1;
  }
</style>
```

- [ ] **Step 2: Update App.svelte**

```svelte
<!-- src/App.svelte - Update the main layout -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { settingsStore } from './stores/settingsStore';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import DepartureList from './components/DepartureList.svelte';
  
  let editing = $state(false);
  let showEditor = $state(false);
  
  onMount(() => {
    routeStore.initialize();
  });
  
  function toggleEdit() {
    editing = !editing;
    showEditor = editing;
  }
  
  function selectRoute(routeId: string) {
    selectedRouteId.set(routeId);
    showEditor = false;
    editing = false;
  }
</script>

<div class="app" class:dark={$settingsStore.theme === 'dark'}>
  <Header {editing} onToggleEdit={toggleEdit} />
  
  <main>
    <RouteSelector 
      onSelect={selectRoute} 
      {editing}
      onDeleteRoute={(id) => routeStore.removeRoute(id)}
    />
    
    {#if showEditor && $selectedRoute}
      <RouteEditor route={$selectedRoute} />
    {:else if $selectedRoute}
      <DepartureList route={$selectedRoute} />
    {/if}
  </main>
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
  }
  
  main {
    max-width: 600px;
    margin: 0 auto;
    padding: 16px;
  }
</style>
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte src/components/RouteSelector.svelte
git commit -m "feat: integrate new route/segment UI in main app"
```

---

## Chunk 7: Create Route Modal

### Task 8: Create CreateRouteModal

**Files:**
- Create: `src/components/CreateRouteModal.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import { routeStore } from '../stores/routeStore';
  
  let { onClose = () => {}, triggerRef = null }: { 
    onClose?: () => void; 
    triggerRef?: HTMLElement | null;
  } = $props();
  
  let name = $state('');
  let modalRef = $state<HTMLDivElement | null>(null);
  
  function handleSubmit(e: Event) {
    e.preventDefault();
    if (name.trim()) {
      routeStore.addRoute(name.trim(), 'toWork');
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

<div 
  class="modal-backdrop" 
  onclick={onClose} 
  onkeydown={handleKeyDown}
  role="presentation"
>
  <div 
    class="modal" 
    onclick={(e) => e.stopPropagation()}
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="modal-title"
    tabindex="-1"
    bind:this={modalRef}
  >
    <h2 id="modal-title">Lägg till rutt</h2>
    <form onsubmit={handleSubmit}>
      <div class="field">
        <label for="route-name">Destination</label>
        <input 
          id="route-name"
          type="text" 
          bind:value={name} 
          placeholder="t.ex. Jobb, Gym, Kompis"
          required
        />
      </div>
      
      <div class="actions">
        <button type="button" class="cancel-btn" onclick={onClose}>Avbryt</button>
        <button type="submit" class="submit-btn" disabled={!name.trim()}>Skapa</button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 360px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    color: var(--text);
  }

  .field {
    margin-bottom: 16px;
  }

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  input {
    width: 100%;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 15px;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
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
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .submit-btn {
    background: var(--accent);
    border: none;
    color: #fff;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateRouteModal.svelte
git commit -m "feat: add CreateRouteModal component"
```

---

## Chunk 8: Cleanup & Final Testing

### Task 9: Remove old components and test

**Files:**
- Delete: `src/components/StopSearch.svelte`
- Delete: `src/components/AddRouteModal.svelte`

- [ ] **Step 1: Remove old files**

```bash
rm src/components/StopSearch.svelte src/components/AddRouteModal.svelte
```

- [ ] **Step 2: Run full test suite**

```bash
npm test && npm run check
```

- [ ] **Step 3: Commit cleanup**

```bash
git rm src/components/StopSearch.svelte src/components/AddRouteModal.svelte
git commit -m "refactor: remove deprecated StopSearch and AddRouteModal"
```

---

## Summary

- [ ] Chunk 1: Data Model & Types
- [ ] Chunk 2: Store & Storage  
- [ ] Chunk 3: API & Departures
- [ ] Chunk 4: New Search Component
- [ ] Chunk 5: Route Editor & UI Updates
- [ ] Chunk 6: Main UI Integration
- [ ] Chunk 7: Create Route Modal
- [ ] Chunk 8: Cleanup & Final Testing