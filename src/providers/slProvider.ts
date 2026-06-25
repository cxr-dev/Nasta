import type {
  TransitProvider,
  TransitStopSearchResult,
  TransitDeparture,
  TransitDisruption,
  TransitStopSequence,
  TransitStopSequenceStop,
  TransportMode,
  EntityId,
  DepartureDataSource,
} from "./types.js";
import { SL_PRODUCT_TO_MODE } from "../types/transit.js";
import { searchSites as slSearchSites, getDepartures as slGetDepartures } from "../services/slApi.js";
import { getDeviations as slGetDeviations, pickPreferredMessageText } from "../services/slDeviations.js";
import { resolveStopSequence } from "../services/routeStops.js";
import {
  getPredictedDepartures as timetablePredicted,
  getNextScheduledDeparture as timetableNextScheduled,
  getKnownRoutes as timetableKnownRoutes,
} from "../services/timetableCache.js";
import type { Departure } from "../types/departure.js";
import type { DeviationMessage } from "../types/deviation.js";
import type { TransportType } from "../types/page.js";

/** Provider identifier prefix for EntityId resolution. */
const PROVIDER_ID = "sl";
const STOP_PREFIX = `${PROVIDER_ID}:`;

function toStopEntityId(siteId: string): EntityId {
  return `${STOP_PREFIX}${siteId}`;
}

function fromStopEntityId(entityId: EntityId): string {
  return entityId.startsWith(STOP_PREFIX) ? entityId.slice(STOP_PREFIX.length) : entityId;
}

/** Convert SL TransportType → canonical TransportMode. */
function toTransportMode(t: TransportType): TransportMode {
  // TransportType and TransportMode share bus/train/metro/tram/boat
  return t as TransportMode;
}

/** Convert Departure[] → TransitDeparture[]. */
function toTransitDepartures(deps: Departure[], stopId: EntityId): TransitDeparture[] {
  return deps.map((d) => {
    const dataSource: DepartureDataSource = d.predicted ? "predicted" : "realtime";
    return {
      id: `${stopId}|${d.line}|${d.direction_code}|${d.time}`,
      stopId,
      line: d.line,
      lineName: d.lineName,
      destination: d.destination,
      directionCode: d.direction_code,
      transportMode: toTransportMode(d.transportType),
      minutes: d.minutes,
      scheduledTime: d.time,
      expectedTime: d.expectedAt,
      dataSource,
      isFirstMorning: d.isFirstMorning,
      providerMetadata: {
        journeyRef: d.journeyRef,
        tripId: d.tripId,
        display: d.display,
        stopPointId: d.stop_point_id,
      },
    };
  });
}

/** Map SL DeviationMessage severity → canonical DisruptionSeverity (same values). */
function toDisruptionSeverity(s: string): "info" | "warning" | "critical" {
  if (s === "critical" || s === "warning" || s === "info") return s;
  return "info";
}

/** Estimate DisruptionEffect from severify/context. */
function estimateEffect(msg: DeviationMessage): "other" | "reduced_service" | "significant_delays" | "no_service" | "accessibility_issue" | "elevator_service" | "escalator_service" {
  if (msg.severity === "critical") return "no_service";
  if (msg.severity === "warning") return "significant_delays";
  return "other";
}

/** Convert DeviationMessage[] → TransitDisruption[]. */
function toTransitDisruptions(messages: DeviationMessage[]): TransitDisruption[] {
  return messages.map((msg) => {
    const text = pickPreferredMessageText(msg, "en");
    return {
      id: `sl:deviation-${msg.id}`,
      severity: toDisruptionSeverity(msg.severity),
      title: text.header,
      description: text.details,
      effect: estimateEffect(msg),
      cause: "unknown",
      affectedRoutes: msg.scope.lines.map((l) => `sl:line-${l.id}`),
      affectedStops: msg.scope.stopAreas.map((a) => `sl:stoparea-${a.id}`),
      activePeriod: {
        start: msg.publishFrom ?? msg.createdAt,
        end: msg.publishTo,
      },
      updatedAt: msg.modifiedAt,
      language: text.language,
      providerMetadata: {
        importanceLevel: msg.importanceLevel,
        influenceLevel: msg.influenceLevel,
        urgencyLevel: msg.urgencyLevel,
      },
    };
  });
}

