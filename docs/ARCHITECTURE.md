# Architecture

## Overview

Nästa is a frontend-only PWA that uses LocalStorage for persistence and SL Transport API for real-time departure data.

## Data Flow

```
User Action → Svelte Store → Service → API/Storage
                    ↓
              UI Update ← Store Subscribe
```

## Key Components

### Stores

- `routeStore`: Manages routes and stops
- `settingsStore`: Manages app settings (dark mode, refresh interval)
- `departureStore`: Manages departure data and auto-refresh

### Services

- `slApi.ts`: SL Transport API integration
- `storage.ts`: LocalStorage persistence
- `arrivalCalculator.ts`: Arrival time calculation

### Components

- `Header`: App header with edit toggle
- `RouteSelector`: Tab-based route switching
- `DepartureList`: Shows stops and departures
- `ArrivalTime`: Shows calculated arrival
- `StopSearch`: Debounced stop search
- `RouteEditor`: Route/stop management

## PWA

Uses vite-plugin-pwa for:
- Service worker for offline support
- Web app manifest
- Cache strategies for API calls
