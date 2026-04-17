/**
 * Cached Departures Generator
 *
 * Takes cached scheduled times and generates Departure objects
 * for display when cache is available.
 */

import type { Departure } from '../types/departure';
import type { TransportType } from '../types/route';

export interface CachedDepartureParams {
  siteId: string;
  line: string;
  directionText: string;
  transportType?: TransportType;
  lineName?: string;
  maxResults?: number;
}

/**
 * Generate Departure objects from cached schedule times
 * Returns null if no cache available
 */
export function generateCachedDepartures(
  scheduledTimes: string[] | null | undefined,
  params: CachedDepartureParams
): Departure[] | null {
  if (!scheduledTimes || scheduledTimes.length === 0) return null;

  const now = Date.now();
  const { siteId, line, directionText, transportType = 'bus', lineName = '', maxResults = 5 } = params;

  const departures: Departure[] = scheduledTimes
    .map((isoTime) => {
      const departureTime = new Date(isoTime).getTime();
      // Filter out past times
      if (departureTime <= now) return null;

      const minutes = Math.max(0, Math.floor((departureTime - now) / 60000));
      const timeStr = new Date(isoTime).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        line,
        lineName,
        destination: directionText,
        directionText,
        minutes,
        time: timeStr,
        transportType,
        predicted: true, // Mark as cached/predicted
        expectedAt: departureTime,
      };
    })
    .filter((d) => d !== null)
    .slice(0, maxResults);

  return departures.length > 0 ? departures : null;
}
