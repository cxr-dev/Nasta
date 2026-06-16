# Architecture

## Overview

Nästa is a frontend-only PWA that uses LocalStorage for persistence, SL Transport API for real-time departures, SL Deviations API for disruption alerts, and a hybrid fetch strategy that combines live data with locally cached schedules. The app is built with Svelte 5 Runes for fine-grained reactivity and TypeScript strict mode.

## Data Flow

### Request Lifecycle

```
User Route Change → App.svelte
                    ├─→ departureStore.startAutoRefresh()
                    │   ├─→ Check scheduleCache
                    │   ├─→ Fetch from slApi.ts (returns departures + stop_deviations)
                    │   ├─→ Learn from response → timetableCache
                    │   ├─→ Update departureStore.data
                    │   ├─→ Update departureStore.stopDeviations
                    │   └─→ Merge & deduplicate departures
                    │
                    └─→ deviationStore.startAutoRefresh()
                        ├─→ Check deviationCache (IndexedDB)
                        └─→ Fetch from slDeviations.ts
```

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
| `departureStore`          | Departure fetching, caching, auto-refresh, request ID routing                  |
| `deviationStore`          | Disruption fetching, segment health tracking, severity filtering               |
| `stopAreaStore`           | SiteId→stopAreaId mapping for disruption matching (legacy `svelte/store`)      |
| `settingsStore`           | User preferences (theme, transport filtering, refresh interval, language, etc) |
| `localeStore`             | Automatic locale detection and i18n text retrieval                             |

## Services

### API Integration

| Service            | Endpoint                                                                  | Purpose                                                                           |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `slApi.ts`         | `transport.integration.sl.se/v1` + `journeyplanner.integration.sl.se/v2`  | Real-time departures, stop search (`stop-finder`), planned trip fallback (`trip`) |
| `slDeviations.ts`  | `deviations.integration.sl.se/v1/messages`                                | Active disruptions, alerts, severity scoring                                      |
| `geo.ts`           | Native Geolocation API                                                    | User distance to stops, walking time calculations                                 |
| `eventService.ts`  | `api.visitstockholm.com`                                                  | Nearby events from Visit Stockholm                                                |
| `venueService.ts`  | Supabase Edge Function + Overpass API                                     | Beer/wine/cocktail venues                                                         |

### Data Processing

| Service                      | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| `departureService.ts`        | Routes API calls to SL or static timetable based on source detection|
| `staticTimetable.ts`         | Hardcoded Sjöstadstrafiken ferry schedule (weekday/weekend)         |
| `deviationCache.ts`          | Persists disruptions to IndexedDB (fallback when API unavailable)   |
| `scheduleCache.ts`           | Caches predicted departures from schedules                          |
| `timetableCache.ts`          | Learns departure patterns from SL API responses                     |
| `persistentCache.ts`         | Generic persistent cache layer                                      |
| `prefetchService.ts`         | Orchestrates venue/event prefetching for segments                   |
| `nextDepartureResolver.ts`   | Resolves next departure from combined sources                       |
| `storage.ts`                 | LocalStorage persistence for routes, settings                       |

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
| `i18n.ts`                    | Full Swedish + English translations (~550 keys)                     |
| `timeOfDay.svelte.ts`        | Time-of-day state (morning/afternoon/evening/night)                 |

## Components

### Page-level

- `App.svelte` — Main app container, route state, auto-refresh orchestration
- `ErrorBoundary.svelte` — Error catching and user-friendly error display
- `Onboarding.svelte` — First-run experience for new users

### Departures & Routes

- `PageHeader.svelte` — Page name, edit/save toggle, page selection
- `BottomBar.svelte` — Arrival summary, "arriving in X min" CTA
- `SegmentDepartures.svelte` — List of route segments with departures per stop
- `DepartureRow.svelte` — Individual departure row with countdown
- `SegmentList.svelte` — List of segments within a page
- `SegmentSearch.svelte` — Stop/segment search with debounced input

### Editors & Settings

- `PageEditor.svelte` — Page/segment CRUD, stop search, travel time inputs
- `DirectionSelector.svelte` — Transit direction selection UI

### Disruptions

- `DisruptionList.svelte` — Active disruption list display
- `StationNoticeBar.svelte` — Station-level facility alerts (elevator/escalator)

### Feature Discovery

- `FeatureDiscoverySheet.svelte` — Tabbed panel for beer, wine/cocktail, and events
- `MapPreview.svelte` — Interactive map of segment stops (dynamically imports `maplibre-gl`)

### Other

- `Skeleton.svelte` — Loading skeleton placeholders
- `UpdateBanner.svelte` — PWA update available banner

## Caching & Offline

### Service Worker (Workbox)

```
Navigation requests      → Network First (30-entry cache, instant fallback)
Journey Planner          → Stale-While-Revalidate (50-entry, 24h TTL)
SL /sites/{id}/departures → Network First (20-entry, 60s TTL)
Static assets            → Cache First (hashed filenames)
```

### LocalStorage Keys

| Key                       | Content                    | TTL       |
| ------------------------- | -------------------------- | --------- |
| `nasta_routes`            | Serialized Page[]          | Permanent |
| `nasta_settings`          | Serialized Settings        | Permanent |
| `nasta_onboarding_seen`   | Boolean flag               | Permanent |
| `nasta_recent_stops`      | SiteSearchResult[]         | Permanent |
| `nasta_stop_area_mapping` | siteId→stopAreaId map      | Permanent |

### IndexedDB Keys (Deviations)

| Key                | Content                             | TTL     |
| ------------------ | ----------------------------------- | ------- |
| `deviations_cache` | Deviation message array + timestamp | 6 hours |

## Request ID Routing

To prevent stale responses when switching routes, `departureStore` uses request IDs:

1. Route changes generate new `requestId = route-${id}-${timestamp}`
2. API responses include the `requestId` that spawned them
3. Store only applies responses matching the current `requestId`
4. Pending responses with old IDs are silently dropped

This prevents race conditions when users quickly switch between routes.

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

1. The `slApi.getDepartures` call captures `stop_deviations` from the real-time response.
2. These are stored in `departureStore.stopDeviations` (site-mapped).
3. `SegmentDepartures.svelte` displays a warning icon if a site has disruptions but zero active departures.
4. Clicking the row expands to show the full disruption message(s).

## Transport Filtering

Enforced at the data layer to ensure unselected modes don't clutter the UI:

1. Enabled modes stored in `settingsStore.enabledTransportTypes`
2. Filter mode (`multi` / `single`) and `activeTransportType` control single-mode focus
3. `slApi.searchSites` includes `productClasses` for filtering
4. Global enforcement ensures no hidden modes appear in any view

## Feature Discovery

Three external APIs used for discovering nearby venues and events:

- **Visit Stockholm** (`eventService.ts`) — Public events feed; CORS-enabled, fetched directly from browser
- **Supabase Edge Function** (`venueService.ts`) — Curated beer venue data (prices, happy hour). Requires `VITE_SUPABASE_ANON_KEY`
- **Overpass API** (`venueService.ts`) — OpenStreetMap queries for wine/cocktail venues

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

- `src/types/route.ts` — Page, Segment, Stop, TransportType definitions
- `src/types/departure.ts` — Departure, SiteSearchResult
- `src/types/deviation.ts` — DeviationMessage, SegmentHealth, StationAlert, severity types
- `src/lib/i18n.ts` — Locale and Translations types
- `src/services/storage.ts` — Settings type

All API responses are parsed and validated before store updates.
