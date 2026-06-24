# ADR 001: SL Transport API siteId Architecture

## Status

Accepted

## Context

SL provides two APIs for public transport data in Stockholm:
- **Stop Finder** (V2): returns stop points by name search. Each result has a `globalId` (e.g., `9091001000009220`) and `type: "stop"`.
- **Transport API** (V1): `/sites/{siteId}/departures` returns departures for a station site.

The app uses Stop Finder to let users search for stops, then calls the Transport API with the siteId extracted from the global ID (stripping the `9091001000` prefix).

Initially there was confusion about whether the Transport API operates at a `stopArea` level while Stop Finder returns `stop` points, requiring an additional mapping step.

## Investigation

We queried multiple stations through Stop Finder and the Transport API:

| Station | SiteId | Stop areas returned |
|---|---|---|
| T-Centralen | 0009001 | 5 (metro, bus, tram, commuter train, regional bus) |
| Odenplan | 0009117 | multiple (metro, bus, train) |
| Fridhemsplan | 0009115 | multiple (bus, train) |
| Liljeholmen | 0009294 | multiple (tram, bus, train, boat) |
| Tekniska högskolan | 0009204 | multiple (tram, bus, train) |
| Ropsten | 0009220 | 4 (metro, bus, tram, ferry) |

This confirmed: **The Transport API's `/sites/{siteId}/departures` endpoint IS already a station-level aggregate.** A single siteId returns departures from all stop areas and stop points at that station. No additional aggregation or mapping is needed.

The "Two Ropsten" bug was a search UX issue: `cleanStopName()` strips the locality prefix (`"Stockholm, "` / `"Norrtälje, "`), making two physically distinct stations display identically.

## Decision

1. **Keep siteId architecture as-is.** No refactor to stopArea needed.
2. **Fix search UX** instead: show locality context when station names are ambiguous (two results share the same display name).
3. **Add `locality`, `localityId`, `matchQuality`** to `SiteSearchResult` from Stop Finder's `parent` field to support this.

## Consequences

- The siteId → departures pipeline remains unchanged and correct.
- Search results now carry locality metadata for disambiguation.
- Users see locality info only when needed (name appears >1 in results), keeping the UI clean for unambiguous searches.
- No additional API calls needed for locality information.

## References

- SL Transport API: `/v1/sites/{siteId}/departures`
- SL Stop Finder: `/v2/stop-finder`
- Implementation: SegmentSearch.svelte two-row adaptive layout
