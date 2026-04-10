# Vehicle Progress Strip — Design Spec

**Date:** 2026-04-10
**Status:** Approved for implementation

---

## Context

Users want to know where their specific bus/train/boat is *right now* — not just how many minutes until it arrives at their stop. The existing departure cards show a countdown but give no spatial sense of the vehicle's position.

This feature adds a tap-to-expand progress strip to each departure card, showing the full route from terminus to terminus with the vehicle's current position marked, and the user's stop highlighted. No navigation away from the home screen — the card expands in place and collapses on second tap.

---

## Design

### Interaction

- **Default state**: departure card looks exactly as today (line, direction, countdown minutes)
- **Tap card**: it expands smoothly downward (Svelte `slide` transition) to reveal the progress strip below the existing content row
- **Tap again**: collapses back to default state
- **Only one card open at a time**: opening a second card collapses the first
- **Route switch**: collapses any open card

### Progress Strip Layout

```
[Ropsten*] ──●──●──●──[53]──○──[★ Östhammarsg.]──○──○── [Centralen]
  terminus*  passed   vehicle  upcoming   your stop            final
```

*Origin terminus label is omitted when unavailable (see Data Constraints below).

- **Terminus labels**: destination terminus at the right end (from `departure.destination`). Left-end origin label is omitted — the SL API does not reliably expose it.
- **Passed stops**: small filled dots, accent color at low opacity
- **Vehicle bubble**: line number in a rounded square, accent color, glow effect, animates along track
- **Upcoming stops**: small hollow dots
- **Your stop (★)**: larger dot, white fill, accent border, subtle glow
- **Track line**: filled (accent) from left up to vehicle position, unfilled ahead

Below the strip:
- Left: "Ankommer 08:24" (arrival time at your stop from `departure.expectedAt`)
- Right: "Live ✦" badge (real-time data) or "~Estimat" (time-estimated position)

**Long routes**: capped at 12 stops visible. The track is horizontally scrollable if the route has more. Your stop is scrolled into view after the `slide` transition completes — call `yourStopEl.scrollIntoView({ inline: 'center', behavior: 'smooth' })` inside a `setTimeout(() => ..., 290)` (just after the 280 ms transition).

---

## Data Constraints (confirmed before implementation)

The SL Transport API (`transport.integration.sl.se/v1`) must be probed before building `journeyService.ts`. The feature works in two modes depending on what the API provides:

| Mode | Condition | Experience |
|---|---|---|
| **Full** | API returns `journeyRef` on departures AND has a `/journeys/{ref}/stops` (or `/calls`) endpoint | Real stop names, real stop times, accurate vehicle position |
| **Estimated** | Either field is missing | Synthesised 5-stop sequence, vehicle position from time math, "~Estimat" badge |

**Static timetable departures (Sjöstadstrafiken)** never have a `journeyRef`. `DepartureStrip` must guard against this: if `departure.journeyRef` is `undefined`, skip the fetch entirely and render the estimated fallback immediately (no skeleton).

---

## Architecture

### New file: `src/services/journeyService.ts`

```ts
export interface JourneyStop {
  name: string;
  siteId: string;
  idx: number;           // 0 = first stop in journey
  scheduledAt?: number;  // unix ms — may be undefined on synthesised stops
}

export interface JourneyData {
  stops: JourneyStop[];
  isEstimated: boolean;  // true = synthesised fallback, not real stop data
}

// Fetch stop sequence. Returns synthesised fallback if journeyRef is undefined,
// the endpoint is unavailable, or times out after 5 000 ms.
export async function fetchJourneyStops(
  journeyRef: string | undefined,
  segment: Segment,
  departure: Departure,
): Promise<JourneyData>

// Estimate which stop index the vehicle is at.
// When stops have scheduledAt: interpolate by time.
// When stops lack scheduledAt (synthesised): distribute evenly across
// [departure.expectedAt - (count * 90_000), departure.expectedAt],
// returning the index closest to now.
// Returns 0 if stops is empty.
export function estimateVehicleStopIndex(stops: JourneyStop[], expectedAtOurStop: number, now: number): number
```

**Cache key**: `${journeyRef}:${toDateString(now)}` where `toDateString` is a local helper that calls `getStockholmComponents(now)` (already exported from `timetableCache.ts`) and formats the date as `"YYYY-MM-DD"`. This prevents stale hits across service days for recycled journey refs. In-memory Map, TTL 5 minutes.

**Synthesised fallback** when `journeyRef` is undefined or fetch fails/times out:
- Build 5 stops: `[origin?, stop1, stop2, ourStop, stop3]` where `ourStop` is `segment.fromStop.name`
- Origin label is omitted (left end of track unlabelled)
- Vehicle position computed by `estimateVehicleStopIndex` with evenly-spaced times

