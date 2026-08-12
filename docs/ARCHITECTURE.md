# Architecture

Nästa is a client-only Svelte 5 PWA. There is no server application or database. The browser combines live SL data, static ferry data, local caches, and optional location/discovery services.

## Runtime flow

```text
User action
  → App.svelte
  → stores
  → services / TransitService
  → providers, browser APIs, or persistent cache
  → component state and UI
```

Saved pages are loaded from LocalStorage. Departure refreshes use a request ID so responses from an older page cannot overwrite the active page. Cached data can render first and live data can refine it later.

## Transit providers

Transit data uses provider-scoped IDs such as `sl:1234` and `sjostad:luma`.

```text
TransitService
  → ProviderRegistry.resolve(entityId)
  → slProvider       → SL API and learned schedules
  → sjostadProvider  → static ferry timetable
```

The provider boundary is defined by [`src/providers/types.ts`](../src/providers/types.ts). Providers return canonical types from [`src/types/transit.ts`](../src/types/transit.ts); UI components do not consume raw provider responses.

Current provider wiring lives in [`src/providers/init.ts`](../src/providers/init.ts). The registry resolves providers by ID prefix and aggregates searchable providers.

## Stores and state

Stores use module-level Svelte 5 runes and small subscriber lists. They do not use `svelte/store` primitives.

| Store | Responsibility |
| --- | --- |
| `pageStore` | Saved pages, segments, active page, and persistence |
| `departureStore` | Departure snapshots, refresh, schedule predictions, and request IDs |
| `deviationStore` | Active disruptions, station notices, and segment health |
| `settingsStore` | User preferences and persistence status |
| `localeStore` | Swedish/English translations and locale selection |
| `stopAreaStore` | Site-to-stop-area mapping for disruption matching |
| `timeOfDayStore` | Time-of-day state used by discovery behavior |

Rune modules use the `.svelte.ts` extension.

## Services

The main service boundaries are:

- `slApi.ts`: SL Transport and Journey Planner requests and response mapping.
- `slDeviations.ts`: active disruption requests and severity/text mapping.
- `transitService.ts`: provider resolution and cross-provider transit operations.
- `staticTimetable.ts`: supported Sjöstadstrafiken schedules.
- `routeStops.ts` and `journeyService.ts`: stop sequences, direction lookup, and planned journeys.
- `persistentCache.ts`: IndexedDB cache with an in-memory fallback.
- `geo.ts`: permission-aware location session, distances, and walking estimates.
- `eventService.ts` and `venueService.ts`: event and nearby-venue discovery.
- `backup.ts` and `appDataReset.ts`: validated settings/page backup and complete local-data reset.

Processing helpers keep presentation logic out of network clients. Important examples are `departureBoardModel.ts`, `departureDisplay.ts`, `departureDeduplication.ts`, `disruptionType.ts`, `savedJourneyLifecycle.ts`, and `cacheLifecycle.ts`.

## UI structure

- `App.svelte`: application shell, navigation, startup coordination, and refresh orchestration.
- `SegmentDepartures.svelte` and `DepartureRow.svelte`: departure boards and rows.
- `PageEditor.svelte`, `SegmentList.svelte`, and `SegmentSearch.svelte`: saved-page editing.
- `JourneySearch.svelte` and `JourneyCard.svelte`: planned multi-leg journeys.
- `SettingsPanel.svelte`: preferences, backup/import, reset, and discovery settings.
- `FeatureDiscoverySheet.svelte`: nearby venue and event discovery.
- `Sheet.svelte`: shared responsive modal/sheet behavior with focus handling and reduced-motion support.
- `MapPreview.svelte` and `MapViewer.svelte`: optional MapLibre map views.
- `SurfaceControl.svelte`: shared close/back/action control used by transient surfaces.

## Persistence and caching

User settings and saved pages live in LocalStorage. Expiring application data uses the `nasta-cache` IndexedDB database through `persistentCache`; it falls back to memory when IndexedDB is unavailable.

Service-worker caching is configured in [`vite.config.ts`](../vite.config.ts):

```text
Navigation              → NetworkFirst
SL transport API        → NetworkFirst
events-data.json        → NetworkFirst
Venue mood images       → CacheFirst
Map and hours assets    → CacheFirst
Hashed application code → Precache
```

The service worker is disabled in development. Production registration uses `import.meta.env.BASE_URL`, and updates remain waiting until the user chooses Reload in the update banner.

## Disruptions

The departure API can provide stop-specific deviations. The separate Deviations API provides active line and station messages. `deviationStore` fetches and caches the latter, while departure snapshots retain stop-level context for empty-board warnings.

Severity is derived from importance, influence, and urgency. Facility notices are separated from line disruptions and displayed at station level when they do not directly affect a segment.

## Location and discovery

Location is opt-in. Ordinary startup performs a granted-only lookup; prompts follow explicit user actions. Browser and installed-PWA permissions are separate.

Feature discovery uses a shared session layer so prefetch and the open sheet can reuse the same in-flight requests and cached results. Event data has a build-time static snapshot; venue data is fetched from Supabase and Overpass.

## Deployment constraints

- Development base path: `/`.
- Production base path: `/Nasta/` on GitHub Pages.
- Asset and service-worker paths must use `import.meta.env.BASE_URL`.
- `vite-plugin-pwa` is enabled for preview/production, not Vite development.
- `version.json` is written by the deployment workflow and used for deployed-version checks.
- Production validation is `check` → unit tests → build → artifact verification → Playwright E2E; the workflow also runs a deployed smoke test.

## Source of truth

For changes, check the implementation first:

- [`vite.config.ts`](../vite.config.ts) for build, PWA, and cache behavior.
- [`package.json`](../package.json) for commands and package manager.
- [`src/types/transit.ts`](../src/types/transit.ts) for provider-neutral types.
- [`src/services/storage.ts`](../src/services/storage.ts) for settings and LocalStorage.
- [`src/providers/init.ts`](../src/providers/init.ts) for provider registration.
