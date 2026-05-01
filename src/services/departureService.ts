import type { Departure } from '../types/departure';
import { getDepartures as slGetDepartures } from './slApi';
import { isSjostadstrafikenStop, getNextDepartures } from './staticTimetable';
import { getNextDeparture } from './nextDepartureResolver';

export async function getDepartures(
  stopName: string, 
  siteId: string, 
  line?: string, 
  direction_code?: number,
  destId?: string
): Promise<Departure[]> {
  if (isSjostadstrafikenStop(stopName)) {
    return getNextDepartures(stopName, 2);
  }
  
  const departures = await slGetDepartures(siteId);

  // If no departures found and we have specific line info, try the resolver fallback
  if (departures.length === 0 && line && direction_code !== undefined) {
    const resolved = await getNextDeparture(siteId, line, direction_code, destId);
    if (resolved.departure) {
      return [resolved.departure];
    }
  }
  
  return departures;
}
