import type { TransportType } from './route';

export interface Departure {
  line: string;
  lineName: string;
  destination: string;
  directionText: string;
  minutes: number;
  time: string;
  expectedAt?: number;
  deviation?: string;
  transportType: TransportType;
  /** True when computed from cached timetable rather than confirmed by live API. */
  predicted?: boolean;
  /** SL journey reference, used to fetch the stop sequence for the progress strip. */
  journeyRef?: string;
}

export interface SiteSearchResult {
  siteId: string;
  name: string;
  type: 'stop' | 'station';
  note?: string;
  lat?: number;
  lon?: number;
}
