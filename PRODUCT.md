# Product

## Register

product

## Users

Daily Stockholm commuters who take SL public transport (bus, metro, train, ferry). Users check departures while walking or waiting at stops — often outdoors in sunlight, one-handed on mobile, with limited attention span. They want a "glanceable" PWA that loads instantly and works in tunnels or areas with poor signal.

## Product Purpose

Nästa helps commuters track real-time departures from configured stops, calculate arrival times, and stay informed about transit disruptions — all from a mobile-first dashboard that works offline. Success means the user opens the app, sees their next departure in under 2 seconds, and gets back to their day.

## Brand Personality

**Voice**: Minimalist, functional, no-nonsense Scandinavian
**Tone**: Calm, efficient, trustworthy — a utility that just works
**3-word personality**: Practical · Quick · Uncluttered

## Anti-references

- **No gradient text.** Single solid color for emphasis; weight or size carries hierarchy.
- **No glassmorphism.** Blurs and glass cards are never decorative — only used with deliberate purpose.
- **No side-stripe borders.** No colored left/right borders on cards, list items, or callouts.
- **No hero-metric template.** No big-number / small-label SaaS cliché patterns.
- **No generic card grids.** No identical icon-heading-text cards repeated without purpose.
- **No AI-scaffold tropes.** No uppercase tracked "ABOUT" / "PROCESS" / "PRICING" kickers; no numbered 01/02/03 section markers. Sequences earn their numbering.
- **No decorative fluff.** Every element serves the glanceable commuter use case. Nothing decorative.
- **No desktop-first layout.** Mobile-first, 480px max-width, one-handed thumb zone.
- **No stale-data silence.** Freshness indicator is visible; stale data is clearly marked.
- **No muted-gray-only palette.** Themes have personality; color is purposeful, not gray for elegance.

## Design Principles

1. **Function first** — Every visual element earns its place in the commuter's glance.
2. **Speed perception** — Interface feels instant and responsive; cached data shows immediately, live data refines.
3. **Glanceable information** — Largest number on screen is minutes until departure. Clear hierarchy, minimal noise.
4. **No AI slop** — No gradient text, no side-stripe borders, no glassmorphism, no decorative reflexes.
5. **Mobile-optimized** — Touch-friendly targets, works in sunlight, one-handed, safe-area aware.
6. **Offline resilience** — Core functionality works without network; disruptions and ferry schedules cached.
7. **Thematic personality** — 16 bold palettes with contrast-aware adaptation; dark/light auto-switching. Not a single gray-on-gray design.

## Accessibility & Inclusion

- WCAG 2.1 AA compliant
- Contrast-aware theme system: text, surface, and accent colors auto-adapt to background luminance
- Reduced motion support via `prefers-reduced-motion` — all animations have non-animated fallbacks
- Bilingual UI (Swedish + English) with auto-detection
- Touch-friendly minimum tap targets
- Works with system font scaling (no fixed viewport zoom lock)
