# Architecture

## Overview

Nästa is a frontend-only PWA that uses LocalStorage for persistence, SL Transport API for real-time departures, SL Deviations API for disruption alerts, and a hybrid fetch strategy that combines live data with locally cached schedules. The app is built with Svelte 5 Runes for fine-grained reactivity and Type-safe stores.

## Data Flow

### Request Lifecycle

```
User Route Change → App.svelte
                    ├─→ departureStore.startAutoRefresh()
                    │   ├─→ Check departureCache
                    │   ├─→ Fetch from slApi.ts
                    │   └─→ Merge & deduplicate departures
                    │
                    └─→ deviationStore.startAutoRefresh()
                        ├─→ Check deviationCache
                        └─→ Fetch from slDeviations.ts
```

### Reactivity Pattern

```
Svelte 5 Runes ($state, $derived, $effect)
    ↓
  Stores (writable, readable, derived)
    ↓
  Components ($props, template reactivity)
    ↓
  UI Updates
```

## Stores

| Store | Responsibility |
|-------|----------------|
| `routeStore` | Route/segment CRUD, reordering, persistence to LocalStorage |
| `departureStore` | Departure fetching, caching, auto-refresh every N seconds |
| `deviationStore` | Disruption fetching, segment health tracking, severity filtering |
| `settingsStore` | User preferences (theme, refresh interval, language, notifications) |
| `localeStore` | Automatic locale detection and i18n text retrieval |

## Services

### API Integration

| Service | Endpoint | Purpose |
|---------|----------|---------|
| `slApi.ts` | `https://transport.integration.sl.se/v1` | Stop search, real-time departures, journey patterns |
| `slDeviations.ts` | `https://deviations.integration.sl.se/v1/messages` | Active disruptions, alerts, severity scoring |
| `journeyService.ts` | Journey planner via slApi | Vehicle stop patterns, live position calculation |

### Data Processing

| Service | Responsibility |
|---------|----------------|
| `departureService.ts` | Routes API calls to SL or static timetable based on source detection |
| `staticTimetable.ts` | Hardcoded Sjöstadstrafiken ferry schedule (weekday/weekend) |
| `deviationCache.ts` | Persists disruptions to IndexedDB (fallback when API unavailable) |
| `timetableCache.ts` | Caches predicted departures from schedules |
| `departureDeduplication.ts` | Removes duplicate arrivals when merging live + cached data |
| `departureEnrichment.ts` | Adds deviation minutes and source metadata to departures |
| `sourceClassification.ts` | Detects external timetable sources (e.g., ferries) vs. SL API |
| `cacheLifecycle.ts` | Manages cache eviction and TTL expiration |

## Components

### Page-level

- `App.svelte` — Main app container, route state, auto-refresh orchestration
- `ErrorBoundary.svelte` — Error catching and user-friendly error display

### Features

- `RouteHeader.svelte` — Route name, edit/save toggle, route selection
- `BottomBar.svelte` — Arrival summary, "arriving in X min" CTA
- `SegmentDepartures.svelte` — List of route segments with departures per stop
- `DepartureStrip.svelte` — Individual departure with live vehicle tracking visualization
- `RouteEditor.svelte` — Route/segment CRUD, stop search, travel time inputs
- `Onboarding.svelte` — First-run experience for new users
- `QuirkyMoment.svelte` — Random Easter egg messages

## Caching & Offline

### Service Worker (Workbox)

```
Navigation requests    → Network First (30-entry cache, instant fallback)
SL /sites endpoint     → Stale-While-Revalidate (50-entry, 24h TTL)
SL /departures endpoint → Network First (20-entry, 60s TTL)
Static assets          → Cache First (hashed filenames)
```

### LocalStorage Keys

| Key | Content | TTL |
|-----|---------|-----|
| `nasta_routes` | Serialized Route[] | Permanent |
| `nasta_settings` | Serialized settings | Permanent |
| `nasta_onboarding_seen` | Boolean flag | Permanent |
| (Computed schedules) | Predicted departures | As configured per service |

### IndexedDB Keys (Deviations)

| Key | Content | TTL |
|-----|---------|-----|
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
- **warning** — Moderate impact (score 5-7)
- **critical** — High urgency, major impact (score ≥ 8)

Score computed as: `importance * 2 + influence + urgency`

### Segment Health States

- **ok** — No active disruptions
- **affected** — Info/warning level disruptions
- **critical** — Critical disruptions

### Caching Strategy

1. Fetch deviations every 60+ seconds
2. Cache failures fall back to last successful fetch (up to 6 hours old)
3. External timetable segments (ferries) always show as "ok"
4. Language-specific text returned based on app locale setting

## Commute Nudges

Weekday morning and afternoon reminder notifications:
- Stored in `settingsStore.commuteNudgesEnabled`
- Requires notification permission (requested on first enable)
- Triggered via `setInterval` on specific hour/minute slots
- Hidden if browser tab is in background or permission not granted

## Live Vehicle Tracking

The `DepartureStrip` component integrates with `journeyService` to:

1. Fetch route stop patterns from SL Journey Planner
2. Estimate current vehicle position based on elapsed time since departure
3. Render visual progress indicator showing vehicle stops
4. Update position every ~5 seconds

Caches patterns for 14 days; live position cache refreshes every 5 minutes.

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

- `src/types/route.ts` — Route, Segment, Stop definitions
- `src/types/departure.ts` — Departure, transport type enums
- `src/types/deviation.ts` — Disruption, severity, segment health types

All API responses are parsed and validated before store updates.
