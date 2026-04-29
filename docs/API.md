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
      "expectedDepartureTime": "08:04",
      "deviation": 0,
      "transportMode": "bus"
    }
  ]
}
```

### Get Journey Patterns

```
GET /journey-planner/{lineDesignation}/stops
```

Returns stop sequence for a specific line, used for live vehicle position tracking.

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
        "lines": [{"id": "76", "designation": "76"}],
        "stop_areas": [{"id": "3001", "name": "Sergels torg"}]
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

## LocalStorage Keys

| Key | Type | Example |
|-----|------|---------|
| `nasta_routes` | JSON array | `[{id, name, direction, segments}]` |
| `nasta_settings` | JSON object | `{theme, language, refreshInterval}` |
| `nasta_onboarding_seen` | String | `"true"` |

## TypeScript Types

All TypeScript types are defined in `src/types/`:

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
  directionText: string;
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
  travelTimeMinutes: number;
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
  directionText: string;
  minutes: number;
  time: string;
  source: "live" | "cached" | "predicted";
  expectedAt?: number;
  deviation?: number;
  transportType: TransportType;
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

## Settings Schema

```typescript
interface Settings {
  theme?: string;
  themeVariant?: "A" | "B";
  language?: "auto" | "sv" | "en";
  refreshInterval?: number;
  disruptionAlertsEnabled?: boolean;
  disruptionLanguage?: "auto" | "sv" | "en";
  disruptionSeverityThreshold?: "info" | "warning" | "critical";
  commuteNudgesEnabled?: boolean;
  transferBufferMinutes?: number;
}
