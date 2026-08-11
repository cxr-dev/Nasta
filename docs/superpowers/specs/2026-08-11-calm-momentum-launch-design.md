# Calm Momentum Launch Screen

## Status and References

Approved visual direction: Direction A v3, light and dark.

- Original direction: `C:\tmp\nasta-launch-wireframe-v2.png`
- Normative animated preview: `.superpowers/brainstorm/1052-1786481336/launch-calm-momentum-v3.html`
- Approved comparison: `.superpowers/brainstorm/1052-1786481336/launch-calm-momentum-v3.png`

The production result must match the 390 × 844 reference measurements below within ±1 CSS pixel, excluding glyph rasterization differences across browser engines.

## Goal and Lifecycle

Replace the current small, dotted-route launch veil with the approved Calm Momentum composition: a large real app mark, a protected wordmark, and a visible journey from Slussen to T-Centralen while departures start.

The veil enriches real loading time only. It never waits for the journey animation.

At application readiness `t0`:

1. In the same task, add the leaving state, set `pointer-events: none`, and start an exact `120ms` opacity fade.
2. Remove the veil on `transitionend`.
3. Also schedule a fallback removal no later than `t0 + 200ms` so a missing event cannot retain the veil.
4. Under `prefers-reduced-motion: reduce`, remove the veil synchronously at `t0`.

## Pre-Svelte Architecture

The veil remains semantic HTML, inline SVG, and inline CSS in `index.html`. It must paint before the Svelte module executes, remain `aria-hidden="true"`, expose no controls, and work offline.

`src/main.ts` owns readiness dismissal only. It must not coordinate or await launch animation state.

The fake time and signal icons in the preview are presentation chrome and are not implemented. The operating system owns the real status bar.

## Exact Theme Tokens

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#f7f7f5` | `#111311` |
| Ink | `#171b18` | `#f5f5ef` |
| Muted | `#555b55` | `rgba(245,245,239,0.66)` |
| Route base | `rgba(23,27,24,0.18)` | `rgba(245,245,239,0.21)` |
| Halo/soft | `rgba(23,27,24,0.10)` | `rgba(245,245,239,0.11)` |

The synchronous theme initializer, root background, body fallback, and veil background must use the same resolved light or dark background. Dark mode must not retain the previous `#111211`; that one-channel mismatch would create a first-frame seam.

All small text must meet WCAG 2.1 AA contrast of at least 4.5:1 against its actual background.

## Exact 390 × 844 Composition

The implementation viewport is full-screen and square-cornered. Rounded phone chrome, border, shadow, and theme labels in the comparison artifact are preview-only.

| Element | Normative declaration or geometry |
| --- | --- |
| Veil | `position: fixed; inset: 0; overflow: hidden` |
| Identity block | `position: absolute; top: 19.5%; left: 0; right: 0; text-align: center` |
| Logo | width `57%` with max-width `222.3px`; natural aspect ratio; centered |
| Light logo filter | `drop-shadow(0 10px 18px rgba(18,23,18,0.12))` |
| Dark logo filter | `invert(1) brightness(1.12) drop-shadow(0 12px 20px rgba(0,0,0,0.26))` |
| Wordmark | margin-top `14px`; Bricolage Grotesque 800; `72px/0.84`; letter-spacing `-0.05em` |
| Loading row | margin-top `18px`; inline-flex; gap `8px`; DM Sans Launch `12px/1.2`, weight 600 |
| Loading mark | `18px × 4px`; pill radius; 50% ink shuttle on soft track |
| Route SVG | `position: absolute; inset: 0; width/height: 100%`; `viewBox="0 0 390 844"`; `preserveAspectRatio="xMidYMid meet"` |
| Base path | width `4px`; round cap; route-base token |
| Active path | width `5px`; round cap; ink token |
| Slussen halo/ring/core | center `(54,650)`; radii `16/9/3`; ring width `4px` |
| T-Centralen halo/ring | center `(340,570)`; radii `16/9`; ring width `4px` |
| Destination muted stroke | `color-mix(in srgb, var(--launch-ink) 38%, transparent)` |
| Slussen label | SVG `(30,678)`; `9px` 700; letter-spacing `0.075em` |
| T-Centralen label | SVG `(286,598)`; `9px` 700; letter-spacing `0.075em` |
| Traveler halo/ring | radii `17/10`; ring width `4px` |
| Traveler arrow | path `M-3 -4 L4 0 L-3 4 Z`; ink fill; automatic tangent rotation |
| Traveler shadow | `drop-shadow(0 2px 4px rgba(0,0,0,0.18))` on the ring |
| Bottom readout | left/right `34px`; bottom `calc(62px + var(--launch-safe-bottom))`; grid columns `auto 1fr auto`; gap `12px`; padding-top `13px`; `1px` top rule |
| Readout separator | height `1px`; route-base token background |
| Readout label | DM Sans Launch `9px/1.2` 700; letter-spacing `0.08em` |
| Readout destination | DM Sans Launch `10px/1.2` 700; letter-spacing `0.025em` |

