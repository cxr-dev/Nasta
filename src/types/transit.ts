// ─── Identity System ────────────────────────────────────────────

/** Composite identity: `${ProviderId}:${LocalId}`.
 *  Examples: "sl:1234", "sjostad:luma", "gtfs-se:740000001"
 */
export type EntityId = string;

/** EntityId scoped to a stop (for readability in interfaces) */
export type StopId = EntityId;

/** EntityId scoped to a route */
export type RouteId = EntityId;

/** EntityId scoped to a trip */
export type TripId = EntityId;

/** EntityId scoped to a shape (route geometry) */
export type ShapeId = EntityId;

/** Parse an EntityId into its components. */
export function parseEntityId(id: EntityId): { providerId: string; localId: string } {
  const colon = id.indexOf(":");
  if (colon === -1) return { providerId: "", localId: id };
  return {
    providerId: id.slice(0, colon),
    localId: id.slice(colon + 1),
  };
}

// ─── Base Types ────────────────────────────────────────────────

/** WGS84 coordinate pair [latitude, longitude] */
export type Coord = [number, number];

// ─── Enums ─────────────────────────────────────────────────────

/** Canonical transport mode taxonomy, priority-ordered by display prominence.
 *  "ferry" = road ferry (short car-capable crossing)
 *  "boat"  = passenger boat / water bus
 */
export type TransportMode =
  | "train"
  | "metro"
  | "tram"
  | "bus"
  | "boat"
  | "ferry";

/** GTFS location_type equivalents */
export type StopLocationType =
  | "stop"           // Simple stop / platform
  | "station"        // Station containing platforms
  | "entrance"       // Station entrance/exit
  | "boarding_area"  // Specific boarding point on platform
  | "generic_node";  // Generic pathway node

/** Data source of a departure */
export type DepartureDataSource =
  | "realtime"   // Confirmed by live feed
  | "predicted"  // Predicted from learned schedule
  | "scheduled"  // Static schedule only
  | "static";    // Hardcoded timetable (ferry)

/** Disruption severity */
export type DisruptionSeverity =
  | "info"      // Informational, no service impact
  | "warning"   // Minor delays or changes
  | "critical"; // Major disruption, service stopped

/** Disruption effect on service */
export type DisruptionEffect =
  | "no_service"
  | "reduced_service"
  | "significant_delays"
  | "detour"
  | "additional_service"
  | "modified_service"
  | "stop_moved"
  | "accessibility_issue"
  | "elevator_service"
  | "escalator_service"
  | "other";

/** Disruption cause (if known) */
export type DisruptionCause =
  | "unknown"
  | "other"
  | "technical_problem"
  | "strike"
  | "demonstration"
  | "accident"
  | "holiday"
  | "weather"
  | "maintenance"
  | "construction"
  | "police_activity"
  | "medical_emergency";

/** Transfer connection type */
export type TransferType =
  | "indoor"        // Within same station complex
  | "tunnel"        // Underground passage between nearby stations
  | "cross_street"  // Outdoor, street-level crossing
  | "outdoor";      // Outdoor walk between distinct stops

/** Schedule relationship for realtime updates */
export type RealtimeScheduleRelationship =
  | "scheduled"  // Running as scheduled
  | "skipped"    // Stop is skipped
  | "no_data";   // No realtime data for this stop

// ─── Mode Mapping Reference Tables ────────────────────────────

/** Bidirectional GTFS route_type → TransportMode */
export const GTFS_ROUTE_TYPE_TO_MODE: Record<number, TransportMode> = {
  0: "tram", 1: "metro", 2: "train", 3: "bus",
  4: "ferry", 5: "tram", 6: "tram", 7: "tram",
  11: "bus", 12: "train",
  100: "train",
  200: "bus",
  400: "boat",
  700: "bus",
  800: "bus",
  900: "tram",
  1000: "boat",
  1100: "ferry",
  1200: "boat",
  1500: "bus",
};

/** Map SL product class bitmask → TransportMode */
export const SL_PRODUCT_TO_MODE: Record<number, TransportMode> = {
  1: "metro", 2: "metro",
  4: "tram",
  8: "train", 16: "train", 32: "train", 64: "train",
  128: "bus",
  256: "boat",
};

// ═══════════════════════════════════════════════════════════════
// CORE DOMAIN TYPES (implement now)
// ═══════════════════════════════════════════════════════════════

// ─── TransitStop ─────────────────────────────────────────────

/** A place where passengers board/alight.
 *  Unifies SL site/stop-point, GTFS stop/platform/station, hardcoded pier.
 */
