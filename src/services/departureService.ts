import type { Departure } from '../types/departure';
import { getDepartures as slGetDepartures } from './slApi';
import { isSjostadstrafikenStop, getNextDepartures } from './staticTimetable';

export async function getDepartures(stopName: string, siteId: string): Promise<Departure[]> {
  if (isSjostadstrafikenStop(stopName)) {
    return getNextDepartures(stopName, 2);
  }
  
  return slGetDepartures(siteId);
}
