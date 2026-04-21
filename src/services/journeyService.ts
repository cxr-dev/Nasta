import type { Segment } from "../types/route";
import type { Departure } from "../types/departure";
import { parseSlTimestamp } from "./slApi";

const TRANSPORT_URL = "https://transport.integration.sl.se/v1";
const FETCH_TIMEOUT_MS = 5_000;

export interface JourneyStop {
  name: string;
  siteId: string;
  idx: number;
  scheduledAt?: number; // unix ms; absent on synthesised stops
}

export interface JourneyData {
  stops: JourneyStop[];
  availability: "live" | "unavailable" | "estimated"; // live = real API data, estimated = synthetic fallback, unavailable = failed with reason
  destination: string; // right-end terminus label
  pickupStopIndex?: number;
  reason?: string; // diagnostic reason code: 'no_ref' | '404' | 'empty' | 'parse_error' | 'direction_mismatch' | 'live'
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: JourneyData; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Generate cache key that includes segment identity to prevent collisions.
 * When journeyRef is present, it's globally unique.
 * When absent, include siteId|line|direction|date to prevent cross-route cache reuse.
 */
function cacheKey(
  journeyRef: string | undefined,
  segment: Segment | undefined,
  now: number,
): string {
  if (journeyRef) {
    return `ref:${journeyRef}:${toStockholmDateString(now)}`;
  }

  // Include segment identity to prevent synthetic data collision across routes
  const segmentId = segment
    ? `${segment.fromStop.siteId}|${segment.line}|${segment.directionText || "unknown"}`
    : "unknown";

  return `synth:${segmentId}:${toStockholmDateString(now)}`;
}

// ─── Date helper ─────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" in Stockholm local time. Exported for testing. */
export function toStockholmDateString(ts: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

// ─── Synthesised fallback ─────────────────────────────────────────────────────

/** Builds a 5-stop placeholder sequence with ourStop at index 3. Exported for testing. */
export function buildSynthesisedStops(
  ourStopName: string,
  ourSiteId: string,
): JourneyStop[] {
  return [
    { name: "", siteId: "", idx: 0 },
    { name: "", siteId: "", idx: 1 },
    { name: "", siteId: "", idx: 2 },
    { name: ourStopName, siteId: ourSiteId, idx: 3 },
    { name: "", siteId: "", idx: 4 },
  ];
}

function synthesised(
  segment: Segment,
  departure: Departure,
  reason: string,
): JourneyData {
  return {
    stops: buildSynthesisedStops(
      segment.fromStop.name,
      segment.fromStop.siteId,
    ),
    availability: "estimated", // Not real API data, but we'll show it anyway for UX
    destination: departure.destination,
    pickupStopIndex: 3,
    reason, // Diagnostic reason: 'no_ref' | '404' | 'empty' | 'parse_error'
  };
}

// ─── Position estimator ───────────────────────────────────────────────────────

/**
 * Returns the stop index where the vehicle currently is (0-based).
 *
 * If stops have scheduledAt times: finds the last stop that has already passed (scheduledAt <= now).
 * If stops lack scheduledAt (synthesised): distributes evenly across the interval
 *   [expectedAtOurStop - count*90s, expectedAtOurStop] and picks the closest past stop.
 * Returns 0 if stops is empty.
 */
export function estimateVehicleStopIndex(
  stops: JourneyStop[],
  expectedAtOurStop: number,
  now: number,
): number {
  if (stops.length === 0) return 0;

  const hasTimes = stops.some((s) => s.scheduledAt !== undefined);

  if (hasTimes) {
    let result = 0;
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].scheduledAt !== undefined && stops[i].scheduledAt! <= now) {
        result = i;
      }
    }
    return result;
  }

  // Synthesised: distribute evenly at 90-second intervals before our stop
  const INTERVAL_MS = 90_000;
  const count = stops.length;
  for (let i = count - 1; i >= 0; i--) {
    const estimatedAt = expectedAtOurStop - (count - 1 - i) * INTERVAL_MS;
    if (estimatedAt <= now) return i;
  }
  return 0;
}

