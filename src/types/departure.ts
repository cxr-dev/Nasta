export interface Departure {
  line: string;
  destination: string;
  minutes: number;
  time: string;
  deviation?: number;
}

export interface SiteSearchResult {
  siteId: string;
  name: string;
  type: 'stop' | 'station';
  transportModes?: string[];
}
