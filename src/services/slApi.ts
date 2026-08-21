import type { Departure, SiteSearchResult } from "../types/departure";
import { cleanStopName } from "../lib/stopName";
import type { TransportType } from "../types/page";
import { getTransportType } from "../lib/getTransportType";
import type { DepartureFetchDiagnostics } from "../types/transit";
import { learnFromApiResponse } from "./timetableCache";
import { cacheScheduleTime } from "./scheduleCache";
import { stopAreaStore } from "../stores/stopAreaStore.svelte";

const TRANSPORT_URL = "https://transport.integration.sl.se/v1";
const JOURNEY_PLANNER_URL = "https://journeyplanner.integration.sl.se/v2";
const STOP_FINDER_URL = `${JOURNEY_PLANNER_URL}/stop-finder`;
const TRIP_URL = `${JOURNEY_PLANNER_URL}/trips`;
const DEFAULT_FORECAST_MINUTES = 240;
const STALE_DEPARTURE_GRACE_MS = 90_000;

type SlApiErrorKind = "timeout" | "http" | "network" | "invalid-json";

export type SlApiError = Error & {
  kind: SlApiErrorKind;
  status?: number;
  diagnostics?: DepartureFetchDiagnostics;
};

function apiError(
  message: string,
  kind: SlApiErrorKind,
  status?: number,
  diagnostics?: DepartureFetchDiagnostics,
): SlApiError {
  return Object.assign(new Error(message), { kind, status, diagnostics });
}

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
  parent?: {
    id: string;
    name: string;
    type: string;
  };
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

function parseDisplayMinutes(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  if (/^(?:nu|now)$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^(\d+)\s*(?:min|m)$/i);
  return match ? Number(match[1]) : NaN;
}

function isValidDeparture(obj: unknown): obj is Departure {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const line = o.line;
  const hasUsableTimeToDeparture =
    typeof o.timeToDeparture === "number" &&
    Number.isFinite(o.timeToDeparture) &&
    o.timeToDeparture >= 0;
  const hasUsableDisplay = Number.isFinite(parseDisplayMinutes(o.display));
  const hasTimestamp = [o.expected, o.scheduled].some(
    (value) =>
      typeof value === "string" && Number.isFinite(parseSlTimestamp(value)),
  );
  return (
    typeof line === "object" &&
    line !== null &&
    typeof o.destination === "string" &&
    typeof o.direction_code === "number" &&
    (hasTimestamp || hasUsableTimeToDeparture || hasUsableDisplay)
  );
}

export async function searchSites(
  query: string,
  signal?: AbortSignal,
): Promise<SiteSearchResult[]> {
  if (!query || query.length < 2) return [];

  const url = `${STOP_FINDER_URL}?name_sf=${encodeURIComponent(query)}&any_obj_filter_sf=2&type_sf=any`;

  const response = await fetch(url, { signal });
  if (!response.ok)
    throw apiError(
      `Search API error: ${response.status}`,
      "http",
      response.status,
    );

  let data: StopFinderResponse;
  try {
    data = await response.json();
  } catch {
    throw apiError(
      "Search API returned invalid JSON",
      "invalid-json",
      response.status,
    );
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
      locality: loc.parent?.name,
      localityId: loc.parent?.id,
      matchQuality: loc.matchQuality,
    }));

  return stations;
}

