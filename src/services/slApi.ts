import type { Departure, SiteSearchResult } from "../types/departure";
import { cleanStopName } from "../lib/stopName";
import type { TransportType } from "../types/page";
import { getTransportType } from "../lib/getTransportType";
import { learnFromApiResponse } from "./timetableCache";
import { cacheScheduleTime } from "./scheduleCache";
import { stopAreaStore } from "../stores/stopAreaStore.svelte";

const TRANSPORT_URL = "https://transport.integration.sl.se/v1";
const JOURNEY_PLANNER_URL = "https://journeyplanner.integration.sl.se/v2";
const STOP_FINDER_URL = `${JOURNEY_PLANNER_URL}/stop-finder`;
const TRIP_URL = `${JOURNEY_PLANNER_URL}/trip`;
const DEFAULT_FORECAST_MINUTES = 240;

/**
 * Parse SL API timestamps as Stockholm local time using Intl-based DST-aware conversion.
 * SL returns local time without timezone suffix (e.g., "2026-04-18T00:22:57").
 * Sweden uses Europe/Stockholm (UTC+1 winter, UTC+2 summer DST).
 *
 * If the timestamp includes Z or an offset (±HH:MM), parse it directly as ISO 8601.
 * Otherwise, interpret it as a Stockholm wall-clock time and convert to UTC milliseconds.
 */
export function parseSlTimestamp(raw: string): number {
  // If timestamp has explicit timezone indicator, parse directly
  if (/Z|[+-]\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw).getTime();
  }

  // Interpret timezone-naive string as Stockholm local time.
  // Parse as UTC first to get components, then figure out the offset between UTC and Stockholm.
  const assumedUtcMs = new Date(raw + "Z").getTime();

  // Get the components of the assumed UTC time
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const stockholmFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Format the same UTC timestamp in both timezones to determine the offset
  const utcParts = utcFormatter.formatToParts(new Date(assumedUtcMs));
  const stockholmParts = stockholmFormatter.formatToParts(
    new Date(assumedUtcMs),
  );

  const utcHour = parseInt(
    utcParts.find((p) => p.type === "hour")?.value || "0",
  );
  const stockholmHour = parseInt(
    stockholmParts.find((p) => p.type === "hour")?.value || "0",
  );

  // Calculate the offset in hours (Stockholm - UTC)
  // Handle day boundary wrapping
  let offsetHours = stockholmHour - utcHour;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;

  // The raw timestamp is in Stockholm time, so subtract the offset to get UTC
  const offsetMs = offsetHours * 60 * 60 * 1000;
  return assumedUtcMs - offsetMs;
}


function globalIdToSiteId(globalId: string): string {
  return globalId.replace(/^9091001000/, "");
}

interface StopFinderLocation {
  id: string;
  name: string;
  disassembledName: string;
  coord?: [number, number];
  type: string;
  matchQuality?: number;
  productClasses?: number[];
}

interface StopFinderResponse {
  locations: StopFinderLocation[];
}

function isValidStopFinderResult(obj: unknown): obj is StopFinderLocation {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.type === "string"
  );
}

function isValidDeparture(obj: unknown): obj is Departure {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.line === "object" &&
    o.line !== null &&
    typeof o.destination === "string" &&
    typeof o.direction_code === "number"
  );
}

export async function searchSites(
  query: string,
  signal?: AbortSignal,
): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];

  const url = `${STOP_FINDER_URL}?name_sf=${encodeURIComponent(query)}&any_obj_filter_sf=2&type_sf=any`;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return [];
    }
    if (import.meta.env.DEV) console.error("[SL API] Search fetch error:", e);
    return [];
  }

  if (!response.ok) {
    if (import.meta.env.DEV)
      console.error("[SL API] Search error:", response.status);
    return [];
  }

  let data: StopFinderResponse;
  try {
    data = await response.json();
  } catch {
    if (import.meta.env.DEV) console.error("[SL API] JSON parse error");
    return [];
  }

  const rawLocations = Array.isArray(data.locations) ? data.locations : [];

  if (import.meta.env.DEV) {
    console.log("[SL API] Got", rawLocations.length, "stop-finder results");
  }

  const stations: SiteSearchResult[] = rawLocations
    .filter(
      (loc): loc is StopFinderLocation =>
        isValidStopFinderResult(loc) && loc.type === "stop",
    )
    .map((loc) => ({
      siteId: globalIdToSiteId(loc.id),
      name: cleanStopName(loc.name),
      note: undefined,
      type: "stop" as const,
      lat: loc.coord?.[0],
      lon: loc.coord?.[1],
      productClasses: loc.productClasses,
    }));

  return stations;
}

