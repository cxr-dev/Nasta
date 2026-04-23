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
  availability: "live" | "scheduled" | "unavailable";
  source: "live_journey" | "pattern_schedule" | "none";
  confidence: "high" | "medium" | "low";
  destination: string; // right-end terminus label
  pickupStopIndex?: number;
  reason?: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: JourneyData; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;
const PATTERN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_OFFSET_SAMPLES = 25;
const MAX_PATTERN_STOPS = 14;

interface PatternStopStats {
  siteId: string;
  name: string;
  relativeIndex: number;
  offsetSamplesSec: number[];
}

interface StopPatternEntry {
  line: string;
  directionText: string;
  pickupStopSiteId: string;
  updatedAt: number;
  sampleCount: number;
  stops: PatternStopStats[];
}

const stopPatternCache = new Map<string, StopPatternEntry>();

function patternKey(line: string, directionText: string, pickupStopSiteId: string): string {
  return `${line}|${directionText}|${pickupStopSiteId}`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function trimSamples(values: number[]): number[] {
  if (values.length <= MAX_OFFSET_SAMPLES) return values;
  return values.slice(values.length - MAX_OFFSET_SAMPLES);
}

function samePatternStop(
  a: Pick<PatternStopStats, "siteId" | "name" | "relativeIndex">,
  b: Pick<PatternStopStats, "siteId" | "name" | "relativeIndex">,
): boolean {
  if (a.relativeIndex !== b.relativeIndex) return false;
  if (a.siteId && b.siteId) return a.siteId === b.siteId;
  return a.name !== "" && a.name === b.name;
}

function isPatternFresh(entry: StopPatternEntry, now: number): boolean {
  return now - entry.updatedAt <= PATTERN_TTL_MS;
}

/**
 * Generate cache key that includes segment identity to prevent collisions.
 * Priority: journeyRef > tripId > composite (segment + departure time).
 */
export function cacheKey(
  journeyRef: string | undefined,
  tripId: string | undefined,
  segment: Segment | undefined,
  now: number,
  departure?: Pick<Departure, "expectedAt">,
): string {
  if (journeyRef) {
    return `ref:${journeyRef}:${toStockholmDateString(now)}`;
  }

  if (tripId) {
    return `trip:${tripId}:${toStockholmDateString(now)}`;
  }

  // Composite: include departure time (expectedAt rounded to minute) to avoid collisions
  const timeKey = departure?.expectedAt
    ? Math.floor(departure.expectedAt / 60000).toString()
    : toStockholmDateString(now);

  const segmentId = segment
    ? `${segment.fromStop.siteId}|${segment.line}|${segment.directionText || "unknown"}`
    : "unknown";

  return `synth:${segmentId}:${timeKey}`;
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

function unavailableData(
  segment: Segment,
  departure: Departure,
  reason: string,
): JourneyData {
  const stops: JourneyStop[] = [
    {
      name: "",
      siteId: "",
      idx: 0,
    },
    {
      name: segment.fromStop.name,
      siteId: segment.fromStop.siteId,
      idx: 1,
    },
    {
      name: segment.toStop.name,
      siteId: segment.toStop.siteId,
      idx: 2,
    },
  ];
  return {
    stops,
    availability: "unavailable",
    source: "none",
    confidence: "low",
    destination: segment.directionText || departure.destination || segment.toStop.name,
    pickupStopIndex: 1,
    reason,
  };
}

// ─── Position estimator ───────────────────────────────────────────────────────

/**
 * Returns the stop index where the vehicle currently is (0-based).
 *
 * If stops have scheduledAt times: finds the last stop that has already passed (scheduledAt <= now).
 * Works with both live journey stop schedules and timetable-derived stop schedules.
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
  // No stop schedules available: avoid fabricating precision.
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
    availability: "live",
    source: "live_journey",
    confidence: "high",
    destination,
    pickupStopIndex: orientedPickupIdx,
    reason: "live",
  };
}

function learnStopPatternFromLiveJourney(
  segment: Segment,
  departure: Departure,
  data: JourneyData,
): void {
  if (data.availability !== "live") return;
  if (!departure.line || !departure.directionText || !segment.fromStop.siteId) return;

  const pickupIdx = data.pickupStopIndex ?? data.stops.findIndex((s) => stopMatches(s, segment.fromStop));
  if (pickupIdx < 0) return;
  const pickupScheduledAt = data.stops[pickupIdx]?.scheduledAt;
  if (pickupScheduledAt === undefined) return;

  const sampleStops: PatternStopStats[] = [];
  for (const stop of data.stops) {
    if (stop.scheduledAt === undefined) continue;
    const relativeIndex = stop.idx - pickupIdx;
    const offsetSec = Math.round((stop.scheduledAt - pickupScheduledAt) / 1000);
    sampleStops.push({
      siteId: stop.siteId,
      name: stop.name,
      relativeIndex,
      offsetSamplesSec: [offsetSec],
    });
  }
  if (!sampleStops.length) return;

  sampleStops.sort((a, b) => a.relativeIndex - b.relativeIndex);
  const boundedSample = sampleStops
    .filter((s) => s.relativeIndex >= -6 && s.relativeIndex <= 7)
    .slice(0, MAX_PATTERN_STOPS);
  if (!boundedSample.length) return;

  const key = patternKey(departure.line, departure.directionText, segment.fromStop.siteId);
  const now = Date.now();
  const existing = stopPatternCache.get(key);
  if (!existing || !isPatternFresh(existing, now)) {
    stopPatternCache.set(key, {
      line: departure.line,
      directionText: departure.directionText,
      pickupStopSiteId: segment.fromStop.siteId,
      updatedAt: now,
      sampleCount: 1,
      stops: boundedSample,
    });
    return;
  }

  for (const sampled of boundedSample) {
    const matched = existing.stops.find((s) => samePatternStop(s, sampled));
    if (matched) {
      matched.offsetSamplesSec = trimSamples([...matched.offsetSamplesSec, sampled.offsetSamplesSec[0]]);
      if (!matched.name && sampled.name) matched.name = sampled.name;
      if (!matched.siteId && sampled.siteId) matched.siteId = sampled.siteId;
    } else {
      existing.stops.push(sampled);
    }
  }

  existing.stops.sort((a, b) => a.relativeIndex - b.relativeIndex);
  existing.stops = existing.stops
    .filter((s) => s.relativeIndex >= -6 && s.relativeIndex <= 7)
    .slice(0, MAX_PATTERN_STOPS);
  existing.sampleCount += 1;
  existing.updatedAt = now;
}

function buildJourneyFromPattern(
  segment: Segment,
  departure: Departure,
): JourneyData | null {
  if (!departure.line || !departure.directionText || !segment.fromStop.siteId) {
    return null;
  }
  const key = patternKey(departure.line, departure.directionText, segment.fromStop.siteId);
  const entry = stopPatternCache.get(key);
  const now = Date.now();
  if (!entry || !isPatternFresh(entry, now)) return null;

  const sortedStops = [...entry.stops].sort((a, b) => a.relativeIndex - b.relativeIndex);
  const pickupPatternIdx = sortedStops.findIndex((s) => s.relativeIndex === 0);
  if (pickupPatternIdx < 0 || sortedStops.length < 2) return null;

  const expectedAtOurStop = departure.expectedAt ?? (now + departure.minutes * 60_000);
  const stops: JourneyStop[] = sortedStops.map((stop, idx) => ({
    idx,
    name: stop.name,
    siteId: stop.siteId,
    scheduledAt: expectedAtOurStop + median(stop.offsetSamplesSec) * 1000,
  }));

  const destination = sortedStops[sortedStops.length - 1]?.name || segment.directionText || departure.destination;
  return {
    stops,
    availability: "scheduled",
    source: "pattern_schedule",
    confidence: "medium",
    destination,
    pickupStopIndex: pickupPatternIdx,
    reason: "pattern_schedule",
  };
}

/**
 * Returns journey stop data for a departure.
 * Falls back to timetable pattern-derived stops when live journey data is missing.
 * If no pattern exists, returns minimal unavailable data without fabricated position.
 * Results are cached in memory for CACHE_TTL_MS (5 min) per journey+date+segment key.
 *
 * Includes reason code for diagnostics and source/confidence metadata.
 */
export async function fetchJourneyStops(
  journeyRef: string | undefined,
  segment: Segment,
  departure: Departure,
): Promise<JourneyData> {
  const now = Date.now();
  const key = cacheKey(journeyRef, departure.tripId, segment, now, departure);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  let data: JourneyData;

  if (journeyRef) {
    const stops = await fetchFromApi(journeyRef);
    if (stops && stops.length > 0) {
      const normalised = normaliseJourneyStops(stops, segment);
      if (normalised) {
        data = normalised;
        learnStopPatternFromLiveJourney(segment, departure, normalised);
      } else {
        data =
          buildJourneyFromPattern(segment, departure) ??
          unavailableData(segment, departure, "direction_mismatch");
      }
    } else {
      const reason = stops === null ? "404" : "empty";
      data =
        buildJourneyFromPattern(segment, departure) ??
        unavailableData(segment, departure, reason);
    }
  } else {
    data =
      buildJourneyFromPattern(segment, departure) ??
      unavailableData(segment, departure, "no_ref");
  }

  cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}

export function __clearJourneyServiceCachesForTests(): void {
  cache.clear();
  stopPatternCache.clear();
}
