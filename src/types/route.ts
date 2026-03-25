export interface Stop {
  id: string;
  name: string;
  siteId: string;
  line?: string;
  travelMinutesToNext?: number;
}

export interface Route {
  id: string;
  name: string;
  stops: Stop[];
}
