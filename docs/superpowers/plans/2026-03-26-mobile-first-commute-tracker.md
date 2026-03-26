# Mobile-First Commute Tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Nasta into a mobile-first Swedish public transit commute tracker with hybrid ferry support (SL API for regular transit, static timetable for Sjöstadstrafiken ferries), improved search, dual departure display, and touch drag reordering.

**Architecture:** Use existing slApi.ts for real-time departures. Create new staticTimetable.ts for Sjöstadstrafiken ferry schedules. Create ferryDetection.ts to identify Sjöstadstrafiken stops. Create departureService.ts to orchestrate between APIs. Update UI components for mobile-first UX.

**Tech Stack:** Svelte 5, TypeScript, Vite, PWA, localStorage for persistence

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/services/staticTimetable.ts` | **Create** | Hardcoded ferry schedules + departure calculation |
| `src/services/ferryDetection.ts` | **Create** | Detect Sjöstadstrafiken stops |
| `src/services/departureService.ts` | **Create** | Route to SL API or static timetable |
| `src/services/trafikLabApi.ts` | **Delete** | Remove TrafikLab code with embedded API keys |
| `src/services/trafikLabApi.test.ts` | **Delete** | Remove TrafikLab tests |
| `src/components/SegmentSearch.svelte` | **Modify** | Show line+stop+dest in search results |
| `src/components/SegmentDepartures.svelte` | **Modify** | Show 2 departures with smart layout |
| `src/components/SegmentList.svelte` | **Modify** | Add touch drag reordering |
| `src/icons/transport.ts` | **Modify** | Add Sjöstadstrafiken badge icon |

---

## Chunk 1: Remove TrafikLab Code (Security Fix)

### Task 1: Remove TrafikLab API Service

**Files:**
- Delete: `src/services/trafikLabApi.ts`
- Delete: `src/services/trafikLabApi.test.ts`

- [ ] **Step 1: Delete trafkLabApi.ts**

```bash
rm src/services/trafikLabApi.ts
```

- [ ] **Step 2: Delete trafkLabApi.test.ts**

```bash
rm src/services/trafikLabApi.test.ts
```

- [ ] **Step 3: Update imports in SegmentSearch.svelte**

Change:
```typescript
import { searchStops, getDepartures } from '../services/trafikLabApi';
```
To:
```typescript
import { searchSites } from '../services/slApi';
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "security: remove TrafikLab API with embedded keys"
```

---

## Chunk 2: Create Sjöstadstrafiken Support

### Task 2: Create Static Timetable Service

**Files:**
- Create: `src/services/staticTimetable.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/services/staticTimetable.test.ts
import { describe, it, expect } from 'vitest';
import { isSjostadstrafikenStop, getNextDepartures } from './staticTimetable';