// ─── Journey fetch ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromApi(journeyRef: string): Promise<JourneyStop[] | null> {
  try {
    for (const suffix of ["stops", "calls"]) {
      const res = await fetchWithTimeout(
        `${TRANSPORT_URL}/journeys/${journeyRef}/${suffix}`,
      );
      if (!res.ok) {
        if (import.meta.env.DEV) {
          console.debug(
            `[Journey Service] ${suffix} endpoint returned ${res.status} for journey ${journeyRef}`,
          );
        }
        continue;
      }

      const data = await res.json();
      const items: any[] = Array.isArray(data)
        ? data
        : (data.stops ?? data.calls ?? []);
      if (!items.length) {
        if (import.meta.env.DEV) {
          console.debug(
            `[Journey Service] ${suffix} endpoint returned empty result for journey ${journeyRef}`,
          );
        }
        continue;
      }

      const stops = items.map((s: any, i: number) => ({
        name: s.stop?.name ?? s.name ?? s.stopPoint?.name ?? "",
        siteId: String(s.stop?.id ?? s.siteId ?? s.stopPoint?.siteId ?? ""),
        idx: i,
        // Import parseSlTimestamp for journey stop timestamps (same as departure times)
        scheduledAt: s.scheduledArrival
          ? parseSlTimestamp(s.scheduledArrival)
          : s.scheduledDeparture
            ? parseSlTimestamp(s.scheduledDeparture)
            : s.scheduled
              ? parseSlTimestamp(s.scheduled)
              : undefined,
      }));

      if (import.meta.env.DEV) {
        console.debug(
          `[Journey Service] Fetched ${stops.length} stops from ${suffix} endpoint`,
          { journeyRef },
        );
      }

      return stops;
    }

    if (import.meta.env.DEV) {
      console.warn(
        `[Journey Service] Both /stops and /calls endpoints failed for journey ${journeyRef}`,
      );
    }
    return null;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Journey Service] Journey fetch error for ${journeyRef}:`,
        e,
      );
    }
    return null;
  }
}

function stopMatches(
  stop: JourneyStop,
  target: { siteId: string; name: string },
): boolean {
  return (
    stop.siteId === target.siteId ||
    (stop.name !== "" && stop.name === target.name)
  );
}

function findStopIndex(
  stops: JourneyStop[],
  target: { siteId: string; name: string },
): number {
  return stops.findIndex((stop) => stopMatches(stop, target));
}

function normaliseJourneyStops(
  stops: JourneyStop[],
  segment: Segment,
): JourneyData | null {
  if (!stops.length) return null;

  const pickupIdx = findStopIndex(stops, segment.fromStop);
  if (pickupIdx < 0) return null;

  const dropoffIdx = findStopIndex(stops, segment.toStop);

  let oriented = stops;
  let orientedPickupIdx = pickupIdx;
  let orientedDropoffIdx = dropoffIdx;

  // If the selected segment's pickup appears after its dropoff in the fetched pattern,
  // the data is oriented opposite to the saved segment. Reverse so the strip matches the chosen ride direction.
  if (dropoffIdx >= 0 && pickupIdx > dropoffIdx) {
    oriented = [...stops].reverse().map((stop, idx) => ({
      ...stop,
      idx,
    }));
    orientedPickupIdx = oriented.length - 1 - pickupIdx;
    orientedDropoffIdx = oriented.length - 1 - dropoffIdx;
  }

  const destination =
    orientedDropoffIdx >= 0
      ? oriented[orientedDropoffIdx].name
      : segment.directionText || segment.toStop.name;

  return {
    stops: oriented,
    availability: "live", // Real API data
    destination,
    pickupStopIndex: orientedPickupIdx,
    reason: "live",
  };
}

/**
 * Returns journey stop data for a departure.
 * Falls back to a synthesised 5-stop sequence on any failure or missing journeyRef.
 * Results are cached in memory for CACHE_TTL_MS (5 min) per journey+date+segment key.
 *
 * When journeyRef is missing or fetch fails, marks data as 'estimated'.
 * Includes reason code for diagnostics: 'no_ref' | '404' | 'empty' | 'parse_error' | 'live'.
 */
export async function fetchJourneyStops(
  journeyRef: string | undefined,
  segment: Segment,
  departure: Departure,
): Promise<JourneyData> {
  const now = Date.now();
  const key = cacheKey(journeyRef, segment, now);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  let data: JourneyData;

  if (!journeyRef) {
    data = synthesised(segment, departure, "no_ref");
  } else {
    const stops = await fetchFromApi(journeyRef);
    if (stops && stops.length > 0) {
      const normalised = normaliseJourneyStops(stops, segment);
      if (normalised) {
        data = normalised;
      } else {
        // Successfully fetched but failed to match segment endpoints
        data = synthesised(segment, departure, "direction_mismatch");
      }
    } else {
      // Fetch returned null or empty
      const reason = stops === null ? "404" : "empty";
      data = synthesised(segment, departure, reason);
    }
  }

  cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}
