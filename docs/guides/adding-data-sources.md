# Adding a data source

This guide covers the two extension paths currently used by Nästa:

1. a transit provider behind `TransitService`;
2. an event or venue source behind the existing discovery services.

Read [Architecture](../ARCHITECTURE.md) first. Verify the current interfaces in `src/` before copying any example.

## Add a transit provider

Transit providers own provider-scoped IDs and return canonical types. The UI and stores call `transitService`, not provider implementations directly.

### 1. Define the provider identity

Use a short stable prefix such as `sl:` or `sjostad:`:

```ts
const PROVIDER_ID = "example";
const STOP_PREFIX = `${PROVIDER_ID}:`;

function toStopEntityId(localId: string): EntityId {
  return `${STOP_PREFIX}${localId}`;
}
```

The registry resolves providers from the prefix in an `EntityId`. Do not use display names as provider identity.

### 2. Implement `TransitProvider`

Import types from [`src/providers/types.ts`](../../src/providers/types.ts). At minimum, implement:

- `capabilities` with only the features the source actually supports;
- `ownsStop(stopId)` using the provider prefix;
- `getDepartures(stopId, line?, directionCode?, signal?)`;
- `searchStops()` when the source supports search.

`capabilities.features` has these required flags. Set a flag to `true` only when the provider implements the corresponding behavior:

| Flag | Meaning |
| --- | --- |
| `search` | Text search returns `TransitStopSearchResult[]` |
| `realtime` | Live departures are available |
| `schedules` | Static timetable data is available |
| `predictions` | Schedule-based predicted departures are available |
| `disruptions` | Service alerts can be mapped to `TransitDisruption[]` |
| `stopSequences` | Ordered route stops can be returned |
| `vehiclePositions` | Live vehicle positions are available |
| `routeGeometry` | Route shapes can be returned |
| `tripMetadata` | Full trip details can be returned |
| `occupancy` | Crowding data is available |

The required departure contract is:

```ts
getDepartures(
  stopId,
  line?,
  directionCode?,
  signal?,
): Promise<{ departures: TransitDeparture[]; stopDeviations: any[] }>
```

Each `TransitDeparture` must provide an ID, provider-scoped `stopId`, line, line name, destination, direction code, canonical `transportMode`, minutes, scheduled time, and `dataSource`. Add `expectedTime`, `isFirstMorning`, and `providerMetadata` when the source provides them. Use `dataSource: "realtime"`, `"predicted"`, `"scheduled"`, or `"static"` accurately. Return `stopDeviations: []` when the provider has no stop-level deviation data.

Search results must use provider-scoped IDs and provide a name, modes, relevance, and `locationType`; coordinates and locality are optional. Optional methods such as disruptions, predictions, route sequences, and stop resolution must match the signatures in [`src/types/transit.ts`](../../src/types/transit.ts). Return canonical types, never raw API objects.

The existing implementations are the best references:

- [`slProvider.ts`](../../src/providers/slProvider.ts) wraps the SL APIs and learned timetable cache.
- [`sjostadProvider.ts`](../../src/providers/sjostadProvider.ts) maps a static ferry timetable.

A provider should preserve provider-specific values in `providerMetadata` rather than adding UI-specific fields to the canonical model.

For a basic provider, the implementation shape is: define prefix helpers, declare all capability flags, implement `ownsStop`, map source responses in `getDepartures`, and return empty arrays for unsupported optional data. Use the complete [`slProvider.ts`](../../src/providers/slProvider.ts) and [`sjostadProvider.ts`](../../src/providers/sjostadProvider.ts) implementations as copy-safe examples rather than inventing a second abstraction.

### 3. Register it

Add the provider in [`src/providers/init.ts`](../../src/providers/init.ts):

```ts
import { exampleProvider } from "./exampleProvider";

providerRegistry.register(exampleProvider);
```

`TransitService` then resolves IDs with the new prefix. Search automatically includes providers whose capabilities declare `search: true`.

A basic provider should require one provider file, one provider test file, and one registration change. Do not modify stores, components, or `TransitService` unless the provider introduces a capability that the existing service does not expose.

### 4. Add focused tests

Create `src/providers/exampleProvider.test.ts`. Cover:

- provider capabilities;
- `ownsStop()` for matching and non-matching IDs;
- mapping from source data to canonical stops/departures;
- `getDepartures()` always returns both `departures` and `stopDeviations`;
- line and direction filtering;
- empty or unavailable source responses;
- abort-signal handling where the source supports it.

Mock the underlying API or file source. Do not make tests depend on live external services.

Run the normal checks:

```bash
pnpm run check
pnpm run test
pnpm run build
```

If the provider adds an external origin, update the CSP `connect-src` list in [`index.html`](../../index.html). If it adds generated static data, wire the generator into the appropriate `predev` or `prebuild` script and document the refresh behavior.

## Add a venue source

Venue discovery is not part of the transit provider abstraction. Add source-specific fetching to [`src/services/venueService.ts`](../../src/services/venueService.ts) and keep the returned shape as `Venue`.

Checklist:

- return a stable source-prefixed ID;
- map coordinates, address, opening hours, price, and category flags;
- check browser CORS support and use the existing proxy configuration only when needed;
- use `persistentCache` for persistent results and the service's existing in-memory coordination;
- preserve relevance sorting and deduplication;
- add unit tests for mapping, filtering, failures, and duplicate results.

Current sources are Supabase for curated beer venues and Overpass/OpenStreetMap for wine and cocktail venues.

## Add an event source

Event fetching belongs in [`src/services/eventService.ts`](../../src/services/eventService.ts). Keep the existing fallback order understandable:

1. shared in-memory result or in-flight request;
2. build-time `public/events-data.json` snapshot;
3. live Visit Stockholm data when available;
4. development-only demo data when no real source is available.

New event sources should return `EventItem[]`, preserve category and location data, and use the shared cache/session behavior. Add a build script only when the source needs a generated static snapshot.

## Cross-cutting requirements

- Keep network mapping in services/providers, not components.
- Pass `AbortSignal` through fetch boundaries when available.
- Return empty results for expected upstream failures; reserve thrown errors for invalid program state.
- Use `TransportType` for UI-facing transport values and `TransportMode` for canonical provider data.
- Keep provider-specific fields inside `providerMetadata`.
- Add user-visible loading, empty, and offline behavior when the new source can be unavailable.
- Update the current architecture/API docs if the data flow, storage, CSP, or deployment behavior changes.
