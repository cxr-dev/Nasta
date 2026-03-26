export type TransportType = 'bus' | 'train' | 'metro' | 'boat';

export type Direction = 'toWork' | 'fromWork';

export interface Stop {
  id: string;
  name: string;
  siteId: string;
}

export interface Segment {
  id: string;
  line: string;
  lineName: string;
  directionText: string;
  fromStop: Stop;
  toStop: Stop;
  transportType: TransportType;
  travelTimeMinutes?: number;
}

export interface Route {
  id: string;
  name: string;
  direction: Direction;
  segments: Segment[];
}