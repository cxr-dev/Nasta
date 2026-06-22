# AGENTS.md — Nasta

## Project

Frontend-only PWA for Stockholm SL commuter departures. Svelte 5 (Runes) + TypeScript strict. No SSR, no backend.

## Commands

```sh
pnpm install              # must use pnpm (packageManager: "pnpm@9.15.0")
pnpm run dev              # Vite dev server, base="/". predev hook fetches events-data.json
pnpm run build            # production build to dist/, base="/Nasta/". prebuild: generate-png-icons + fetch-events-data
pnpm run check            # svelte-check type checking (run before test)
pnpm test                 # Vitest unit tests (jsdom)
pnpm run test:watch       # Vitest in watch mode
pnpm run test:e2e         # Playwright E2E — builds first, then tests against vite preview
pnpm run verify:build     # post-build verification (checks /Nasta/ base path, no SSR runtime leaks)
pnpm run preview          # preview production build locally
```

CI order (`.github/workflows/deploy.yml`): `check` → `test` → `build` (with `VITE_COMMIT_SHA`) → write `version.json` → `verify:build` → `test:e2e` → deploy to Pages. CI also runs on cron (06:00 + 10:00 UTC) to refresh events-data.json.

## Quirks & conventions

- **pnpm only.** `packageManager: "pnpm@9.15.0"`, `node-linker=hoisted` (`.npmrc`). Stale `package-lock.json` is gitignored — delete if found.
- **No linter, no formatter.** TypeScript `strict: true` + `checkJs: true` is the only enforcement.
- **Svelte 5 Runes.** All stores use module-level `$state()` + manual subscriber arrays — *not* `svelte/store` writable/derived. Stores export either an object with methods (`departureStore`, `deviationStore`) or bare functions (`pageStore`, `settingsStore`, `localeStore`, `stopAreaStore`). Rune module files use `.svelte.ts` extension.
- **Base path** is `/` in dev, `/Nasta/` in production (GitHub Pages). Always use `import.meta.env.BASE_URL` for asset/service worker paths. `verify-build.mjs` enforces this in CI.
- **PWA service worker only in preview/production** — `vite-plugin-pwa` `devOptions.enabled: false`.
- **`prebuild` hook** runs `scripts/generate-png-icons.mjs` + `scripts/fetch-events-data.mjs` automatically before every `build`. `predev` hook runs `fetch-events-data.mjs` too. Output: `public/events-data.json` (gitignored, NetworkFirst in SW runtime cache).
- **SL Transport API is public** — no API key needed. Fetched directly from browser.
- **Sjostadstrafiken ferries** detected by stop name, served from hardcoded schedule (`staticTimetable.ts`) instead of SL API.
- **Request ID routing** — route changes generate `requestId` values; stale API responses from earlier routes silently dropped (prevents race conditions on fast route switching).
- **CSP is a `<meta>` tag in `index.html`** (not an HTTP header). Update `connect-src` when adding new API origins (Supabase, Overpass, Visit Stockholm, corsproxy.io).
- **No `<svelte:head>`** — all meta tags live in `index.html`.
- **Dark mode default.** `defaultSettings.darkMode = true`.
- **Env vars all optional** (`VITE_*`). No `.env` file needed. `VITE_SUPABASE_ANON_KEY`, `VITE_USE_CORS_PROXY`, `VITE_CORS_PROXY_BASE` exist but optional.
- **`maplibre-gl`** dynamically imported in `MapPreview.svelte` — code-split automatically.
- **`opening_hours`** dependency used for venue hours parsing in feature discovery.
- **Feature discovery** uses three external APIs: Visit Stockholm (events, CORS-enabled), Supabase Edge Function (beer venues), Overpass API (OSM wine/cocktail venues).
- **CSS transformer** is `lightningcss` (not PostCSS). Vite config: `css.transformer: "lightningcss"`.
- **SL timestamps** are timezone-naive Stockholm local time. `parseSlTimestamp()` in `slApi.ts` handles DST-aware conversion.

## Testing

- **Unit tests** (`pnpm test`): vitest with jsdom, `resolve.conditions: ['browser']`. Setup in `vitest.setup.ts` mocks `globalThis.localStorage` with a `vi.fn()` object. Tests are `*.test.ts` co-located with source. `@testing-library/svelte` available for component tests.
- **E2E tests** (`pnpm run test:e2e`): Playwright in `tests/e2e/`. `fullyParallel: false`, `workers: 1` (CI) / `2` (local). Service workers blocked (`serviceWorkers: "block"`) so `page.route()` mocks work. Timezone: `Europe/Stockholm`, locale: `en-US`. CSS animations disabled in `beforeEach`. LocalStorage seeded via `page.addInitScript()` (bypasses onboarding). Web server: `vite preview` on port 5173. Mock pattern: `**/*.integration.sl.se/**` for SL API, also stub `izrgqxgsuhogrukisfrd.supabase.co` for venue prefetches.

## Design constraints

From `.impeccable.md`: no gradient text, no side-stripe borders, no glassmorphism. Mobile-first, glanceable UI. Light mode primary. No decorative fluff.

## Architecture

`App.svelte` → stores (`pageStore`, `departureStore`, `deviationStore`, `settingsStore`, `localeStore`, `stopAreaStore`) → services (SL API, caching, geo, static timetable, deviation cache, venue/event prefetching) → components. Persistence: LocalStorage + IndexedDB (deviations cache). See `docs/ARCHITECTURE.md` for data flow.
