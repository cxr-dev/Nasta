# Adding Data Sources — Nasta Onboarding Guide

> **For:** AI agents + human developers adding new transit providers, venue sources, event feeds, or static data.
> **Version:** 2026-06-26
> **Status:** draft

---

## Part A: Transit Providers

New transport data (bus, train, ferry, metro, tram) enters via `TransitProvider` interface.

### A.1 Architecture Overview

```
UI / Stores
    │
    ▼
transitService (single entry point)
    │
    ▼
providerRegistry (O(1) prefix-hash lookup)
    │
    ├── slProvider      → slApi + slDeviations + timetableCache
    ├── sjostadProvider → staticTimetable (hardcoded ferry)
    └── YOUR-PROVIDER   → YOUR-DATA-SOURCE
```

**Rules:**
- UI and stores call `transitService` only — never a provider directly.
- Providers produce canonical domain types (`TransitDeparture`, `TransitStop`, etc.). Never expose raw API shapes.
- Each provider gets an `EntityId` prefix (e.g. `sl:`, `sjostad:`). Prefix IS the resolution key.
- Provider registers itself once in `src/providers/init.ts`. That's one line.

### A.2 The TransitProvider Interface

Full interface at `src/providers/types.ts`. Key methods:

| Method | Required? | Purpose |
|--------|-----------|---------|
| `capabilities` | YES | Declares what this provider can do (search, realtime, schedules, disruptions, etc.) |
| `ownsStop(stopId)` | YES | Prefix check: `stopId.startsWith("MY-PREFIX:")` → boolean |
| `getDepartures(stopId, line?, dir?, signal?)` | YES | Upcoming departures from a stop |
| `searchStops(query, signal?)` | Only if `capabilities.features.search` | Text search → `TransitStopSearchResult[]` |
| `getDisruptions(stopIds, lines)` | Only if `capabilities.features.disruptions` | Active disruptions affecting stops/lines |
| `getPredictedDepartures(stopId, line, dir, max)` | Only if `capabilities.features.predictions` | Schedule-based future departures (sleeping state) |
| `getNextScheduledDeparture(stopId, line, dir)` | Only if `capabilities.features.predictions` | Single next departure regardless of time horizon |
| `getKnownRoutes(stopId)` | Only if `capabilities.features.schedules` | All lines serving a stop (for direction selector) |
| `resolveStopId(stopName)` | Only if `capabilities.features.search` | Map human-readable name → EntityId |
| `getStopSequence(origin, dest, line, dir)` | Only if `capabilities.features.stopSequences` | Ordered stops along route (direction preview) |
| `getVehiclePositions(tripIds, routeId?)` | Only if `capabilities.features.vehiclePositions` | Live vehicle GPS positions (future) |
| `getRouteShape(shapeId)` | Only if `capabilities.features.routeGeometry` | Route geometry for map rendering (future) |
| `getTripDetails(tripId)` | Only if `capabilities.features.tripMetadata` | Full trip metadata + all stop times (future) |
| `getRealtimeUpdates(tripId)` | Only if `capabilities.features.realtime` | GTFS-RT TripUpdate style realtime data (future) |

Capabilities enum flags (set only what your source provides):
```typescript
features: {
  search: boolean;           // Text-based stop search
  realtime: boolean;         // Live departure data
  schedules: boolean;        // Static timetable data
  predictions: boolean;      // Schedule-learned prediction
  disruptions: boolean;      // Service alerts/disruptions
  stopSequences: boolean;    // Route stop order
  vehiclePositions: boolean; // Live GPS (future)
  routeGeometry: boolean;    // Route shapes (future)
  tripMetadata: boolean;     // Trip-level metadata (future)
  occupancy: boolean;        // Crowding data (future)
}
```

### A.3 How to Add a New Provider — 4 Steps

#### Step 1: Create provider file

**Location:** `src/providers/YOUR-PROVIDER.ts`

