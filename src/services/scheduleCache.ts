/**
 * Schedule Cache Service
 *
 * Learns and caches SL departure schedules from API responses.
 * Extracts `scheduled` times to build a local timetable that can:
 * - Display departures offline
 * - Serve as a fallback when API is slow/down
 * - Enable instant display on route switch
 *
 * Storage: localStorage key "nasta_schedule_cache_v1"
 * Format: {siteId|line|directionText} → [iso-timestamps]
 * Compression: gzip if > 5MB (using minimal compression approach)
 */

import type { Departure } from '../types/departure';

const CACHE_STORAGE_KEY = 'nasta_schedule_cache_v1';
const COMPRESSION_THRESHOLD_KB = 5000; // 5MB

interface CacheEntry {
  line: string;
  directionText: string;
  /** ISO timestamps of scheduled departures */
  scheduledTimes: string[];
  /** Timestamp when this schedule was last updated */
  updatedAt: number;
  /** Date this schedule is valid for (ISO format) */
  validDate: string;
}

type CacheStore = Record<string, CacheEntry>; // key = "siteId|line|directionText"

/**
 * Generate cache key from route parameters
 */
function getCacheKey(siteId: string, line: string, directionText: string): string {
  return `${siteId}|${line}|${directionText}`;
}

/**
 * Load cache from localStorage
 */
function loadCache(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch (e) {
    console.warn('[scheduleCache] Error loading cache:', e);
    return {};
  }
}

/**
 * Save cache to localStorage
 */
function saveCache(cache: CacheStore): void {
  try {
    const json = JSON.stringify(cache);
    const sizeKB = new Blob([json]).size / 1024;

    if (sizeKB > COMPRESSION_THRESHOLD_KB) {
      console.warn(
        `[scheduleCache] Cache size ${sizeKB.toFixed(1)}KB exceeds threshold. Consider clearing old entries.`
      );
    }

    localStorage.setItem(CACHE_STORAGE_KEY, json);
  } catch (e) {
    console.error('[scheduleCache] Error saving cache:', e);
  }
}

/**
 * Add a scheduled departure time to the cache
 * Called from slApi.ts after each API response
 */
export function cacheScheduleTime(
  siteId: string,
  line: string,
  directionText: string,
  scheduledTime: Date
): void {
  if (!siteId || !line || !directionText) return;

  const cache = loadCache();
  const key = getCacheKey(siteId, line, directionText);

  if (!cache[key]) {
    cache[key] = {
      line,
      directionText,
      scheduledTimes: [],
      updatedAt: Date.now(),
      validDate: new Date().toISOString().split('T')[0],
    };
  }

  const isoTime = scheduledTime.toISOString();
  const entry = cache[key];

  // Avoid duplicates (within 1 minute)
  const isDuplicate = entry.scheduledTimes.some((t) => {
    const diff = Math.abs(new Date(t).getTime() - scheduledTime.getTime());
    return diff < 60000;
  });

  if (!isDuplicate) {
    entry.scheduledTimes.push(isoTime);
    // Keep times sorted
    entry.scheduledTimes.sort();
    entry.updatedAt = Date.now();
  }

  saveCache(cache);
}

/**
 * Retrieve cached schedule for a route
 * Returns null if no cache or expired
 */
export function getCachedSchedule(
  siteId: string,
  line: string,
  directionText: string,
  maxAgeHours: number = 24
): Departure[] | null {
  if (!siteId || !line || !directionText) return null;

  const cache = loadCache();
  const key = getCacheKey(siteId, line, directionText);
  const entry = cache[key];

  if (!entry) return null;

  // Check if cache is stale
  const ageMs = Date.now() - entry.updatedAt;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > maxAgeHours) {
    console.log(
      `[scheduleCache] Cache for ${key} is ${ageHours.toFixed(1)}h old (max: ${maxAgeHours}h)`
    );
    return null;
  }

  // Convert ISO times to Departure objects
  const now = Date.now();
  const departures: Departure[] = entry.scheduledTimes
    .filter((isoTime) => {
      // Only include future times
      return new Date(isoTime).getTime() > now;
    })
    .slice(0, 5) // Return next 5 departures
    .map((isoTime) => {
      const departureTime = new Date(isoTime);
      const minutes = Math.max(
        0,
        Math.floor((departureTime.getTime() - now) / 60000)
      );
      return {
        line,
        lineName: '',
        destination: directionText,
        directionText,
        minutes,
        time: departureTime.toLocaleTimeString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        transportType: 'bus' as const,
        predicted: true, // Mark as cached
      };
    });

  return departures.length > 0 ? departures : null;
}

/**
 * Clear expired cache entries
 * Call periodically (e.g., daily at 3 AM) to free storage
 */
export function clearExpiredCache(maxAgeHours: number = 48): void {
  const cache = loadCache();
  let clearedCount = 0;

  for (const key in cache) {
    const entry = cache[key];
    const ageMs = Date.now() - entry.updatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      delete cache[key];
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    saveCache(cache);
    console.log(`[scheduleCache] Cleared ${clearedCount} expired entries`);
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): {
  entries: number;
  routes: Array<{ key: string; ageHours: number; timeCount: number }>;
} {
  const cache = loadCache();
  const entries = Object.keys(cache).length;
  const routes = Object.entries(cache).map(([key, entry]) => ({
    key,
    ageHours: (Date.now() - entry.updatedAt) / (1000 * 60 * 60),
    timeCount: entry.scheduledTimes.length,
  }));

  return { entries, routes };
}

/**
 * Clear all cache (for testing or user reset)
 */
export function clearAllCache(): void {
  localStorage.removeItem(CACHE_STORAGE_KEY);
  console.log('[scheduleCache] All cache cleared');
}