describe('staticTimetable', () => {
  describe('isSjostadstrafikenStop', () => {
    it('should detect Luma brygga', () => {
      expect(isSjostadstrafikenStop('Luma brygga')).toBe(true);
    });
    
    it('should detect Barnängen', () => {
      expect(isSjostadstrafikenStop('Barnängen')).toBe(true);
    });
    
    it('should detect Henriksdal', () => {
      expect(isSjostadstrafikenStop('Henriksdal')).toBe(true);
    });
    
    it('should reject regular SL stops', () => {
      expect(isSjostadstrafikenStop('Slussen')).toBe(false);
      expect(isSjostadstrafikenStop('Stockholm Central')).toBe(false);
    });
  });
  
  describe('getNextDepartures', () => {
    it('should return departures for Luma brygga', () => {
      const deps = getNextDepartures('luma_brygga');
      expect(deps).toHaveLength(2);
      expect(deps[0].line).toBe('421');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/staticTimetable.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write implementation**

```typescript
// src/services/staticTimetable.ts
import type { Departure } from '../types/departure';
import type { TransportType } from '../types/route';

type StopKey = 'luma_brygga' | 'barnangen' | 'henriksdal';

interface TimetableEntry {
  time: string; // HH:mm
  line: string;
  destination: string;
  transportType: TransportType;
}

interface Timetable {
  [key: string]: TimetableEntry[];
}

const timetables: Record<StopKey, Timetable> = {
  luma_brygga: {
    weekdays: generateTimes(['06:05','06:25','06:45','07:05','07:15','07:25','07:35','07:45','07:55','08:05','08:15','08:25','08:35','08:45','08:55','09:05','09:25','09:45','10:05','10:25','10:45','11:05','11:25','11:45','12:05','12:25','12:45','13:05','13:25','13:45','14:05','14:25','14:45','15:05','15:25','15:45','15:55','16:05','16:15','16:25','16:35','16:45','16:55','17:05','17:15','17:25','17:35','17:45','17:55','18:05','18:25','18:45','19:05','19:25','19:45','20:05','20:25','20:45','21:05','21:25','21:45','22:05','22:25','22:45','23:05','23:25','23:45'], '421', 'Henriksdal', 'boat'),
    weekends: generateTimes(['08:05','08:25','08:45','09:05','09:25','09:45','10:05','10:25','10:45','11:05','11:25','11:45','12:05','12:25','12:45','13:05','13:25','13:45','14:05','14:25','14:45','15:05','15:25','15:45','16:05','16:25','16:45','17:05','17:25','17:45','18:05','18:25','18:45','19:05','19:25','19:45','20:05','20:25','20:45','21:05','21:25','21:45','22:05','22:25','22:45','23:05','23:25','23:45'], '421', 'Henriksdal', 'boat'),
  },
  barnangen: {
    weekdays: generateTimes(['06:00','06:20','06:40','07:00','07:10','07:20','07:30','07:40','07:50','08:00','08:10','08:20','08:30','08:40','08:50','09:00','09:20','09:40','10:00','10:20','10:40','11:00','11:20','11:40','12:00','12:20','12:40','13:00','13:20','13:40','14:00','14:20','14:40','15:00','15:20','15:40','15:50','16:00','16:10','16:20','16:30','16:40','16:50','17:00','17:10','17:20','17:30','17:40','17:50','18:00','18:20','18:40','19:00','19:20','19:40','20:00','20:20','20:40','21:00','21:20','21:40','22:00','22:20','22:40','23:00','23:20','23:40'], '422', 'Sjöstadshamnen', 'boat'),
    weekends: generateTimes(['08:00','08:20','08:40','09:00','09:20','09:40','10:00','10:20','10:40','11:00','11:20','11:40','12:00','12:20','12:40','13:00','13:20','13:40','14:00','14:20','14:40','15:00','15:20','15:40','16:00','16:20','16:40','17:00','17:20','17:40','18:00','18:20','18:40','19:00','19:20','19:40','20:00','20:20','20:40','21:00','21:20','21:40','22:00','22:20','22:40','23:00','23:20','23:40'], '422', 'Sjöstadshamnen', 'boat'),
  },
  henriksdal: {
    weekdays: generateTimes(['06:10','06:30','06:50','07:00','07:10','07:20','07:30','07:40','07:50','08:00','08:10','08:20','08:30','08:40','08:50','09:00','09:10','09:30','09:50','10:10','10:30','10:50','11:10','11:30','11:50','12:10','12:30','12:50','13:10','13:30','13:50','14:10','14:30','14:50','15:10','15:30','15:50','16:00','16:10','16:20','16:30','16:40','16:50','17:00','17:10','17:20','17:30','17:40','17:50','18:00','18:10','18:30','18:50','19:10','19:30','19:50','20:10','20:30','20:50','21:10','21:30','21:50','22:10','22:30','22:50','23:10','23:30','23:50'], '421', 'Luma brygga', 'boat'),
    weekends: generateTimes(['08:10','08:30','08:50','09:10','09:30','09:50','10:10','10:30','10:50','11:10','11:30','11:50','12:10','12:30','12:50','13:10','13:30','13:50','14:10','14:30','14:50','15:10','15:30','15:50','16:10','16:30','16:50','17:10','17:30','17:50','18:10','18:30','18:50','19:10','19:30','19:50','20:10','20:30','20:50','21:10','21:30','21:50','22:10','22:30','22:50','23:10','23:30','23:50'], '421', 'Luma brygga', 'boat'),
  },
};

function generateTimes(times: string[], line: string, destination: string, type: TransportType): TimetableEntry[] {
  return times.map(time => ({
    time,
    line,
    destination,
    transportType: type,
  }));
}

const SJOSTAD_STOPS = ['luma brygga', 'barnängen', 'henriksdal'];

export function isSjostadstrafikenStop(stopName: string): boolean {
  const normalized = stopName.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return SJOSTAD_STOPS.some(s => normalized.includes(s));
}

export function getStopKey(stopName: string): StopKey | null {
  const normalized = stopName.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  if (normalized.includes('luma')) return 'luma_brygga';
  if (normalized.includes('barn')) return 'barnangen';
  if (normalized.includes('henrik')) return 'henriksdal';
  return null;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function getNextDepartures(stopName: string, count: number = 2): Departure[] {
  const key = getStopKey(stopName);
  if (!key) return [];
  
  const table = timetables[key];
  const isWeek = isWeekend(new Date());
  const schedule = isWeek ? table.weekends : table.weekdays;
  
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimeMins = currentHours * 60 + currentMinutes;
  
  const departures: Departure[] = [];
  
  for (const entry of schedule) {
    const [hours, mins] = entry.time.split(':').map(Number);
    const entryTimeMins = hours * 60 + mins;
    const minutesUntil = entryTimeMins - currentTimeMins;
    
    if (minutesUntil >= 0) {
      const departureTime = new Date(now);
      departureTime.setHours(hours, mins, 0, 0);
      
      departures.push({
        line: entry.line,
        lineName: entry.line,
        destination: entry.destination,
        directionText: entry.destination,
        minutes: minutesUntil,
        time: entry.time,
        transportType: entry.transportType,
      });
      
      if (departures.length >= count) break;
    }
  }
  
  // If not enough departures today, get from tomorrow
  if (departures.length < count) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIsWeekend = isWeekend(tomorrow);
    const tomorrowSchedule = tomorrowIsWeekend ? table.weekends : table.weekdays;
    
    for (const entry of tomorrowSchedule) {
      const [hours, mins] = entry.time.split(':').map(Number);
      const baseMins = 24 * 60 - currentTimeMins;
      const minutesUntil = baseMins + hours * 60 + mins;
      
      const departureTime = new Date(now);
      departureTime.setDate(departureTime.getDate() + 1);
      departureTime.setHours(hours, mins, 0, 0);
      
      departures.push({
        line: entry.line,
        lineName: entry.line,
        destination: entry.destination,
        directionText: entry.destination,
        minutes: minutesUntil,
        time: entry.time,
        transportType: entry.transportType,
      });
      
      if (departures.length >= count) break;
    }
  }
  
  return departures;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/staticTimetable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/staticTimetable.ts src/services/staticTimetable.test.ts
git commit -m "feat: add static timetable for Sjöstadstrafiken ferries"
```

### Task 3: Create Departure Service

**Files:**
- Create: `src/services/departureService.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/services/departureService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDepartures } from './departureService';

vi.mock('../services/slApi', () => ({
  getDepartures: vi.fn().mockResolvedValue([
    { line: '42', lineName: '42', destination: 'Slussen', directionText: 'Slussen', minutes: 5, time: '07:05', transportType: 'bus' }
  ])
}));

describe('departureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should return static departures for Sjostadstrafiken stops', async () => {
    const deps = await getDepartures('Luma brygga');
    expect(deps).toHaveLength(2);
    expect(deps[0].line).toBe('421');
  });
  
  it('should use SL API for regular stops', async () => {
    const deps = await getDepartures('Slussen');
    expect(deps).toHaveLength(1);
    expect(deps[0].line).toBe('42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/departureService.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write implementation**

```typescript
// src/services/departureService.ts
import type { Departure } from '../types/departure';
import { getDepartures as slGetDepartures } from './slApi';
import { isSjostadstrafikenStop, getNextDepartures } from './staticTimetable';

export async function getDepartures(stopName: string, siteId: string): Promise<Departure[]> {
  if (isSjostadstrafikenStop(stopName)) {
    return getNextDepartures(stopName, 2);
  }
  
  return slGetDepartures(siteId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/departureService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/departureService.ts src/services/departureService.test.ts
git commit -m "feat: create departure service with hybrid routing"
```

---

## Chunk 3: Improve Stop Search UI

### Task 4: Update SegmentSearch for Better Display

**Files:**
- Modify: `src/components/SegmentSearch.svelte`

- [ ] **Step 1: Update imports to use slApi**

Change import from `trafikLabApi` to `slApi`:
```typescript
import { searchSites, getDepartures } from '../services/slApi';
```

- [ ] **Step 2: Update search to show line+destination**

Replace the search results display with:
```svelte
<div class="results">
  {#each stations as station}
    <button class="item" onmousedown={() => selectStation(station)}>
      <span class="stop-name">{station.name}</span>
      <span class="arrow">→</span>
    </button>
  {/each}
</div>
```

- [ ] **Step 3: Update styles for mobile-first**

```css
.item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 16px;
  min-height: 60px;
}

.stop-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}

.stop-note {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: PASS with 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/components/SegmentSearch.svelte
git commit -m "feat: improve stop search with better mobile UX"
```

---

## Chunk 4: Dual Departure Display

### Task 5: Update SegmentDepartures for 2 Departures

**Files:**
- Modify: `src/components/SegmentDepartures.svelte`
- Modify: `src/stores/departureStore.ts`

- [ ] **Step 1: Update departureStore to use departureService**

```typescript
// src/stores/departureStore.ts
import { getDepartures } from '../services/departureService';

const fetchAll = async (siteIds: string[], stopNames: Map<string, string>) => {
  const results = new Map<string, Departure[]>();
  await Promise.all(
    siteIds.map(async (siteId) => {
      try {
        const stopName = stopNames.get(siteId) || '';
        const departures = await getDepartures(stopName, siteId);
        results.set(siteId, departures);
      } catch (e) {
        console.error(`Failed to fetch departures for ${siteId}:`, e);
        results.set(siteId, []);
      }
    })
  );
  set(results);
};
```

- [ ] **Step 2: Update departure fetching in App.svelte**

Pass stop names to the departure store:
```typescript
const siteIds = route.segments.map(s => s.fromStop.siteId).filter(Boolean);
const stopNames = new Map(route.segments.map(s => [s.fromStop.siteId, s.fromStop.name]));
departureStore.startAutoRefresh(siteIds, stopNames, 30000);
```

- [ ] **Step 3: Update SegmentDepartures with smart layout**

Replace the departure display with:
```svelte
<div class="departure-info">
  {#if deps.length > 0}
    {@const headerDep = deps[0]}
    <div class="dep-header">
      <span class="transport-icon">{getTransportIcon(headerDep.transportType)}</span>
      <span class="line">{headerDep.line}</span>
      <span class="dest">{headerDep.destination}</span>
      {#if isSjostadstrafikenStop(segment.fromStop.name)}
        <span class="badge">Sjöstadstrafiken</span>
      {/if}
    </div>
    <div class="dep-times">
      {#each deps.slice(0, 2) as dep}
        <div class="dep-time">
          <span class="minutes">{dep.minutes} min</span>
          <span class="time">{dep.time}</span>
        </div>
      {/each}
    </div>
  {:else}
    <span class="no-departures">Ingen avgång</span>
  {/if}
</div>
```

- [ ] **Step 4: Add styles for smart layout**

```css
.dep-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.transport-icon {
  font-size: 18px;
}

.badge {
  font-size: 11px;
  background: var(--boat);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
}

.dep-times {
  display: flex;
  gap: 24px;
  margin-top: 8px;
}

.dep-time {
  display: flex;
  flex-direction: column;
}

.minutes {
  font-size: 28px;
  font-weight: 700;
}

.time {
  font-size: 14px;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: PASS with 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/SegmentDepartures.svelte src/stores/departureStore.ts src/App.svelte
git commit -m "feat: show dual departures with smart layout"
```

---

## Chunk 5: Touch Drag Reordering

### Task 6: Add Drag Reorder to SegmentList

**Files:**
- Modify: `src/components/SegmentList.svelte`
- Modify: `src/stores/routeStore.ts`

- [ ] **Step 1: Add reorder function to routeStore**

```typescript
// In routeStore.ts, add:
reorderSegments: (routeId: string, fromIndex: number, toIndex: number) => {
  update(routes => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return routes;
    
    const segments = [...route.segments];
    const [moved] = segments.splice(fromIndex, 1);
    segments.splice(toIndex, 0, moved);
    
    route.segments = segments;
    
    const updated = routes.map(r => r.id === routeId ? route : r);
    saveRoutes(updated);
    return updated;
  });
}
```

- [ ] **Step 2: Add drag state and handlers**

```typescript
// In SegmentList.svelte
let draggingIndex = $state<number | null>(null);
let dragOverIndex = $state<number | null>(null);

function handleDragStart(index: number) {
  draggingIndex = index;
}

function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  dragOverIndex = index;
}

function handleDrop(toIndex: number) {
  if (draggingIndex !== null && draggingIndex !== toIndex) {
    routeStore.reorderSegments(route.id, draggingIndex, toIndex);
  }
  draggingIndex = null;
  dragOverIndex = null;
}

function handleDragEnd() {
  draggingIndex = null;
  dragOverIndex = null;
}
```

- [ ] **Step 3: Update template with drag attributes**

```svelte
{#each route.segments as segment, index (segment.id)}
  <div 
    class="segment"
    class:dragging={draggingIndex === index}
    class:drag-over={dragOverIndex === index}
    draggable="true"
    ondragstart={() => handleDragStart(index)}
    ondragover={(e) => handleDragOver(e, index)}
    ondrop={() => handleDrop(index)}
    ondragend={handleDragEnd}
  >
```

- [ ] **Step 4: Add drag styles**

```css
.segment {
  touch-action: none;
  cursor: grab;
  transition: transform 0.2s, box-shadow 0.2s;
}

.segment.dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.segment.drag-over {
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

- [ ] **Step 5: Add test for reorder**

```typescript
// src/stores/routeStore.test.ts
it('should reorder segments', () => {
  const store = createRouteStore();
  store.addRoute('Test', 'toWork');
  const routes = store.getAll();
  // Add segments...
  store.reorderSegments(routes[0].id, 0, 1);
  const updated = store.getAll();
  expect(updated[0].segments[0].id).toBe(originalSegmentIds[1]);
});
```

- [ ] **Step 6: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/SegmentList.svelte src/stores/routeStore.ts
git commit -m "feat: add touch drag reordering for route segments"
```

---

## Chunk 6: Mobile-First Polish

### Task 7: Mobile-First UI Improvements

**Files:**
- Modify: `src/App.svelte`
- Modify: `vite.config.ts` (PWA settings)

- [ ] **Step 1: Verify PWA configuration**

Check that vite.config.ts has proper PWA settings for mobile:
```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Nasta - Nästa avgång',
        short_name: 'Nasta',
        description: 'Swedish public transit commute tracker',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      }
    })
  ]
});
```

- [ ] **Step 2: Add touch-optimized styles**

Add to global styles:
```css
/* Touch-first defaults */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}

input, select, textarea {
  font-size: 16px; /* Prevents iOS zoom */
}
```

- [ ] **Step 3: Run final checks**

```bash
npm run check
npm run test
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts src/app.css
git commit -m "feat: ensure mobile-first PWA configuration"
```

---

## Final Verification

- [ ] All tests pass: `npm run test`
- [ ] Type check passes: `npm run check`
- [ ] Build succeeds: `npm run build`
- [ ] PWA works offline for static timetable

**Ready for deployment to GitHub Pages.**
