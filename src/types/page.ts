export type TransportType = "bus" | "train" | "metro" | "boat" | "tram";

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

export interface Page {
  id: string;
  name: string;
  segments: Segment[];
}
