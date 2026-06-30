import type { Departure, DepartureDeviation } from "../types/departure";
import type { TransportType } from "../types/page";
import type { TransitDeparture } from "../providers/types";

/** Convert TransitDeparture → legacy Departure for backward compat with components.
 *  Fixes: maps expectedTime→expectedAt, reads stopPointId from providerMetadata,
 *  distinguishes static vs predicted dataSource. */
export function toLegacyDeparture(td: TransitDeparture): Departure {
  const meta = td.providerMetadata ?? {};
  return {
    line: td.line,
    lineName: td.lineName,
    destination: td.destination,
    direction_code: td.directionCode,
    minutes: td.minutes,
    time: td.scheduledTime,
    expectedAt: td.expectedTime,
    predicted: td.dataSource === "predicted", // only predicted cache, not static/scheduled
    transportType: td.transportMode === "ferry" ? "boat" : (td.transportMode as TransportType),
    isFirstMorning: td.isFirstMorning,
    display: meta.display as string | undefined,
    journeyRef: meta.journeyRef as string | undefined,
    tripId: meta.tripId as string | undefined,
    deviations: meta.deviations as DepartureDeviation[] | undefined,
    stop_point_id:
      (meta.stopPointId as string | undefined) ??
      (meta.stop_point_id as string | undefined),
  };
}

/** Convert raw siteId (e.g. "1234", "sjostad-luma") to EntityId (e.g. "sl:1234", "sjostad:luma"). */
export function toEntityId(siteId: string): string {
  if (siteId.startsWith("sjostad-")) return `sjostad:${siteId.slice(8)}`;
  if (siteId.includes(":")) return siteId;
  return `sl:${siteId}`;
}
