/**
 * Schedule Cache Service
 *
 * Learns and caches SL departure schedules from API responses.
 * Extracts `scheduled` times to build a local timetable that can:
 * - Display departures offline
 * - Serve as a fallback when API is slow/down
 * - Enable instant display on route switch
 *
 * Storage: IndexedDB key "schedule:v1"
 * Format: {siteId|line|directionText} → [iso-timestamps]
 */

import type { Departure } from "../types/departure";
import { persistentCache } from "./persistentCache";

const CACHE_KEY = "schedule:v1";
const LOCAL_STORAGE_KEY = "nasta_schedule_cache_v1";
const MAX_DEPARTURES = 5;
const DUPLICATE_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  line: string;
  direction_code: number;
  /** ISO timestamps of scheduled departures */
  scheduledTimes: string[];
  /** Timestamp when this schedule was last updated */
  updatedAt: number;
  /** Date this schedule is valid for (ISO format) */
  validDate: string;
}

export type CacheStore = Record<string, CacheEntry>; // key = "siteId|line|directionText"

let cacheLoaded = false;
let inMemoryCache: CacheStore = {};

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  await persistentCache.migrateFromLocalStorage(LOCAL_STORAGE_KEY, CACHE_KEY, CACHE_TTL_MS);
  const data = await persistentCache.get(CACHE_KEY);
  inMemoryCache = (data as CacheStore) || {};
  cacheLoaded = true;
}

async function saveCache(): Promise<void> {
  await persistentCache.set(CACHE_KEY, inMemoryCache, CACHE_TTL_MS);
}

/**
 * Generate cache key from route parameters
 */
function getCacheKey(
  siteId: string,
  line: string,
  direction_code: number,
): string {
  return `${siteId}|${line}|${direction_code}`;
}

/**
 * Add a scheduled departure time to the cache
 * Called from slApi.ts after each API response
 */
export async function cacheScheduleTime(
  siteId: string,
  line: string,
  direction_code: number,
  scheduledTime: Date,
): Promise<void> {
  if (!siteId || !line) return;

  await ensureCacheLoaded();
  const key = getCacheKey(siteId, line, direction_code);

  if (!inMemoryCache[key]) {
    inMemoryCache[key] = {
      line,
      direction_code,
      scheduledTimes: [],
      updatedAt: Date.now(),
      validDate: new Date().toISOString().split("T")[0],
    };
  }

  const isoTime = scheduledTime.toISOString();
  const entry = inMemoryCache[key];

  // Avoid duplicates (within DUPLICATE_WINDOW_MS)
  const isDuplicate = entry.scheduledTimes.some((t) => {
    const diff = Math.abs(new Date(t).getTime() - scheduledTime.getTime());
    return diff < DUPLICATE_WINDOW_MS;
  });

  if (!isDuplicate) {
    entry.scheduledTimes.push(isoTime);
    // Keep times sorted
    entry.scheduledTimes.sort();
    entry.updatedAt = Date.now();
  }

  await saveCache();
}

/** Maximum minutes ahead to show cached schedule departures.
 * Beyond this, the data is likely stale timetable data.
 */
const MAX_CACHED_MINUTES = 24 * 60; // 24 hours (handles overnight schedules)

/**
 * Retrieve cached schedule for a route
 * Returns null if no cache or expired
 */
export async function getCachedSchedule(
  siteId: string,
  line: string,
  direction_code: number,
  maxAgeHours: number = 24,
): Promise<Departure[] | null> {
  if (!siteId || !line) return null;

  await ensureCacheLoaded();
  const key = getCacheKey(siteId, line, direction_code);
  const entry = inMemoryCache[key];

  if (!entry) return null;

  // Check if cache is stale
  const ageMs = Date.now() - entry.updatedAt;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > maxAgeHours) {
    if (import.meta.env.DEV)
      console.log(
        `[scheduleCache] Cache for ${key} is ${ageHours.toFixed(1)}h old (max: ${maxAgeHours}h)`,
      );
    return null;
  }

  const now = Date.now();

  // Convert ISO times to Departure objects
  const departures: Departure[] = entry.scheduledTimes
    .filter((isoTime) => {
      // Only include future times within reasonable horizon
      const ts = new Date(isoTime).getTime();
      return ts > now && (ts - now) / 60000 <= MAX_CACHED_MINUTES;
    })
    .slice(0, MAX_DEPARTURES)
    .map((isoTime) => {
      const departureTime = new Date(isoTime);
      const time = departureTime.toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Stockholm",
      });
      const expectedAt = departureTime.getTime();
      const calculatedMinutes = Math.max(
        0,
        Math.floor((expectedAt - now) / 60000),
      );
      return {
        line,
        lineName: "",
        destination: "",
        direction_code,
        minutes: calculatedMinutes,
        time,
        expectedAt,
        transportType: "bus" as const,
        predicted: true,
      };
    });

  return departures.length > 0 ? departures : null;
}

/**
 * Clear expired cache entries
 * Call periodically (e.g., daily at 3 AM) to free storage
 */
export async function clearExpiredCache(maxAgeHours: number = 48): Promise<void> {
  await ensureCacheLoaded();
  let clearedCount = 0;

  for (const key in inMemoryCache) {
    const entry = inMemoryCache[key];
    const ageMs = Date.now() - entry.updatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      delete inMemoryCache[key];
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    await saveCache();
    if (import.meta.env.DEV)
      console.log(`[scheduleCache] Cleared ${clearedCount} expired entries`);
  }
}

/**
 * Get cache statistics (for debugging)
 */
export async function getCacheStats(): Promise<{
  entries: number;
  routes: Array<{ key: string; ageHours: number; timeCount: number }>;
}> {
  await ensureCacheLoaded();
  const entries = Object.keys(inMemoryCache).length;
  const routes = Object.entries(inMemoryCache).map(([key, entry]) => ({
    key,
    ageHours: (Date.now() - entry.updatedAt) / (1000 * 60 * 60),
    timeCount: entry.scheduledTimes.length,
  }));

  return { entries, routes };
}

/**
 * Clear all cache (for testing or user reset)
 */
export async function clearAllCache(): Promise<void> {
  await persistentCache.remove(CACHE_KEY);
  inMemoryCache = {};
  cacheLoaded = false;
  if (import.meta.env.DEV) console.log("[scheduleCache] All cache cleared");
}
