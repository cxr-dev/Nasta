# API Reference

## SL Transport API

Base URL: `https://transport.integration.sl.se/v1`

### Get Departures

```
GET /sites/{siteId}/departures?forecast={minutes}
```

Query parameters:

| Param       | Default | Description                      |
| ----------- | ------- | -------------------------------- |
| `forecast`  | 240     | Forecast window in minutes       |

Response (parsed):

```json
{
  "departures": [
    {
      "line": { "designation": "76", "name": "76", "transport_mode": "bus" },
      "destination": "Klingsta",
      "direction_code": 1,
      "timeToDeparture": 4,
      "scheduled": "2026-06-16T08:00:00",
      "expected": "2026-06-16T08:04:00",
      "display": "4 min",
      "deviation": null,
      "stop_point": { "id": "3001" },
      "journey": { "id": 123456789 },
      "trip": { "id": "987654321" },
      "stop_area": { "id": 3031 }
    }
  ],
  "stop_deviations": [
    {
      "id": 11175981,
      "importance_level": 2,
      "message": "Innerstadsbussarna: Idag påverkas många busslinjer av demonstrationer...",
      "scope": { "stop_areas": [3031], "lines": [2] }
    }
  ]
}
```

> [!NOTE]
> The `line` field is an **object** with `designation` (line number), `name`, and `transport_mode`.
> The `stop_deviations` field provides site-specific context (e.g. why a station is currently empty) that may not always be present in the main Deviations API due to filtering differences.
> The `stop_area.id` is extracted and published to `stopAreaStore` for disruption matching.

## SL Deviations API

Base URL: `https://deviations.integration.sl.se/v1`

### Get Active Disruptions

```
GET /messages?future=true&site={siteId}&line={lineDesignation}
```

Raw response (API shape):

```json
[
  {
    "deviation_case_id": "12345",
    "created": "2026-04-29T10:00:00Z",
    "modified": "2026-04-29T10:30:00Z",
    "priority": {
      "importance_level": 3,
      "influence_level": 2,
      "urgency_level": 2
    },
    "publish": { "from": "...", "upto": "..." },
    "message_variants": [
      {
        "language": "sv",
        "header": "Bussbyte på Sergels torg",
        "details": "Linje 76 går från annan hållplats...",
        "scope_alias": "Sergels torg",
        "weblink": "https://..."
      }
    ],
    "scope": {
      "lines": [{ "id": 76, "designation": "76", "transport_mode": "bus", "name": "76" }],
      "stop_areas": [{ "id": 3001, "name": "Sergels torg" }]
    }
  }
]
```

Severity is determined by:

- `importance_level` (0–4)
- `influence_level` (0–3)
- `urgency_level` (0–3)

Score calculation: `importance * 2 + influence + urgency`

- Score ≥ 8 or importance ≥ 4 or urgency ≥ 3 → **critical**
- Score ≥ 5 or importance ≥ 3 → **warning**
- Otherwise → **info**

Query parameters:

| Param    | Description                                    |
| -------- | ---------------------------------------------- |
| `future` | Include future-dated messages (`true`)         |
| `site`   | Stop area IDs (repeatable)                     |
| `line`   | Line designations (repeatable)                 |

## SL Journey Planner API

Base URL: `https://journeyplanner.integration.sl.se/v2`

### Stop Finder

```
GET /stop-finder?name_sf={query}&any_obj_filter_sf=2&type_sf=any
```

Response shape:

```json
{
  "locations": [
    {
      "coord": [59.320316, 18.072451],
      "disassembledName": "Slussen",
      "id": "9091001000009192",
      "isBest": true,
      "isGlobalId": true,
      "matchQuality": 1000,
      "name": "Stockholm, Slussen",
      "productClasses": [2, 5, 9],
      "properties": {
        "mainLocality": "Stockholm",
        "stopId": "18009192"
      },
      "type": "stop"
    }
  ]
}
```

> [!NOTE]
> - This is the endpoint used for stop search in the app (not `transport.integration.sl.se/v1/sites`)
> - `coord` is `[latitude, longitude]`
> - `productClasses` is an array of integers representing transport modes served at this stop
> - `properties.stopId` is mapped to `siteId` internally (global ID prefix `9091001000` is stripped)
> - `isBest` and `matchQuality` can be used to rank or pre-select results

### Trip

```
GET /trips?originId={originId}&destId={destId}&date={date}&time={time}
```

Used for planned trip fallback and direction lookup when needed.

## LocalStorage Keys

| Key                       | Type        | Example                              | TTL       |
| ------------------------- | ----------- | ------------------------------------ | --------- |
| `nasta_routes`            | JSON array  | `[{id, name, segments}]`            | Permanent |
| `nasta_settings`          | JSON object | `{theme, language, refreshInterval}` | Permanent |
| `nasta_recent_stops`      | JSON array  | `[{siteId, name, type}]`            | Permanent |
| `nasta_stop_area_mapping` | JSON object | `{"3001": "3031"}`                  | Permanent |

> [!NOTE]
> `nasta_location_prompted` was used in earlier versions to track location permission state;
> location preference is now stored inside the `nasta_settings` object as `locationServicesEnabled`.
> A migration path from the legacy key is maintained in `storage.ts`.

## IndexedDB (Deviations Cache)

| Key                | Content                             | TTL     |
| ------------------ | ----------------------------------- | ------- |
| `deviations_cache` | Deviation message array + timestamp | 6 hours |

