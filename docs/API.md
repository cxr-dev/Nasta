# API and persistence reference

This document covers the external data contracts and browser storage used by Nästa. The implementation is the source of truth for response mapping and validation:

- [SL client](../src/services/slApi.ts)
- [SL deviations client](../src/services/slDeviations.ts)
- [Transit domain types](../src/types/transit.ts)
- [Page and settings types](../src/types/page.ts)
- [Storage implementation](../src/services/storage.ts)

## External APIs

### SL Transport API

Base URL: `https://transport.integration.sl.se/v1`

```text
GET /sites/{siteId}/departures?forecast={minutes}
```

Nästa maps the response into the legacy departure shape and the canonical `TransitDeparture` shape. The response may also contain `stop_deviations`, which are kept for stop-specific empty-board warnings and disruption context.

### SL Journey Planner API

Base URL: `https://journeyplanner.integration.sl.se/v2`

```text
GET /stop-finder?name_sf={query}&any_obj_filter_sf=2&type_sf=any
GET /trips?originId={originId}&destId={destId}&date={date}&time={time}
```

Stop Finder results provide the site ID, display name, coordinates, locality, match quality, and product classes used by stop search. Coordinates are `[latitude, longitude]`. The app maps product classes to its internal transport types.

Trip results support planned journey creation, direction lookup, and fallback journey details.

### SL Deviations API

Base URL: `https://deviations.integration.sl.se/v1`

```text
GET /messages?future=true&site={siteId}&line={lineDesignation}
```

Messages are mapped to `DeviationMessage` and classified as `info`, `warning`, or `critical` using importance, influence, and urgency. Facility messages such as elevator and escalator notices are handled separately from line disruptions.

## Other data sources

- **Sjöstadstrafiken:** supported pier names are routed to the static timetable in [`staticTimetable.ts`](../src/services/staticTimetable.ts). This is a provider choice, not a general SL API fallback.
- **Visit Stockholm:** live events are fetched by [`eventService.ts`](../src/services/eventService.ts), with the build-time snapshot in `public/events-data.json` used as the fast/offline tier.
- **Supabase and Overpass:** nearby venues are fetched by [`venueService.ts`](../src/services/venueService.ts).

## LocalStorage

| Key | Purpose |
| --- | --- |
| `nasta_routes` | Saved pages and segments |
| `nasta_settings` | User settings, including theme, language, filtering, location, and discovery preferences |
| `nasta_recent_stops` | Recent stop-search results |
| `nasta_stop_area_mapping` | Site-to-stop-area mapping for disruption matching |
| `nasta_map_app_preference` | Map app preference |
| `nasta_location_prompted` | Legacy location-permission migration marker |
| `nasta_deviations_cache_v1` | Legacy deviation-cache migration key |
| `nasta_schedule_cache_v1` | Legacy schedule-cache migration key |
| `nasta_venues_v2:*` | Legacy venue-cache migration keys |

The app-data reset service owns the complete list of removable LocalStorage keys. Do not add a persistent key without also updating [`appDataReset.ts`](../src/services/appDataReset.ts).

### Settings

The current `Settings` interface is defined in [`storage.ts`](../src/services/storage.ts). Its stable groups are:

- `theme`: `system`, `light`, or `dark`;
- language and disruption preferences;
- refresh interval and transport filters;
- `sortMode`, `groupingMode`, and `groupSleeping`;
- location, walking ETA, afterwork, and event preferences.

Older `darkMode`, `themeVariant`, and manual-sort values are accepted only for migration and are not part of the current persisted public shape.

### Location services

Location is optional and controlled by `locationServicesEnabled`. Walking ETA additionally requires `walkingEtaEnabled`. Stop search can use location for nearby suggestions and distance labels without enabling walking ETA.

The app performs a granted-only lookup during ordinary startup. Native permission prompts are reserved for explicit actions such as enabling location or choosing nearby stops. Browser and installed-PWA permissions are separate, and geolocation requires HTTPS or localhost.

## IndexedDB and persistent cache

[`persistentCache.ts`](../src/services/persistentCache.ts) stores expiring values in the `nasta-cache` IndexedDB database and falls back to memory when IndexedDB is unavailable.

Current cache users include:

- live schedule predictions and timetable learning;
- deviations;
- stop search and trip-planning results;
- event and venue results;
- generated share cards.

Each caller owns its cache key and TTL. The cache layer removes expired values and supports full reset through [`appDataReset.ts`](../src/services/appDataReset.ts).

## Service-worker caching

Workbox configuration lives in [`vite.config.ts`](../vite.config.ts):

| Request | Strategy | Retention |
| --- | --- | --- |
| Navigation | NetworkFirst | 30 entries, 1 hour, 2-second network timeout |
| SL transport API | NetworkFirst | 20 entries, 60 seconds, 5-second network timeout |
| `events-data.json` | NetworkFirst | 5 entries, 12 hours, 4-second network timeout |
| Venue mood images | CacheFirst | 48 entries, 1 year |
| Optional map and hours assets | CacheFirst | 4 entries, 30 days |
| Hashed application assets | Precached | Build-controlled |

The service worker is disabled in Vite development mode. Production registration is base-aware and uses the prompt update flow described in [`main.ts`](../src/main.ts) and [`UpdateBanner.svelte`](../src/components/UpdateBanner.svelte).

## Canonical types

Use the source types instead of copying interfaces into documentation:

- [`transit.ts`](../src/types/transit.ts): provider-neutral stops, departures, disruptions, and provider interfaces.
- [`page.ts`](../src/types/page.ts): saved pages, segments, stops, transport types, sort, and grouping modes.
- [`departure.ts`](../src/types/departure.ts): compatibility types still used by parts of the UI.
- [`deviation.ts`](../src/types/deviation.ts): disruption and station-alert presentation types.
