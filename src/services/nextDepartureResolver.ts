import type { Departure } from "../types/departure";
import { getDepartures, searchTrips } from "./slApi";

export interface ResolverResult {
  departure: Departure | null;
  source: "realtime" | "planned" | "none";
}

/**
 * NextDepartureResolver
 * 
 * Ensures a "next departure" is always found by coordinating between 
 * the real-time departures feed and the journey planner (timetable).
 */
export async function getNextDeparture(
  siteId: string,
  line: string,
  direction_code: number,
  destId?: string
): Promise<ResolverResult> {
  try {
    // 1. Try real-time API first (forecast 120 min)
    const { departures: realtimeDepartures } = await getDepartures(siteId, 120);
    
    const nextRealtime = realtimeDepartures
      .filter(d => d.line === line && d.direction_code === direction_code)
      .sort((a, b) => a.minutes - b.minutes)[0];

    if (nextRealtime) {
      return {
        departure: nextRealtime,
        source: "realtime"
      };
    }

    // 2. Fallback to Journey Planner (Planned Trips) if destId is available
    if (destId) {
      if (import.meta.env.DEV) {
        console.log(`[NextDepartureResolver] No real-time results for ${line} at ${siteId}, falling back to planned trips.`);
      }
      
      const plannedTrips = await searchTrips(siteId, destId);
      
      const nextPlanned = plannedTrips
        .filter(d => d.line === line && d.direction_code === direction_code)
        .sort((a, b) => a.minutes - b.minutes)[0];

      if (nextPlanned) {
        return {
          departure: {
            ...nextPlanned,
            predicted: true
          },
          source: "planned"
        };
      }

      // 3. Last resort: Search for tomorrow's first departure (Night Gap)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(4, 0, 0, 0); // Start searching from 04:00 tomorrow

      if (import.meta.env.DEV) {
        console.log(`[NextDepartureResolver] Night gap detected for ${line}, searching for tomorrow's start.`);
      }

      const morningTrips = await searchTrips(siteId, destId, tomorrow);
      const firstMorning = morningTrips
        .filter(d => d.line === line && d.direction_code === direction_code)
        .sort((a, b) => a.minutes - b.minutes)[0];

      if (firstMorning) {
        return {
          departure: {
            ...firstMorning,
            predicted: true,
            isFirstMorning: true // Flag for UI to show "Morgonens första"
          },
          source: "planned"
        };
      }
    }

    return { departure: null, source: "none" };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[NextDepartureResolver] Error resolving next departure:", error);
    }
    return { departure: null, source: "none" };
  }
}
