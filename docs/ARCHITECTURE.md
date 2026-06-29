# Architecture

## Overview

Nästa is a frontend-only PWA using LocalStorage for persistence, a **provider-based transit abstraction layer** over SL Transport API, SL Deviations API, Sjöstadstrafiken ferries, and a hybrid fetch strategy combining live data with locally cached schedules. Built with Svelte 5 Runes + TypeScript strict.

## Data Flow

### Request Lifecycle

```
User Route Change → App.svelte
                    ├─→ departureStore.startAutoRefresh()
                    │   ├─→ Check scheduleCache
                    │   ├─→ Fetch from transitService.getDepartures()
                    │   │      └─→ ProviderRegistry.resolve(stopId) 
                    │   │              ├─→ slProvider.getDepartures()  (wraps slApi)
                    │   │              └─→ sjostadProvider.getDepartures()  (wraps staticTimetable)
                    │   ├─→ Learn from response → timetableCache
                    │   ├─→ Update departureStore.data
                    │   └─→ Merge & deduplicate departures
                    │
                    └─→ deviationStore.startAutoRefresh()
                        ├─→ Check deviationCache (IndexedDB)
                        └─→ Fetch from slDeviations.ts (not yet migrated to TransitService)
```

### Provider Architecture

```
UI Component
    ↓
TransitService (src/services/transitService.ts)
    ↓
ProviderRegistry.resolve(stopId) → O(1) prefix hash
    ↓
TransitProvider (interface)
    ├─ slProvider       — SL Transport API + SL Deviations + timetableCache
    ├─ sjostadProvider  — Hardcoded Sjöstadstrafiken ferry schedules
    └─ (future) waxholmProvider, gtfsProvider, etc.
```

Adding a new transit source = 1 provider file + 1 registry line. No store/component changes.

### Provider Resolution

Stop IDs are EntityIds with `providerId:localId` format (e.g. `sl:1234`, `sjostad:luma`).
ProviderRegistry uses a prefix-hash for O(1) `resolve(stopId)` lookup — no iteration.

### Reactivity Pattern

```
Svelte 5 Runes ($state, $derived, $effect, $props)
    ↓
  Stores (module-level $state() + manual subscriber arrays)
    ↓
  Components (template reactivity)
    ↓
  UI Updates
```

Stores do **not** use `svelte/store` writable/readable/derived primitives. Instead they use module-level `$state()` calls with manual subscriber arrays for interop with Svelte 5's `$state` rune reactivity.

## Stores

| Store                     | Responsibility                                                                  |
| ------------------------- | ------------------------------------------------------------------------------- |
| `pageStore`               | Page/segment CRUD, reordering, persistence to LocalStorage                     |
| `departureStore`          | Departure fetching via TransitService, caching, auto-refresh, request ID routing |
| `deviationStore`          | Disruption fetching (direct slDeviations, not yet migrated), segment health    |
| `stopAreaStore`           | SiteId→stopAreaId mapping for disruption matching                              |
| `settingsStore`           | User preferences (theme, transport filtering, refresh interval, language, etc) |
| `localeStore`             | Automatic locale detection and i18n text retrieval                             |
| `timeOfDayStore`          | Time-of-day state (morning/afternoon/evening/night) for afterwork logic       |

## Services

### Provider Layer (new)

| File                     | Responsibility                                                      |
| ------------------------ | ------------------------------------------------------------------- |
| `src/providers/registry.ts` | O(1) prefix-hash ProviderRegistry, register/resolve/withFeature   |
| `src/providers/init.ts`  | Singleton registry + TransitService instantiation                    |
| `src/providers/slProvider.ts` | TransitProvider wrapping SL API + deviations + timetable cache     |
| `src/providers/sjostadProvider.ts` | TransitProvider wrapping static ferry schedules                 |
| `src/services/transitService.ts` | Aggregation layer — delegates to owning provider by EntityId    |

### API Integration

| Service            | Endpoint                                                                  | Purpose                                                                           |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `slApi.ts`         | `transport.integration.sl.se/v1` + `journeyplanner.integration.sl.se/v2`  | Real-time departures, stop search, planned trip fallback (wrapped by slProvider) |
| `slDeviations.ts`  | `deviations.integration.sl.se/v1/messages`                                | Active disruptions, alerts, severity scoring (not yet wrapped by TransitService) |
| `geo.ts`           | Native Geolocation API                                                    | User distance to stops, walking time calculations                                 |
| `eventService.ts`  | `api.visitstockholm.com`                                                  | Nearby events from Visit Stockholm                                                |
| `venueService.ts`  | Supabase Edge Function + Overpass API + optional CORS proxy               | Beer/wine/cocktail venues                                                         |

### Data Processing

