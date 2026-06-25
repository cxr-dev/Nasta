import type {
  TransitProvider,
  TransitStopSearchResult,
  TransitDeparture,
  TransportMode,
  EntityId,
  DepartureDataSource,
} from "./types.js";
import {
  getNextDepartures as staticNextDepartures,
  getFirstTomorrowDeparture,
  getStopKey,
} from "../services/staticTimetable.js";
import type { Departure } from "../types/departure.js";

const PROVIDER_ID = "sjostad";
const STOP_PREFIX = `${PROVIDER_ID}:`;

interface StopInfo {
  name: string;
  coord?: [number, number];
}

const STOP_METADATA: Record<string, StopInfo> = {
  luma_brygga: {
    name: "Lumabryggan",
    coord: [59.30566801584885, 18.099309696257656],
  },
  barnangsbryggan: {
    name: "Barnängsbryggan",
    coord: [59.30824408961144, 18.097770808925457],
  },
  henriksdalsbryggan: {
    name: "Henriksdalsbryggan",
    coord: [59.309253974378066, 18.10136473213606],
  },
};

/** Maps stopKey → directionCode → destination name. */
const DESTINATION_MAP: Record<string, Record<number, string>> = {
  luma_brygga: { 1: "Henriksdalsbryggan" },
  barnangsbryggan: { 1: "Lumabryggan", 2: "Henriksdalsbryggan" },
  henriksdalsbryggan: { 1: "Barnängsbryggan" },
};

function toStopEntityId(stopKey: string): EntityId {
  return `${STOP_PREFIX}${stopKey}`;
}

function fromStopEntityId(entityId: EntityId): string | null {
  if (!entityId.startsWith(STOP_PREFIX)) return null;
  // Normalize legacy hyphen-separated keys (sjostad:luma-brygga → sjostad:luma_brygga)
  return entityId.slice(STOP_PREFIX.length).replace(/-/g, "_");
}

function toTransitDepartures(deps: Departure[], stopId: EntityId): TransitDeparture[] {
  return deps.map((d) => ({
    id: `${stopId}|${d.line}|${d.direction_code}|${d.time}`,
    stopId,
    line: d.line,
    lineName: d.lineName,
    destination: d.destination,
    directionCode: d.direction_code,
    transportMode: "boat" as TransportMode,
    minutes: d.minutes,
    scheduledTime: d.time,
    dataSource: "static" as DepartureDataSource,
  }));
}

export const sjostadProvider: TransitProvider = {
  capabilities: {
    providerId: PROVIDER_ID,
    displayName: "Sjöstadstrafiken",
    features: {
      search: true,
      realtime: false,
      schedules: true,
      predictions: true,
      disruptions: false,
      stopSequences: false,
      vehiclePositions: false,
      routeGeometry: false,
      tripMetadata: false,
      occupancy: false,
    },
    homepageUrl: "https://vastvatten.se/sjostadstrafiken/",
  },

  ownsStop(stopId: EntityId): boolean {
    return stopId.startsWith(STOP_PREFIX);
  },

  async searchStops(query: string, _signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
    const results: TransitStopSearchResult[] = [];
    const q = query.toLowerCase();
    for (const [key, info] of Object.entries(STOP_METADATA)) {
      if (info.name.toLowerCase().includes(q)) {
        results.push({
          id: toStopEntityId(key),
          name: info.name,
          coord: info.coord,
          modes: ["boat"],
          relevance: 100,
          locationType: "stop",
        });
      }
    }
    return results;
  },

  async getDepartures(
    stopId: EntityId,
    line?: string,
    directionCode?: number,
    _signal?: AbortSignal,
  ): Promise<TransitDeparture[]> {
    const stopKey = fromStopEntityId(stopId);
    if (!stopKey) return [];
    const stopName = STOP_METADATA[stopKey]?.name;
    if (!stopName) return [];

    const all = staticNextDepartures(stopName, 20);
    let filtered = all;

    if (line != null) {
      filtered = filtered.filter((d) => d.line === line);
    }
    if (directionCode != null) {
      filtered = filtered.filter((d) => d.direction_code === directionCode);
    }

    return toTransitDepartures(filtered, stopId);
  },

  async getPredictedDepartures(
    stopId: EntityId,
    line: string,
    directionCode: number,
    maxResults: number,
  ): Promise<TransitDeparture[]> {
    const stopKey = fromStopEntityId(stopId);
    if (!stopKey) return [];
    const stopName = STOP_METADATA[stopKey]?.name;
    if (!stopName) return [];

    const deps = staticNextDepartures(stopName, maxResults)
      .filter((d) => d.line === line && d.direction_code === directionCode);
    return toTransitDepartures(deps, stopId);
  },

  async getNextScheduledDeparture(
    stopId: EntityId,
    line: string,
    directionCode: number,
    _signal?: AbortSignal,
  ): Promise<TransitDeparture | null> {
    const stopKey = fromStopEntityId(stopId);
    if (!stopKey) return null;
    const stopName = STOP_METADATA[stopKey]?.name;
    if (!stopName) return null;

    // First try upcoming departures today
    const upcoming = staticNextDepartures(stopName, 1)
      .filter((d) => d.line === line && d.direction_code === directionCode);
    if (upcoming.length > 0) {
      return toTransitDepartures(upcoming, stopId)[0];
    }

    // Fall back to first departure on next traffic day
    const first = getFirstTomorrowDeparture(stopName, line, directionCode);
    if (!first) return null;

    const destination = DESTINATION_MAP[stopKey]?.[directionCode] ?? "";
    return {
      id: `${stopId}|${line}|${directionCode}|${first.time}`,
      stopId,
      line,
      lineName: "Sjöstadstrafiken",
      destination,
      directionCode,
      transportMode: "boat",
      minutes: 0,
      scheduledTime: first.time,
      dataSource: "static",
    };
  },

  async getKnownRoutes(
    stopId: EntityId,
  ): Promise<Array<{
    line: string;
    lineName: string;
    destination: string;
    directionCode: number;
    transportMode: TransportMode;
  }>> {
    const stopKey = fromStopEntityId(stopId);
    if (!stopKey) return [];
    const stopName = STOP_METADATA[stopKey]?.name;
    if (!stopName) return [];

    const deps = staticNextDepartures(stopName, 20);
    const seen = new Set<string>();
    const routes: Array<{ line: string; lineName: string; destination: string; directionCode: number; transportMode: TransportMode }> = [];

    for (const d of deps) {
      const key = `${d.line}:${d.direction_code}`;
      if (!seen.has(key)) {
        seen.add(key);
        routes.push({
          line: d.line,
          lineName: "Sjöstadstrafiken",
          destination: d.destination,
          directionCode: d.direction_code,
          transportMode: "boat",
        });
      }
    }
    return routes;
  },

  async resolveStopId(
    stopName: string,
    _signal?: AbortSignal,
  ): Promise<EntityId | null> {
    const stopKey = getStopKey(stopName);
    if (!stopKey) return null;
    return toStopEntityId(stopKey);
  },
};