### New component: `src/components/DepartureStrip.svelte`

Props:
```ts
{
  departure: Departure;
  segment: Segment;
}
```

Lifecycle:
- `onMount`: call `fetchJourneyStops(departure.journeyRef, segment, departure)`. If cache has a hit, skip skeleton (render directly). If miss, show skeleton.
- Start 15-second interval: re-call `estimateVehicleStopIndex(stops, departure.expectedAt, Date.now())` and update vehicle bubble position via CSS `left` with `transition: left 600ms ease`.
- `onDestroy`: clear the interval. This is mandatory — the component mounts/unmounts on every card tap.

States:
| State | Strip content | Badge |
|---|---|---|
| Loading (cache miss) | Pulsing skeleton bar | — |
| Error / timeout (5 s) | Not shown — card stays collapsed, silent fail | — |
| Estimated (fallback) | Track with synthesised stops | "~Estimat" muted |
| Live (real data) | Track with real stop names | "Live ✦" green |

The `isEstimated` flag comes from `JourneyData` — it does not reuse `departure.predicted` (which means something different: departure time from timetable cache, not vehicle position).

Accessibility:
- Tap target on `.departure-row` gets `role="button"` and `aria-expanded={expandedIndex === index}`
- Track stops get `aria-label="Stop: {name}"` (screen reader only, visually hidden)

### DOM structure (important for CSS `contain`)

The existing `.departure-row` has `contain: layout paint style`. The `DepartureStrip` must be a **sibling** of `.departure-row`, not a child — this avoids clipping from `paint` containment.

```svelte
{#each (route.segments ?? []) as segment, index (segment.id)}
  {@const deps = segmentDeps[index] ?? []}
  {@const departure = deps[0]}
  <div class="departure-row" role="button" aria-expanded={expandedIndex === index}
       onclick={() => toggleExpanded(index)}>
    <!-- existing row content unchanged -->
  </div>
  {#if expandedIndex === index && departure}
    <div transition:slide={{ duration: 280, easing: cubicOut }}>
      <DepartureStrip {departure} {segment} />
    </div>
  {/if}
{/each}
```

`departure` is `deps[0]` — the leading departure for the segment, already computed by the existing `segmentDeps` derived array. The `&& departure` guard prevents mounting the strip when no departure exists.

### Modified: `src/components/SegmentDepartures.svelte`

Add:
```ts
let expandedIndex = $state<number | null>(null);

function toggleExpanded(index: number) {
  expandedIndex = expandedIndex === index ? null : index;
}
```

Reset `expandedIndex = null` when `route` prop changes (route switch) using a `$effect` keyed on route identity:
```ts
$effect(() => {
  route.id;              // read to establish dependency
  expandedIndex = null;
});
```

### Modified: `src/types/departure.ts`

Add:
```ts
journeyRef?: string;
```

### Modified: `src/services/slApi.ts`

In the departure mapping:
```ts
journeyRef: dep.journeyRef ?? dep.journey?.id ?? dep.journeyPatternPoint?.journeyRef ?? undefined,
```

If none of these fields exist in the actual API response (confirmed during pre-implementation probe), `journeyRef` remains `undefined` and the fallback path runs for all SL departures too.

---

## Data Flow

```
User taps card
  → toggleExpanded(i)
  → DepartureStrip mounts
  → check in-memory cache (key = journeyRef + date)
      cache hit  → render immediately, skip skeleton
      cache miss → show skeleton, fetch with 5 s timeout
          success → store in cache, render
          timeout/error → collapse strip silently (no error toast); expandedIndex
                          is reset to null inside DepartureStrip's onDestroy via
                          a callback prop `onError`. A subsequent tap re-tries the
                          fetch from scratch (only successful results are cached).
  → start 15 s interval: recalculate vehicle position from time, update bubble
  → user taps again → toggleExpanded(i) → expandedIndex = null → onDestroy clears interval
```

---

## Verification

1. Tap SL departure card → expands with slide animation, strip renders
2. Tap Sjöstadstrafiken card → expands with estimated strip (no journeyRef, no fetch)
3. Tap same card again → collapses, interval is cleared (verify in DevTools Performance: no rogue setInterval callbacks after collapse)
4. Open card A, tap card B → A collapses, B opens
5. Switch route → any open card collapses
6. If journey endpoint returns real stop names: "Live ✦" badge appears, stop names shown
7. If journey endpoint is absent or times out: "~Estimat" badge, synthesised strip, no error state shown to user
8. Long route (>12 stops): strip scrolls horizontally, your stop scrolled into view on open
9. `npm run check` — no type errors
10. `npm test` — existing 38 tests pass
