# Nästa

Nästa is a glanceable, mobile-first PWA for Stockholm SL departures. It shows configured journeys, live departures, disruptions, arrival estimates, and optional nearby places and events.

**Live app:** [cxr-dev.github.io/nasta](https://cxr-dev.github.io/nasta)

## What it does

- Live SL departures with configurable refresh intervals.
- Saved pages containing ordered journey segments.
- Disruption and station-facility notices with Swedish and English text.
- Cached schedules and a static Sjöstadstrafiken ferry timetable.
- Optional nearby-stop ranking, walking estimates, maps, venues, and events.
- Swedish and English UI, light/dark/system themes, and offline-safe PWA behavior.
- No account or app-owned backend required; no app-store installation needed.

## Stack

- Svelte 5 with runes and TypeScript strict mode.
- Vite and `vite-plugin-pwa`/Workbox.
- LocalStorage for user settings and saved pages.
- IndexedDB for persistent caches and generated share cards.
- Vitest for unit/component tests and Playwright for browser tests.
- GitHub Pages for deployment.

The repository uses Node.js 24 from `.node-version` and pnpm 11.9.0 from `package.json`.

## Development

```bash
pnpm install
pnpm run dev
```

The development server uses `/` as its base path and normally runs at `http://localhost:5173`.

Useful commands:

```bash
pnpm run check          # Svelte and TypeScript checks
pnpm run test           # Unit and component tests
pnpm run test:watch     # Watch mode
pnpm run build          # Production build at /Nasta/
pnpm run verify:build   # Validate the production artifact
pnpm run test:e2e       # Build, preview, and run Playwright
pnpm run preview        # Preview the production build
```

`pnpm run build` also refreshes the generated event snapshot and PNG icons. The E2E preview runs at `http://localhost:4173/Nasta/`.

## Using the app

Open Settings to create pages and add journey segments. A segment contains an origin stop, destination stop, line, direction, transport type, and optional travel time. Changes are saved locally.

Settings include:

- refresh interval, language, and theme preference;
- disruption visibility, severity, and language;
- transport filtering and departure sorting/grouping;
- location services and walking ETA;
- afterwork venues, event discovery, backup/import, and app-data reset.

Location services are opt-in. Nästa only requests a platform location permission after an explicit action and continues to work without it. Browser and installed-PWA permissions are separate and require HTTPS or localhost.

## Data sources

| Source | Use |
| --- | --- |
| SL Transport API | Live departures and stop-level deviations |
| SL Journey Planner API | Stop search, direction lookup, and planned journeys |
| SL Deviations API | Active disruptions and station notices |
| Sjöstadstrafiken timetable | Static ferry departures for supported piers |
| Visit Stockholm | Nearby event data |
| Supabase Edge Function | Curated beer venues |
| Overpass / OpenStreetMap | Wine and cocktail venues |

The browser calls public transit endpoints directly. Event data is also fetched into `public/events-data.json` during builds and refreshed by the scheduled deployment workflow.

## Architecture

```text
App.svelte
  → Svelte stores
  → services and TransitService
  → SL/Sjöstad providers, caches, and browser APIs
  → components
```

Transit providers return canonical domain types from `src/types/transit.ts`. Provider resolution uses the `provider:local-id` format, for example `sl:1234` and `sjostad:luma`.

Read the deeper documentation when you need to change the system:

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API and persistence reference](docs/API.md)
- [Adding a data source](docs/guides/adding-data-sources.md)
- [Design system](DESIGN.md)
- [Product principles](PRODUCT.md)
- [Image credits](CREDITS.md)

## PWA and deployment

Production builds use the `/Nasta/` base path and deploy to GitHub Pages from `main` through `.github/workflows/deploy.yml`.

Workbox caches navigation, SL transport responses, the event snapshot, mood images, and optional map/venue assets. The update flow is intentionally prompted: a new service worker waits until the user chooses to reload.

Before a release, run:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run build
pnpm run verify:build
pnpm run test:e2e
```

## Known limits

- Transit support is currently limited to Stockholm SL and the supported Sjöstadstrafiken ferry timetable.
- Ferry departures are static and have no live delay adjustments.
- Live disruptions and most nearby-data features require network access.
- Location-dependent features are unavailable when the browser or device denies location access.

## License and credits

The repository is MIT licensed. Transit data is provided through Trafiklab. See [CREDITS.md](CREDITS.md) for locally hosted editorial imagery.