**Template:**
```typescript
import type {
  TransitProvider,
  TransitStopSearchResult,
  TransitDeparture,
  TransitDisruption,
  TransportMode,
  EntityId,
  DepartureDataSource,
} from "./types.js";

const PROVIDER_ID = "gtfs-se";           // Short, stable, no colons
const STOP_PREFIX = `${PROVIDER_ID}:`;

// EntityId helpers — always create these
function toStopEntityId(localId: string): EntityId {
  return `${STOP_PREFIX}${localId}`;
}
function fromStopEntityId(entityId: EntityId): string | null {
  if (!entityId.startsWith(STOP_PREFIX)) return null;
  return entityId.slice(STOP_PREFIX.length);
}

// Data-source → TransitDeparture mapper
function toTransitDepartures(rawDeps: YourRawType[], stopId: EntityId): TransitDeparture[] {
  return rawDeps.map(d => ({
    id: `${stopId}|${d.line}|${d.directionCode}|${d.time}`,
    stopId,
    line: d.line,
    lineName: d.lineName,
    destination: d.destination,
    directionCode: d.directionCode,
    transportMode: mapYourMode(d.transportMode),   // → TransportMode
    minutes: d.minutes,
    scheduledTime: d.time,
    expectedTime: d.expectedAt,                     // epoch ms or undefined
    delaySeconds: d.delay,                          // seconds, optional
    dataSource: "realtime",                         // "realtime" | "predicted" | "scheduled" | "static"
    isFirstMorning: false,
    providerMetadata: {
      // Provider-specific fields UI never reads directly
      rawId: d.internalId,
      vehicleLabel: d.vehicle,
    },
    // Trip reference — include if you have trip data
    // tripRef: { tripId: ..., routeId: ..., headsign: ..., directionCode: ... },
  }));
}

export const gtfsSeProvider: TransitProvider = {
  capabilities: {
    providerId: PROVIDER_ID,
    displayName: "GTFS Sweden (Trafiklab)",
    features: {
      search: true,         // Set what your data ACTUALLY provides
      realtime: true,
      schedules: true,
      predictions: false,
      disruptions: true,
      stopSequences: true,
      vehiclePositions: false,
      routeGeometry: true,
      tripMetadata: true,
      occupancy: false,
    },
    homepageUrl: "https://www.trafiklab.se/api/gtfs-sverige-2",
    license: "CC0",
    attribution: "Data from Trafiklab",
  },

  ownsStop(stopId: EntityId): boolean {
    return stopId.startsWith(STOP_PREFIX);
  },

  async searchStops(query, signal) {
    const results = await yourSearchAPI(query, signal);
    return results.map(r => ({
      id: toStopEntityId(r.id),
      name: r.name,
      coord: r.lat && r.lon ? [r.lat, r.lon] : undefined,
      modes: [mapYourMode(r.mode)],          // TransportMode[]
      relevance: r.score ?? 50,               // 0-100
      locationType: r.isStation ? "station" : "stop",
      providerMetadata: { rawId: r.id },
    }));
  },

  async getDepartures(stopId, line, directionCode, signal) {
    const localId = fromStopEntityId(stopId);
    if (!localId) return [];
    const deps = await yourDepartureAPI(localId, signal);

    let filtered = deps;
    if (line != null) filtered = filtered.filter(d => d.line === line);
    if (directionCode != null) filtered = filtered.filter(d => d.directionCode === directionCode);

    return toTransitDepartures(filtered, stopId);
  },

  // Optional methods — only implement if features flag is true
  async getDisruptions(stopIds, lineNames) {
    const alerts = await yourAlertAPI(stopIds, lineNames);
    return alerts.map(a => ({
      id: `${PROVIDER_ID}:alert-${a.id}`,
      severity: mapSeverity(a.severity),       // "info" | "warning" | "critical"
      title: a.title,
      description: a.description,
      effect: mapEffect(a.effect),             // DisruptionEffect
      cause: mapCause(a.cause),                // DisruptionCause or "unknown"
      affectedRoutes: a.routeIds.map(id => `${PROVIDER_ID}:route-${id}`),
      affectedStops: a.stopIds.map(id => toStopEntityId(id)),
      activePeriod: a.start ? { start: a.start, end: a.end } : undefined,
      updatedAt: a.updatedAt,
      url: a.url,
      language: "sv",
      providerMetadata: { rawId: a.id },
    }));
  },

  // ... implement remaining optional methods as needed
};
```

#### Step 2: Write tests

**Location:** `src/providers/YOUR-PROVIDER.test.ts`