## TypeScript Types

All TypeScript types are defined in `src/types/`:

### Route / Page Types

```typescript
type TransportType = "bus" | "train" | "metro" | "boat" | "tram";

interface Stop {
  id: string;
  name: string;
  siteId: string;
  coord?: [number, number];           // [lat, lon]
  productClasses?: number[];
  stopAreaId?: string;                 // For disruption matching
}

interface SegmentDirection {
  code: number;
  destination: string;
  stopPointId: string;
  via?: string;                        // Optional intermediate stop
  intermediateStops?: string[];         // Stops between user stop and destination
}

interface Segment {
  id: string;
  line: string;
  lineName: string;
  direction: SegmentDirection;
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
  travelTimeMinutes?: number;
}

interface Page {
  id: string;
  name: string;
  segments: Segment[];
}
```

### Search Types

```typescript
interface SiteSearchResult {
  siteId: string;
  name: string;
  type: "stop" | "station";
  note?: string;
  lat?: number;
  lon?: number;
  productClasses?: number[];
}
```

### Departure Types

```typescript
interface Departure {
  line: string;
  lineName: string;
  destination: string;
  direction_code: number;
  minutes: number;
  time: string;                        // Formatted clock time
  expectedAt?: number;                 // Unix ms timestamp
  deviation?: string;
  transportType: TransportType;
  predicted?: boolean;                 // True if from cached timetable
  journeyRef?: string;                 // SL journey ID for progress strip
  tripId?: string;                     // SL trip ID (cache key fallback)
  display?: string;                    // Raw SL display string
  stop_point_id?: string;              // Stop point from SL API
  isFirstMorning?: boolean;            // First departure after night gap
}
```

### Deviation Types

```typescript
type DeviationSeverity = "info" | "warning" | "critical";

interface DeviationMessageVariant {
  language: string;
  header: string;
  details?: string;
  scopeAlias?: string;
  webLink?: string;
}

interface DeviationScopeLine {
  id: string;
  designation?: string;
  transportMode?: string;
  name?: string;
}

interface DeviationScopeStopArea {
  id: string;
  name?: string;
}

interface DeviationMessage {
  id: string;
  createdAt: number;
  modifiedAt: number;
  publishFrom?: number;               // Unix ms timestamp
  publishTo?: number;                 // Unix ms timestamp
  severity: DeviationSeverity;
  importanceLevel: number;            // 0–4
  influenceLevel: number;             // 0–3
  urgencyLevel: number;               // 0–3
  messageVariants: DeviationMessageVariant[];
  scope: {
    lines: DeviationScopeLine[];
    stopAreas: DeviationScopeStopArea[];
  };
}

type SegmentHealthState = "ok" | "affected" | "critical";

interface SegmentHealth {
  state: SegmentHealthState;
  severity: DeviationSeverity | null;
  reason: string | null;
  messages: DeviationMessage[];
  updatedAt: number;
}

interface StationAlert {
  id: string;
  stations: string[];
  message: string;
  severity: DeviationSeverity;
  segmentIds: string[];
}
```

### Settings Schema

```typescript
interface Settings {
  darkMode: boolean;
  refreshInterval: number;             // ms, default 30000
  hasSwipedRoutes: boolean;
  theme: string;                       // Theme palette ID
  themeVariant: "A" | "B";
  language: "auto" | "sv" | "en";
  disruptionAlertsEnabled: boolean;
  disruptionSeverityThreshold: "info" | "warning" | "critical";
  disruptionLanguage: "sv" | "en" | "auto";
  enabledTransportTypes: TransportType[];
  transportFilterMode: "multi" | "single";
  activeTransportType: TransportType | null;
  locationServicesEnabled: boolean;
  walkingEtaEnabled: boolean;
  afterworkVenuesEnabled: boolean;
  afterworkStartHour: number;          // 0–23
  afterworkTypes: Array<"beer" | "wine" | "cocktail">;
  eventsEnabled: boolean;
  groupDisruptedSegments: boolean;
}
```

## Caching Strategy

1. Fetch deviations every 60+ seconds
2. Cache failures fall back to last successful fetch (up to 6 hours old, stored in IndexedDB)
3. External timetable segments (ferries) always show as "ok"
4. Language-specific text returned based on app locale setting

## Inline Disruptions (Stop Deviations)

1. The SL departure API response includes `stop_deviations` — captured by `slProvider` and stored in `departureStore.stopDeviations` (site-mapped).
2. `SegmentDepartures.svelte` displays a warning icon if a site has disruptions but zero active departures.
3. Clicking the row expands to show the full disruption message(s).

## Architecture Flow

```
User Route Change → App.svelte
            ├─→ departureStore.startAutoRefresh()
            │   ├─→ Check scheduleCache
            │   ├─→ Fetch from transitService.getDepartures()
            │   │      └─→ ProviderRegistry.resolve(stopId)
            │   │              ├─→ slProvider.getDepartures() (wraps slApi)
            │   │              └─→ sjostadProvider.getDepartures() (wraps staticTimetable)
            │   ├─→ Learn from response → timetableCache
            │   ├─→ Update departureStore.data
            │   ├─→ Update departureStore.stopDeviations
            │   └─→ Merge & deduplicate departures
            │
            └─→ deviationStore.startAutoRefresh()
                ├─→ Check deviationCache (IndexedDB)
                └─→ Fetch from slDeviations.ts
```
