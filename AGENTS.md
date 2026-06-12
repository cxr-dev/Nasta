# AGENTS.md — Nasta

## Project

Frontend-only PWA for Stockholm SL commuter departures. Built with Svelte 5 (Runes) + TypeScript strict. No SSR, no backend.

## Quick start

```sh
pnpm install
pnpm run dev        # Vite dev server, base="/"
pnpm run build      # production build to dist/, base="/Nasta/"
pnpm run check      # svelte-check type checking
pnpm test           # Vitest unit tests (jsdom)
pnpm run test:e2e   # Playwright E2E (uses `vite preview`)
pnpm run preview    # preview production build locally
```

CI order: `check` → `test` → `build` → `verify:build` → `test:e2e`.

## Quirks & conventions

- **pnpm only.** `packageManager: "pnpm@9.15.0"`. There is a stale `package-lock.json` — ignore it.
- **No linter, no formatter.** TypeScript `strict: true` is the only code quality enforcement.
- **Svelte 5 Runes.** Stores use module-level `$state()` + manual subscriber arrays — *not* `svelte/store` writable/derived. Rune module files use the `.svelte.ts` extension.
- **Base path** is `/` in dev, `/Nasta/` in production (GitHub Pages). Always use `import.meta.env.BASE_URL` for asset/service worker paths. `verify-build.mjs` enforces this in CI.
- **PWA service worker only in preview/production** — `vite-plugin-pwa` `devOptions.enabled: false`.
- **`prebuild` hook** runs `scripts/generate-png-icons.mjs` (requires `sharp`) automatically before every `build`.
- **SL Transport API is public** — no API key needed. Fetched directly from browser.
- **Sjostadstrafiken ferries** are detected by stop name and served from a hardcoded schedule (`staticTimetable.ts`) instead of the SL API.
- **Request ID routing** — route changes generate `requestId` values; stale API responses from earlier routes are silently dropped (prevents race conditions on fast route switching).
- **CSP is a `<meta>` tag in `index.html`** (not an HTTP header). Update `connect-src` when adding new API origins.
- **No `<svelte:head>`** — all meta tags live in `index.html`.
- **Dark mode default.** `defaultSettings.darkMode = true`.
- **Env vars are all optional** (`VITE_*`). No `.env` file needed.
- **Line endings** are normalized via `.gitattributes` (`* text=auto`). LF in the repo, platform-native on checkout.
- **`maplibre-gl`** is dynamically imported in `MapPreview.svelte` so it's code-split automatically.

## Testing

- **Unit tests** (`pnpm test`): vitest with jsdom, setup in `vitest.setup.ts` (mocks `localStorage` on `globalThis`). Tests are `*.test.ts` co-located with source. `@testing-library/svelte` is available for component tests.
- **E2E tests** (`pnpm run test:e2e`): Playwright in `tests/e2e/`. Service workers blocked (`serviceWorkers: "block"`) so `page.route()` mocks work. Timezone: `Europe/Stockholm`, locale: `en-US`. CSS animations disabled in `beforeEach`. LocalStorage seeded via `page.addInitScript()` (bypasses onboarding). Web server: `vite preview` on port 5173.

## Design constraints

From `.impeccable.md`: no gradient text, no side-stripe borders, no glassmorphism. Mobile-first, glanceable UI. Light mode primary. No decorative fluff.

## Architecture

`App.svelte` → stores (departure, deviation, page, settings, locale) → services (SL API, caching, geo, static timetable) → components. Persistence is LocalStorage + IndexedDB (deviations cache). See `docs/ARCHITECTURE.md` for data flow details.
