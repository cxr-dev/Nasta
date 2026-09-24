import { persistentCache } from "./persistentCache";
import { searchSites } from "./slApi";

const STOP_FINDER_URL = "https://journeyplanner.integration.sl.se/v2/stop-finder";
const TRIP_URL = "https://journeyplanner.integration.sl.se/v2/trips";

const CACHE_PREFIX = "route-stops:v3";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedStops {
  stops: string[];
  ts: number;
}

const memoryCache = new Map<string, CachedStops>();
const inFlight = new Map<string, Promise<string[] | null>>();

interface StopFinderLocation {
  id: string;
  name: string;
  disassembledName: string;
  type: string;
}

interface TripJourney {
  legs?: Array<{
    stopSequence?: Array<{
      id: string;
      name: string;
      disassembledName: string;
      type: string;
      parent?: {
        id: string;
        name: string;
        disassembledName: string;
        type: string;
      };
    }>;
    transportation?: { disassembledName?: string; name?: string };
  }>;
}

interface TripData {
  journeys?: TripJourney[];
}

/**
 * Resolve destination name (e.g. "Ropsten") to a global stop ID via Stop Finder.
 */
async function resolveDestinationToGlobalId(
  destinationName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = `${STOP_FINDER_URL}?name_sf=${encodeURIComponent(destinationName)}&any_obj_filter_sf=2&type_sf=any`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const data = await response.json();
    const locations: StopFinderLocation[] = Array.isArray(data.locations) ? data.locations : [];
    // Prefer exact name match on stop type
    const exact = locations.find(
      (loc) => loc.type === "stop" && loc.name === destinationName,
    );
    if (exact) return exact.id;
    // Fallback: any stop result
    const anyStop = locations.find((loc) => loc.type === "stop");
    return anyStop?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch stop sequence from Trip API for a given origin → destination pair.
 * Returns intermediate stop names (excluding origin and destination).
 */
function legMatchesLine(
  leg: NonNullable<TripJourney["legs"]>[number],
  line: string,
): boolean {
  const wanted = line.trim();
  if (!wanted) return false;
  const id = (leg.transportation?.disassembledName ?? "").trim();
  const name = leg.transportation?.name ?? "";
  if (id === wanted || name === wanted) return true;
  const numeric = name.match(/(\d+)/);
  return numeric?.[1] === wanted;
}

function findLineLeg(
  journeys: TripJourney[],
  line: string,
): NonNullable<TripJourney["legs"]>[number] | null {
  for (const journey of journeys) {
    for (const leg of journey.legs ?? []) {
      if (legMatchesLine(leg, line) && Array.isArray(leg.stopSequence)) return leg;
    }
  }
  return null;
}

function intermediateStopNames(
  stopSequence: NonNullable<NonNullable<TripJourney["legs"]>[number]["stopSequence"]>,
): string[] {
  return stopSequence
    .slice(1, -1)
    .map((s) => s.parent?.disassembledName || s.name || "")
    .filter(Boolean);
}

async function fetchTripJourneys(
  originGlobalId: string,
  destGlobalId: string,
  extraQuery: string,
  signal?: AbortSignal,
): Promise<TripJourney[]> {
  const url = `${TRIP_URL}?type_origin=any&type_destination=any&name_origin=${originGlobalId}&name_destination=${destGlobalId}&calc_number_of_trips=3${extraQuery}`;
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const data: TripData = await response.json();
  return Array.isArray(data.journeys) ? data.journeys : [];
}

async function fetchStopSequenceFromTrip(
  originGlobalId: string,
  destGlobalId: string,
  line: string,
  directionCode: number,
  signal?: AbortSignal,
): Promise<string[] | null> {
  try {
    // The trip planner ignores `line` / `direction` query params and returns the
    // fastest journey (often metro). Ask for a direct trip first, then fall back
    // to any journey and pick the leg that actually matches the requested line.
    let journeys = await fetchTripJourneys(originGlobalId, destGlobalId, "&max_changes=0", signal);
    let matched = findLineLeg(journeys, line);
    if (!matched) {
      journeys = await fetchTripJourneys(originGlobalId, destGlobalId, "", signal);
      matched = findLineLeg(journeys, line);
    }
    if (!matched?.stopSequence) return null;
    return intermediateStopNames(matched.stopSequence);
  } catch {
    return null;
  }
}

async function getCached(key: string): Promise<string[] | null> {
  const memory = memoryCache.get(key);
  if (memory) {
    if (Date.now() - memory.ts < CACHE_TTL_MS) return memory.stops;
    memoryCache.delete(key);
  }

  const data = await persistentCache.get(`${CACHE_PREFIX}:${key}`);
  const d = data as CachedStops | null;
  if (d && Array.isArray(d.stops) && Date.now() - d.ts < CACHE_TTL_MS) {
    memoryCache.set(key, d);
    return d.stops;
  }
  return null;
}

async function setCache(key: string, stops: string[]): Promise<void> {
  const data = { stops, ts: Date.now() };
  memoryCache.set(key, data);
  await persistentCache.set(
    `${CACHE_PREFIX}:${key}`,
    data,
    CACHE_TTL_MS,
  );
}

function cacheKey(originSiteId: string, line: string, directionCode: number): string {
  return `${originSiteId}|${line}|${directionCode}`;
}

/**
 * Resolve intermediate stop names for a route direction.
 *
 * Makes up to 2 API calls on first access (Stop Finder + Trip), then caches
 * by `{originSiteId}|{line}|{directionCode}` for 1 hour.
 *
 * Returns null on failure. An empty array is a valid direct route with no
 * intermediate stops and is cached so repeated expansions stay instant.
 */
export async function resolveStopSequence(
  originSiteId: string,
  destinationName: string,
  line: string,
  directionCode: number,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (signal?.aborted) return null;

  const key = cacheKey(originSiteId, line, directionCode);

  const cached = await getCached(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<string[] | null> => {
    const destGlobalId = await resolveDestinationToGlobalId(destinationName, signal);
    if (!destGlobalId) return null;

    const originGlobalId = `9091001000${originSiteId}`;
    const stops = await fetchStopSequenceFromTrip(originGlobalId, destGlobalId, line, directionCode, signal);

    if (stops !== null) {
      await setCache(key, stops);
    }

    return stops;
  })();

  inFlight.set(key, request);
  request.finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }).catch(() => {
    // The original request result is still delivered to its caller.
  });

  return request;
}

