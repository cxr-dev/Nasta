/** Re-export canonical provider types for cleaner imports.
 *  Provider implementations import from here instead of the large transit.ts.
 */
export type {
  EntityId,
  Coord,
  NearbyStopQuery,
  StopId,
  RouteId,
  TripId,
  TransportMode,
  TransitStopSearchResult,
  TransitDeparture,
  TransitDisruption,
  TransitStopSequence,
  TransitStopSequenceStop,
  TransitTrip,
  TransitScheduledTime,
  TransitRealtimeUpdate,
  TransitVehiclePosition,
  TransitShape,
  TransitProvider,
  ProviderCapabilities,
  ProviderRegistry,
  TransitService,
  DisruptionSeverity,
  DisruptionEffect,
  DisruptionCause,
  DepartureDataSource,
  RealtimeScheduleRelationship,
  OccupancyStatus,
} from "../types/transit.js";

export { parseEntityId, GTFS_ROUTE_TYPE_TO_MODE, SL_PRODUCT_TO_MODE } from "../types/transit.js";
