# TrafikLab API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SL API with TrafikLab and fix route button labels to show icons with tooltips.

**Architecture:** 
- Create new TrafikLab API service replacing local station caching with on-demand stop search
- Modify RouteSelector component to display icons instead of text labels with tooltips
- Add environment variable for API key and attribution text

**Tech Stack:** Svelte 5, TypeScript, Vite, TrafikLab Realtime APIs

---

## Chunk 1: Route Button Labels Fix

### Task 1: Fix RouteSelector.svelte button labels

**Files:**
- Modify: `src/components/RouteSelector.svelte`

- [ ] **Step 1: Add work and home icons to transport.ts**

Add to `src/icons/transport.ts`:
```typescript
export const directionIcons = {
  toWork: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  fromWork: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
};
```

- [ ] **Step 2: Modify RouteSelector to use icons and tooltips**

Replace lines 41-46 in RouteSelector.svelte:
```svelte
<span class="name" title={route.direction === 'toWork' ? 'Res till arbetet' : 'Res hem'}>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d={route.direction === 'toWork' ? directionIcons.toWork : directionIcons.fromWork} />
  </svg>
</span>
```

- [ ] **Step 3: Update CSS to handle icon-only display**

Modify `.name` styles in RouteSelector.svelte:
```css
.name {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}
```

- [ ] **Step 4: Test the button changes**

Run: `npm run dev`
Verify: Route buttons show icons with tooltips on hover

- [ ] **Step 5: Commit**

```bash
git add src/components/RouteSelector.svelte src/icons/transport.ts
git commit -m "fix: use icons with tooltips for route buttons"
```

---

## Chunk 2: TrafikLab API Service

### Task 2: Create TrafikLab API service

**Files:**
- Create: `src/services/trafikLabApi.ts`
- Modify: `src/services/storage.ts` (if needed for test setup)
- Create: `.env.example`

- [ ] **Step 1: Create .env.example with TrafikLab API key**

```bash
# TrafikLab API key (get from https://trafiklab.se)
VITE_TRAFIKLAB_API_KEY=
```

- [ ] **Step 2: Create trafikLabApi.ts service**

```typescript
import type { Departure, SiteSearchResult } from '../types/departure';
import type { TransportType } from '../types/route';

const API_BASE = 'https://transport.trafiklab.se/api2/v1';

function getApiKey(): string {
  const key = import.meta.env.VITE_TRAFIKLAB_API_KEY;
  if (!key) throw new Error('VITE_TRAFIKLAB_API_KEY not configured');
  return key;
}

function getTransportType(mode?: string): TransportType {
  switch (mode?.toUpperCase()) {
    case 'BUS': return 'bus';
    case 'TRAIN': case 'RAIL': case 'TRAM': return 'train';
    case 'METRO': return 'metro';
    case 'BOAT': case 'SHIP': return 'boat';
    default: return 'bus';
  }
}

export async function searchStops(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const key = getApiKey();
  const url = `${API_BASE}/stops/name/${encodeURIComponent(query)}?key=${key}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  return (data.stops || []).map((stop: any) => ({
    siteId: stop.stopId || stop.id,
    name: stop.name,
    type: 'stop' as const,
    lat: stop.lat,
    lon: stop.lon
  }));
}

