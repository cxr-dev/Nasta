# Mobile testing

Nästa is primarily used in iPhone Safari and from the Home Screen. Automated
mobile WebKit is the main regression target. It is not a physical iPhone or an
installed-PWA simulator.

## Commands

```sh
pnpm run test:mobile
pnpm run bench:mobile
```

Both build once and test the production `/Nasta/` app. `test:mobile` runs the
Safari feature selection, a smaller Chromium smoke selection, and the mobile
Chromium service-worker tests. The existing `pnpm run test:e2e` includes them
alongside the desktop projects. Do not run test commands concurrently: they
share the preview port and test-results directory.

For an existing fresh build, omit the build step:

```sh
pnpm exec playwright test --project=mobile-safari --project=mobile-chromium --project=pwa-chromium
pnpm exec playwright test --config=playwright.benchmark.config.ts
```

## Coverage and maintenance

Portable tests carry `@mobile-core` (WebKit) and optionally `@mobile-smoke`
(Chromium). The original dedicated gesture, location, and narrow-width files
remain selected. Keep desktop geometry checks out of these tags. Prefer adding
assertions to an existing flow over introducing a second version of it.
`pnpm run check` type-checks the test/configuration code as well as the app.

| Flow | Assertion-bearing tests |
|---|---|
| Saved departures and independent loading | `progressive-departures.spec.ts`: slow stop isolation, local retry, optional-module failure |
| Refresh and recovery | `mobile-core.spec.ts`: downward refresh retains the card; `pwa.spec.ts`: offline schedule and live reconnect |
| Add a stop | `search.spec.ts`: searches and saves a segment; `mobile-critical.spec.ts`: stop, countdown, action controls |
| Journey search, saving, expansion, persistence | `mobile-core.spec.ts`: searches, saves and expands a journey; `saved-card-actions.spec.ts`: multi-leg route overview |
| Edit, remove, Undo | `mobile-core.spec.ts`: legacy numeric stop direction edit survives reload; Remove/Undo survives reload |
| Touch navigation and Back | `mobile-critical.spec.ts`, `native-motion.spec.ts`: page switching, interrupted/reversed settling, station board Back |
| Location and map failures | `location-lifecycle.spec.ts`: explicit opt-in, restored permission, nearby ranking, map-module failure with usable list |
| Disruptions and route stops | `departure-features.spec.ts`: station notice and route-stop disclosure through clock refresh |
| Discovery | `feature-discovery.spec.ts`: mocked venue/event content and tab switching |
| Settings and local data | `locale.spec.ts`, `theme-preferences.spec.ts`, `settings-reset.spec.ts`; `mobile-core.spec.ts`: export, reset, import and reload |
| Sharing and controls | `mobile-core.spec.ts`: native-share-unavailable link copy; `saved-card-actions.spec.ts`: compact mobile actions; `mobile-compat.spec.ts`: readable controls |
| PWA cache and update UI | `pwa.spec.ts`: useful offline data, missing-cache state, reconnection and update-banner dismissal |

`support/mobileTest.ts` prevents optional network services/fonts/map styles
from depending on public availability. Specific API fixtures remain responsible
for the data a flow asserts. This does not verify real provider uptime or real
map imagery. Map worker/tile integration retains its separate regression tests.

The PWA tests allow real service workers and intercept worker network requests
at context level. They seed the real IndexedDB schedule format, verify offline
navigation, and probe that an uncached request fails. Chromium emulation resets
`navigator.onLine` during service-worker navigation, so the fixture explicitly
supplies the offline/online signal as well as disconnecting the network. This
limitation must not be described as physical-iPhone connectivity evidence.

Native permission dialogs, denied-permission recovery in iOS Settings, native
share sheets, safe-area/keyboard behavior on a real phone, and real PWA upgrades
require the physical checklist below. The update-banner test dispatches an
event; it does not prove that a new worker was downloaded and activated.

## Benchmarks

Three scenarios, with Settings and Add reported separately:

