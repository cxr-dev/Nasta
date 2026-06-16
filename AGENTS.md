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

CI order (`.github/workflows/deploy.yml`): `check` → `test` → `build` → `verify:build` → `test:e2e` → upload to Pages.

## Quirks & conventions

- **pnpm only.** `packageManager: "pnpm@9.15.0"`. Stale `package-lock.json` is gitignored — delete it if you see it.
- **No linter, no formatter.** TypeScript `strict: true` is the only code quality enforcement.
- **Svelte 5 Runes.** Stores use module-level `$state()` + manual subscriber arrays — *not* `svelte/store` writable/derived (except `stopAreaStore` which uses legacy writable). Stores export either an object with methods (`departureStore`, `deviationStore`) or bare functions (`pageStore`, `settingsStore`, `localeStore`). Rune module files use the `.svelte.ts` extension.
- **Base path** is `/` in dev, `/Nasta/` in production (GitHub Pages). Always use `import.meta.env.BASE_URL` for asset/service worker paths. `verify-build.mjs` enforces this in CI.
- **PWA service worker only in preview/production** — `vite-plugin-pwa` `devOptions.enabled: false`.
- **`prebuild` hook** runs `scripts/generate-png-icons.mjs` + `scripts/fetch-events-data.mjs` automatically before every `build`. The latter generates `public/events-data.json` (gitignored) — a static snapshot of Visit Stockholm events for offline use.
- **SL Transport API is public** — no API key needed. Fetched directly from browser.
- **Sjostadstrafiken ferries** are detected by stop name and served from a hardcoded schedule (`staticTimetable.ts`) instead of the SL API.
- **Request ID routing** — route changes generate `requestId` values; stale API responses from earlier routes are silently dropped (prevents race conditions on fast route switching).
- **CSP is a `<meta>` tag in `index.html`** (not an HTTP header). Update `connect-src` when adding new API origins (especially for feature discovery: Supabase, Overpass, Visit Stockholm, corsproxy.io).
- **No `<svelte:head>`** — all meta tags live in `index.html`.
- **Dark mode default.** `defaultSettings.darkMode = true`.
- **Env vars are all optional** (`VITE_*`). No `.env` file needed. `VITE_SUPABASE_ANON_KEY`, `VITE_USE_CORS_PROXY`, `VITE_CORS_PROXY_BASE` exist but are optional.
- **`maplibre-gl`** is dynamically imported in `MapPreview.svelte` so it's code-split automatically.
- **`opening_hours`** dependency used for venue hours parsing in feature discovery.
- **Feature discovery** uses three external APIs: Visit Stockholm (events, CORS-enabled), Supabase Edge Function (beer venues, needs `VITE_SUPABASE_ANON_KEY`), Overpass API (OSM queries for wine/cocktail venues).

## Testing

- **Unit tests** (`pnpm test`): vitest with jsdom, setup in `vitest.setup.ts` (mocks `globalThis.localStorage` with a `vi.fn()` object). Tests are `*.test.ts` co-located with source. `@testing-library/svelte` is available for component tests.
- **E2E tests** (`pnpm run test:e2e`): Playwright in `tests/e2e/`. Service workers blocked (`serviceWorkers: "block"`) so `page.route()` mocks work. Timezone: `Europe/Stockholm`, locale: `en-US`. CSS animations disabled in `beforeEach`. LocalStorage seeded via `page.addInitScript()` (bypasses onboarding). Web server: `vite preview` on port 5173. Mock pattern: `**/*.integration.sl.se/**` for SL API, also stub `izrgqxgsuhogrukisfrd.supabase.co` for venue prefetches.

## Design constraints

From `.impeccable.md`: no gradient text, no side-stripe borders, no glassmorphism. Mobile-first, glanceable UI. Light mode primary. No decorative fluff.

## Skills & AI tools

Skills are loaded via the `skill` tool. Key project-relevant skills:

- **`impeccable`** (`.agents/skills/impeccable/`) — UI design, critique, polish. Sub-commands: `craft`, `audit`, `shape`, `polish`, `critique`, `colorize`, `harden`, `clarify`, and more (see `reference/`).
- **`design-taste-frontend`** (`.agents/skills/design-taste-frontend/`) — Anti-slop frontend for landing pages, portfolios, redesigns.
- **`svelte-code-writer`** (`.agents/skills/svelte-code-writer/`) — Svelte 5 docs lookup and code analysis.
- **`svelte-core-bestpractices`** (`.agents/skills/svelte-core-bestpractices/`) — Svelte 5 performance and pattern guidance.
- **`gsap`** (`.agents/skills/gsap/`) — GSAP animation reference (used by impeccable animate sub-command).

### opencode MCP servers

Configured in `.opencode/opencode.json`:
- **Playwright MCP** (`@playwright/mcp`) — browser automation for E2E debugging.
- **Svelte MCP** (`@sveltejs/mcp`) — Svelte 5 docs, component analysis, Runes-aware code review.

LSP (Svelte + TypeScript) is enabled via `"lsp": true`.

## Architecture

`App.svelte` → stores (`pageStore`, `departureStore`, `deviationStore`, `settingsStore`, `localeStore`, `stopAreaStore`) → services (SL API, caching, geo, static timetable, deviation cache, venue/event prefetching) → components. Persistence is LocalStorage + IndexedDB (deviations cache). See `docs/ARCHITECTURE.md` for data flow details.
