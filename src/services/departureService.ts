import type { Departure } from '../types/departure';
import { getDepartures as slGetDepartures } from './slApi';
import { isSjostadstrafikenStop, getNextDepartures } from './staticTimetable';
import { getNextDeparture } from './nextDepartureResolver';

export async function getDepartures(
  stopName: string, 
  siteId: string, 
  line?: string, 
  direction_code?: number,
  destId?: string,
  signal?: AbortSignal,
): Promise<{ departures: Departure[]; stopDeviations: any[] }> {
  if (isSjostadstrafikenStop(stopName)) {
    return { departures: getNextDepartures(stopName, 20), stopDeviations: [] };
  }
  
  const { departures, stopDeviations } = await slGetDepartures(siteId, undefined, signal);

  if (departures.length === 0 && line && direction_code !== undefined) {
    const resolved = await getNextDeparture(siteId, line, direction_code, destId, signal);
    if (resolved.departure) {
      return { departures: [resolved.departure], stopDeviations };
    }
  }
  
  return { departures, stopDeviations };
}
