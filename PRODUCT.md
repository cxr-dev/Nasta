# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Daily Stockholm commuters who use SL public transport (bus, metro, train, ferry). They check departures while walking or waiting at stops — often outdoors in sunlight, one-handed on mobile, with limited attention and unreliable connectivity.

## Product Purpose

Nästa helps commuters see the next relevant departure from their configured journeys quickly, with live updates, arrival estimates, and disruption context. Success means the user can open the PWA, understand what leaves next in under two seconds, and continue their day.

## Positioning

Nästa is a fast, glanceable Stockholm SL commuter utility rather than a general city-discovery app. Saved journeys and live departures are its core value; nearby stops, maps, venues, and events are optional supporting tools for the journey.

## Operating Context

The PWA is used on a phone while commuting, including in bright outdoor conditions and tunnels or areas with poor signal. Users configure pages and journey segments locally, then return to those saved views for day-to-day departure checks. Location is opt-in and requested only after an explicit action.

## Capabilities and Constraints

- Shows live SL departures, disruptions, station-facility notices, arrival estimates, and configurable refresh intervals.
- Supports Stockholm SL and a static Sjöstadstrafiken timetable for supported ferry piers; static ferry data has no live delay adjustments.
- Offers optional nearby-stop ranking, walking estimates, maps, venues, and event discovery without making them prerequisites for core departures.
- Works as an offline-safe PWA with cached schedules and data where available; live disruptions and most discovery data require a network connection.
- Requires no account, app-owned backend, or app-store installation. Settings and saved pages remain in the user's browser; IndexedDB stores persistent caches and generated share cards.
- Provides Swedish and English UI, light/dark/system themes, and user-controlled settings and data backup/import.

## Brand Commitments

**Voice**: Minimalist, functional, no-nonsense Scandinavian.

**Tone**: Calm, efficient, trustworthy — a utility that just works.

**Personality**: Practical, quick, uncluttered.

The product remains mobile-first, dense but glanceable, and free of decorative UI. It rejects gradient text, decorative glass, side-stripe borders, generic card grids, and desktop-first layouts. Freshness must be visible and stale data clearly marked.

## Evidence on Hand

- The implemented Svelte PWA, its component and service code, and automated Vitest/Playwright coverage.
- Public SL Transport, Journey Planner, and Deviations APIs for live transit data.
- A checked-in static Sjöstadstrafiken timetable for supported ferry piers.
- Visit Stockholm event data, a Supabase Edge Function for curated beer venues, and Overpass/OpenStreetMap for wine and cocktail venues.
- Generated `public/events-data.json` as a build-time/offline event-data tier.

No proprietary customer research, testimonials, or app-owned user accounts should be implied or fabricated.

## Product Principles

1. **Departure first** — The next relevant departure is the primary job; supporting features do not compete with it.
2. **Glanceable under real conditions** — Information must work one-handed, outdoors, and with limited attention.
3. **Fast even when connectivity is not** — Show useful cached information immediately and make data freshness explicit.
4. **Local control by default** — Saved journeys, preferences, and optional location use stay under the commuter's control without an account.
5. **Useful, not ornamental** — Every feature and visual treatment must earn its place in the commuting workflow.

## Accessibility & Inclusion

- WCAG 2.1 AA compliant.
- Handcrafted light/dark tokens with WCAG contrast tests for text, surfaces, controls, and status states.
- Reduced-motion support through `prefers-reduced-motion`, with non-animated fallbacks.
- Bilingual Swedish and English UI with auto-detection.
- Touch-friendly minimum tap targets and system font scaling without a fixed viewport zoom lock.