export async function getDepartures(
  siteId: string,
  forecast = DEFAULT_FORECAST_MINUTES,
  signal?: AbortSignal,
): Promise<{
  departures: Departure[];
  stopDeviations: any[];
  diagnostics: DepartureFetchDiagnostics;
}> {
  const requestedAt = Date.now();
  const startedAt = performance.now();
  const failureDiagnostics = (
    httpStatus?: number,
  ): DepartureFetchDiagnostics => ({
    requestedAt,
    durationMs: Math.round(performance.now() - startedAt),
    forecastMinutes: forecast,
    rawCount: 0,
    validCount: 0,
    invalidCount: 0,
    staleCount: 0,
    relativeFallbackCount: 0,
    httpStatus,
  });
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(
      `${TRANSPORT_URL}/sites/${siteId}/departures?forecast=${forecast}`,
      { signal: controller.signal },
    );
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
    if (signal?.aborted && !timedOut) throw e;
    if (timedOut)
      throw apiError(
        "Departure request timed out",
        "timeout",
        undefined,
        failureDiagnostics(),
      );
    const message =
      e instanceof Error && e.message ? e.message : "Departure request failed";
    throw apiError(message, "network", undefined, failureDiagnostics());
  }
  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", abortFromCaller);

  if (!response.ok)
    throw apiError(
      `API error: ${response.status}`,
      "http",
      response.status,
      failureDiagnostics(response.status),
    );

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw apiError(
      "Departure API returned invalid JSON",
      "invalid-json",
      response.status,
      failureDiagnostics(response.status),
    );
  }
  learnFromApiResponse(siteId, data.departures || []).catch(() => {});

  const rawDeps = Array.isArray(data.departures) ? data.departures : [];
  const stopDeviations = Array.isArray(data.stop_deviations)
    ? data.stop_deviations
    : [];
  const validDeps = rawDeps.filter(isValidDeparture);
  let staleCount = 0;
  let relativeFallbackCount = 0;

  // Extract stop_area.id from departure responses and publish to stopAreaStore
  // This enables disruption matching via Deviations API stop area lookup
  for (const dep of rawDeps) {
    if (dep?.stop_area?.id) {
      stopAreaStore.setMapping(siteId, String(dep.stop_area.id));
      break; // One mapping per siteId is sufficient
    }
  }

  const departures = validDeps.flatMap((dep: any) => {
    const timestampCandidate = [dep.expected, dep.scheduled].find(
      (value) =>
        typeof value === "string" && Number.isFinite(parseSlTimestamp(value)),
    );
    const liveTime = timestampCandidate ?? "";
    const parsedTime = liveTime ? parseSlTimestamp(liveTime) : NaN;
    const apiMinutes =
      typeof dep.timeToDeparture === "number" &&
      Number.isFinite(dep.timeToDeparture)
        ? dep.timeToDeparture
        : NaN;
    const displayMinutes = parseDisplayMinutes(dep.display);

    if (
      Number.isNaN(parsedTime) &&
      Number.isNaN(apiMinutes) &&
      Number.isNaN(displayMinutes)
    )
      return [];

    // Prioritize computed minutes from parsed timestamp
    let minutes: number;

    if (!Number.isNaN(parsedTime)) {
      // Compute from absolute timestamp (most reliable)
      const now = Date.now();
      if (parsedTime < now - STALE_DEPARTURE_GRACE_MS) {
        const relativeMinutes = !Number.isNaN(apiMinutes)
          ? apiMinutes
          : displayMinutes;
        if (Number.isNaN(relativeMinutes) || relativeMinutes <= 0) {
          staleCount += 1;
          return [];
        }
        relativeFallbackCount += 1;
        minutes = Math.max(0, Math.ceil(relativeMinutes));
      } else {
        minutes = Math.max(0, Math.ceil((parsedTime - now) / 60000));
      }
    } else {
      // Use the provider's relative value only when no usable timestamp exists.
      minutes = !Number.isNaN(apiMinutes)
        ? Math.max(0, Math.ceil(apiMinutes))
        : Math.max(0, Math.ceil(displayMinutes));
    }

    const formattedTime =
      !Number.isNaN(parsedTime) &&
      parsedTime >= Date.now() - STALE_DEPARTURE_GRACE_MS
        ? formatTime(new Date(parsedTime))
        : "";

    // Extract scheduled time from API response and cache it
    const scheduledTime =
      typeof dep.scheduled === "string" ? parseSlTimestamp(dep.scheduled) : NaN;
    if (Number.isFinite(scheduledTime)) {
      const scheduledDate = new Date(scheduledTime);
      const line = dep.line?.designation || dep.line?.name || "";
      const direction_code = dep.direction_code ?? 0;
      cacheScheduleTime(siteId, line, direction_code, scheduledDate).catch(
        () => {},
      );
    }

    // Extract departure-level deviations (plural "deviations" field from SL API)
    const depDeviations = Array.isArray(dep.deviations)
      ? dep.deviations.map((d: any) => ({
          importance_level: d.importance_level ?? 0,
          consequence: d.consequence ?? "INFORMATION",
          message: d.message ?? "",
        }))
      : undefined;

    return [
      {
        line: dep.line?.designation || dep.line?.name || "",
        lineName: dep.line?.name || "",
        destination: dep.destination || "",
        direction_code: dep.direction_code ?? 0,
        minutes,
        time: formattedTime,
        expectedAt: Number.isFinite(parsedTime) ? parsedTime : undefined,
        deviations: depDeviations,
        transportType: getTransportType(dep.line?.transport_mode),
        // SL API exposes journey.id — used for vehicle position estimation in the progress strip
        journeyRef:
          dep.journey?.id != null ? String(dep.journey.id) : undefined,
        // SL API exposes trip.id — fallback for cache key when journeyRef is missing
        tripId: dep.trip?.id != null ? String(dep.trip.id) : undefined,
        // SL's pre-calculated display — always correct, use as fallback
        display: dep.display,
        // SL API provides stop point ID
        stop_point_id: dep.stop_point?.id ?? undefined,
      },
    ];
  });

  const diagnostics: DepartureFetchDiagnostics = {
    requestedAt,
    durationMs: Math.round(performance.now() - startedAt),
    forecastMinutes: forecast,
    rawCount: rawDeps.length,
    validCount: departures.length,
    invalidCount: rawDeps.length - validDeps.length,
    staleCount,
    relativeFallbackCount,
    httpStatus: response.status,
  };

  return { departures, stopDeviations, diagnostics };
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

  const originGlobalId = `9091001000${originId}`;
  const destGlobalId = `9091001000${destId}`;
  let url = `${TRIP_URL}?type_origin=any&type_destination=any&name_origin=${originGlobalId}&name_destination=${destGlobalId}`;
  if (dateStr) url += `&date=${dateStr}`;
  if (timeStr) url += `&time=${timeStr}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

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
  const journeys = Array.isArray(data.journeys) ? data.journeys : [];

  const results: Departure[] = [];

  for (const journey of journeys) {
    // A journey has multiple legs. We look for legs that start at originId.
    const legs = Array.isArray(journey.legs) ? journey.legs : [];
    for (const leg of legs) {
      if (globalIdToSiteId(leg.origin?.id || "") === originId) {
        const liveTime = leg.origin?.time || "";
        const parsedTime = liveTime
          ? parseSlTimestamp(`${leg.origin?.date || ""}T${liveTime}`)
          : NaN;

        if (isNaN(parsedTime)) continue;

        const minutes = Math.max(
          1,
          Math.ceil((parsedTime - Date.now()) / 60000),
        );

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
export function mapProductClassesToTransportTypes(
  classes: number[],
): TransportType[] {
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