The visible strings are exactly:

- `Nästa`
- `Hämtar avgångar`
- `SLUSSEN`
- `T-CENTRALEN`
- `NÄSTA STOPP`

Remove the old launch skeleton cards and all of their CSS.

## Exact Route Geometry

Use this identical normalized path for the base path, active path, and traveler `offset-path`:

```text
M -25 686 C 5 676 29 663 54 650 C 120 595 189 687 250 620 C 286 578 316 559 340 570 C 366 581 391 594 420 586
```

The path is segmented at `(54,650)` and `(340,570)`, so it intersects the exact center of both station rings. Tests must assert the literal normalized `d` data, the station `cx/cy` attributes, and the matching CSS `offset-path`; screenshots alone do not prove the geometry.

## Exact Motion

The route and traveler share a `4.8s` loop but intentionally use different curves:

- Active path: `cubic-bezier(0.22,1,0.36,1)`.
- Traveler: `cubic-bezier(0.45,0,0.2,1)`.
- Both progress from 0% through 68%, then hold their completed state through 100%.
- Active path animates `stroke-dasharray` from `0 1000` to `1000 0` with `pathLength="1000"`.
- Traveler animates `offset-distance` from `0%` to `100%`; the nested arrow follows the tangent.
- Destination ring stays muted through 58%, becomes solid and scales to `1.28` at 68%, settles to scale `1` at 78%, and holds through 100%. Use the active route easing; do not bounce.
- Loading shuttle duration is `1.35s`, alternate direction, `cubic-bezier(0.45,0,0.2,1)`.

No animation library or runtime animation JavaScript is added.

## Reduced Motion Terminal State

Under `prefers-reduced-motion: reduce`:

- Set every launch animation and transition to `none`.
- Show the active path fully drawn (`stroke-dasharray: 1000 0`).
- Place the traveler at `offset-distance: 55%`.
- Render the destination ring with solid ink stroke and scale `1`.
- Keep the loading track static with its ink segment centered.
- Remove the veil synchronously on application readiness.

No visible content depends on an animation firing or completing.

## Font and Asset Contract

The approved typography uses two checked-in, OFL-licensed files:

`public/fonts/bricolage-grotesque-latin-800.woff2`

`public/fonts/dm-sans-latin-500-700.woff2`

Declare it before launch styles:

```css
@font-face {
  font-family: "Bricolage Grotesque Launch";
  src: url("%BASE_URL%fonts/bricolage-grotesque-latin-800.woff2") format("woff2");
  font-style: normal;
  font-weight: 800;
  font-display: swap;
}

@font-face {
  font-family: "DM Sans Launch";
  src: url("%BASE_URL%fonts/dm-sans-latin-500-700.woff2") format("woff2");
  font-style: normal;
  font-weight: 500 700;
  font-display: swap;
}
```