/** Convert SiteSearchResult[] → TransitStopSearchResult[]. */
function toSearchResults(results: Array<{ siteId: string; name: string; lat?: number; lon?: number; productClasses?: number[]; matchQuality?: number; type: "stop" | "station" }>): TransitStopSearchResult[] {
  return results.map((r) => ({
    id: toStopEntityId(r.siteId),
    name: r.name,
    coord: r.lat != null && r.lon != null ? [r.lat, r.lon] : undefined,
    modes: (r.productClasses ?? []).flatMap((pc) => {
      const m = SL_PRODUCT_TO_MODE[pc];
      return m ? [m] : [];
    }),
    relevance: r.matchQuality != null ? Math.round(r.matchQuality * 20) : 50,
    locationType: r.type === "station" ? "station" : "stop",
    providerMetadata: { siteId: r.siteId },
  }));
}

/**
 * SL Transit Provider — wraps existing SL Transport API, Deviations API,
 * Journey Planner API, and learned timetable cache behind TransitProvider interface.
 */
export const slProvider: TransitProvider = {
  capabilities: {
    providerId: PROVIDER_ID,
    displayName: "SL (Storstockholms Lokaltrafik)",
    features: {
      search: true,
      realtime: true,
      schedules: true,
      predictions: true,
      disruptions: true,
      stopSequences: true,
      vehiclePositions: false,
      routeGeometry: false,
      tripMetadata: false,
      occupancy: false,
    },
    homepageUrl: "https://sl.se",
    license: "https://www.trafiklab.se/api/sl-transport",
  },

  ownsStop(stopId: EntityId): boolean {
    return stopId.startsWith(STOP_PREFIX);
  },

  async searchStops(query: string, signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
    const results = await slSearchSites(query, signal);
    return toSearchResults(results);
  },

  async getDepartures(
    stopId: EntityId,
    line?: string,
    directionCode?: number,
    signal?: AbortSignal,
  ): Promise<TransitDeparture[]> {
    const siteId = fromStopEntityId(stopId);
    const { departures } = await slGetDepartures(siteId, undefined, signal);

    let filtered = departures;
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
    const siteId = fromStopEntityId(stopId);
    const predicted = await timetablePredicted(siteId, line, directionCode, maxResults);
    return predicted.map((p) => ({
      id: `${stopId}|${p.line}|${p.direction_code}|${p.time}`,
      stopId,
      line: p.line,
      lineName: p.lineName,
      destination: p.destination,
      directionCode: p.direction_code,
      transportMode: toTransportMode(p.transportType),
      minutes: p.minutes,
      scheduledTime: p.time,
      expectedTime: p.expectedAt,
      dataSource: "predicted" as DepartureDataSource,
      isFirstMorning: false,
    }));
  },

  async getNextScheduledDeparture(
    stopId: EntityId,
    line: string,
    directionCode: number,
    _signal?: AbortSignal,
  ): Promise<TransitDeparture | null> {
    const siteId = fromStopEntityId(stopId);
    const predicted = await timetableNextScheduled(siteId, line, directionCode);
    if (!predicted) return null;
    return {
      id: `${stopId}|${predicted.line}|${predicted.direction_code}|${predicted.time}`,
      stopId,
      line: predicted.line,
      lineName: predicted.lineName,
      destination: predicted.destination,
      directionCode: predicted.direction_code,
      transportMode: toTransportMode(predicted.transportType),
      minutes: predicted.minutes,
      scheduledTime: predicted.time,
      expectedTime: predicted.expectedAt,
      dataSource: "predicted",
      isFirstMorning: false,
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
    const siteId = fromStopEntityId(stopId);
    const routes = await timetableKnownRoutes(siteId);
    return routes.map((r) => ({
      line: r.line,
      lineName: r.lineName,
      destination: r.destination,
      directionCode: r.direction_code,
      transportMode: toTransportMode(r.transportType),
    }));
  },

  async getDisruptions(
    stopIds: EntityId[],
    lineNames: string[],
  ): Promise<TransitDisruption[]> {
    const siteIds = stopIds.map(fromStopEntityId);
    const { messages } = await slGetDeviations(siteIds, lineNames);
    return toTransitDisruptions(messages);
  },

  async resolveStopId(
    stopName: string,
    signal?: AbortSignal,
  ): Promise<EntityId | null> {
    const results = await slSearchSites(stopName, signal);
    if (results.length === 0) return null;
    return toStopEntityId(results[0].siteId);
  },

  async getStopSequence(
    originStopId: EntityId,
    destinationName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitStopSequence | null> {
    const siteId = fromStopEntityId(originStopId);
    const stopNames = await resolveStopSequence(siteId, destinationName, line, directionCode, signal);
    if (!stopNames) return null;

    const stops: TransitStopSequenceStop[] = stopNames.map((name, i) => ({
      stopId: `sl:${name.toLowerCase().replace(/\s+/g, "-")}`,
      stopName: name,
      sequence: i,
    }));

    return {
      routeId: `sl:route-${line}`,
      directionCode,
      headsign: destinationName,
      stops,
    };
  },
};
