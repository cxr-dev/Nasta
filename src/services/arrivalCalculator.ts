import type { Stop } from '../types/route';
import type { Departure } from '../types/departure';

export interface ArrivalInfo {
  arrivalTime: string;
  totalMinutes: number;
  departureMinutes: number;
}

export function calculateArrival(
  stops: Stop[],
  departures: Map<string, Departure[]>
): ArrivalInfo | null {
  if (stops.length === 0) return null;

  const firstStop = stops[0];
  const firstDepartures = departures.get(firstStop.siteId);
  
  if (!firstDepartures || firstDepartures.length === 0) return null;
  
  const nextDeparture = firstDepartures[0];
  let totalMinutes = nextDeparture.minutes;

  for (let i = 1; i < stops.length; i++) {
    const travelTime = stops[i].travelMinutesToNext;
    if (travelTime !== undefined) {
      totalMinutes += travelTime;
    }
  }

  const now = new Date();
  const arrival = new Date(now.getTime() + totalMinutes * 60000);
  
  const hours = arrival.getHours().toString().padStart(2, '0');
  const minutes = arrival.getMinutes().toString().padStart(2, '0');

  return {
    arrivalTime: `${hours}:${minutes}`,
    totalMinutes,
    departureMinutes: nextDeparture.minutes
  };
}