The wordmark uses `"Bricolage Grotesque Launch", "Arial Black", sans-serif`. Secondary launch text uses `"DM Sans Launch", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. The system fallback is deliberately reserved and shares the declared line height so the layout does not collapse before the preloaded faces resolve. `font-display: swap` keeps every string visible during a slow first load; the capture contract waits for the exact faces before judging pixel fidelity.

Preload both WOFF2 files with `as="font" type="font/woff2" crossorigin`, preload `%BASE_URL%logosvg.svg`, and use `%BASE_URL%logosvg.svg` as the launch image source. Every launch asset reference in `index.html` uses `%BASE_URL%`, which Vite resolves to `/` in development and `/Nasta/` in production.

The production build and Workbox/service-worker precache manifest must contain all three assets. A warm-installed offline check in a separate Playwright context with service workers explicitly allowed must prove:

- the logo request under `/Nasta/` succeeds and `img.decode()` resolves;
- both font requests under `/Nasta/` succeed;
- `document.fonts.check('800 72px "Bricolage Grotesque Launch"')` is true;
- `document.fonts.check('600 12px "DM Sans Launch"')` is true;
- launch typography makes no remote request.

The existing remote Fontshare stylesheet may continue serving the application, but the launch wordmark cannot depend on it.

## Responsive and Safe-Area Rules

The 390 × 844 composition is normative for portrait heights of at least `700px`.

- Define `--launch-safe-top: env(safe-area-inset-top, 0px)`, `--launch-safe-right`, `--launch-safe-bottom`, and `--launch-safe-left` on the veil. Tests override these variables to emulate non-zero insets.
- Logo width is `min(57vw, 222.3px)` and never comes within `16px` of the left/right safe variables.
- Identity top is `max(19.5svh, calc(var(--launch-safe-top) + 16px))`.
- Bottom readout is at least `28px` above `var(--launch-safe-bottom)`.
- The route may crop beyond the left and right edges; both station circles and labels remain visible.
- At `max-height: 699px` in portrait, cap the logo at `168px`, use a `56px` wordmark, move the identity top to `max(12svh, var(--launch-safe-top) + 16px)`, translate the route upward by `72px`, and place the readout `28px + var(--launch-safe-bottom)` from the bottom.
- In landscape (`orientation: landscape` and `max-height: 520px`), use a split composition. The identity occupies the left half, with logo capped at `128px`, `46px` wordmark, and top `var(--launch-safe-top) + 16px`. The route SVG occupies the right half at `195px × 422px`, vertically centered, with `preserveAspectRatio="xMidYMid meet"`; hide station labels and the readout. This explicit SVG window retains the base path and traveler without the portrait artboard being cropped offscreen or crossing the identity.

Evidence must include 390 × 844, 579 × 1250, 390 × 664, and 844 × 390 viewports. Browser emulation with injected safe variables proves the CSS fallback contract. A physical iOS standalone-PWA pass is required to validate real `env(safe-area-inset-*)` behavior before validation is complete.

## Service Worker Constraint

Do not change the conservative prompt-style service-worker update flow. Do not add `skipWaiting`, `clientsClaim`, or any launch behavior that treats a worker lifecycle event as navigation.

## Deterministic Verification

Create or use a Playwright capture harness that prevents the application module from removing the static launch HTML, then:

1. Wait for `document.fonts.ready` and `img.decode()`.
2. Freeze launch animations at 0% and 68% with negative delays plus `animation-play-state: paused`.
3. Capture frozen light and dark states at 390 × 844 at DPR 1, DPR 2, and DPR 3; compare CSS-pixel bounding boxes against the normative table with ±1 CSS-pixel tolerance and inspect raster crispness at each DPR.
4. Capture 579 × 1250, 390 × 664, and 844 × 390 in both themes to prove responsive rules and non-overlap.
5. Capture reduced motion and assert the exact terminal computed styles.
6. Assert the normalized SVG path, station coordinates, radii, labels, and traveler arrow directly from the DOM.
7. At an incomplete journey phase, trigger readiness and timestamp that pointer events disable at `t0`, opacity reaches the leaving state in the same task, and removal occurs by `t0 + 200ms`; under reduced motion, assert synchronous removal.
8. Run type checking, unit tests, production build, and `verify:build`.
9. Inspect the production precache and warm-installed offline network log for the local logo and font contract.

Implementation and validation are complete only when the automated evidence passes, rendered light/dark captures match the approved v3 composition, and the physical iOS standalone check has passed. If that physical check has not run, implementation may be code-complete but validation remains incomplete.
