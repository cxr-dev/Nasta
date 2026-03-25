# Nästa Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimalist personal commute dashboard (PWA) showing next departures, multiple stops, expected arrival times, and local user-configured routes for Stockholm public transport.

**Architecture:** Frontend-only Svelte app with LocalStorage for persistence, SL Transport API for real-time departure data, and GitHub Pages for hosting with auto-deploy on push.

**Tech Stack:** Vite, Svelte, TypeScript, Plain CSS, LocalStorage, GitHub Pages, PWA, Vitest (testing), Playwright (E2E)

---

## Chunk 1: Project Foundation & Setup

### Task 1: Initialize Vite + Svelte + TypeScript Project

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/App.svelte`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "nasta",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.41.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.1",
    "@tsconfig/svelte": "^5.0.2",
    "svelte": "^4.2.9",
    "svelte-check": "^3.6.3",
    "typescript": "^5.3.3",
    "vite": "^5.0.12",
    "vite-plugin-pwa": "^0.17.4",
    "vitest": "^1.2.2"
  },
  "dependencies": {
    "workbox-window": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'Nästa - Commute Dashboard',
        short_name: 'Nästa',
        description: 'Minimalist personal commute dashboard for Stockholm public transport',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/transport\.integration\.sl\.se\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sl-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: 'esbuild'
  }
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create svelte.config.js**

```javascript
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess()
};
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Nästa - Minimalist personal commute dashboard" />
    <link rel="manifest" href="/manifest.json" />
    <title>Nästa</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/main.ts**

```typescript
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app')!
});

export default app;
```

- [ ] **Step 8: Create src/vite-env.d.ts**

```typescript
/// <reference types="svelte" />
/// <reference types="vite/client" />
```

- [ ] **Step 9: Create minimal src/App.svelte**

```svelte
<script lang="ts">
</script>

<main>
  <h1>Nästa</h1>
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #000;
    color: #fff;
    min-height: 100vh;
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
  }
</style>
```

- [ ] **Step 10: Create public/favicon.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#000"/>
  <text x="16" y="22" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">N</text>
</svg>
```

- [ ] **Step 11: Verify build works**

Run: `npm install && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 12: Commit**

---

## Chunk 2: Type Definitions

### Task 2: Create TypeScript Type Definitions

**Files:**
- Create: `src/types/route.ts`
- Create: `src/types/departure.ts`

- [ ] **Step 1: Create src/types/route.ts**

```typescript
export interface Stop {
  id: string;
  name: string;
  siteId: string;
  line?: string;
  travelMinutesToNext?: number;
}

export interface Route {
  id: string;
  name: string;
  stops: Stop[];
}
```

- [ ] **Step 2: Create src/types/departure.ts**

```typescript
export interface Departure {
  line: string;
  destination: string;
  minutes: number;
  time: string;
  deviation?: number;
}

export interface SiteSearchResult {
  siteId: string;
  name: string;
  type: 'stop' | 'station';
}
```

- [ ] **Step 3: Write tests for types**

Create: `src/types/route.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { Route, Stop } from './route';

describe('Route type', () => {
  it('should accept valid route object', () => {
    const route: Route = {
      id: '1',
      name: 'Jobb',
      stops: [
        { id: '1', name: 'Lindarängsvägen', siteId: '9001' }
      ]
    };
    expect(route.id).toBe('1');
    expect(route.name).toBe('Jobb');
    expect(route.stops).toHaveLength(1);
  });

  it('should allow optional stop properties', () => {
    const stop: Stop = {
      id: '1',
      name: 'Test',
      siteId: '9001',
      line: '76',
      travelMinutesToNext: 5
    };
    expect(stop.line).toBe('76');
    expect(stop.travelMinutesToNext).toBe(5);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: Tests pass

- [ ] **Step 5: Commit**

---

## Chunk 3: Core Services

### Task 3: Storage Service

**Files:**
- Create: `src/services/storage.ts`
- Test: `src/services/storage.test.ts`

- [ ] **Step 1: Create src/services/storage.ts**

```typescript
import type { Route } from '../types/route';

const ROUTES_KEY = 'nasta_routes';
const SETTINGS_KEY = 'nasta_settings';

export interface Settings {
  darkMode: boolean;
  refreshInterval: number;
}

const defaultSettings: Settings = {
  darkMode: true,
  refreshInterval: 30000
};