**Pattern:** Mock your underlying data source functions with `vi.mock()`, test each provider method returns correct domain types.

```typescript
import { describe, it, expect, vi } from "vitest";
import { gtfsSeProvider } from "./gtfsSeProvider";

// Mock your data import
vi.mock("../services/gtfsApi", () => ({
  searchGtfsStops: vi.fn(),
  getGtfsDepartures: vi.fn(),
}));

describe("gtfsSeProvider", () => {
  it("capabilities match declared features", () => {
    expect(gtfsSeProvider.capabilities.providerId).toBe("gtfs-se");
    expect(gtfsSeProvider.capabilities.features.search).toBe(true);
  });

  it("ownsStop returns true for gtfs-se prefix", () => {
    expect(gtfsSeProvider.ownsStop("gtfs-se:740000001")).toBe(true);
    expect(gtfsSeProvider.ownsStop("sl:1234")).toBe(false);
  });

  it("searchStops returns TransitStopSearchResult[]", async () => {
    // mock setup...
    const results = await gtfsSeProvider.searchStops("Stockholm C");
    expect(results[0]).toHaveProperty("id");
    expect(results[0].id).toMatch(/^gtfs-se:/);
  });

  // ... test each method
});
```

#### Step 3: Register in init.ts

**File:** `src/providers/init.ts`

Add one import and one registration line:
```typescript
import { gtfsSeProvider } from "./gtfsSeProvider";

providerRegistry.register(gtfsSeProvider);   // ← ONE LINE
```

That's it. `transitService` now routes `gtfs-se:*` EntityIds to your provider.

#### Step 4: Wire consumers (if needed)

UI and stores already call `transitService`. Your provider returns canonical types — no UI changes needed.

**Exception:** If your provider is the first to support a new feature (e.g., `routeGeometry`), you may need to add a UI element that calls `transitService.getRouteShape()`. But the transit service method already exists (throws "Future" until a provider implements it).

### A.4 Provider Patterns

#### Pattern 1: API Wrapper (SL Provider)

**Reference:** `src/providers/slProvider.ts` (291 lines)

Wraps an external REST API. Pattern:
- Import existing API functions from `src/services/slApi.ts` (legacy service file)
- `fromStopEntityId()` extracts the numeric siteId from `sl:1234`
- `toTransitDepartures()` maps the SL-specific `Departure` type → `TransitDeparture`
- `toTransitDisruptions()` maps `DeviationMessage[]` → `TransitDisruption[]`
- `toSearchResults()` maps `SiteSearchResult[]` → `TransitStopSearchResult[]`

Key: The legacy `slApi.ts` still exists — the provider delegates to it. Eventually, the API logic moves into the provider directly, but wrapping the existing service is a safe first step.

#### Pattern 2: Static / Hardcoded Timetable (Sjöstad Provider)

**Reference:** `src/providers/sjostadProvider.ts` (231 lines)

No external API. All data is hardcoded or computed locally. Pattern:
- `STOP_METADATA`: map of stop keys → { name, coord } for each supported stop
- `searchStops()`: string-matches query against `STOP_METADATA` keys, returns results with `relevance: 100` for matches
- `getDepartures()`: delegates to `staticTimetable.getNextDepartures()`, filters by line/direction
- `getNextScheduledDeparture()`: tries today's departures first, falls back to `getFirstTomorrowDeparture()` for overnight gap
- `getKnownRoutes()`: deduplicates lines from all departures at a stop
- `fromStopEntityId()`: normalizes legacy hyphen-separated keys (`sjostad:luma-brygga` → `luma_brygga`)

Key: `dataSource` is `"static"` — this signals the UI to show the time (not minutes) and handle "sleeping" state differently.

#### Pattern 3: HTML Scraping (Waxholm — Future)

**Planned pattern** for providers that scrape HTML timetable pages (Waxholmsbolaget, Strömma):

```
build-time scrape → static JSON file in public/
    ↓
provider reads JSON at runtime
    ↓
produces TransitDeparture[] with dataSource: "static"
```

Key differences from API wrapper:
- Scraping happens at **build time** (via a `scripts/fetch-*.mjs` prebuild hook), not browser runtime
- Browser reads the pre-generated JSON from `public/`
- Schedule data is static until the next build/cron refresh
- Stop coordinates come from a hardcoded lookup table (no search API)
- EntityId prefix: `waxholm:` or `html:`

