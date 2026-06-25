import { persistentCache } from "./persistentCache";

const STOP_FINDER_URL = "https://journeyplanner.integration.sl.se/v2/stop-finder";
const TRIP_URL = "https://journeyplanner.integration.sl.se/v2/trips";

const CACHE_PREFIX = "route-stops:v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
async function fetchStopSequenceFromTrip(
  originGlobalId: string,
  destGlobalId: string,
  signal?: AbortSignal,
): Promise<string[] | null> {
  const url = `${TRIP_URL}?type_origin=any&type_destination=any&name_origin=${originGlobalId}&name_destination=${destGlobalId}&calc_number_of_trips=1`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const data: TripData = await response.json();
    const journeys = Array.isArray(data.journeys) ? data.journeys : [];
    if (journeys.length === 0) return null;
    const firstLeg = journeys[0]?.legs?.[0];
    if (!firstLeg?.stopSequence) return null;
    // Skip origin (first) and destination (last) — only intermediate stops
    const stops = firstLeg.stopSequence
      .slice(1, -1)
      .map((s: { parent?: { disassembledName?: string }; name?: string; disassembledName?: string }) => s.parent?.disassembledName || s.name || "")
      .filter(Boolean);
    return stops.length > 0 ? stops : null;
  } catch {
    return null;
  }
}

async function getCached(key: string): Promise<string[] | null> {
  const data = await persistentCache.get(`${CACHE_PREFIX}:${key}`);
  const d = data as { stops: string[]; ts: number } | null;
  if (d && Date.now() - d.ts < CACHE_TTL_MS) return d.stops;
  return null;
}

async function setCache(key: string, stops: string[]): Promise<void> {
  await persistentCache.set(
    `${CACHE_PREFIX}:${key}`,
    { stops, ts: Date.now() },
    CACHE_TTL_MS,
  );
}

/**
 * Resolve intermediate stop names for a route direction.
 *
 * Makes up to 2 API calls on first access (Stop Finder + Trip), then caches
 * by `{originSiteId}|{line}|{directionCode}` for 1 hour.
 *
 * Returns null on failure or empty result — caller should fall back gracefully.
 */
export async function resolveStopSequence(
  originSiteId: string,
  destinationName: string,
  line: string,
  directionCode: number,
  signal?: AbortSignal,
): Promise<string[] | null> {
  const cacheKey = `${originSiteId}|${line}|${directionCode}`;

  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const destGlobalId = await resolveDestinationToGlobalId(destinationName, signal);
  if (!destGlobalId) return null;

  const originGlobalId = `9091001000${originSiteId}`;
  const stops = await fetchStopSequenceFromTrip(originGlobalId, destGlobalId, signal);

  if (stops && stops.length > 0) {
    await setCache(cacheKey, stops);
  }

  return stops;
}
