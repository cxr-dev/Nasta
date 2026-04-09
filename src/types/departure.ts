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
}

export interface SiteSearchResult {
  siteId: string;
  name: string;
  type: 'stop' | 'station';
  note?: string;
  lat?: number;
  lon?: number;
}
