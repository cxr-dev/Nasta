import type { TransportType } from './page';

/** Front/middle/back position on a platform relative to train direction. */
export type PlatformPosition = 'front' | 'middle' | 'back';

/** A single leg of a journey: one vehicle segment with boarding/alighting stops. */
export interface JourneyLeg {
  /** Origin stop name */
  originName: string;
  /** Origin stop siteId (if known) */
  originSiteId?: string;
  /** Origin coordinates [lat, lon] */
  originCoord?: [number, number];
  /** Destination stop name */
  destName: string;
  /** Destination stop siteId (if known) */
  destSiteId?: string;
  /** Destination coordinates [lat, lon] */
  destCoord?: [number, number];
  /** Transport type */
  transportType: TransportType;
  /** Line number/designator */
  line: string;
  /** Line display name */
  lineName: string;
  /** Direction code (SL direction) */
  directionCode: number;
  /** Direction destination name */
  directionName: string;
  /** Departure time (ms UTC) */
  departureTime: number;
  /** Arrival time (ms UTC) */
  arrivalTime: number;
  /** Duration in minutes */
  durationMin: number;
  /** Where to stand on the platform for optimal exit */
  platformPosition: PlatformPosition;
}

/** Full journey search result. */
export interface Journey {
  /** Unique ID for this journey option */
  id: string;
  /** User-provided origin label */
  originLabel: string;
  /** User-provided destination label */
  destLabel: string;
  /** Ordered legs of the journey */
  legs: JourneyLeg[];
  /** Total duration in minutes */
  totalDurationMin: number;
  /** Departure time of first leg (ms UTC) */
  departureTime: number;
  /** Arrival time of last leg (ms UTC) */
  arrivalTime: number;
  /** Number of transfers (0 = direct) */
  transfers: number;
}

/** Search request payload. */
export interface JourneySearchRequest {
  /** Origin address or stop name */
  origin: string;
  /** Destination address or stop name */
  dest: string;
  /** Origin coordinates (from address selection, bypasses stop-finder) */
  originCoord?: [number, number];
  /** Destination coordinates (from address selection, bypasses stop-finder) */
  destCoord?: [number, number];
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Metadata attached to a segment when it represents a saved journey. */
export interface JourneyMeta {
  /** Original journey ID */
  journeyId: string;
  /** Origin label */
  originLabel: string;
  /** Destination label */
  destLabel: string;
  /** All legs */
  legs: JourneyLeg[];
  /** Total duration */
  totalDurationMin: number;
  /** Transfers count */
  transfers: number;
  /** When this journey was last updated */
  updatedAt: number;
}