**When to use:** The provider has a public timetable webpage but no API. The schedule changes infrequently (seasonal). Scraping is fragile but the only option.

#### Pattern 4: GTFS Static Feed (Future)

**Planned pattern** for GTFS static data (stops, routes, trips, stop_times, shapes):

```
GTFS zip downloaded at build time
    ↓
scripts/unpack-gtfs.mjs extracts to public/gtfs/
    ↓
GTFS provider reads CSV/JSON at runtime
    ↓
produces TransitDeparture[] + TransitStop[] + TransitShape[] etc.
```

Key differences:
- GTFS uses `location_type` to distinguish stop vs station vs entrance
- `stop_times.arrival_time` / `departure_time` may exceed 24:00:00 (next service day)
- Route colors come from `routes.route_color` / `routes.route_text_color`
- Shapes for map rendering come from `shapes.txt` → `TransitShape`
- EntityId prefix: `gtfs-se:` or `gtfs-regional:` (distinguishes feeds)
- See `docs/superpowers/specs/2026-06-25-canonical-domain.md` §8.2 for GTFS→Domain field mapping table

### A.5 Key Domain Types (What You Must Produce)

All defined in `src/types/transit.ts`. Import from `src/providers/types.ts` (re-exports).

| Type | Key Fields | Used By |
|------|-----------|---------|
| `TransitDeparture` | `id, stopId, line, lineName, destination, directionCode, transportMode, minutes, scheduledTime, expectedTime?, dataSource` | departureStore, SegmentDepartures |
| `TransitStopSearchResult` | `id, name, coord?, modes[], relevance, locationType` | SegmentSearch |
| `TransitDisruption` | `id, severity, title, description?, effect, cause?, affectedRoutes[], affectedStops[], activePeriod?, updatedAt` | deviationStore |
| `TransitStopSequence` | `routeId, directionCode, headsign, stops[]` | DirectionSelector |
| `TransitTrip` | `id, routeId, headsign, directionCode, serviceDate` | trip details (future) |
| `TransitVehiclePosition` | `vehicleId, tripId?, position, stopStatus, timestamp` | map (future) |
| `TransitShape` | `id, points[]` (lat, lon, sequence) | map (future) |

### A.6 Source Files Reference

