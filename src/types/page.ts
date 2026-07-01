export type TransportType = "bus" | "train" | "metro" | "boat" | "tram";
export type SortMode = 'manual' | 'time' | 'station' | 'transport' | 'line' | 'distance';
export type GroupingMode = 'none' | 'disrupted' | 'station' | 'transport';

export interface Stop {
  id: string;
  name: string;
  siteId: string;
  coord?: [number, number];
  productClasses?: number[];
  stopAreaId?: string;
}

export interface SegmentDirection {
  code: number;
  destination: string;
  stopPointId: string;
  via?: string;
  /** Intermediate stop names between user's stop and destination, for direction preview. */
  intermediateStops?: string[];
}

export interface Segment {
  id: string;
  line: string;
  lineName: string;
  direction: SegmentDirection;
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
  travelTimeMinutes?: number;
  /** Journey metadata — present when segment represents a saved multi-leg journey. */
  journeyMeta?: {
    journeyId: string;
    originLabel: string;
    destLabel: string;
    totalDurationMin: number;
    transfers: number;
    updatedAt: number;
    legs: Array<{
      originName: string;
      originSiteId?: string;
      destName: string;
      destSiteId?: string;
      transportType: TransportType;
      line: string;
      lineName: string;
      directionCode: number;
      directionName: string;
      departureTime: number;
      arrivalTime: number;
      durationMin: number;
      platformPosition: 'front' | 'middle' | 'back';
    }>;
  };
}

export interface Page {
  id: string;
  name: string;
  segments: Segment[];
}