/** Clear process-local state between isolated consumers or tests. */
export function clearRouteStopsCache(): void {
  memoryCache.clear();
  inFlight.clear();
  coordCache.clear();
  coordInFlight.clear();
}

// ─── Stop coordinates (for the route preview map) ────────────────

const coordCache = new Map<string, [number, number] | null>();
const coordInFlight = new Map<string, Promise<[number, number] | null>>();

/** Resolve a single stop name to [lat, lon] via Stop Finder, cached in memory. */
export function resolveStopCoord(name: string): Promise<[number, number] | null> {
  const cached = coordCache.get(name);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = coordInFlight.get(name);
  if (pending) return pending;

  const request = (async (): Promise<[number, number] | null> => {
    try {
      const sites = await searchSites(name);
      if (sites.length === 0) return null;
      // Prefer an exact name match, then any result with coordinates.
      const byName = sites.find((s) => s.name === name);
      const pick = byName ?? sites[0];
      if (pick?.lat == null || pick?.lon == null) return null;
      return [pick.lat, pick.lon];
    } catch {
      return null;
    }
  })();

  coordInFlight.set(name, request);
  request
    .then((coord) => coordCache.set(name, coord))
    .finally(() => {
      if (coordInFlight.get(name) === request) coordInFlight.delete(name);
    });

  return request;
}

export interface RoutePoint {
  name: string;
  coord: [number, number] | null;
}

/**
 * Resolve the full ordered stop sequence (origin → intermediate stops →
 * destination) with coordinates, for rendering the route on a map.
 * Returns an empty array when the sequence cannot be resolved.
 */
export async function resolveRoutePoints(
  originSiteId: string,
  originName: string,
  destinationName: string,
  line: string,
  directionCode: number,
  signal?: AbortSignal,
): Promise<RoutePoint[]> {
  const intermediates = await resolveStopSequence(
    originSiteId,
    destinationName,
    line,
    directionCode,
    signal,
  );
  if (intermediates === null) return [];

  const names = [originName, ...intermediates, destinationName];
  const coords = await Promise.all(names.map((n) => resolveStopCoord(n)));
  return names.map((name, i) => ({ name, coord: coords[i] }));
}

/** Clear only the coordinate cache (keeps stop-sequence cache warm). */
export function clearRouteCoordCache(): void {
  coordCache.clear();
  coordInFlight.clear();
}