| File | Role | Edit When? |
|------|------|------------|
| `src/types/transit.ts` | Canonical domain types, enums, mode mappers | Add new TransportMode or enum value |
| `src/providers/types.ts` | Re-exports transit types + TransitService interface | Rarely |
| `src/providers/registry.ts` | ProviderRegistry class (prefix-hash, feature filter) | Never (it's done) |
| `src/providers/init.ts` | Singleton registry + service. **Register providers here.** | Every new provider (+1 line) |
| `src/providers/slProvider.ts` | SL API → domain mapper | Only if SL API changes |
| `src/providers/sjostadProvider.ts` | Ferry static schedule → domain mapper | Only if ferry schedule changes |
| `src/services/transitService.ts` | Aggregation layer: resolves provider, delegates | Rarely (new features that need cross-provider logic) |
| `src/services/slApi.ts` | Raw SL API calls (legacy) | Only if SL API endpoints change |
| `src/services/slDeviations.ts` | Raw SL Deviations API (legacy) | Only if Deviations API changes |
| `src/services/staticTimetable.ts` | Hardcoded ferry schedule (legacy) | Only if ferry schedule changes |
| `src/services/timetableCache.ts` | Learned SL schedule predictor (legacy) | Only if prediction model changes |
| `src/services/routeStops.ts` | Stop sequence resolver (legacy) | Only if Trip API changes |
| `src/services/persistentCache.ts` | Generic IndexedDB cache | Never (it's done) |
| `src/lib/departureConverter.ts` | TransitDeparture → legacy Departure (backward compat) | Only if legacy Departure type changes |
| `src/stores/departureStore.svelte.ts` | Departure state + auto-refresh | Only if departure flow changes |
| `src/stores/deviationStore.svelte.ts` | Disruption state + auto-refresh | Only if disruption flow changes |

---

## Part B: Feature Discovery

Feature discovery is a **separate domain** — not transit. It covers nearby venues (beer, wine, cocktails) and events. Currently has no provider abstraction; sources are called directly.

### B.1 Venue Sources

**File:** `src/services/venueService.ts` (676 lines)

Three data sources, called in parallel:

1. **Supabase Edge Function** (beer venues)
   - URL: `https://izrgqxgsuhogrukisfrd.supabase.co/functions/v1/beer-venues`
   - Response: JSON array of venue records
   - Handled by `fetchSupabaseVenues()`
   - Configurable via `VITE_SUPABASE_ANON_KEY` env var (optional, falls back)

2. **Overpass API** (wine/cocktail venues from OpenStreetMap)
   - URL: `https://overpass-api.de/api/interpreter` (primary)
   - Fallback: `https://overpass.kumi.systems/api/interpreter`
   - Queries OSM nodes/ways for `amenity=bar/restaurant/pub` with wine/cocktail tags
   - Handled by `fetchOverpassWine()` and `fetchOverpassCocktail()`
   - Cached in LocalStorage + IndexedDB (7-day TTL for Overpass)
   - Coordinate rounded to ~400m grid for cache keys

3. **CORS Proxy** (fallback for blocked origins)
   - Configurable via `VITE_USE_CORS_PROXY` and `VITE_CORS_PROXY_BASE`

**Adding a new venue source:**

1. Add a new `fetchYourVenues(lat, lon, signal)` function in `venueService.ts`
2. Return `Venue[]` (type defined at top of `venueService.ts`)
3. Add call to `fetchAllVenues()` / `fetchNearbyVenues()` orchestrator
4. Handle caching: use `persistentCache` (IndexedDB) or in-memory `_venuesCache`
5. Handle deduplication: venue ID format should include source prefix to avoid collisions
6. Handle CORS: check if the API supports browser CORS; fall back to proxy if needed

**Venue type:**
```typescript
type Venue = {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  address?: string;
  openingHours?: string;
  priceLevel?: 1 | 2 | 3;
  rawPrice?: number;
  drinkName?: string;
  happyHourPrice?: number | null;
  distance?: number;
  source?: string;
  hasOutdoorSeating?: boolean;
  isSpecificWine?: boolean;
  isSpecificCocktail?: boolean;
  _classified?: "beer" | "wine" | "cocktail";  // @internal
  _score?: number;                                // @internal
};
```

### B.2 Event Sources

**File:** `src/services/eventService.ts` (272 lines)

Three-tier fetch strategy:

1. **Static `events-data.json`** (generated at build time by `scripts/fetch-events-data.mjs`)
   - Located in `public/events-data.json`
   - Preloaded at build + refreshed by CI cron (06:00 + 10:00 UTC)
   - Served via Service Worker (NetworkFirst strategy)
   - First tier — fastest, always available offline

2. **Visit Stockholm API** (live events, CORS-enabled)
   - URL: `https://api.visitstockholm.com/api/public-v1/events/`
   - Paginated (max 100 per page), fetched via CORS proxy fallback
   - Filtered by distance from user location
   - Second tier — live data when online

3. **DEV Demo Data** (hardcoded fallback)
   - Used when `import.meta.env.DEV` is true and no other data available
   - Shows sample events for development/testing

**Event type:**
```typescript
type EventItem = {
  id: string;
  name: string;
  startTime?: string;
  location?: string;
  description?: string;
  ticketUrl?: string;
  lat?: number;
  lon?: number;
  categories?: EventItemCategory[];
};
```

**Adding a new event source:**

1. Add a new `fetchYourEvents(lat, lon, radius, signal)` function in `eventService.ts`
2. Return `EventItem[]`
3. Wire into `fetchNearbyEvents()` — add to the tier chain:
   - Check in-memory cache first
   - Check persistent cache (IndexedDB)
   - Try static JSON
   - Try your new API
   - Fall back to demo data (dev only)
4. Handle caching with the shared `eventsCache` (in-memory) or `persistentCache` (IndexedDB)
5. If your source needs a build-time fetch, add a script in `scripts/` and wire into `prebuild` hook

### B.3 OSM Station Layout Data (Planned — Not Yet Implemented)

The canonical domain model (`docs/superpowers/specs/2026-06-25-canonical-domain.md`) defines three types for station layout:

- **`StationExit`** — entrance/exit coordinates, connected platforms, street-level flag
- **`PlatformSection`** — platform subsections with carriage positions, nearest exit
- **`TransferConnection`** — walking path between platforms with time/distance

These are currently **types only** (in `src/types/transit.ts`) — no runtime implementation.

**Planned data sources:**
1. **Manually curated JSON** — for key stations (T-Centralen, Slussen, etc.)
2. **OpenStreetMap** — nodes with `public_transport=platform` + ways with `highway=footway`
3. **GTFS pathways.txt** — if available in the GTFS feed

**When implementing:** these types belong to the **transit domain** (not feature discovery). A provider for station layout would implement `TransitProvider` with custom methods or extend the interface. The OSM Overpass queries for layout data follow a similar pattern to venue queries but produce `StationExit` / `PlatformSection` / `TransferConnection` domain types instead of `Venue`.

---

## Part C: Cross-Cutting Concerns

### Caching

All caching goes through `src/services/persistentCache.ts` — a generic IndexedDB wrapper with in-memory fallback.

**For transit providers:** Cache your API responses internally. pattern:
```typescript
import { persistentCache } from "../services/persistentCache";

const CACHE_KEY_PREFIX = `${PROVIDER_ID}:departures:`;
const CACHE_TTL = 30_000; // 30 seconds

async function getWithCache(stopId: string, signal?: AbortSignal) {
  const key = CACHE_KEY_PREFIX + stopId;
  const cached = await persistentCache.get<YourType[]>(key);
  if (cached) return cached;

  const fresh = await fetchFromAPI(stopId, signal);
  await persistentCache.set(key, fresh, CACHE_TTL);
  return fresh;
}
```

**For venues/events:** Use the existing cache patterns in `venueService.ts` / `eventService.ts`. Add your own cache key prefix.

### Search Aggregation

`transitService.searchStops()` automatically aggregates results from ALL providers with `features.search: true`. Your provider's search results appear alongside SL and Sjöstad results — no special wiring needed.

Deduplication is by `EntityId` (which includes your prefix). If two providers return the same stop with different IDs, that's intentional — they're different entities.

### Error Handling

- Provider methods should **never throw** for expected failures (empty results, timeouts). Return `[]` or `null`.
- Throw only for programming errors (invalid state, missing required config).
- `transitService` wraps provider calls in `Promise.allSettled` for search — individual provider failures don't break search.
- For departures, `transitService.resolveOrThrow()` throws "No provider found" — callers handle this.

### Type Safety

- Use `TransportMode` (from `src/providers/types.ts`) for all transport modes. It's `"train" | "metro" | "tram" | "bus" | "boat" | "ferry"`.
- `EntityId` is `string` — always use the `${PREFIX}:${localId}` format.
- `DepartureDataSource` is `"realtime" | "predicted" | "scheduled" | "static"`. Choose the most accurate category.
- All domain types have `providerMetadata?: Record<string, unknown>` — put provider-specific data here. UI never reads it directly.

### Checklist for Adding a New Provider

- [ ] Choose a short, stable `PROVIDER_ID` (no colons, no spaces)
- [ ] Create `src/providers/YOUR-PROVIDER.ts`
- [ ] Implement `capabilities` with accurate feature flags
- [ ] Implement `ownsStop()` — prefix check
- [ ] Implement `getDepartures()` — required
- [ ] Create `toStopEntityId()` / `fromStopEntityId()` helpers
- [ ] Create `toTransitDepartures()` mapper
- [ ] Implement optional methods matching your capabilities flags
- [ ] All returned data uses canonical domain types (TransitDeparture, TransitStopSearchResult, etc.)
- [ ] No raw API shapes exposed in return types
- [ ] Write tests in `src/providers/YOUR-PROVIDER.test.ts`
- [ ] Mock your data source, test each method
- [ ] Register in `src/providers/init.ts` (+1 line)
- [ ] Run `pnpm test` — all existing tests still pass
- [ ] Run `pnpm run check` — 0 type errors
- [ ] Run `pnpm run build` — builds clean
- [ ] Manual smoke test: search for a stop your provider owns, verify departures appear
