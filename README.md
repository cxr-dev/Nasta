# Nästa - Stockholm Commute Tracker

**A minimalist personal commute dashboard for Stockholm public transport (SL).**

**Live** → [cxr-dev.github.io/Nasta](https://cxr-dev.github.io/Nasta)

## Purpose

Nästa helps Stockholm commuters track their daily routes by showing real-time departures from their configured stops, calculating arrival times, and providing a simple mobile-first interface optimized for quick glances while walking or waiting at stops.

## Problem Solved

- Stockholm commuters need to know when their next bus/train/metro/ferry departs without opening multiple apps
- Existing apps are cluttered with ads, unnecessary features, and complex navigation
- Users want a zero-friction, always-available PWA that works offline and loads instantly

## Target Users

- Daily commuters in Stockholm who take SL public transport (bus, metro, train, ferry)
- Users who value speed, simplicity, and minimal visual noise
- People who want a dedicated "app-like" experience via PWA

## Core Features

### 1. Real-Time Departures Display

- Shows next departures from configured stops for each route segment
- Auto-refreshes every 30 seconds
- Displays time until departure (minutes) + planned departure time
- Color-coded transport type icons (bus, train, metro, boat/ferry)

### 2. Route Management

- Two pre-configured routes: "Till jobbet" (to work) and "Hem" (home)
- Each route contains ordered segments (stop → stop with travel time)
- Touch drag reordering for segments on mobile

### 3. Hybrid Ferry Support

- SL API integration for regular transit (bus, train, metro)
- Static timetable fallback for Sjöstadstrafiken ferries (Luma brygga, Barnängen, Henriksdal)
- Automatic detection based on stop names

### 4. Arrival Time Calculation

- Sums travel times across all segments
- Shows expected arrival time at final destination
- Accounts for departure wait time from first stop

### 5. PWA Installation

- Installable as standalone app
- Works offline with cached data
- Cache-busting for automatic updates

## Value Proposition

| Feature                 | User Value                                 |
| ----------------------- | ------------------------------------------ |
| Single screen dashboard | No navigation, instant information         |
| Auto-refresh            | Always accurate, zero manual refresh       |
| Offline support         | Works in tunnel/slow signal areas          |
| PWA installable         | Feels like native app, no app store needed |
| Minimalist design       | Glanceable in sunlight, battery efficient  |
| Touch drag reordering   | Fast route editing on mobile               |

## Technical Architecture

### Tech Stack

- **Framework**: Vite + Svelte + TypeScript
- **Storage**: LocalStorage (routes/settings persisted locally)
- **API**: SL Transport API v1 (Trafiklab)
- **PWA**: vite-plugin-pwa with service worker

### Data Model

```
Route
├── id: string
├── name: string ("tillJobbet" | "hem")
└── segments: Segment[]

Segment
├── id: string
├── fromStop: Stop
├── toStop: Stop
├── line: string (e.g., "76")
├── destination: string (e.g., "Klingsta")
├── transportType: "bus" | "train" | "metro" | "boat"
├── travelTimeMinutes: number
└── departureTime: string (HH:mm, next departure from fromStop)

Stop
├── id: string (siteId from SL API)
├── name: string
├── type: "stop" | "ferry"
└── isStaticFerry: boolean
```

### Key Services

| Service              | Responsibility                               |
| -------------------- | -------------------------------------------- |
| `slApi.ts`           | Search stops, fetch departures, format times |
| `staticTimetable.ts` | Sjöstadstrafiken ferry schedules             |
| `routeStore.ts`      | Route state, segment CRUD, reordering        |
| `departureStore.ts`  | Departure fetching, auto-refresh             |

### Key Components

| Component                  | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `SegmentDepartures.svelte` | Main card showing departure for one segment     |
| `SegmentList.svelte`       | Ordered list of route segments with drag handle |
| `SegmentSearch.svelte`     | Stop search with debounce + ferry badge         |
| `RouteEditor.svelte`       | Full-screen route editing mode                  |
| `Header.svelte`            | App header with logo                            |

## Implementation History

### Bug Fixes (Production Issues Resolved)

1. **PWA caching preventing updates**: Added cache-control headers, disabled service worker caching, added version params to static assets
2. **Time format bug**: SL API returns full ISO timestamps; fixed with `formatTime()` function
3. **Reverse route swapping bug**: fromWork/toWork segments incorrectly shared stops; fixed in routeStore.ts
4. **Manifest 404s**: Referenced non-existent PNG icons; changed to SVG
5. **Departure filtering bug**: Showed all departures instead of filtering by line/destination; fixed in SegmentDepartures.svelte
6. **Search results ordering**: Exact matches not prioritized; improved filterStations() with match priority scoring
7. **Segment name bug**: Search query "barn" created segment named "barn" instead of "Barnängen"; fixed to use actual stop name
8. **Drag reordering bug**: Direct mutation broke Svelte reactivity; fixed to return new arrays
9. **SVG rendering bug**: `{@html}` injection rendered path data as text; wrapped in `<g>` tags

### Design Changes

1. Redesigned segment cards:
   - Transport icon + line number in colored circle
   - Next departure time in 56px bold (primary focus)
   - Second departure in 28px (secondary)
   - From → To in header (once per card)
2. Added SVG logo replacing "Nästa" text
3. Moved "Redigera" button to fixed bottom bar, full width, blue

## API Integration

### SL Transport API

```
Base URL: https://transport.integration.sl.se/v1

GET /sites?search={query}          # Search stops
GET /sites/{siteId}/departures     # Get departures
```

### Static Timetable (Sjöstadstrafiken Ferries)

```
Stops: Luma brygga ↔ Barnängen ↔ Henriksdal
Schedule: Hardcoded in staticTimetable.ts
```

## Deployment

- **Host**: GitHub Pages
- **URL**: https://cxr-dev.github.io/Nasta
- **Auto-deploy**: Push to main branch triggers deployment

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Testing

```bash
npm run test        # Unit tests
npm run test:e2e   # E2E tests
```

## Configuration

Routes are stored in LocalStorage (`nasta_routes`):

1. Tap "Redigera" button (bottom bar)
2. Search for stops using the search bar
3. Add segments with travel times between stops
4. Drag to reorder segments
5. Changes save automatically

## License

MIT
