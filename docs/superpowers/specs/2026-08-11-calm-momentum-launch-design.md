# Calm Momentum Launch Screen

## Status

Approved visual direction: Direction A v3, light and dark.

Reference artifacts:

- `C:\tmp\nasta-launch-wireframe-v2.png` — original v2 direction
- `.superpowers/brainstorm/1052-1786481336/launch-calm-momentum-v3.html` — approved animated preview
- `.superpowers/brainstorm/1052-1786481336/launch-calm-momentum-v3.png` — approved light/dark comparison

## Goal

Replace the current small, dotted-route launch veil with the approved Calm Momentum composition. It must feel purpose-built for Nästa: a large real app mark, a protected wordmark, and a journey from Slussen to T-Centralen that visibly progresses while departure data starts.

The launch screen enriches real loading time only. It must disappear as soon as the app is ready and must never impose a minimum display duration.

## Composition

The launch veil remains HTML and inline CSS in `index.html` so it appears before Svelte boots and works offline.

- Full viewport background: `#f7f7f5` in light mode and `#111311` in dark mode.
- Centered identity block begins at roughly 19.5% of the viewport height.
- Use the real `public/logosvg.svg` at 57% of a 390px reference viewport, scaling responsively with a sensible mobile cap.
- Dark mode inverts the logo so its outer tile is light and its illustration is dark.
- The `Nästa` wordmark sits below the mark in Bricolage Grotesque 800. It uses a bundled local WOFF2 file so cold starts do not depend on a remote font request.
- The loading label and a small shuttling bar sit below the wordmark.
- The journey occupies the lower portion of the viewport. It does not cross the logo, wordmark, or loading label.
- A bottom readout says `NÄSTA STOPP` and `T-CENTRALEN`, separated by a hairline.
- Remove the existing departure-card skeletons from the launch veil.

The reference canvas is `390 × 844`. The route path is:

```text
M -25 686
C 5 676 29 663 54 650
C 120 595 189 687 250 620
C 286 578 316 559 340 570
C 366 581 391 594 420 586
```

The Slussen station is centered at `(54, 650)` and T-Centralen at `(340, 570)`. Both circles must be centered exactly on the route.

## Visual Details

Light mode uses near-black ink on the existing neutral light background. Dark mode uses near-white ink on the existing near-black background. Muted route and label colors are derived from the theme ink with alpha; no new decorative palette is introduced.

The route has four distinct states:

1. A quiet full-length base path shows the journey shape immediately.
2. A stronger active path draws from origin toward destination.
3. Slussen is a completed origin: halo, solid ring, and core.
4. T-Centralen begins muted and resolves to a solid arrival ring.

The traveler is a nested circular marker with a small forward arrow. It follows the curve tangent rather than remaining at a fixed rotation. This is the primary handcrafted detail and must remain crisp at device pixel ratios of 2 and 3.

## Motion

- Route draw and traveler motion share one `4.8s` loop and the same progress curve.
- The traveler uses `offset-path` with automatic tangent rotation.
- T-Centralen changes from muted to solid around arrival and briefly scales to `1.28` before settling. No bounce or elastic easing.
- The loading bar shuttles over `1.35s` using a restrained ease and alternating direction.
- The existing veil exit remains a fast opacity transition around `120ms`.
- The app removes the veil immediately when startup is ready, even if the journey is incomplete.

All motion is declarative CSS. No animation library or additional runtime JavaScript is required.

## Reduced Motion

With `prefers-reduced-motion: reduce`:

- Disable all looping and pulsing animations.
- Show the full route as a static line.
- Place the traveler at a stable midpoint.
- Show both station states clearly without arrival scaling.
- Keep the veil exit immediate or use only the existing short opacity transition.

The default content must be visible without relying on an animation finishing.

## Responsive Behavior

- Preserve the approved vertical composition across common phone viewports, including 390 × 844 and the supplied 579 × 1250 screenshot ratio.
- Respect safe-area insets; the identity and route must not collide with the status bar or home indicator.
- On unusually short or landscape viewports, reduce logo and wordmark scale before allowing overlap.
- The route may crop beyond the left and right edges, but its station circles and labels must remain visible.

## Startup and Asset Constraints

- Keep the launch veil offline-safe and pre-Svelte.
- Use `import.meta.env.BASE_URL` semantics through relative public asset paths that work at `/` in development and `/Nasta/` in production.
- Preload the real logo and bundled wordmark font.
- Do not change the conservative prompt-style service-worker update flow.
- Do not infer navigation or reload behavior from the launch animation.

## Accessibility

- The launch veil remains `aria-hidden="true"`; it exposes no controls and does not trap focus.
- Text contrast must meet WCAG AA in both themes.
- The veil must not block the application after startup readiness.
- Reduced-motion behavior is mandatory.

## Verification

1. Run the project checks and production build verification.
2. Render the launch state at 390 × 844 in forced light and forced dark modes before Svelte removes it.
3. Measure the logo, wordmark, route, station circles, labels, and readout against the approved v3 preview.
4. Confirm the SVG path intersects both station centers exactly.
5. Capture a reduced-motion render and confirm the composition remains complete and legible.
6. Confirm the production base path resolves the logo and local font without network access.
7. Confirm startup readiness still removes the veil immediately rather than waiting for animation completion.