export interface TransitStop {
  /** Provider-scoped composite ID */
  id: EntityId;

  /** Human-readable name (rider-facing) */
  name: string;

  /** WGS84 [lat, lon] */
  coord?: Coord;

  /** Transport modes available at this stop */
  modes: TransportMode[];

  /** Type of stop location */
  locationType: StopLocationType;

  /** Parent station/stop-area EntityId, if any */
  parentId?: EntityId;

  /** Wheelchair boarding (0=unknown, 1=accessible, 2=inaccessible) */
  wheelchairBoarding?: 0 | 1 | 2;

  /** Platform identifier (e.g. "A", "3") */
  platformCode?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

/** Lighter version for search UI */
export interface TransitStopSearchResult {
  id: EntityId;
  name: string;
  coord?: Coord;
  modes: TransportMode[];
  /** Relevance score 0–100 */
  relevance: number;
  /** Distance from search reference point, meters */
  distance?: number;
  locationType: StopLocationType;
  locality?: string;
  providerMetadata?: Record<string, unknown>;
}

// ─── TransitRoute ────────────────────────────────────────────

/** A named transit line/route.
 *  GTFS route, SL line designation, ferry line.
 */
export interface TransitRoute {
  /** Provider-scoped route ID */
  id: EntityId;

  /** Short designation (e.g. "4", "SL 67", "SJO") */
  shortName: string;

  /** Full descriptive name (e.g. "Gullmarsplan – Radiohuset") */
  longName?: string;

  /** Transport mode */
  mode: TransportMode;

  /** Agency/operator name */
  agencyName?: string;

  /** Route color (#RRGGBB) */
  color?: string;

  /** Text color for contrast (#RRGGBB) */
  textColor?: string;

  /** Route description */
  description?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── TransitTrip ─────────────────────────────────────────────

/** A single scheduled vehicle journey on a route.
 *  GTFS trip, SL journey, ferry departure.
 */
export interface TransitTrip {
  /** Provider-scoped trip ID */
  id: EntityId;

  /** Route this trip belongs to */
  routeId: EntityId;

  /** Headsign / destination display */
  headsign: string;

  /** Direction code (provider-defined, typically 0=outbound, 1=inbound) */
  directionCode: number;

  /** Service date (YYYY-MM-DD Stockholm time) */
  serviceDate: string;

  /** Start time on service date (HH:MM:SS) */
  startTime?: string;

  /** Whether this trip can provide realtime updates */
  isRealtimeCapable?: boolean;

  /** Vehicle type for this specific trip (overrides route.mode if set) */
  vehicleType?: TransportMode;

  /** Wheelchair accessible (0=unknown, 1=yes, 2=no) */
  wheelchairAccessible?: 0 | 1 | 2;

  /** Bike allowed (0=unknown, 1=yes, 2=no) */
  bikesAllowed?: 0 | 1 | 2;

  /** Shape ID for route geometry (references TransitShape) */
  shapeId?: EntityId;

  /** Block ID — vehicle serves multiple trips in one block */
  blockId?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── TransitScheduledTime (StopTime) ─────────────────────────

/** A scheduled arrival/departure at a specific stop within a trip.
 *  GTFS stop_time, SL departure, ferry timetable row.
 *  Required for intermediate stop lists, direction previews,
 *  and transfer timing.
 */
export interface TransitScheduledTime {
  /** Trip this stop-time belongs to */
  tripId: EntityId;

  /** Stop this time is for */
  stopId: EntityId;

  /** Stop sequence in trip (0-based) */
  stopSequence: number;

  /** Scheduled arrival time (HH:MM:SS, may be >24:00 for next day) */
  scheduledArrival: string;

  /** Scheduled departure time (HH:MM:SS, may be >24:00 for next day) */
  scheduledDeparture: string;

  /** Pickup type (0=regular, 1=none, 2=phone, 3=driver) */
  pickupType?: 0 | 1 | 2 | 3;

  /** Drop-off type (0=regular, 1=none, 2=phone, 3=driver) */
  dropOffType?: 0 | 1 | 2 | 3;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── TransitDeparture (Rider-Facing) ─────────────────────────

/** A human-visible upcoming departure from a stop.
 *  Aggregates schedule + realtime + prediction.
 *  NOT the same as GTFS stop_time or SL API departure —
 *  this is the merged, deduplicated, display-ready view.
 */
export interface TransitDeparture {
  /** Synthetic ID: `${stopId}|${line}|${directionCode}|${scheduledDeparture}` */
  id: string;

