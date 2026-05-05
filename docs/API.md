# API Reference

## SL Transport API

Base URL: `https://transport.integration.sl.se/v1`

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
      "expectedDepartureTime": "08:04",
      "deviation": 0,
      "transportMode": "bus"
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
> The `stop_deviations` field provides site-specific context (e.g. why a station is currently empty) that may not always be present in the main Deviations API due to filtering differences.

## SL Deviations API

Base URL: `https://deviations.integration.sl.se/v1`

### Get Active Disruptions

```
GET /messages?transport_modes={modes}&scope_stop_areas={siteIds}
```

Response:

```json
{
  "messages": [
    {
      "deviation_case_id": "12345",
      "created": "2026-04-29T10:00:00Z",
      "modified": "2026-04-29T10:30:00Z",
      "priority": {
        "importance_level": 3,
        "influence_level": 2,
        "urgency_level": 2
      },
      "message_variants": [
        {
          "language": "sv",
          "header": "Bussbyte på Sergels torg",
          "details": "Linje 76 går från annan hållplats...",
          "weblink": "https://..."
        }
      ],
      "scope": {
        "lines": [{ "id": "76", "designation": "76" }],
        "stop_areas": [{ "id": "3001", "name": "Sergels torg" }]
      }
    }
  ]
}
```

Severity is determined by:

- `importance_level` (0-4)
- `influence_level` (0-3)
- `urgency_level` (0-3)

Score calculation: `importance * 2 + influence + urgency`

- Score ≥ 8 or importance ≥ 4 → **critical**
- Score ≥ 5 or importance ≥ 3 → **warning**
- Otherwise → **info**

## SL Journey Planner API

Base URL: `https://journeyplanner.integration.sl.se/v2`

### Stop Finder

`GET /stop-finder?name_sf={query}&any_obj_filter_sf=2&type_sf=any`

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
> - `properties.stopId` is the stop identifier used internally
> - `isBest` and `matchQuality` can be used to rank or pre-select results

## LocalStorage Keys

| Key                       | Type        | Example                              |
| ------------------------- | ----------- | ------------------------------------ |
| `nasta_routes`            | JSON array  | `[{id, name, direction, segments}]`  |
| `nasta_settings`          | JSON object | `{theme, language, refreshInterval}` |
| `nasta_onboarding_seen`  | String      | `"true"`                             |
| `nasta_location_prompted`| String      | `"enabled"` or `"skipped"`           |

## TypeScript Types

All TypeScript types are defined in `src/types/`:

### Search Types

```typescript
interface StopFinderLocation {
  coord: [number, number]; // [lat, lon]
  disassembledName: string;
  id: string;
  isBest: boolean;
  isGlobalId: boolean;
  matchQuality: number;
  name: string;
  productClasses: number[];
  properties: {
    mainLocality: string;
    stopId: string;
  };
  type: string;
}

interface StopFinderResponse {
  locations: StopFinderLocation[];
}
```

### Route Types

```typescript
interface Route {
  id: string;
  name: string;
  direction: "toWork" | "fromWork";
  segments: Segment[];
}

interface Segment {
  id: string;
  line: string;
  lineName: string;
  direction: {
    code: number;
    destination: string;
    stopPointId: string;
  };
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
  travelTimeMinutes?: number;
  transferBufferMinutes?: number;
}

interface Stop {
  id: string;
  name: string;
  siteId: string;
}

type TransportType = "bus" | "train" | "metro" | "boat";
```

### Departure Types

```typescript
interface Departure {
  line: string;
  lineName: string;
  destination: string;
  direction_code: number;
  minutes: number;
  time: string;
  expectedAt?: number;
  deviation?: string;
  transportType: TransportType;
  predicted?: boolean;
  journeyRef?: string;
  tripId?: string;
  display?: string;
  stop_point_id?: string;
  isFirstMorning?: boolean;
}
```

### Deviation Types

```typescript
type DeviationSeverity = "info" | "warning" | "critical";

interface DeviationMessage {
  id: string;
  createdAt: number;
  modifiedAt: number;
  severity: DeviationSeverity;
  messageVariants: DeviationMessageVariant[];
  scope: {
    lines: DeviationScopeLine[];
    stopAreas: DeviationScopeStopArea[];
  };
}

interface SegmentHealth {
  state: "ok" | "affected" | "critical";
  severity: DeviationSeverity | null;
  reason: string | null;
  messages: DeviationMessage[];
  updatedAt: number;
}
```

### Caching Strategy

1. Fetch deviations every 60+ seconds
2. Cache failures fall back to last successful fetch (up to 6 hours old)
3. External timetable segments (ferries) always show as "ok"
4. Language-specific text returned based on app locale setting

### Inline Disruptions (Stop Deviations)

1. The `slApi.getDepartures` call captures `stop_deviations` from the real-time response.
2. These are stored in `departureStore.stopDeviations` (site-mapped).
3. `SegmentDepartures.svelte` displays a warning icon if a site has disruptions but zero active departures.
4. Clicking the row expands to show the full disruption message(s).

### Architecture Flow

```
User Route Change → App.svelte
            ├─→ departureStore.startAutoRefresh()
            │   ├─→ Check departureCache
            │   ├─→ Fetch from slApi.ts (returns departures + stop_deviations)
            │   ├─→ Update departureStore.data
            │   ├─→ Update departureStore.stopDeviations
            │   └─→ Merge & deduplicate departures
            │
            └─→ deviationStore.startAutoRefresh()
                ├─→ Check deviationCache
                └─→ Fetch from slDeviations.ts
```

## Settings Schema

```typescript
interface Settings {
  darkMode: boolean;
  refreshInterval: number;
  funMode: boolean;
  hasSwipedRoutes: boolean;
  showNotifications: boolean;
  theme: string;
  themeVariant: "A" | "B";
  language: "auto" | "sv" | "en";
  disruptionAlertsEnabled: boolean;
  disruptionSeverityThreshold: "info" | "warning" | "critical";
  disruptionLanguage: "sv" | "en" | "auto";
  commuteNudgesEnabled: boolean;
  homeAnchor: string;
  workAnchor: string;
  enabledTransportTypes: TransportType[];
}
```
