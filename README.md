# Nästa

![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat&logo=pwa&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-007EC7.svg?style=flat)

> A minimalist commute dashboard for Stockholm public transport

Nästa helps Stockholm commuters track their daily routes by showing real-time departures from configured stops, calculating arrival times, and providing a simple, mobile-first interface optimized for quick glances while walking or waiting at stops.

**Live → [cxr-dev.github.io/Nasta](https://cxr-dev.github.io/Nasta)**

---

## Features

- **Real-time departures** — Auto-refreshing SL data every 30 seconds (configurable)
- **Route management** — Multiple routes with drag-to-reorder segments and auto-save to LocalStorage
- **Disruption alerts** — Real-time transit disruptions and alerts by severity (info/warning/critical)
- **Hybrid ferry support** — Static timetable fallback for Sjöstadstrafiken ferries when API unavailable
- **PWA installable** — Works offline with cached data, no app store required
- **Arrival calculation** — Sums travel times plus transfer buffers to show expected arrival time
- **Pull-to-refresh** — Manual refresh on mobile with visual feedback and stale data indicator
- **Swipe navigation** — Horizontal swipe to switch between routes on mobile
- **Commute nudges** — Local weekday morning and afternoon reminder notifications
- **Live vehicle tracking** — Shows vehicle stops along selected routes with real-time position updates
- **Dark mode & themes** — 16 color themes, auto-detected system preference with contrast adjustment
- **Bilingual** — Swedish and English with automatic locale detection and language-specific disruption text

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

### Supported Toolchain Matrix

| Package | Supported Version |
|---------|-------------------|
| Node.js | 20+ |
| `svelte` | `^5.55.2` |
| `vite` | `^7.0.0` |
| `@sveltejs/vite-plugin-svelte` | `^7.0.0` |
| `vite-plugin-pwa` | `^1.2.0` |

Keep these versions in a compatible range when upgrading. If a major changes, validate with `pnpm run build` and `pnpm run verify:build` before deploy.

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
pnpm run verify:build
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

### Routes & Segments

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

### Settings

Available in the Settings panel (tap **"Inställningar"**):

| Setting | Options | Default | Purpose |
|---------|---------|---------|---------|
| **Theme** | 16 color palettes | "default" | Visual appearance and colors |
| **Language** | Auto, Swedish, English | "auto" | App UI language |
| **Refresh interval** | 10-60 seconds | 30 seconds | How often to fetch departures |
| **Disruption alerts** | On/Off | Off | Show transit disruptions and alerts |
| **Disruption level** | All, Warning+, Critical only | "all" | Filter disruptions by severity |
| **Disruption language** | Auto, Swedish, English | "auto" | Language for disruption text |
| **Commute nudges** | On/Off | Off | Weekday morning/afternoon notifications |
| **Transfer buffer** | Minutes | 2-5 | Time allowed for transfers between segments |

---

## API Integration

### SL Transport API (Trafiklab)

```
Base URL: https://transport.integration.sl.se/v1

GET /sites?search={query}              → Search stops & stations
GET /sites/{siteId}/departures         → Get real-time departures
GET /journey-planner/{line}            → Get journey stops and patterns
```

### SL Deviations API

```
Base URL: https://deviations.integration.sl.se/v1

GET /messages                          → Get all active disruptions/alerts
```

Departures are enriched with real-time disruptions, severity levels (info/warning/critical), and text in both Swedish and English. Disruptions are cached locally and can be filtered by severity threshold.

### Journey Service

Fetches and caches vehicle stop patterns for lines, enabling live vehicle position tracking along routes. Patterns are cached for 14 days with 5-minute live cache TTL for fresh data.

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
| `src/stores/departureStore.ts` | Departure fetching, hybrid cache+API strategy, auto-refresh with request ID routing |
| `src/stores/deviationStore.ts` | Disruption fetching, segment health tracking, severity thresholding |
| `src/stores/localeStore.ts` | Automatic locale detection, i18n translation store |
| `src/stores/settingsStore.ts` | User preferences: refresh interval, theme, language, notification toggles |
| `src/services/slApi.ts` | SL Transport API client, stop search with result ranking |
| `src/services/slDeviations.ts` | SL Deviations API client, message parsing, severity scoring |
| `src/services/journeyService.ts` | Journey planner, stop patterns, live vehicle position calculation |
| `src/services/departureService.ts` | Routes departures to SL API or static timetable based on source |
| `src/services/staticTimetable.ts` | Sjöstadstrafiken ferry static schedule |
| `src/services/deviationCache.ts` | Disk persistence for disruption data (fallback when API unavailable) |
| `src/services/storage.ts` | LocalStorage persistence for routes, settings, and schedule cache |
| `src/lib/arrivalTime.ts` | Computes expected arrival given departures & travel times |
| `src/lib/departureDisplay.ts` | Merges live and predicted departures, computes minutes remaining |
| `src/lib/departureDeduplication.ts` | Deduplicates arrivals by stable key (avoids double-counting) |
| `src/lib/departureEnrichment.ts` | Adds deviation minutes and source metadata to departures |
| `src/lib/sourceClassification.ts` | Detects external timetable sources (ferries, etc.) |
| `src/lib/cacheLifecycle.ts` | Manages cache eviction and cleanup lifecycle |
| `src/lib/i18n.ts` | Internationalization strings (Swedish & English) |
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
- **E2E tests:** Playwright tests run against built app (`pnpm run test:e2e`)
- **Type safety:** `pnpm run check` runs `svelte-check` with `tsconfig.json`
- **Build smoke:** `pnpm run verify:build` fails if server-only Svelte runtime markers are present in production JS bundles

---

## Development Notes

### Why Svelte 5?

Runes (`$state`, `$derived`, `$effect`, `$props`) provide fine-grained reactivity without boilerplate, smaller bundles, and excellent TypeScript support. The app leverages Svelte 5's component model for clean separation: stores drive state, components are dumb renderers, services encapsulate side effects.

### Hybrid Fetch Strategy

Departure fetching uses a **Network-first with intelligent deduplication** pattern:

1. Route change generates new `requestId` to prevent stale responses
2. Fetch live departures from SL API for all configured stops
3. Fetch cached schedule predictions in parallel
4. Merge results: live data takes priority, cached provides instant display
5. Deduplicate arrivals by stable key (line + destination + time) to avoid double-counting
6. Enrich with deviation minutes and source metadata (live/cached/predicted)
7. Drop responses with mismatched `requestId` to prevent race conditions

This ensures:
- Instant display of cached data even on poor connections
- Fresh live data as soon as available
- No stale data overwrites when switching routes rapidly
- Accurate arrival counts even when live and cached overlap

### Disruption Fetching

Disruptions are fetched from the SL Deviations API:

1. Request active disruptions for the current route's lines and stops
2. Filter by user's severity threshold (info/warning/critical)
3. Compute segment health state (ok/affected/critical)
4. Cache locally; fallback to cached copy if API unavailable
5. Auto-refresh every 60+ seconds during active viewing

Language-specific disruption text is returned based on app locale setting.

### Request ID Routing

To prevent race conditions when users rapidly switch routes:

1. Each route change assigns a new `requestId = route-${id}-${timestamp}`
2. Pending requests pass this ID alongside API calls
3. Store only applies responses with current `requestId`
4. Responses from old requests are silently dropped

This is critical because fetches can take several seconds; without routing, a fast route switcher would see departures from the wrong route overlay on the correct one.

### Route Coupling

When you delete a segment from "Till jobbet", the same-index segment is automatically removed from "Hem". This keeps round-trip routes symmetric. Implemented in `routeStore.ts:removeSegment()`.

### Ferry Detection

Stops matching `luma brygga`, `barnängen`, or `henriksdal` are routed to the static timetable. Detection is case-insensitive and name-based (`isExternalTimetableSource()`).

### Commute Nudges

Optional weekday morning/afternoon reminders:
- Enabled via Settings → "Commute nudges"
- Requests notification permission on first enable
- Triggers on configured weekday hours
- Hidden if browser tab is in background or permission denied

### Live Vehicle Tracking

The `DepartureStrip` component shows vehicle stops along a route:
- Fetches stop patterns from SL Journey Planner API
- Estimates current vehicle position based on elapsed time since departure
- Renders visual progress indicator showing upcoming stops
- Updates position ~every 5 seconds during active viewing

Patterns are cached for 14 days; live positions refresh every 5 minutes.

---

## Deployment

**Host:** GitHub Pages  
**URL:** https://cxr-dev.github.io/Nasta  
**Branch:** `main` (auto-deploy via GitHub Actions)

Workflow: `.github/workflows/deploy.yml`

```
push to main → CI runs type check + tests → vite build → Upload Pages artifact → Deploy
```

The app is served as a static SPA from the `/Nasta/` base path.

### GitHub Pages Deployment Invariants

- `vite.config.ts` production `base` must remain `"/Nasta/"`.
- Service worker paths must be base-aware (`import.meta.env.BASE_URL`) and must not hardcode root paths like `/sw.js`.
- Asset references should remain base-safe and resolve under `/Nasta/` in production output.
- Treat `vite.config.ts` as source of truth for base path behavior.

### Release Checklist

1. `pnpm install --frozen-lockfile`
2. `pnpm run check`
3. `pnpm run test`
4. `pnpm run build`
5. `pnpm run verify:build`
6. `pnpm run test:e2e`
7. `pnpm run preview` and verify `http://localhost:4173/Nasta/` renders correctly

### Troubleshooting: `lifecycle_function_unavailable`

**Symptom**
- White screen in production
- Console error: ``mount(...) is not available on the server``

**Likely cause**
- Client bundle resolved to Svelte server runtime due to incompatible toolchain versions.

**Fix path**
1. Verify `svelte`, `vite`, and `@sveltejs/vite-plugin-svelte` are in the supported matrix.
2. Reinstall and rebuild: `pnpm install --frozen-lockfile && pnpm run build`.
3. Run `pnpm run verify:build` to ensure server-only markers are absent.
4. If a stale service worker was previously installed, clear site data and reload.

---

## Known Limitations

- **SL API only:** Only supports Stockholm public transport (SL). Other agencies/cities not supported.
- **Rate limiting:** SL API rate limits at ~10 req/s (not an issue for typical 2-4 routes, 4-8 stops usage)
- **Transfer complexity:** Routes limited to 2 transfers max (current UI design assumption)
- **Ferry times:** Sjöstadstrafiken times are static; no real-time delay adjustments
- **Departure count:** Shows next 3-5 departures (to keep UI glanceable); does not show all departures
- **Vehicle tracking:** Vehicle position estimation is approximate; based on schedule vs. actual times
- **Browser support:** Requires modern browsers with ES2023, WebWorker, and PWA support (Safari 16.4+, Chrome 90+, Edge 90+, Firefox 91+)
- **Offline limitation:** Ferry timetable cached offline, but live disruptions require network connectivity

---

## Acknowledgements

- Transit data provided by [Trafiklab](https://trafiklab.se) — SL API
- Icons from internal `transportIcons` SVG paths
- Fonts from [Fontshare](https://fontshare.com) — Neue Machina & Satoshi
- Built with ❤️ using Svelte & TypeScript