  /** Stop this departure is from */
  stopId: EntityId;

  /** Route identifier */
  routeId?: EntityId;

  /** Line designation (e.g. "4", "SJO", "67") */
  line: string;

  /** Human-readable line name */
  lineName: string;

  /** Destination / headsign */
  destination: string;

  /** Direction code (provider-defined, 0=outbound default) */
  directionCode: number;

  /** Transport mode */
  transportMode: TransportMode;

  /** Minutes until departure (computed, integer) */
  minutes: number;

  /** Scheduled departure time (HH:MM, local time) */
  scheduledTime: string;

  /** Expected departure timestamp (epoch ms), null if unknown */
  expectedTime?: number;

  /** Delay in seconds (positive=late, negative=early, 0=on time) */
  delaySeconds?: number;

  /** Data source classification */
  dataSource: DepartureDataSource;

  /** Whether this is the first departure after overnight gap */
  isFirstMorning?: boolean;

  /** Provider-specific data (journeyRef, tripId, display, etc.) */
  providerMetadata?: Record<string, unknown>;
}

/** Trip reference — for showing trip continuation / stop sequence */
export interface TransitTripRef {
  tripId: EntityId;
  routeId: EntityId;
  headsign: string;
  directionCode: number;
}

// ─── TransitStopSequence (Direction Preview) ─────────────────

/** Ordered stops along a route in a given direction.
 *  Powers direction selector UI and intermediate stop visualization.
 */
export interface TransitStopSequence {
  /** Route identifier */
  routeId: EntityId;

  /** Direction code */
  directionCode: number;

  /** Headsign */
  headsign: string;

  /** Ordered stops */
  stops: TransitStopSequenceStop[];

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

export interface TransitStopSequenceStop {
  stopId: EntityId;
  stopName: string;
  /** Sequence index (0-based) */
  sequence: number;
}

// ─── TransitDisruption ──────────────────────────────────────

/** Service disruption, delay, or alert.
 *  Merges SL Deviations, GTFS-RT ServiceAlert, manual notices.
 *  Facility alerts (elevator/escalator) use
 *  effect="elevator_service" | "escalator_service" | "accessibility_issue"
 *  — no separate StationFacilityAlert type.
 */
export interface TransitDisruption {
  /** Provider-scoped disruption ID */
  id: EntityId;

  /** Severity classification */
  severity: DisruptionSeverity;

  /** Short title (rider-facing) */
  title: string;

  /** Detailed description (HTML or plain text) */
  description?: string;

  /** Effect on service */
  effect: DisruptionEffect;

  /** Cause (if known) */
  cause?: DisruptionCause;

  /** Affected routes */
  affectedRoutes: EntityId[];

  /** Affected stops */
  affectedStops: EntityId[];

  /** Active time window */
  activePeriod?: {
    start: number;   // epoch ms
    end?: number;    // epoch ms, no end = ongoing
  };

  /** When this was last updated (epoch ms) */
  updatedAt: number;

  /** URL for more information */
  url?: string;

  /** Language of text fields (BCP 47) */
  language?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── StationExit ────────────────────────────────────────────

/** Entrance/exit of a station.
 *  Powers "best exit recommendation": upon arrival, which exit to take
 *  for fastest walk to destination.
 *  Initial data: manually curated JSON for key stations.
 *  Long term: derived from OpenStreetMap node + footway relations.
 */
export interface StationExit {
  /** Provider-scoped ID. E.g. "sl:exit-tcen-norra" */
  id: EntityId;

  /** Human-readable name. "Norra utgången mot Sergels Torg" */
  name: string;

  /** WGS84 [lat, lon] — where the exit surfaces */
  coord: Coord;

  /** Parent station EntityId. E.g. "sl:9101" (T-Centralen) */
  parentStationId: EntityId;

  /** Which platform sections this exit connects to */
  connectedPlatforms: EntityId[];

  /** Does this exit lead to street level? (vs underground passage) */
  streetLevel: boolean;

  /** Wheelchair accessible exit */
  wheelchairAccessible?: boolean;

  /** Cardinal direction or landmark reference */
  directionLabel?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── PlatformSection ────────────────────────────────────────

/** Subsection of a platform. Slussen bus terminal has "Läge A-F".
 *  T-Centralen metro has "A"/"B"/"C"/"U" sections on blue line.
 *  Powers "best carriage recommendation": which carriage to board
 *  so you exit at the right section for fastest transfer or exit.
 *  Initial data: manually curated JSON.
 *  Long term: OSM platform ways.
 */
export interface PlatformSection {
  /** Provider-scoped ID. E.g. "sl:platform-tcen-14-A" */
  id: EntityId;