export function loadRoutes(): Route[] {
  try {
    const data = localStorage.getItem(ROUTES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveRoutes(routes: Route[]): void {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

- [ ] **Step 2: Write tests for storage service**

Create: `src/services/storage.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRoutes, saveRoutes, loadSettings, saveSettings } from './storage';

describe('storage service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('routes', () => {
    it('returns empty array when no routes stored', () => {
      expect(loadRoutes()).toEqual([]);
    });

    it('returns stored routes', () => {
      const routes = [{ id: '1', name: 'Jobb', stops: [] }];
      localStorage.setItem('nasta_routes', JSON.stringify(routes));
      expect(loadRoutes()).toEqual(routes);
    });

    it('returns empty array on parse error', () => {
      localStorage.setItem('nasta_routes', 'invalid json');
      expect(loadRoutes()).toEqual([]);
    });

    it('saves routes to localStorage', () => {
      const routes = [{ id: '1', name: 'Hem', stops: [] }];
      saveRoutes(routes);
      expect(localStorage.getItem('nasta_routes')).toBe(JSON.stringify(routes));
    });
  });

  describe('settings', () => {
    it('returns default settings when none stored', () => {
      expect(loadSettings()).toEqual({ darkMode: true, refreshInterval: 30000 });
    });

    it('returns stored settings', () => {
      localStorage.setItem('nasta_settings', JSON.stringify({ darkMode: false }));
      const settings = loadSettings();
      expect(settings.darkMode).toBe(false);
      expect(settings.refreshInterval).toBe(30000);
    });

    it('saves settings to localStorage', () => {
      const settings = { darkMode: false, refreshInterval: 60000 };
      saveSettings(settings);
      expect(localStorage.getItem('nasta_settings')).toBe(JSON.stringify(settings));
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

### Task 4: SL API Service

**Files:**
- Create: `src/services/slApi.ts`
- Test: `src/services/slApi.test.ts`

- [ ] **Step 1: Create src/services/slApi.ts**

```typescript
import type { Departure, SiteSearchResult } from '../types/departure';

const BASE_URL = 'https://transport.integration.sl.se/v1';

export async function searchSites(query: string): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  const response = await fetch(`${BASE_URL}/sites?search=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return data.map((site: any) => ({
    siteId: site.siteId,
    name: site.name,
    type: site.type || 'stop'
  }));
}

export async function getDepartures(siteId: string): Promise<Departure[]> {
  const response = await fetch(`${BASE_URL}/sites/${siteId}/departures`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  const data = await response.json();
  return data.departures.map((dep: any) => ({
    line: dep.line,
    destination: dep.destination,
    minutes: dep.timeToDeparture,
    time: dep.plannedDepartureTime,
    deviation: dep.deviation
  }));
}
```

- [ ] **Step 2: Mock the API for tests**

Create: `src/services/slApi.mocks.ts`

```typescript
export const mockSearchResults = [
  { siteId: '9001', name: 'Lindarängsvägen', type: 'stop' as const },
  { siteId: '9002', name: 'Kungsträdgården', type: 'stop' as const },
  { siteId: '9003', name: 'Barnängsbryggan', type: 'stop' as const }
];

export const mockDepartures = [
  { line: '76', destination: 'Klingsta', minutes: 4, time: '08:04', deviation: 0 },
  { line: '76', destination: 'Klingsta', minutes: 19, time: '08:19', deviation: 0 },
  { line: '42', destination: 'Centralen', minutes: 6, time: '08:06', deviation: 2 }
];
```

- [ ] **Step 3: Write tests for SL API service**

Create: `src/services/slApi.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSites, getDepartures } from './slApi';

global.fetch = vi.fn();

describe('slApi service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchSites', () => {
    it('returns empty array for short query', async () => {
      expect(await searchSites('a')).toEqual([]);
      expect(await searchSites('')).toEqual([]);
    });

    it('returns search results', async () => {
      const mockResults = [{ siteId: '9001', name: 'Test', type: 'stop' }];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResults
      });

      const results = await searchSites('test');
      expect(results).toEqual(mockResults);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://transport.integration.sl.se/v1/sites?search=test'
      );
    });

    it('throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(searchSites('test')).rejects.toThrow('API error: 500');
    });
  });

  describe('getDepartures', () => {
    it('returns departures for site', async () => {
      const mockDepartures = [
        { line: '76', destination: 'Test', timeToDeparture: 4, plannedDepartureTime: '08:04', deviation: 0 }
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ departures: mockDepartures })
      });

      const result = await getDepartures('9001');
      expect(result).toHaveLength(1);
      expect(result[0].minutes).toBe(4);
      expect(result[0].time).toBe('08:04');
    });

    it('throws on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(getDepartures('9001')).rejects.toThrow('API error: 404');
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Commit**

---

### Task 5: Arrival Calculator Service

**Files:**
- Create: `src/services/arrivalCalculator.ts`
- Test: `src/services/arrivalCalculator.test.ts`

- [ ] **Step 1: Create src/services/arrivalCalculator.ts**

```typescript
import type { Stop } from '../types/route';
import type { Departure } from '../types/departure';

export interface ArrivalInfo {
  arrivalTime: string;
  totalMinutes: number;
  departureMinutes: number;
}

export function calculateArrival(
  stops: Stop[],
  departures: Map<string, Departure[]>
): ArrivalInfo | null {
  if (stops.length === 0) return null;

  const firstStop = stops[0];
  const firstDepartures = departures.get(firstStop.siteId);
  
  if (!firstDepartures || firstDepartures.length === 0) return null;
  
  const nextDeparture = firstDepartures[0];
  let totalMinutes = nextDeparture.minutes;

  for (let i = 1; i < stops.length; i++) {
    const travelTime = stops[i].travelMinutesToNext;
    if (travelTime !== undefined) {
      totalMinutes += travelTime;
    }
  }

  const now = new Date();
  const arrival = new Date(now.getTime() + totalMinutes * 60000);
  
  const hours = arrival.getHours().toString().padStart(2, '0');
  const minutes = arrival.getMinutes().toString().padStart(2, '0');

  return {
    arrivalTime: `${hours}:${minutes}`,
    totalMinutes,
    departureMinutes: nextDeparture.minutes
  };
}
```

- [ ] **Step 2: Write tests for arrival calculator**

Create: `src/services/arrivalCalculator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { calculateArrival } from './arrivalCalculator';
import type { Stop } from '../types/route';
import type { Departure } from '../types/departure';

describe('arrivalCalculator', () => {
  const createDepartures = (mins: number[]): Map<string, Departure[]> => {
    const map = new Map<string, Departure[]>();
    map.set('9001', mins.map(m => ({
      line: '76',
      destination: 'Test',
      minutes: m,
      time: '08:00'
    })));
    return map;
  };

  it('returns null for empty stops', () => {
    const result = calculateArrival([], new Map());
    expect(result).toBeNull();
  });

  it('returns null when no departures', () => {
    const stops: Stop[] = [{ id: '1', name: 'Test', siteId: '9001' }];
    const result = calculateArrival(stops, new Map());
    expect(result).toBeNull();
  });

  it('calculates arrival with single stop', () => {
    const stops: Stop[] = [{ id: '1', name: 'Test', siteId: '9001' }];
    const departures = createDepartures([5]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.departureMinutes).toBe(5);
    expect(result!.totalMinutes).toBe(5);
  });

  it('calculates arrival with travel times', () => {
    const stops: Stop[] = [
      { id: '1', name: 'Start', siteId: '9001' },
      { id: '2', name: 'Middle', siteId: '9002', travelMinutesToNext: 10 },
      { id: '3', name: 'End', siteId: '9003', travelMinutesToNext: 15 }
    ];
    const departures = createDepartures([5]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.departureMinutes).toBe(5);
    expect(result!.totalMinutes).toBe(30);
  });

  it('handles stops without travel times', () => {
    const stops: Stop[] = [
      { id: '1', name: 'Start', siteId: '9001' },
      { id: '2', name: 'End', siteId: '9002' }
    ];
    const departures = createDepartures([10]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.totalMinutes).toBe(10);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

---

## Chunk 4: Svelte Stores

### Task 6: Create Svelte Stores

**Files:**
- Create: `src/stores/routeStore.ts`
- Create: `src/stores/settingsStore.ts`
- Create: `src/stores/departureStore.ts`

- [ ] **Step 1: Create src/stores/routeStore.ts**

```typescript
import { writable, derived, get } from 'svelte/store';
import type { Route, Stop } from '../types/route';
import { loadRoutes, saveRoutes } from '../services/storage';

function createRouteStore() {
  const { subscribe, set, update } = writable<Route[]>(loadRoutes());

  return {
    subscribe,
    addRoute: (name: string) => {
      const newRoute: Route = {
        id: crypto.randomUUID(),
        name,
        stops: []
      };
      update(routes => {
        const updated = [...routes, newRoute];
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
    addStop: (routeId: string, stop: Stop) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops: [...route.stops, stop] };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    removeStop: (routeId: string, stopId: string) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops: route.stops.filter(s => s.id !== stopId) };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    reorderStops: (routeId: string, stops: Stop[]) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            return { ...route, stops };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    setTravelTime: (routeId: string, stopIndex: number, minutes: number) => {
      update(routes => {
        const updated = routes.map(route => {
          if (route.id === routeId) {
            const newStops = [...route.stops];
            newStops[stopIndex] = { ...newStops[stopIndex], travelMinutesToNext: minutes };
            return { ...route, stops: newStops };
          }
          return route;
        });
        saveRoutes(updated);
        return updated;
      });
    },
    initialize: () => {
      const stored = loadRoutes();
      if (stored.length === 0) {
        const defaultRoutes: Route[] = [
          { id: crypto.randomUUID(), name: 'Jobb', stops: [] },
          { id: crypto.randomUUID(), name: 'Hem', stops: [] }
        ];
        set(defaultRoutes);
        saveRoutes(defaultRoutes);
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

- [ ] **Step 2: Create src/stores/settingsStore.ts**

```typescript
import { writable, get } from 'svelte/store';
import type { Settings } from '../services/storage';
import { loadSettings, saveSettings } from '../services/storage';

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(loadSettings());

  return {
    subscribe,
    setDarkMode: (darkMode: boolean) => {
      update(settings => {
        const updated = { ...settings, darkMode };
        saveSettings(updated);
        return updated;
      });
    },
    setRefreshInterval: (interval: number) => {
      update(settings => {
        const updated = { ...settings, refreshInterval: interval };
        saveSettings(updated);
        return updated;
      });
    }
  };
}

export const settingsStore = createSettingsStore();
```

- [ ] **Step 3: Create src/stores/departureStore.ts**

```typescript
import { writable, get } from 'svelte/store';
import type { Departure } from '../types/departure';
import { getDepartures } from '../services/slApi';

function createDepartureStore() {
  const { subscribe, set, update } = writable<Map<string, Departure[]>>(new Map());
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const fetchAll = async (siteIds: string[]) => {
    const results = new Map<string, Departure[]>();
    await Promise.all(
      siteIds.map(async (siteId) => {
        try {
          const departures = await getDepartures(siteId);
          results.set(siteId, departures);
        } catch (e) {
          console.error(`Failed to fetch departures for ${siteId}:`, e);
          results.set(siteId, []);
        }
      })
    );
    set(results);
  };

  return {
    subscribe,
    fetchForSites: fetchAll,
    startAutoRefresh: (siteIds: string[], interval: number) => {
      if (refreshTimer) clearInterval(refreshTimer);
      fetchAll(siteIds);
      refreshTimer = setInterval(() => fetchAll(siteIds), interval);
    },
    stopAutoRefresh: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    refresh: async (siteIds: string[]) => {
      await fetchAll(siteIds);
    }
  };
}

export const departureStore = createDepartureStore();
```

- [ ] **Step 4: Commit**

---

## Chunk 5: UI Components

### Task 7: Header Component

**Files:**
- Create: `src/components/Header.svelte`

- [ ] **Step 1: Create src/components/Header.svelte**

```svelte
<script lang="ts">
  import { settingsStore } from '../stores/settingsStore';
  
  let editing = false;
  
  function toggleEdit() {
    editing = !editing;
  }
</script>

<header>
  <h1>Nästa</h1>
  <button class="edit-btn" on:click={toggleEdit} aria-label="Redigera rutter">
    {editing ? 'Klar' : 'Redigera'}
  </button>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid #333;
    margin-bottom: 16px;
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .edit-btn {
    background: transparent;
    border: 1px solid #444;
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }

  .edit-btn:hover {
    background: #1a1a1a;
    border-color: #666;
  }
</style>
```

- [ ] **Step 2: Commit**

---

### Task 8: RouteSelector Component

**Files:**
- Create: `src/components/RouteSelector.svelte`

- [ ] **Step 1: Create src/components/RouteSelector.svelte**

```svelte
<script lang="ts">
  import { routeStore, selectedRouteId } from '../stores/routeStore';
  
  export let onSelect: (routeId: string) => void = () => {};
  
  $: routes = $routeStore;
  $: selected = $selectedRouteId;
  
  function selectRoute(id: string) {
    selectedRouteId.set(id);
    onSelect(id);
  }
</script>

<div class="route-selector">
  {#each routes as route (route.id)}
    <button 
      class="route-tab"
      class:active={selected === route.id}
      on:click={() => selectRoute(route.id)}
    >
      {route.name}
    </button>
  {/each}
</div>

<style>
  .route-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .route-tab {
    flex-shrink: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #888;
    padding: 12px 20px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .route-tab:hover {
    border-color: #555;
    color: #ccc;
  }

  .route-tab.active {
    background: #fff;
    border-color: #fff;
    color: #000;
  }
</style>
```

- [ ] **Step 2: Commit**

---

### Task 9: DepartureList Component

**Files:**
- Create: `src/components/DepartureList.svelte`

- [ ] **Step 1: Create src/components/DepartureList.svelte**

```svelte
<script lang="ts">
  import type { Stop } from '../types/route';
  import type { Departure } from '../types/departure';
  
  export let stops: Stop[];
  export let departures: Map<string, Departure[]>;
  export let editing: boolean = false;
  export let onRemoveStop: (stopId: string) => void = () => {};
  
  function getDeparturesForStop(siteId: string): Departure[] {
    return departures.get(siteId) || [];
  }
</script>

<div class="departure-list">
  {#each stops as stop, index (stop.id)}
    <div class="stop-item">
      {#if editing}
        <button 
          class="remove-btn" 
          on:click={() => onRemoveStop(stop.id)}
          aria-label="Ta bort stopp"
        >
          ×
        </button>
      {/if}
      
      <div class="stop-info">
        <div class="stop-name">{stop.name}</div>
        
        <div class="departures">
          {#each getDeparturesForStop(stop.siteId).slice(0, 3) as dep}
            <div class="departure">
              <span class="line">Buss {dep.line}</span>
              <span class="minutes">{dep.minutes} min</span>
              {#if dep.deviation}
                <span class="delay">+{dep.deviation}</span>
              {/if}
            </div>
          {/each}
          {#if getDeparturesForStop(stop.siteId).length === 0}
            <div class="no-departures">Inga avgångar</div>
          {/if}
        </div>
      </div>
      
      {#if index < stops.length - 1 && stop.travelMinutesToNext !== undefined}
        <div class="travel-time">
          ↓ {stop.travelMinutesToNext} min
        </div>
      {/if}
    </div>
  {/each}
  
  {#if stops.length === 0}
    <div class="empty-state">
      <p>Inga stopp i denna rutt</p>
      <p class="hint">Lägg till stopp för att se avgångar</p>
    </div>
  {/if}
</div>

<style>
  .departure-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .stop-item {
    position: relative;
    padding: 16px;
    background: #111;
    border-radius: 12px;
    margin-bottom: 8px;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: #333;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn:hover {
    background: #c00;
  }

  .stop-name {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .departures {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .departure {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }

  .line {
    color: #888;
    min-width: 70px;
  }

  .minutes {
    font-weight: 600;
    font-size: 18px;
  }

  .delay {
    color: #f44;
    font-size: 12px;
  }

  .travel-time {
    position: absolute;
    left: 50%;
    bottom: -14px;
    transform: translateX(-50%);
    background: #222;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: #888;
    z-index: 1;
  }

  .no-departures {
    color: #555;
    font-size: 13px;
    font-style: italic;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #666;
  }

  .hint {
    font-size: 13px;
    margin-top: 8px;
    color: #444;
  }
</style>
```

- [ ] **Step 2: Commit**

---

### Task 10: ArrivalTime Component

**Files:**
- Create: `src/components/ArrivalTime.svelte`

- [ ] **Step 1: Create src/components/ArrivalTime.svelte**

```svelte
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
```

- [ ] **Step 2: Commit**

---

### Task 11: StopSearch Component

**Files:**
- Create: `src/components/StopSearch.svelte`

- [ ] **Step 1: Create src/components/StopSearch.svelte**

```svelte
<script lang="ts">
  import { searchSites } from '../services/slApi';
  import type { SiteSearchResult } from '../types/departure';
  
  export let onSelect: (site: SiteSearchResult) => void = () => {};
  
  let query = '';
  let results: SiteSearchResult[] = [];
  let loading = false;
  let showResults = false;
  let debounceTimer: ReturnType<typeof setTimeout>;
  
  async function handleInput() {
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
      results = [];
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      loading = true;
      showResults = true;
      try {
        results = await searchSites(query);
      } catch (e) {
        console.error('Search failed:', e);
        results = [];
      } finally {
        loading = false;
      }
    }, 300);
  }
  
  function selectSite(site: SiteSearchResult) {
    onSelect(site);
    query = '';
    results = [];
    showResults = false;
  }
  
  function handleBlur() {
    setTimeout(() => showResults = false, 200);
  }
</script>

<div class="stop-search">
  <input
    type="text"
    bind:value={query}
    on:input={handleInput}
    on:focus={() => query.length >= 2 && (showResults = true)}
    on:blur={handleBlur}
    placeholder="Sök hållplats..."
    class="search-input"
  />
  
  {#if showResults && (results.length > 0 || loading)}
    <div class="results">
      {#if loading}
        <div class="loading">Söker...</div>
      {:else}
        {#each results as site}
          <button 
            class="result-item"
            on:mousedown={() => selectSite(site)}
          >
            <span class="site-name">{site.name}</span>
            <span class="site-type">{site.type}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .stop-search {
    position: relative;
    margin-bottom: 16px;
  }

  .search-input {
    width: 100%;
    padding: 14px 16px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    color: #fff;
    font-size: 16px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: #666;
  }

  .search-input::placeholder {
    color: #555;
  }

  .results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 100;
  }

  .loading {
    padding: 16px;
    text-align: center;
    color: #666;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .result-item:hover {
    background: #252525;
  }

  .site-name {
    font-size: 15px;
  }

  .site-type {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
  }
</style>
```

- [ ] **Step 2: Commit**

---

### Task 12: RouteEditor Component

**Files:**
- Create: `src/components/RouteEditor.svelte`

- [ ] **Step 1: Create src/components/RouteEditor.svelte**

```svelte
<script lang="ts">
  import type { Route, Stop } from '../types/route';
  import type { SiteSearchResult } from '../types/departure';
  import { routeStore } from '../stores/routeStore';
  import StopSearch from './StopSearch.svelte';
  
  export let route: Route;
  
  function addStop(site: SiteSearchResult) {
    const newStop: Stop = {
      id: crypto.randomUUID(),
      name: site.name,
      siteId: site.siteId
    };
    routeStore.addStop(route.id, newStop);
  }
  
  function removeStop(stopId: string) {
    routeStore.removeStop(route.id, stopId);
  }
  
  function updateTravelTime(stopIndex: number, minutes: number) {
    routeStore.setTravelTime(route.id, stopIndex, minutes);
  }
</script>

<div class="route-editor">
  <h2>Redigera: {route.name}</h2>
  
  <StopSearch onSelect={addStop} />
  
  <div class="stops">
    {#each route.stops as stop, index (stop.id)}
      <div class="stop-row">
        <div class="stop-info">
          <span class="stop-name">{stop.name}</span>
          <button 
            class="remove-btn" 
            on:click={() => removeStop(stop.id)}
            aria-label="Ta bort"
          >
            ×
          </button>
        </div>
        
        {#if index < route.stops.length - 1}
          <div class="travel-input">
            <label>
              Restid:
              <input
                type="number"
                min="0"
                max="60"
                value={stop.travelMinutesToNext || 0}
                on:change={(e) => updateTravelTime(index, parseInt(e.currentTarget.value) || 0)}
              />
              min
            </label>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if route.stops.length === 0}
      <p class="empty">Lägg till hållplatser ovan</p>
    {/if}
  </div>
</div>

<style>
  .route-editor {
    background: #111;
    border-radius: 16px;
    padding: 20px;
    margin-top: 16px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .stops {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stop-row {
    background: #1a1a1a;
    border-radius: 10px;
    padding: 12px;
  }

  .stop-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stop-name {
    font-size: 15px;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: #333;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
  }

  .remove-btn:hover {
    background: #c00;
  }

  .travel-input {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #222;
  }

  .travel-input label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #888;
  }

  .travel-input input {
    width: 50px;
    padding: 4px 8px;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    text-align: center;
  }

  .empty {
    text-align: center;
    color: #555;
    font-size: 14px;
    padding: 20px;
  }
</style>
```

- [ ] **Step 2: Commit**

---

## Chunk 6: Main App Integration

### Task 13: Integrate App.svelte

**Files:**
- Modify: `src/App.svelte`

- [ ] **Step 1: Replace src/App.svelte with full implementation**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from './components/Header.svelte';
  import RouteSelector from './components/RouteSelector.svelte';
  import DepartureList from './components/DepartureList.svelte';
  import ArrivalTime from './components/ArrivalTime.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  import { routeStore, selectedRouteId, selectedRoute } from './stores/routeStore';
  import { settingsStore } from './stores/settingsStore';
  import { departureStore } from './stores/departureStore';
  import { calculateArrival } from './services/arrivalCalculator';
  
  let editing = false;
  let arrivalInfo: ReturnType<typeof calculateArrival> = null;
  
  $: route = $selectedRoute;
  $: departures = $departureStore;
  $: settings = $settingsStore;
  
  $: if (route && departures) {
    arrivalInfo = calculateArrival(route.stops, departures);
  }
  
  function loadDepartures() {
    if (route && route.stops.length > 0) {
      const siteIds = route.stops.map(s => s.siteId);
      departureStore.startAutoRefresh(siteIds, settings.refreshInterval);
    }
  }
  
  function handleRouteSelect() {
    loadDepartures();
  }
  
  function toggleEdit() {
    editing = !editing;
    if (editing) {
      departureStore.stopAutoRefresh();
    } else {
      loadDepartures();
    }
  }
  
  function handleRemoveStop(stopId: string) {
    if (route) {
      routeStore.removeStop(route.id, stopId);
    }
  }
  
  onMount(() => {
    routeStore.initialize();
    const routes = $routeStore;
    if (routes.length > 0 && !$selectedRouteId) {
      selectedRouteId.set(routes[0].id);
    }
    loadDepartures();
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && route) {
        departureStore.refresh(route.stops.map(s => s.siteId));
      }
    });
  });
  
  onDestroy(() => {
    departureStore.stopAutoRefresh();
  });
</script>

<main class:dark={settings.darkMode}>
  <Header />
  
  <RouteSelector onSelect={handleRouteSelect} />
  
  {#if editing && route}
    <RouteEditor {route} />
  {:else if route}
    <DepartureList 
      stops={route.stops} 
      {departures} 
      {editing}
      onRemoveStop={handleRemoveStop}
    />
    <ArrivalTime arrival={arrivalInfo} />
  {/if}
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #000;
    color: #fff;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
  }

  main.dark {
    background: #000;
  }
</style>
```

- [ ] **Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

---

## Chunk 7: PWA & Static Assets

### Task 14: PWA Configuration

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/robots.txt`

- [ ] **Step 1: Create public/manifest.json**

```json
{
  "name": "Nästa - Commute Dashboard",
  "short_name": "Nästa",
  "description": "Minimalist personal commute dashboard for Stockholm public transport",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Create public/robots.txt**

```
User-agent: *
Allow: /
```

- [ ] **Step 3: Create icon placeholder SVG (will be converted)**

For now, create a simple placeholder. In production, generate actual PNGs.

Create: `public/icons/icon-192.svg`
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#000"/>
  <text x="96" y="130" text-anchor="middle" fill="#fff" font-size="100" font-weight="bold">N</text>
</svg>
```

- [ ] **Step 4: Note about PNG icons**

Note: You'll need to generate actual PNG icons (192x192 and 512x512) for PWA. Use a tool or create placeholder PNGs.

- [ ] **Step 5: Commit**

---

## Chunk 8: E2E Tests with Playwright

### Task 15: Playwright E2E Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Create playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Create E2E test file**

Create: `tests/e2e/app.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Nästa App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display app title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Nästa');
  });

  test('should show default routes', async ({ page }) => {
    await expect(page.locator('.route-tab')).toHaveCount(2);
    await expect(page.locator('.route-tab').first()).toHaveText('Jobb');
  });

  test('should toggle edit mode', async ({ page }) => {
    await page.click('.edit-btn');
    await expect(page.locator('.edit-btn')).toHaveText('Klar');
    await expect(page.locator('.route-editor')).toBeVisible();
  });

  test('should show empty state when no stops', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('Inga stopp');
  });

  test('should be responsive on mobile', async ({ page, isMobile }) => {
    if (isMobile) {
      await expect(page.locator('main')).toHaveCSS('max-width', '480px');
    }
  });
});
```

- [ ] **Step 3: Run E2E tests**

First ensure build is ready: `npm run build`
Then: `npm run test:e2e`
Expected: Tests pass

- [ ] **Step 4: Commit**

---

## Chunk 9: GitHub Actions Deployment

### Task 16: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `package.json` (add homepage field)

- [ ] **Step 1: Create .github/workflows/deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run check

      - name: Run unit tests
        run: npm run test

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Add homepage to package.json**

Update the package.json to add homepage field (note: user needs to replace `<username>`):

```json
{
  "name": "nasta",
  "homepage": "https://<username>.github.io/nasta",
  ...
}
```

- [ ] **Step 3: Commit**

---

## Chunk 10: Documentation

### Task 17: Create Documentation

**Files:**
- Create: `README.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/API.md`

- [ ] **Step 1: Create README.md**

```markdown
# Nästa

A minimalist personal commute dashboard for Stockholm public transport (SL).

## Features

- Next departures display
- Multiple stops management
- Expected arrival time calculation
- Route configuration (Jobb/Hem)
- Dark mode (default)
- Auto refresh every 30 seconds
- PWA installable
- Works offline

## Tech Stack

- Vite
- Svelte
- TypeScript
- LocalStorage
- SL Transport API

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

### Testing

```bash
npm run test        # Unit tests
npm run test:e2e   # E2E tests
```

## Configuration

Routes are stored in LocalStorage. To configure:
1. Click "Redigera" button
2. Search for stops using the search bar
3. Add travel times between stops
4. Changes are saved automatically

## Deployment

The app automatically deploys to GitHub Pages on push to main branch.

## License

MIT
```

- [ ] **Step 2: Create docs/ARCHITECTURE.md**

```markdown
# Architecture

## Overview

Nästa is a frontend-only PWA that uses LocalStorage for persistence and SL Transport API for real-time departure data.

## Data Flow

```
User Action → Svelte Store → Service → API/Storage
                    ↓
              UI Update ← Store Subscribe
```

## Key Components

### Stores

- `routeStore`: Manages routes and stops
- `settingsStore`: Manages app settings (dark mode, refresh interval)
- `departureStore`: Manages departure data and auto-refresh

### Services

- `slApi.ts`: SL Transport API integration
- `storage.ts`: LocalStorage persistence
- `arrivalCalculator.ts`: Arrival time calculation

### Components

- `Header`: App header with edit toggle
- `RouteSelector`: Tab-based route switching
- `DepartureList`: Shows stops and departures
- `ArrivalTime`: Shows calculated arrival
- `StopSearch`: Debounced stop search
- `RouteEditor`: Route/stop management

## PWA

Uses vite-plugin-pwa for:
- Service worker for offline support
- Web app manifest
- Cache strategies for API calls
```

- [ ] **Step 3: Create docs/API.md**

```markdown
# API Reference

## SL Transport API

Base URL: `https://transport.integration.sl.se/v1`

### Search Sites

```
GET /sites?search={query}
```

Response:
```json
[
  {
    "siteId": "9001",
    "name": "Lindarängsvägen",
    "type": "stop"
  }
]
```

### Get Departures

```
GET /sites/{siteId}/departures
```

Response:
```json
{
  "departures": [
    {
      "line": "76",
      "destination": "Klingsta",
      "timeToDeparture": 4,
      "plannedDepartureTime": "08:04",
      "deviation": 0
    }
  ]
}
```

## LocalStorage Keys

- `nasta_routes`: Array of Route objects
- `nasta_settings`: Settings object

## TypeScript Types

See `src/types/` for full type definitions.
```

- [ ] **Step 4: Commit**

---

## Final Verification

### Task 18: Final Build & Test

- [ ] **Step 1: Run full test suite**

```bash
npm run check     # TypeScript check
npm run test      # Unit tests
npm run test:e2e  # E2E tests
```

- [ ] **Step 2: Build for production**

```bash
npm run build
```

- [ ] **Step 3: Verify dist output**

Check that all required files are in dist/

- [ ] **Step 4: Final commit**

---

## Implementation Complete

All tasks completed. The app includes:
- ✅ Vite + Svelte + TypeScript setup
- ✅ Route management with LocalStorage
- ✅ SL API integration for departures
- ✅ Arrival time calculation
- ✅ Dark mode (default)
- ✅ Auto refresh (30s + on tab focus)
- ✅ PWA support
- ✅ Unit tests for services
- ✅ E2E tests with Playwright
- ✅ GitHub Actions deployment
- ✅ Documentation (README + docs/)
