export type TransportType = "bus" | "train" | "metro" | "boat";

export type RouteDirection = "toWork" | "fromWork";

export interface Stop {
  id: string;
  name: string;
  siteId: string;
  coord?: [number, number];
  productClasses?: number[];
  stopAreaId?: string; // NEW: for disruption matching via Deviations API
}

export interface SegmentDirection {
  code: number;
  destination: string;
  stopPointId: string;
  via?: string; // Optional intermediate stop for augmented direction labels
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
  transferBufferMinutes?: number;
}

export interface Route {
  id: string;
  name: string;
  direction: RouteDirection;
  segments: Segment[];
}

// Backwards compatibility export
export type Direction = RouteDirection;