1. **First useful departure:** a fresh browser context with saved routes but no
   schedule cache. Navigation start to a visible countdown and dismissed launch
   overlay, observed in the browser across animation frames.
2. **Cached-data reopen:** prime IndexedDB, reload, and hold live responses.
   Finish when a useful countdown and its cached-data status are visible.
3. **First panel opening:** a first Settings/Add click to a visible, enabled
   control in the viewport, followed by a focus assertion.

Five samples each; one worker; no retries; real clock and normal motion. APIs
are mocked with a 100 ms departure-response delay. Fonts are blocked, service
workers are blocked, and the viewport is 390 × 844. Request routing affects HTTP
caching: this is cached **data** reopening, not warm asset or installed-PWA
startup. Numbers describe the desktop runner's WebKit, not iPhone speed.

Reports are `test-results/benchmarks/results.json` (all samples/errors, revision,
dirty-worktree flag, production-index fingerprint, runner/OS/CPU, browser and
conditions) and `summary.md` (median and range). No p95 from five samples.
Comparisons are report-only; broken samples still make the command fail.

`tests/benchmarks/baseline.json` records the reviewed local baseline. The commit
and build fingerprint identify its source state, including the explicit dirty
flag when measured before committing. Compare only matching environment,
browser, and mock conditions. CI/Linux results will not be compared with a
Windows local baseline. Do not silently replace a baseline after a regression.

Initial local baseline (Windows, WebKit 26.5; five samples): first departure
490 ms, cached-data reopen 343 ms, Settings 33 ms, Add 186 ms (medians).
A second sequential run measured 483/338/33/187 ms. The deliberate 500 ms
delay check measured 1010/344/527/684 ms, respectively: cached data remained
independent of the held live response. These are harness checks, not phone
performance promises.

To refresh it, run two quiet, sequential benchmark passes, inspect failures and
variance, and copy the reviewed `results.json` to `baseline.json`. Do this only
for a complete passing report. Keep the previous report when comparing builds.

To verify that the timers respond to actual work, set `BENCH_DELAY_MS=500` and
run one sample per scenario:

```powershell
$env:BENCH_DELAY_MS='500'
pnpm exec playwright test --config=playwright.benchmark.config.ts --repeat-each=1
Remove-Item Env:BENCH_DELAY_MS
```

Cold departure timing must include the extra API delay; cached-data reopening
must still complete while live data is held; panel timing must include the
optional chunk delay. This is a deliberate harness check, not a performance
profile or baseline candidate.

## CI

The existing E2E job includes mobile coverage once, using the same browser
installation and production build. Manually dispatch **Deploy to GitHub Pages**
with `benchmark: true` for validation and a report-only benchmark run. That mode
skips the artifact build/deployment jobs. It uploads `mobile-benchmarks` and
puts the comparison in the workflow summary. Timing regressions do not block;
test/harness failures do. No hosted workflow execution is claimed by local tests.

## Physical iPhone release checklist

Status: **pending until performed**. Record date, commit/build, iPhone model,
iOS version, and Safari versus Home Screen mode. Use one representative phone;
add another only for a reported device-specific problem.

- [ ] Safari: open a saved commute, pull to refresh, switch pages and interrupt
  a swipe. Check that results remain readable and touch response feels immediate.
- [ ] Open Settings/Add and use the keyboard. Check close controls and the final
  action remain reachable in portrait and with safe areas.
- [ ] Test location denied, then re-enable it in iOS Settings and retry.
- [ ] Use the native share sheet and its cancel path.
- [ ] Install/open from Home Screen. Verify safe areas and saved state.
- [ ] After one successful load, enable airplane mode and reopen: useful cached
  departures appear with a freshness label. Repeat without a primed schedule:
  no invented departure appears.
- [ ] Restore connectivity, background/resume, and verify live data replaces the
  cache without losing pages or cards.
- [ ] Open an installed older build after a new deployment. Apply the real update
  and verify the app reopens with saved pages/settings intact.

Record startup/smoothness observations here; battery and physical-device frame
rates are not measured by the automated suite.
