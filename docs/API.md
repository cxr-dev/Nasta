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
      "deviation": 0
    }
  ]
}
```

## LocalStorage Keys

- `nasta_routes`: Array of Route objects
- `nasta_settings`: Settings object

## TypeScript Types

See `src/types/` for full type definitions.