  /** Short label. "A", "B", "C", "Främre", "Bakre", "Läge C" */
  name: string;

  /** Parent platform stop EntityId. E.g. "sl:node-tcen-14" */
  parentPlatformId: EntityId;

  /** Which carriage numbers align with this section.
   *  [1, 2, 3] = front three carriages stop here.
   */
  carriagePositions: number[];

  /** Nearest exit from this section (shortest walking path) */
  nearestExitId?: EntityId;

  /** Position label on platform (north end, south end, middle) */
  positionLabel?: string;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── TransferConnection ─────────────────────────────────────

/** Walking connection between two stops, platforms, or exits.
 *  Powers "transfer optimization".
 *  Single type, classified — not split into subclasses.
 *  Initial data: manually curated JSON.
 *  Long term: OSM footway network routing.
 */
export interface TransferConnection {
  /** Provider-scoped ID. E.g. "sl:transfer-tcen-14A-to-21" */
  id: EntityId;

  /** Origin stop/platform/exit EntityId */
  fromStopId: EntityId;

  /** Destination stop/platform/exit EntityId */
  toStopId: EntityId;

  /** Classification: what kind of transfer */
  transferType: TransferType;

  /** Estimated walking time in seconds */
  walkingTimeSeconds: number;

  /** Estimated walking distance in meters */
  distanceMeters?: number;

  /** Wheelchair accessible route */
  accessible: boolean;

  /** Human-readable directions. "Följ skyltar mot grön linje" */
  directions?: string;

  /** Cardinal bearing from origin to destination (degrees) */
  bearing?: number;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// FUTURE DOMAIN TYPES (defined, not implemented in Phase 2-10)
// ═══════════════════════════════════════════════════════════════

// ─── TransitRealtimeUpdate ──────────────────────────────────

/** Real-time update for a specific trip at a specific stop.
 *  Future — not implemented in Phase 2-10. Defined for forward compatibility.
 */
export interface TransitRealtimeUpdate {
  /** Trip being updated */
  tripId: EntityId;

  /** Stop this update applies to */
  stopId: EntityId;

  /** Stop sequence (0-based) */
  stopSequence?: number;

  /** Predicted arrival time (epoch ms) */
  arrivalTime?: number;

  /** Predicted departure time (epoch ms) */
  departureTime?: number;

  /** Arrival delay in seconds */
  arrivalDelay?: number;

  /** Departure delay in seconds */
  departureDelay?: number;

  /** Schedule relationship */
  scheduleRelationship: RealtimeScheduleRelationship;

  /** Uncertainty in seconds (±) */
  uncertainty?: number;

  /** Timestamp when this update was generated (epoch ms) */
  timestamp: number;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

// ─── TransitVehiclePosition ─────────────────────────────────

/** Live vehicle position and status.
 *  Future — not implemented in Phase 2-10. Defined for forward compatibility.
 */
export interface TransitVehiclePosition {
  /** Vehicle identifier */
  vehicleId: string;

  /** Vehicle label (rider-visible, e.g. train car number) */
  vehicleLabel?: string;

  /** Current trip, if known */
  tripId?: EntityId;

  /** Current position */
  position: {
    lat: number;
    lon: number;
    /** Bearing in degrees (0=north, 90=east) */
    bearing?: number;
    /** Speed in m/s */
    speed?: number;
    /** Odometer in meters */
    odometer?: number;
  };

  /** Current stop (next stop or current if stopped) */
  currentStopId?: EntityId;

  /** Current stop sequence number */
  currentStopSequence?: number;

  /** Vehicle status relative to current stop */
  stopStatus: VehicleStopStatus;

  /** Timestamp of position reading (epoch ms) */
  timestamp: number;

  /** Congestion level */
  congestion?: CongestionLevel;

  /** Occupancy status */
  occupancy?: OccupancyStatus;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

export type VehicleStopStatus =
  | "incoming_at"
  | "stopped_at"
  | "in_transit_to"
  | "unknown";

export type CongestionLevel =
  | "unknown"
  | "running_smoothly"
  | "stop_and_go"
  | "congestion"
  | "severe_congestion";

export type OccupancyStatus =
  | "empty"
  | "many_seats_available"
  | "few_seats_available"
  | "standing_room_only"
  | "crushed_standing_room_only"
  | "full"
  | "not_accepting_passengers"
  | "unknown";

// ─── TransitShape (Route Geometry) ──────────────────────────

/** Geographic path of a route/trip for map visualization.
 *  Future — not implemented in Phase 2-10. Defined for forward compatibility.
 */
export interface TransitShape {
  /** Provider-scoped shape ID */
  id: EntityId;

