# TrafikLab API Integration Design

**Date:** 2026-03-25  
**Status:** Approved

## Overview

Replace the current SL API integration with TrafikLab Realtime APIs to support all Swedish transit including ferries (ressel.se). Also fix route button labels to show icons with tooltips instead of text.

## 1. Route Button Labels Fix

### Current State
- Buttons display: "Arbete Till arbetet" / "Arbete Hem"
- Shows route name + direction text combined

### Target State
- **To Work button:** Icon + tooltip "Res till arbetet"
- **Home button:** Icon + tooltip "Res hem"

### Implementation
- Modify `RouteSelector.svelte` to:
  1. Remove the text label (`{route.name}`)
  2. Add appropriate icon based on direction (briefcase for work, home for home)
  3. Add `title` attribute for tooltip
  4. Keep accessibility attributes (aria-label)

### Icons to Use
- Work: Briefcase icon (existing transportIcons can be repurposed or add new)
- Home: House icon (simple "home" SVG)

## 2. TrafikLab API Integration

### Current Implementation
- Uses SL API: `transport.integration.sl.se/v1`
- Pre-loads all ~7000 stations on app start
- Local fuzzy search from cached stations
- Gets departures via `/sites/${siteId}/departures`

### Target Implementation
- Use TrafikLab Realtime APIs (free tier - Bronze):
  - **Base URL:** `https://transport.trafiklab.se/api2`
  - **Stop Lookup:** `/v1/stops/name/{query}` - search stops by name
  - **Departure Board:** `/v1/timetable/{stopId}` - get departures

### API Changes

#### New Service File: `src/services/trafikLabApi.ts`

```typescript
// Config
const API_BASE = 'https://transport.trafiklab.se/api2/v1';
const API_KEY = import.meta.env.VITE_TRAFIKLAB_API_KEY;

// Stop search endpoint
GET /v1/stops/name/{query}
// Query params: key, callback (optional), date (optional), time (optional)
// Returns: stops with id, name, lat, lon

// Departure board endpoint  
GET /v1/timetable/{stopId}
// Query params: key, time (optional), date (optional)
// Returns: departures with line number, destination, time, etc.
```

### Data Mapping

| SL API Field | TrafikLab Field |
|--------------|-----------------|
| `site.id` | `stopId` |
| `site.name` | `name` |
| `site.lat` | `lat` |
| `site.lon` | `lon` |
| `line.designation` | `lineNumber` |
| `line.name` | `linePublicName` |
| `direction` | `destination` |
| `timeToDeparture` | `minutes` |
| `expected` | `departureTime` |
| `line.transportMode` | transport type (map to bus/train/metro/boat) |

### Transport Type Mapping
```typescript
function getTransportType(mode: string): TransportType {
  switch (mode?.toLowerCase()) {
    case 'BUS': return 'bus';
    case 'TRAIN': case 'RAIL': case 'TRAM': return 'train';
    case 'METRO': return 'metro';
    case 'BOAT': case 'SHIP': return 'boat';
    default: return 'bus';
  }
}
```

### Removed Functionality
- Remove `loadStations()` - no longer pre-loads all stations
- Remove local caching of 7000+ stations in localStorage
- Remove fuzzy search filter - rely on API

### New Functionality
- `searchStops(query: string)` - calls Stop Lookup API
- `getDepartures(stopId: string)` - calls Departure Board API

### Error Handling
- Handle API errors gracefully with user-friendly messages
- Show loading states during API calls
- Fallback to cached data if API fails (optional)

### Environment Variables
Add to `.env.example`:
```
VITE_TRAFIKLAB_API_KEY=your_api_key_here
```

### Attribution
TrafikLab requires attribution: "Data from Trafiklab.se" (CC-BY license)

## 3. Files to Modify

| File | Change |
|------|--------|
| `src/components/RouteSelector.svelte` | Fix button labels with icons + tooltips |
| `src/services/slApi.ts` | Rename to `trafikLabApi.ts` or create new |
| `.env.example` | Add TrafikLab API key |
| `src/types/departure.ts` | Update types if needed for TrafikLab response |

## 4. Acceptance Criteria

1. **Route buttons** show icons with tooltips, not text labels
2. **Stop search** uses TrafikLab Stop Lookup API (no local pre-load)
3. **Departures** use TrafikLab Departure Board API
4. **Ferry support** works (Sjöstadstrafiken routes visible)
5. **API key** configured via environment variable
6. **Attribution** displayed (small "Trafiklab.se" text in footer)
