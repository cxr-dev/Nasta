# Nästa

![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat&logo=pwa&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-007EC7.svg?style=flat)

> A minimalist commute dashboard for Stockholm public transport

Nästa helps Stockholm commuters track their daily routes by showing real-time departures from configured stops, calculating arrival times, and providing a simple, mobile-first interface optimized for quick glances while walking or waiting at stops.

**Live → [cxr-dev.github.io/Nasta](https://cxr-dev.github.io/Nasta)**

---

## Features

- **Real-time departures** — Auto-refreshing SL data every 30 seconds (configurable)
- **Route management** — Two pre-configured routes ("Till jobbet" / "Hem") with touch drag reordering
- **Hybrid ferry support** — Static timetable fallback for Sjöstadstrafiken ferries when API unavailable
- **PWA installable** — Works offline with cached data, no app store required
- **Arrival calculation** — Sums travel times plus transfer buffers to show expected arrival time
- **Pull-to-refresh** — Manual refresh on mobile with visual feedback
- **Swipe navigation** — Horizontal swipe to switch between routes on mobile
- **Dark mode & themes** — 16 color themes, auto-detected system preference
- **Bilingual** — Swedish and English with automatic locale detection

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | [Svelte 5](https://svelte.dev) (Runes) |
| Language | [TypeScript](https://typescriptlang.org) |
| Build Tool | [Vite](https://vitejs.dev) |
| PWA | [vite-plugin-pwa](https://vite-plugin-pwa.netlify.app) + Workbox |
| Testing | [Vitest](https://vitest.dev) (unit), [Playwright](https://playwright.dev) (e2e) |
| Hosting | [GitHub Pages](https://pages.github.com) |
| API | [SL Transport API](https://trafiklab.se/api/sl-public-transport/) (Trafiklab) |
| Persistence | LocalStorage |

---

## Getting Started

### Prerequisites

- Node.js 18 or higher

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm run dev
```

Runs the dev server at `http://localhost:5173` (or next available port).

### Build

```bash
pnpm run build
```

Creates a production-ready static build in the `dist/` directory.

### Testing

```bash
pnpm test              # Run unit tests (Vitest)
pnpm run test:watch    # Watch mode
pnpm run test:e2e      # End-to-end tests (Playwright)
```

### Type Check

```bash
pnpm run check     # Run svelte-check
```

---

## Configuration

Routes are stored in LocalStorage under `nasta_routes`. Each route contains:

- `id` — unique identifier
- `name` — display name (e.g., "Arbete")
- `direction` — `"toWork"` or `"fromWork"`
- `segments` — ordered array of travel segments

Each segment defines:

- `fromStop` / `toStop` — with `id`, `name`, `siteId` (SL stop ID)
- `line` — transit line number (e.g., `"76"`)
- `directionText` — final destination label
- `transportType` — `"bus"`, `"train"`, `"metro"`, or `"boat"`
- `travelTimeMinutes` — estimated travel duration
- `transferBufferMinutes` — optional transfer wait time between segments

**To edit routes:**
1. Tap the **"Redigera"** button (bottom bar)
2. Search for stops using the debounced search input
3. Add segments between stops and set travel time
4. Drag to reorder segments on mobile
5. Changes save automatically to LocalStorage

---

## API Integration

### SL Transport API (Trafiklab)

```
Base URL: https://transport.integration.sl.se/v1

GET /sites?search={query}          → Search stops & stations
GET /sites/{siteId}/departures     → Get real-time departures
```

The app queries departures for each configured stop, filters by line/destination, and displays the next few departures. Times are formatted to `HH:mm` and enriched with deviation information when available.

### Static Timetable (Sjöstadstrafiken Ferries)

For the Luma brygga ↔ Barnängen ↔ Henriksdal ferry line, the SL API does not return data. Nästa falls back to a hardcoded weekday/weekend schedule defined in `src/services/staticTimetable.ts`. Ferry stops are automatically detected by name and the static schedule is used instead of the live API.

---

## Architecture

### Data Flow

```
User Action → Svelte Store → Service → API/Storage
                    ↓
              UI Update ← Store Subscribe
```

### Core Modules

| Module | Responsibility |
|--------|----------------|
| `src/stores/routeStore.ts` | Route & segment CRUD, reordering, shared to/from work coupling |
| `src/stores/departureStore.ts` | Departure fetching, hybrid cache+API strategy, auto-refresh |
| `src/services/slApi.ts` | SL Transport API client, stop search ranking |
| `src/services/staticTimetable.ts` | Sjöstadstrafiken ferry static schedule |
| `src/services/departureService.ts` | Dispatches to SL API or static timetable |
| `src/services/storage.ts` | LocalStorage persistence for routes & settings |
| `src/lib/arrivalTime.ts` | Computes expected arrival given departures & travel times |
| `src/lib/departureDisplay.ts` | Merges live and predicted departures, computes minutes remaining |
| `src/themes.ts` | 16 theme palettes with automatic contrast adjustment |

### PWA & Caching

- Service worker auto-registers on load (`src/main.ts` + `vite-plugin-pwa`)
- **Runtime caching:**
  - Navigation requests — Network First (30-entry cache)
  - SL `/sites` endpoint — Stale-While-Revalidate (50-entry, 24h TTL)
  - SL `/departures` endpoint — Network First (20-entry, 60s TTL)
- Static assets aggressively cached with `workbox-window`
- Cache-busting via hashed filenames in build output
- Update flow: `controllerchange` listener triggers page reload

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for deeper dive.

---

## Design

### UI Principles

- **Glanceable:** Largest number on screen is minutes until departure
- **Minimalist:** Zero ads, no account required, single-screen dashboard
- **Mobile-first:** Touch-friendly targets, pull-to-refresh, swipe gestures, safe-area insets
- **Offline-ready:** Works in tunnels or areas with poor signal (ferry timetable always cached)

### Typography

- **Display:** [Neue Machina](https://fontshare.com/neue-machina) (bold, condensed, for headings and numbers)
- **Body:** [Satoshi](https://fontshare.com/satoshi) (clean, readable, for labels and UI)

Both loaded asynchronously from [Fontshare](https://fontshare.com) to avoid render-blocking.

### Themes

16 built-in color palettes toggle via settings (toggle in-app). Themes dynamically compute light/dark contrast and update CSS custom properties on `:root`. Border, text, and surface colors automatically adapt to background luminance.

See [`src/themes.ts`](src/themes.ts) for the full palette list.

---

## Testing

- **Unit tests:** Vitest +Testing Library for Svelte (`*.test.ts`)
- **E2E tests:** Playwright tests run against built app (`npm run test:e2e`)
- **Type safety:** `npm run check` runs `svelte-check` with `tsconfig.json`

---

## Development Notes

### Why Svelte 5?

Runes (`$state`, `$derived`, `$effect`, `$props`) provide fine-grained reactivity without boilerplate, smaller bundles, and excellent TypeScript support. The app leverages Svelte 5's component model for clean separation: stores drive state, components are dumb renderers, services encapsulate side effects.

### Hybrid Fetch Strategy

Departure fetching uses a **cache-first, API-enrich** pattern:

1. Check local schedule cache (`src/services/scheduleCache.ts`) for each segment
2. Display cached data immediately (instant load)
3. In parallel, fetch live SL API for those stops
4. Merge: keep API times, overlay any cached deviations

This ensures the UI is always populated (even offline) while staying fresh.

### Route Coupling

When you delete a segment from "Till jobbet", the same-index segment is automatically removed from "Hem". This keeps round-trip routes symmetric. Implemented in `routeStore.ts:removeSegment()`.

### Ferry Detection

Stops matching `luma brygga`, `barnängen`, or `henriksdal` are routed to the static timetable. Detection is case-insensitive and name-based (`isSjostadstrafikenStop()`).

---

## Deployment

**Host:** GitHub Pages  
**URL:** https://cxr-dev.github.io/Nasta  
**Branch:** `main` (auto-deploy via GitHub Actions)

Workflow: `.github/workflows/deploy.yml`

```
push to main → CI runs type check + tests → vite build → Upload Pages artifact → Deploy
```

The app is served as a static SPA from the `/Nasta/` base path. Svelte adapter generates `404.html` fallback for client-side routing.

---

## Known Limitations

- SL API rate limits: ~10 req/s (not an issue for typical 2-route, 4-stop usage)
- No support for trips with more than 2 transfers (out of scope)
- Ferry times are static — no real-time adjustments for delays
- Only Swedish (SL) public transport; other agencies not supported

---

## Acknowledgements

- Transit data provided by [Trafiklab](https://trafiklab.se) — SL API
- Icons from internal `transportIcons` SVG paths
- Fonts from [Fontshare](https://fontshare.com) — Neue Machina & Satoshi
- Built with ❤️ using Svelte & TypeScript