| Service                      | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| `staticTimetable.ts`         | Hardcoded Sjöstadstrafiken ferry schedule (wrapped by sjostadProvider)|
| `deviationCache.ts`          | Persists disruptions to IndexedDB (fallback when API unavailable)   |
| `scheduleCache.ts`           | Caches predicted departures from schedules                          |
| `timetableCache.ts`          | Learns departure patterns from SL API responses                     |
| `persistentCache.ts`         | Generic persistent cache layer                                      |
| `prefetchService.ts`         | Orchestrates venue/event prefetching for segments                   |
| `nextDepartureResolver.ts`   | Resolves next departure from combined sources                       |
| `storage.ts`                 | LocalStorage persistence for pages, settings                       |
| `routeStops.ts`              | Stop-finder + trip planning with persistent cache                  |

### Processing Libraries

| File                         | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| `departureDisplay.ts`        | Merges live + predicted departures, formats display times           |
| `departureDeduplication.ts`  | Deduplicates arrivals by stable key (line+destination+time window)  |
| `sourceClassification.ts`    | Detects external timetable sources (Sjöstadstrafiken ferries)       |
| `cacheLifecycle.ts`          | Manages cache eviction and TTL expiration                           |
| `disruptionType.ts`          | Classifies disruption text into types (protest, weather, technical) |
| `stopName.ts`                | Clean stop name normalization                                       |
| `sw.ts`                      | Service worker URL helper (base-aware)                              |
| `departureConverter.ts`      | TransitDeparture → legacy Departure conversion                      |
| `getTransportType.ts`        | Transport mode classification helper                                |
| `sunPosition.ts`             | Sun position calculation for auto theme                             |
| `checkVersion.ts`            | PWA version check against deployed version.json                     |
| `departureIcons.ts`          | Departure icon mapping for transport modes                          |
| `i18n.ts`                    | Full Swedish + English translations (~550 keys)                     |
| `timeOfDay.svelte.ts`        | Time-of-day state (morning/afternoon/evening/night)                 |

## Components

### Page-level

- `App.svelte` — Main app container, page state, auto-refresh orchestration
- `ErrorBoundary.svelte` — Error catching and user-friendly error display

### Departures & Pages

- `PageHeader.svelte` — Page name, edit/save toggle, page selection
- `SegmentDepartures.svelte` — List of page segments with departures per stop
- `DepartureRow.svelte` — Individual departure row with countdown
- `SegmentList.svelte` — List of segments within a page
- `SegmentSearch.svelte` — Stop/segment search via TransitService

### Editors & Settings

- `PageEditor.svelte` — Page/segment CRUD, stop search, travel time inputs
- `DirectionSelector.svelte` — Transit direction selection UI
- `SettingsPanel.svelte` — Settings pane with theme, language, transport filtering

### Onboarding

- `Onboarding.svelte` — First-run guided hint pointing to Settings

### Disruptions

- `DisruptionList.svelte` — Active disruption list display
- `StationNoticeBar.svelte` — Station-level facility alerts (elevator/escalator)

### Feature Discovery

- `FeatureDiscoverySheet.svelte` — Tabbed panel for beer, wine/cocktail, and events. Events tab has binary sort toggle (time/distance) + single-select category chips derived from loaded event categories.
- `MapPreview.svelte` — Interactive map of segment stops (dynamically imports `maplibre-gl`)
- `MapViewer.svelte` — Full-screen map view with user location

### Other

- `Skeleton.svelte` — Loading skeleton placeholders
- `UpdateBanner.svelte` — PWA update available banner
- `TransportIcon.svelte` — Transport mode icon component
- `IconButton.svelte` — Icon button with tooltip

## Canonical Domain Types

Defined in `src/types/transit.ts` (994 lines, 0 runtime imports):

| Type | Purpose |
| ---- | ------- |
| `EntityId` | Composite identity `${providerId}:${localId}` |
| `TransportMode` | Canonical taxonomy: train/metro/tram/bus/boat/ferry |
| `TransitStopSearchResult` | Provider-agnostic stop search result |
| `TransitDeparture` | Provider-agnostic departure (line, destination, time, delay, etc.) |
| `TransitProvider` | Interface all providers implement |
| `ProviderRegistry` | Interface for O(1) prefix-hash provider resolution |
| `TransitService` | Single entry point for all transit data operations |

Legacy types (`types/departure.ts`, `types/page.ts`, `types/deviation.ts`) still exist for backward compat with stores. New code should use `transit.ts` types.

## Caching & Offline

### Service Worker (Workbox)

```
Navigation requests          → Network First (30-entry, 1h TTL, 2s timeout)
Journey Planner              → Stale-While-Revalidate (50-entry, 24h TTL)
SL /sites/{id}/departures    → Network First (20-entry, 60s TTL, 5s timeout)
events-data.json             → Network First (5-entry, 12h TTL, 4s timeout)
Static assets                → Cache First (hashed filenames)
```

### LocalStorage Keys

| Key                       | Content                    | TTL       |
| ------------------------- | -------------------------- | --------- |
| `nasta_routes`            | Serialized Page[]          | Permanent |
| `nasta_settings`          | Serialized Settings        | Permanent |
| `nasta_recent_stops`      | TransitStopSearchResult[]  | Permanent |
| `nasta_stop_area_mapping` | siteId→stopAreaId map      | Permanent |