  /** Ordered sequence of points */
  points: TransitShapePoint[];

  /** Total distance in meters */
  totalDistance?: number;

  /** Provider-specific data */
  providerMetadata?: Record<string, unknown>;
}

export interface TransitShapePoint {
  lat: number;
  lon: number;
  /** Sequence index (0-based) */
  sequence: number;
  /** Cumulative distance traveled from start (meters) */
  distanceTraveled?: number;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER TYPES
// ═══════════════════════════════════════════════════════════════

// ─── ProviderCapabilities ───────────────────────────────────

/** Declared capabilities of a transit provider.
 *  TransitService uses this to route requests.
 */
export interface ProviderCapabilities {
  /** Unique provider identifier (e.g. "sl", "sjostad") */
  providerId: string;

  /** Human-readable display name */
  displayName: string;

  /** What this provider can do */
  features: {
    /** Stop search (text → results) */
    search: boolean;
    /** Real-time departures (live data) */
    realtime: boolean;
    /** Static schedule (timetable) */
    schedules: boolean;
    /** Schedule-based predictions (learned patterns) */
    predictions: boolean;
    /** Service disruptions/alerts */
    disruptions: boolean;
    /** Trip-based stop sequences (direction preview) */
    stopSequences: boolean;
    /** Live vehicle GPS positions */
    vehiclePositions: boolean;
    /** Route geometry (shapes) for maps */
    routeGeometry: boolean;
    /** Trip metadata (vehicle type, accessibility, etc.) */
    tripMetadata: boolean;
    /** Occupancy / crowding data */
    occupancy: boolean;
  };

  /** URL to provider home page (for attribution) */
  homepageUrl?: string;

  /** License / terms */
  license?: string;

  /** Attribution text */
  attribution?: string;
}

// ─── TransitProvider Interface ──────────────────────────────

/** Interface implemented by every transit data source.
 *  New providers implement this + register with ProviderRegistry.
 *  Goal: adding a new provider = 1 file + 1 registry line.
 *  Optional methods are guarded by capabilities.features checks.
 */
export interface TransitProvider {
  readonly capabilities: ProviderCapabilities;

  // ─── Identification ──────────────────────

  /** Does this provider own the given stop?
   *  Simple prefix check: stopId.startsWith(`${provider.id}:`).
   *  Returns boolean — EntityId prefix IS the resolution key.
   */
  ownsStop(stopId: EntityId): boolean;

  // ─── Search ──────────────────────────────

  /** Search stops matching query text. */
  searchStops?(
    query: string,
    signal?: AbortSignal,
  ): Promise<TransitStopSearchResult[]>;

  // ─── Departures ──────────────────────────

  /** Get upcoming departures for a stop, optionally filtered. */
  getDepartures(
    stopId: EntityId,
    line?: string,
    directionCode?: number,
    signal?: AbortSignal,
  ): Promise<{ departures: TransitDeparture[]; stopDeviations: any[] }>;

  /** Get predicted future departures (schedule-based, not live).
   *  Used for "sleeping" state (late night / early morning).
   */
  getPredictedDepartures?(
    stopId: EntityId,
    line: string,
    directionCode: number,
    maxResults: number,
  ): Promise<TransitDeparture[]>;