export async function getDepartures(stopId: string): Promise<Departure[]> {
  const key = getApiKey();
  const url = `${API_BASE}/timetable/${encodeURIComponent(stopId)}?key=${key}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  
  return (data.Departures || []).map((dep: any) => {
    let minutes = dep.minutes;
    if (minutes === undefined && dep.departureTime) {
      minutes = Math.max(0, Math.floor((new Date(dep.departureTime).getTime() - Date.now()) / 60000));
    }
    return {
      line: dep.lineNumber || dep.line || '',
      lineName: dep.linePublicName || dep.lineName || '',
      destination: dep.destination || '',
      directionText: dep.destination || '',
      minutes: minutes ?? 0,
      time: dep.departureTime || dep.scheduled || '',
      deviation: dep.deviation,
      transportType: getTransportType(dep.transportMode)
    };
  });
}
```

- [ ] **Step 3: Create trafikLabApi.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

global.fetch = vi.fn();

describe('trafikLabApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_TRAFIKLAB_API_KEY', 'test-key');
  });

  describe('searchStops', () => {
    it('should return empty array for short queries', async () => {
      const { searchStops } = await import('./trafikLabApi');
      const result = await searchStops('a');
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should call API and return stop results', async () => {
      const mockStops = {
        stops: [
          { stopId: '1001', name: 'Stockholm Central', lat: 59.33, lon: 18.06 },
          { stopId: '1002', name: 'Stockholm Södra', lat: 59.31, lon: 18.07 }
        ]
      };
      
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStops
      });

      const { searchStops } = await import('./trafikLabApi');
      const result = await searchStops('stockholm');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://transport.trafiklab.se/api2/v1/stops/name/stockholm?key=test-key'
      );
      expect(result).toHaveLength(2);
      expect(result[0].siteId).toBe('1001');
    });
  });

  describe('getDepartures', () => {
    it('should return departures from API', async () => {
      const mockDepartures = {
        Departures: [
          {
            lineNumber: '42',
            linePublicName: 'Line 42',
            destination: 'Slussen',
            departureTime: new Date(Date.now() + 5 * 60000).toISOString(),
            transportMode: 'BUS'
          }
        ]
      };
      
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDepartures
      });

      const { getDepartures } = await import('./trafikLabApi');
      const result = await getDepartures('1001');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://transport.trafiklab.se/api2/v1/timetable/1001?key=test-key'
      );
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe('42');
      expect(result[0].transportType).toBe('bus');
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: Tests pass (may need to mock import.meta.env)

- [ ] **Step 5: Commit**

```bash
git add src/services/trafikLabApi.ts src/services/trafikLabApi.test.ts .env.example
git commit -m "feat: add TrafikLab API service"
```

---

## Chunk 3: Integrate TrafikLab API

### Task 3: Update components to use TrafikLab API

**Files:**
- Modify: `src/components/SegmentSearch.svelte` (uses searchSites)
- Modify: `src/components/SegmentDepartures.svelte` (uses getDepartures)

- [ ] **Step 1: Update import in SegmentSearch.svelte**

Replace: `import { searchSites } from '../services/slApi';`
With: `import { searchStops } from '../services/trafikLabApi';`

And update function call from `searchSites` to `searchStops`

- [ ] **Step 2: Update import in SegmentDepartures.svelte**

Replace: `import { getDepartures } from '../services/slApi';`
With: `import { getDepartures } from '../services/trafikLabApi';`

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 4: Test the app**

Run: `npm run dev`
Verify: Stop search and departures work with TrafikLab API

- [ ] **Step 5: Commit**

```bash
git add src/components/SegmentSearch.svelte src/components/SegmentDepartures.svelte
git commit -m "refactor: switch to TrafikLab API"
```

---

## Chunk 4: Attribution and Cleanup

### Task 4: Add attribution and remove old code

**Files:**
- Modify: `src/components/Header.svelte` or `App.svelte` (add attribution)
- Delete: `src/services/slApi.ts` (after migration complete)

- [ ] **Step 1: Add attribution text to App.svelte**

Add at bottom of app:
```svelte
<footer class="attribution">
  Transit data from <a href="https://trafiklab.se" target="_blank" rel="noopener">Trafiklab.se</a>
</footer>

<style>
  .attribution {
    text-align: center;
    padding: 8px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .attribution a {
    color: var(--text-secondary);
  }
</style>
```

- [ ] **Step 2: Delete old slApi.ts (optional - keep for fallback)**

Run: `rm src/services/slApi.ts src/services/slApi.test.ts`
Or keep for fallback/debugging

- [ ] **Step 3: Final test**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/App.svelte
git commit -m "feat: add TrafikLab attribution"
```

---

## Summary

| Task | Files | Status |
|------|-------|--------|
| Route button icons | RouteSelector.svelte, transport.ts | 5 steps |
| TrafikLab service | trafikLabApi.ts, trafikLabApi.test.ts, .env.example | 5 steps |
| Integrate API | SegmentSearch.svelte, SegmentDepartures.svelte | 5 steps |
| Attribution | App.svelte | 4 steps |

Total: ~19 steps across 4 chunks
