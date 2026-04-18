import type { Departure, SiteSearchResult } from "../types/departure";
import type { TransportType } from "../types/route";
import { learnFromApiResponse } from "./timetableCache";
import { cacheScheduleTime } from "./scheduleCache";

const TRANSPORT_URL = "https://transport.integration.sl.se/v1";
const STOP_FINDER_URL = "https://journeyplanner.integration.sl.se/v2/stop-finder";
const DEFAULT_FORECAST_MINUTES = 240;

/**
 * Parse SL API timestamps as Stockholm local time using Intl-based DST-aware conversion.
 * SL returns local time without timezone suffix (e.g., "2026-04-18T00:22:57").
 * Sweden uses Europe/Stockholm (UTC+1 winter, UTC+2 summer DST).
 */
export function parseSlTimestamp(raw: string): number {
  if (!raw) return 0;

  const datePart = raw.substring(0, 10);
  const timePart = raw.substring(11, 19);

  const stockholmDateStr = `${datePart}T${timePart}`;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const offsetParts = formatter.formatToParts(new Date(stockholmDateStr));
  const getPart = (type: string) => offsetParts.find(p => p.type === type)?.value;
  const year = getPart('year')!;
  const month = getPart('month')!;
  const day = getPart('day')!;
  const hour = getPart('hour')!;
  const minute = getPart('minute')!;
  const second = getPart('second')!;

  const utcMs = Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );

  return utcMs;
}

function getTransportType(mode?: string): TransportType {
  switch (mode?.toLowerCase()) {
    case "bus":
      return "bus";
    case "train":
    case "rail":
      return "train";
    case "metro":
      return "metro";
    case "boat":
    case "ferry":
      return "boat";
    default:
      return "bus";
  }
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
    typeof o.direction === "string"
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
    if (import.meta.env.DEV) console.error("[SL API] Search error:", response.status);
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
    .filter((loc): loc is StopFinderLocation => isValidStopFinderResult(loc) && loc.type === "stop")
    .map((loc) => ({
      siteId: globalIdToSiteId(loc.id),
      name: loc.name,
      note: undefined,
      type: "stop" as const,
      lat: loc.coord?.[0],
      lon: loc.coord?.[1],
    }));

  return stations;
}

export async function getDepartures(
  siteId: string,
  forecast = DEFAULT_FORECAST_MINUTES,
): Promise<Departure[]> {
  const response = await fetch(
    `${TRANSPORT_URL}/sites/${siteId}/departures?forecast=${forecast}`,
  );
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  learnFromApiResponse(siteId, data.departures || []);

  const rawDeps = Array.isArray(data.departures) ? data.departures : [];
  const validDeps = rawDeps.filter(isValidDeparture);

  return validDeps.map((dep: any) => {
    let minutes = dep.timeToDeparture;
    const liveTime = dep.expected || dep.scheduled || "";
    const parsedTime = liveTime ? parseSlTimestamp(liveTime) : NaN;
    if (minutes === undefined && liveTime && !isNaN(parsedTime)) {
      minutes = Math.max(0, Math.floor((parsedTime - Date.now()) / 60000));
    }
    const formattedTime = !isNaN(parsedTime) ? formatTime(new Date(parsedTime)) : "";

    // Extract scheduled time from API response and cache it
    if (dep.scheduled) {
      const scheduledDate = new Date(parseSlTimestamp(dep.scheduled));
      const direction = dep.direction || "";
      const line = dep.line?.designation || dep.line?.name || "";
      cacheScheduleTime(siteId, line, direction, scheduledDate);
    }

    return {
      line: dep.line?.designation || dep.line?.name || "",
      lineName: dep.line?.name || "",
      destination: dep.destination || "",
      directionText: dep.direction || "",
      minutes: minutes ?? 0,
      time: formattedTime,
      expectedAt: dep.expected ? parseSlTimestamp(dep.expected) : undefined,
      deviation: dep.deviation,
      transportType: getTransportType(dep.line?.transport_mode),
      // SL API exposes journey.id — used for vehicle position estimation in the progress strip
      journeyRef: dep.journey?.id != null ? String(dep.journey.id) : undefined,
      // SL's pre-calculated display — always correct, use as fallback
      display: dep.display,
    };
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