export async function getDepartures(
  siteId: string,
  forecast = DEFAULT_FORECAST_MINUTES,
  signal?: AbortSignal,
): Promise<{ departures: Departure[]; stopDeviations: any[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(
      `${TRANSPORT_URL}/sites/${siteId}/departures?forecast=${forecast}`,
      { signal: controller.signal },
    );
  } catch (e) {
    clearTimeout(timeoutId);
    if ((e as Error).name === "AbortError") {
      throw e;
    }
    throw e;
  }
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  learnFromApiResponse(siteId, data.departures || []).catch(() => {});

  const rawDeps = Array.isArray(data.departures) ? data.departures : [];
  const stopDeviations = Array.isArray(data.stop_deviations) ? data.stop_deviations : [];
  const validDeps = rawDeps.filter(isValidDeparture);

  // Extract stop_area.id from departure responses and publish to stopAreaStore
  // This enables disruption matching via Deviations API stop area lookup
  for (const dep of rawDeps) {
    if (dep?.stop_area?.id) {
      stopAreaStore.setMapping(siteId, String(dep.stop_area.id));
      break; // One mapping per siteId is sufficient
    }
  }

  const departures = validDeps.map((dep: any) => {
    const liveTime = dep.expected || dep.scheduled || "";
    const parsedTime = liveTime ? parseSlTimestamp(liveTime) : NaN;

    // Prioritize computed minutes from parsed timestamp
    let minutes: number;
    let isFromParsedTime = false;

    if (liveTime && !isNaN(parsedTime)) {
      // Compute from absolute timestamp (most reliable)
      // Use Math.max(1, Math.ceil(...)) to avoid 0 min display for imminent departures
      minutes = Math.max(1, Math.ceil((parsedTime - Date.now()) / 60000));
      isFromParsedTime = true;
    } else if (
      dep.timeToDeparture !== undefined &&
      typeof dep.timeToDeparture === "number"
    ) {
      // Fallback to API-provided timeToDeparture
      minutes = Math.max(1, dep.timeToDeparture);
    } else {
      // Last resort: use 1 if both fail (avoid 0 min display)
      minutes = 1;
    }

    // Dev diagnostics for stale/invalid timestamps
    if (import.meta.env.DEV) {
      if (minutes < 0) {
        console.warn("[SL API] Stale timestamp detected:", {
          raw: liveTime,
          parsed: parsedTime,
          now: Date.now(),
          minutes,
          line: dep.line?.designation,
          destination: dep.destination,
        });
      }
    }

    const formattedTime = !isNaN(parsedTime)
      ? formatTime(new Date(parsedTime))
      : "";

    // Extract scheduled time from API response and cache it
    if (dep.scheduled) {
      const scheduledDate = new Date(parseSlTimestamp(dep.scheduled));
      const line = dep.line?.designation || dep.line?.name || "";
      const direction_code = dep.direction_code ?? 0;
      cacheScheduleTime(siteId, line, direction_code, scheduledDate).catch(() => {});
    }

    return {
      line: dep.line?.designation || dep.line?.name || "",
      lineName: dep.line?.name || "",
      destination: dep.destination || "",
      direction_code: dep.direction_code ?? 0,
      minutes,
      time: formattedTime,
      expectedAt: dep.expected ? parseSlTimestamp(dep.expected) : undefined,
      deviation: dep.deviation,
      transportType: getTransportType(dep.line?.transport_mode),
      // SL API exposes journey.id — used for vehicle position estimation in the progress strip
      journeyRef: dep.journey?.id != null ? String(dep.journey.id) : undefined,
      // SL API exposes trip.id — fallback for cache key when journeyRef is missing
      tripId: dep.trip?.id != null ? String(dep.trip.id) : undefined,
      // SL's pre-calculated display — always correct, use as fallback
      display: dep.display,
      // SL API provides stop point ID
      stop_point_id: dep.stop_point?.id ?? undefined,
    };
  });

  return { departures, stopDeviations };
}


export async function searchTrips(
  originId: string,
  destId: string,
  time?: Date,
  signal?: AbortSignal,
): Promise<Departure[]> {
  const dateStr = time ? toStockholmDateString(time.getTime()) : "";
  const timeStr = time
    ? time.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : "";

  let url = `${TRIP_URL}?originId=${originId}&destId=${destId}`;
  if (dateStr) url += `&date=${dateStr}`;
  if (timeStr) url += `&time=${timeStr}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timeoutId);
    if ((e as Error).name === "AbortError") {
      throw e;
    }
    throw e;
  }
  clearTimeout(timeoutId);

  if (!response.ok) throw new Error(`Trip API error: ${response.status}`);

  const data = await response.json();
  const trips = Array.isArray(data.trips) ? data.trips : [];

  const results: Departure[] = [];

  for (const trip of trips) {
    // A trip has multiple legs. We look for legs that start at originId.
    const legs = Array.isArray(trip.legs) ? trip.legs : [];
    for (const leg of legs) {
      if (globalIdToSiteId(leg.origin?.id || "") === originId) {
        const liveTime = leg.origin?.time || "";
        const parsedTime = liveTime ? parseSlTimestamp(`${leg.origin?.date || ""}T${liveTime}`) : NaN;

        if (isNaN(parsedTime)) continue;

        const minutes = Math.max(1, Math.ceil((parsedTime - Date.now()) / 60000));
        
        // Filter out past trips
        if (minutes < 0) continue;

        results.push({
          line: leg.line?.designation || leg.line?.name || "",
          lineName: leg.line?.name || "",
          destination: leg.destination?.name || "",
          direction_code: leg.direction?.code ?? 0,
          minutes,
          time: liveTime,
          expectedAt: parsedTime,
          transportType: getTransportType(leg.transport_mode),
          predicted: true, // Marked as planned
          stop_point_id: leg.origin?.stopPoint?.id,
        });
      }
    }
  }

  return results.sort((a, b) => a.minutes - b.minutes);
}

function toStockholmDateString(ts: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
/**
 * Maps SL productClasses to internal TransportType.
 * 1, 2, 4 -> metro
 * 8, 16, 32, 64 -> train
 * 128 -> bus
 * 256 -> boat
 */
export function mapProductClassesToTransportTypes(classes: number[]): TransportType[] {
  const types = new Set<TransportType>();
  for (const c of classes) {
    if (c === 1 || c === 2) types.add("metro");
    else if (c === 4) types.add("tram");
    else if (c === 8 || c === 16 || c === 32 || c === 64) types.add("train");
    else if (c === 128) types.add("bus");
    else if (c === 256) types.add("boat");
  }
  return Array.from(types);
}
