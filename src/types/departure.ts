import type { TransportType } from "./page";

/** A deviation attached to a specific departure by the SL Transport API.
 *  Distinct from the separate Deviations API (slDeviations.ts). */
export interface DepartureDeviation {
  importance_level: number;
  consequence: string;
  message: string;
}

export interface Departure {
  line: string;
  lineName: string;
  destination: string;
  /** Direction code from SL API - used for filtering and matching */
  direction_code: number;
  minutes: number;
  time: string;
  expectedAt?: number;
  /** Departure-level deviations from SL Transport API — these actually affect
   *  this specific journey (e.g. skipped stops, reroutes). */
  deviations?: DepartureDeviation[];
  transportType: TransportType;
  /** True when computed from cached timetable rather than confirmed by live API. */
  predicted?: boolean;
  /** SL journey reference, used to fetch the stop sequence for the progress strip. */
  journeyRef?: string;
  /** SL trip reference, used as fallback for cache key when journeyRef is missing. */
  tripId?: string;
  /** Raw display string from SL API — e.g., "Nu", "9 min", "01:22" */
  display?: string;
  /** Stop point ID from SL API */
  stop_point_id?: string;
  /** True when this is the first departure of the next traffic day (after a night gap). */
  isFirstMorning?: boolean;
}

export interface SiteSearchResult {
  siteId: string;
  name: string;
  type: "stop" | "station";
  note?: string;
  lat?: number;
  lon?: number;
  productClasses?: number[];
  locality?: string;
  localityId?: string;
  matchQuality?: number;
}
