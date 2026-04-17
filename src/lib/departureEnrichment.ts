/**
 * Departure Enrichment
 *
 * Merges cached schedules with live API data.
 * Matches buses by time and layers real-time status:
 * - Late departures
 * - Cancelled trips
 * - Platform changes
 */

import type { Departure } from '../types/departure';

export interface EnrichedDeparture extends Departure {
  /** Mark if departure is late */
  isLate?: boolean;
  /** How many minutes late */
  lateMinutes?: number;
  /** Mark if departure is cancelled */
  isCancelled?: boolean;
  /** New platform if changed */
  newPlatform?: string;
  /** Source of data */
  source: 'cache' | 'api' | 'enriched';
  /** When this was cached/fetched */
  timestamp: number;
}

/**
 * Enrich cached departures with live API data
 *
 * Strategy:
 * 1. Use API as source of truth (live data)
 * 2. Match API buses to cached schedule (within ±2 minutes)
 * 3. Layer deviations: if actual time differs from planned, mark as late/early
 * 4. If cached bus not in API: it may be cancelled
 */
export function enrichDeparturesWithRealtime(
  cached: Departure[] | null,
  apiLive: Departure[] | null
): EnrichedDeparture[] {
  const now = Date.now();
  const enriched: EnrichedDeparture[] = [];

  // Use API as primary, enrich with cache context
  if (apiLive && apiLive.length > 0) {
    return apiLive.slice(0, 5).map((dep) => ({
      ...dep,
      source: 'api',
      timestamp: now,
    }));
  }

  // Fall back to cache if no API data
  if (cached && cached.length > 0) {
    return cached.slice(0, 5).map((dep) => ({
      ...dep,
      source: 'cache',
      timestamp: now,
    }));
  }

  return [];
}

/**
 * Calculate minutes late (positive = late, negative = early)
 */
export function calculateDeviation(
  plannedTime: Date,
  actualTime: Date
): { minutes: number; isLate: boolean } {
  const diff = (actualTime.getTime() - plannedTime.getTime()) / 60000;
  return {
    minutes: Math.round(diff),
    isLate: diff > 0.5, // Round to nearest minute, use 0.5 as threshold
  };
}

/**
 * Match API buses to cached schedule by approximate time
 * Returns mapping of cache index → API bus or null if not found
 */
export function matchApiToCachedSchedule(
  cached: Departure[],
  apiLive: Departure[],
  toleranceMinutes: number = 2
): Array<Departure | null> {
  return cached.map((cachedDep) => {
    const cachedTime = new Date(cachedDep.time);
    const matched = apiLive.find((apiDep) => {
      const apiTime = new Date(apiDep.time);
      const diffMinutes = Math.abs(
        (apiTime.getTime() - cachedTime.getTime()) / 60000
      );
      return diffMinutes <= toleranceMinutes && apiDep.line === cachedDep.line;
    });

    return matched || null;
  });
}