### IndexedDB Keys (Deviations)

| Key                | Content                             | TTL     |
| ------------------ | ----------------------------------- | ------- |
| `deviations_cache` | Deviation message array + timestamp | 6 hours |

## Request ID Routing

To prevent stale responses when switching pages, `departureStore` uses request IDs:

1. Page changes generate new `requestId = page-${id}-${timestamp}`
2. API responses include the `requestId` that spawned them
3. Store only applies responses matching the current `requestId`
4. Pending responses with old IDs are silently dropped

This prevents race conditions when users quickly switch between pages.

## Disruption Handling

### Severity Scoring

Disruptions are classified as:
- **info** — Minor, low urgency (score < 5)
- **warning** — Moderate impact (score 5–7)
- **critical** — High urgency, major impact (score ≥ 8)

Score computed as: `importance * 2 + influence + urgency`

Additional rules:
- `importance ≥ 4` or `urgency ≥ 3` → critical (regardless of score)
- `importance ≥ 3` → warning (regardless of score)

### Segment Health States

- **ok** — No active disruptions
- **affected** — Info/warning level disruptions
- **critical** — Critical disruptions

### Station Alerts (Facility Notices)

Facility alerts (elevator/escalator/entrance disruptions) are separated from line disruptions:

1. `buildSegmentHealth()` in `deviationStore` classifies messages matching facility keywords (`isStationFacilityAlert`)
2. If a facility alert does not affect the segment's stop areas, it's shown as a station-level notice
3. Station alerts are aggregated across segments and displayed in `StationNoticeBar.svelte`

### Caching Strategy

1. Request deduplication: identical requests within 60s are collapsed (unless forced)
2. Fetch deviations every 60+ seconds
3. Cache failures fall back to last successful fetch (up to 6 hours old, stored in IndexedDB)
4. External timetable segments (ferries) always show as "ok"
5. Language-specific text returned based on app locale setting

### Inline Disruptions (Stop Deviations)

1. SL departure API responses include `stop_deviations` — stored in `departureStore.stopDeviations`.
2. `SegmentDepartures.svelte` displays a warning icon if a site has disruptions but zero active departures.
3. This path currently bypasses TransitService (stop_deviations are not yet part of the provider interface).

## Transport Filtering

Enforced at the data layer to ensure unselected modes don't clutter the UI:

1. Enabled modes stored in `settingsStore.enabledTransportTypes`
2. Filter mode (`multi` / `single`) and `activeTransportType` control single-mode focus
3. `SegmentSearch` filters by `TransportMode[]` from `TransitStopSearchResult`
4. Global enforcement ensures no hidden modes appear in any view

## Feature Discovery

Three external APIs used for discovering nearby venues and events:

- **Visit Stockholm** (`eventService.ts`) — Public events feed; CORS-enabled, fetched directly from browser
- **Supabase Edge Function** (`venueService.ts`) — Curated beer venue data (prices, happy hour). `VITE_SUPABASE_ANON_KEY` is an optional override; the service falls back to a bundled anon token and can retry through a CORS proxy when enabled.
- **Overpass API** (`venueService.ts`) — OpenStreetMap queries for wine/cocktail venues, with local/persistent caching to reduce repeated fetches.

Prefetching is orchestrated by `prefetchService.ts`. A static snapshot of events is generated at build time via `scripts/fetch-events-data.mjs`.

## PWA Configuration

### vite-plugin-pwa Settings

- **Base path:** Must align with GitHub Pages deployment (`/Nasta/`)
- **Manifest:** Includes app name, icons, display mode (`standalone`)
- **Icons:** Generated from PNG in `public/icons/` by `scripts/generate-png-icons.mjs`
- **Service worker registration:** Auto-registered in `src/main.ts`
- **Update flow:** `controllerchange` listener triggers page reload

### Known Deployment Constraints

- Service worker paths must be base-aware (`import.meta.env.BASE_URL`)
- Asset hashing ensures cache invalidation on new builds
- Static `.html` files must never be cached (browser cache-busted)

## TypeScript & Runes

### Svelte 5 Reactive Primitives

- `$state` — Reactive state variables (auto-tracked in templates)
- `$derived` — Computed properties (re-run when dependencies change)
- `$effect` — Side effects (run after DOM updates, like useEffect)
- `$props` — Component prop typing (strict, non-bindable by default)

### Type Safety

- `src/types/transit.ts` — Canonical domain model (EntityId, TransportMode, TransitProvider, TransitService)
- `src/types/page.ts` — Page, Segment, Stop, TransportType definitions
- `src/types/departure.ts` — Departure, SiteSearchResult (legacy)
- `src/types/deviation.ts` — DeviationMessage, SegmentHealth, StationAlert, severity types
- `src/lib/i18n.ts` — Locale and Translations types
- `src/services/storage.ts` — Settings type

All API responses are parsed and validated before store updates.