  /** Get the next single departure regardless of time horizon. */
  getNextScheduledDeparture?(
    stopId: EntityId,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitDeparture | null>;

  /** Get all known routes/lines serving a stop. */
  getKnownRoutes?(
    stopId: EntityId,
  ): Promise<Array<{
    line: string;
    lineName: string;
    destination: string;
    directionCode: number;
    transportMode: TransportMode;
  }>>;

  // ─── Disruptions ────────────────────────

  /** Get active disruptions affecting given stops/lines. */
  getDisruptions?(
    stopIds: EntityId[],
    lineNames: string[],
  ): Promise<TransitDisruption[]>;

  // ─── Stop Resolution ────────────────────

  /** Resolve stop ID from human-readable name (for saved favorites). */
  resolveStopId?(
    stopName: string,
    signal?: AbortSignal,
  ): Promise<EntityId | null>;

  // ─── Stop Sequences ─────────────────────

  /** Get ordered stops along a route in a direction. */
  getStopSequence?(
    originStopId: EntityId,
    destinationName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitStopSequence | null>;

  // ─── Vehicle Positions ──────────────────

  /** Get live vehicle positions for given trip(s). */
  getVehiclePositions?(
    tripIds: EntityId[],
    routeId?: EntityId,
    signal?: AbortSignal,
  ): Promise<TransitVehiclePosition[]>;

  // ─── Route Geometry ────────────────────

  /** Get route geometry (shape) for map rendering. */
  getRouteShape?(
    shapeId: EntityId,
    signal?: AbortSignal,
  ): Promise<TransitShape | null>;

  // ─── Trip Details ───────────────────────

  /** Get full trip metadata (all stop times for a trip). */
  getTripDetails?(
    tripId: EntityId,
    signal?: AbortSignal,
  ): Promise<{
    trip: TransitTrip;
    stopTimes: TransitScheduledTime[];
  } | null>;

  /** Get realtime updates for a trip. */
  getRealtimeUpdates?(
    tripId: EntityId,
    signal?: AbortSignal,
  ): Promise<TransitRealtimeUpdate[]>;
}

// ─── ProviderRegistry Interface ─────────────────────────────

/** Registry of all transit providers.
 *  Resolves providers by EntityId prefix — O(1) hash lookup.
 *  TransitService delegates to the owning provider.
 */
export interface ProviderRegistry {
  /** Register a provider. Keyed by provider.capabilities.providerId. */
  register(provider: TransitProvider): void;

  /** Find provider owning a given stop.
   *  Parses prefix from EntityId (e.g. "sl:1234" → "sl")
   *  and does O(1) hash lookup.
   */
  resolve(stopId: EntityId): TransitProvider | null;

  /** All providers that support a given feature. */
  withFeature(feature: keyof ProviderCapabilities["features"]): TransitProvider[];

  /** All registered providers. */
  getAll(): TransitProvider[];
}

// ─── TransitService Interface ───────────────────────────────

/** Single entry point for transit data.
 *  Stores and UI components call this — never providers directly.
 *  Aggregates results from all registered providers.
 */
export interface TransitService {
  // Search
  searchStops(query: string, signal?: AbortSignal): Promise<TransitStopSearchResult[]>;

  // Departures
  getDepartures(
    stopId: EntityId,
    stopName: string,
    line?: string,
    directionCode?: number,
    signal?: AbortSignal,
  ): Promise<{ departures: TransitDeparture[]; stopDeviations: any[] }>;

  getPredictedDepartures(
    stopId: EntityId,
    stopName: string,
    line: string,
    directionCode: number,
    maxResults: number,
  ): Promise<TransitDeparture[]>;

  getNextScheduledDeparture(
    stopId: EntityId,
    stopName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitDeparture | null>;

  getKnownRoutes(
    stopId: EntityId,
    stopName: string,
  ): Promise<Array<{
    line: string;
    lineName: string;
    destination: string;
    directionCode: number;
    transportMode: TransportMode;
  }>>;

  // Disruptions
  getDisruptions(
    segments: Array<{ stopId: EntityId; stopName: string; line: string }>,
  ): Promise<Map<EntityId, TransitDisruption[]>>;

  // Stop resolution
  resolveStopId(stopName: string, signal?: AbortSignal): Promise<EntityId | null>;

  // Stop sequences
  getStopSequence(
    originStopId: EntityId,
    destinationName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitStopSequence | null>;

  /** Warm the stop-sequence cache without tying the request to a UI lifecycle. */
  prefetchStopSequence(
    originStopId: EntityId,
    destinationName: string,
    line: string,
    directionCode: number,
  ): Promise<void>;

  // Vehicle positions
  getVehiclePositions(
    tripIds: EntityId[],
    routeId?: EntityId,
    signal?: AbortSignal,
  ): Promise<TransitVehiclePosition[]>;

  // Route geometry
  getRouteShape(shapeId: EntityId, signal?: AbortSignal): Promise<TransitShape | null>;

  // Trip details
  getTripDetails(
    tripId: EntityId,
    signal?: AbortSignal,
  ): Promise<{
    trip: TransitTrip;
    stopTimes: TransitScheduledTime[];
  } | null>;

  getRealtimeUpdates(
    tripId: EntityId,
    signal?: AbortSignal,
  ): Promise<TransitRealtimeUpdate[]>;

  // Provider introspection
  /** All registered provider capabilities */
  getProviders(): ProviderCapabilities[];
}
