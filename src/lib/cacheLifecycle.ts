/**
 * Cache Lifecycle Management
 *
 * Implements:
 * - Cache expiry policies (24h default)
 * - Storage quota management (8MB max)
 * - Auto-cleanup of old entries
 */

import { getCacheStats, clearExpiredCache } from "../services/scheduleCache";

const CACHE_VERSION = "nasta_schedule_cache_v1";
const MAX_CACHE_AGE_HOURS = 24;
const MAX_CACHE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start cache lifecycle management
 * Run once on app initialization
 */
export function initializeCacheLifecycle(): void {
  if (cleanupTimer) return;

  console.log("[cacheLifecycle] Starting cleanup scheduler");

  // Run initial cleanup
  performCacheCleanup();

  // Schedule periodic cleanup
  cleanupTimer = setInterval(() => {
    performCacheCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop cache lifecycle management
 */
export function stopCacheLifecycle(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[cacheLifecycle] Stopped cleanup scheduler");
  }
}

/**
 * Perform cache cleanup:
 * 1. Remove expired entries (older than 24h)
 * 2. Check storage size
 * 3. Trim if needed
 */
function performCacheCleanup(): void {
  try {
    // Phase 1: Remove expired entries
    clearExpiredCache(MAX_CACHE_AGE_HOURS);

    // Phase 2: Check storage size
    const stats = getCacheStats();
    const cacheStr = localStorage.getItem(CACHE_VERSION) || "{}";
    const cacheSizeBytes = new Blob([cacheStr]).size;

    console.log(
      `[cacheLifecycle] Cache: ${stats.entries} entries, ${stats.routes} routes, ~${(cacheSizeBytes / 1024).toFixed(1)}KB`,
    );

    // Phase 3: Trim if over quota
    if (cacheSizeBytes > MAX_CACHE_SIZE_BYTES) {
      console.warn(
        `[cacheLifecycle] Cache size exceeded (${(cacheSizeBytes / 1024).toFixed(1)}KB > 8MB), trimming oldest entries`,
      );
      trimLargestCache();
    }
  } catch (error) {
    console.error("[cacheLifecycle] Cleanup error:", error);
  }
}

/**
 * Trim the largest cached route to reduce storage
 */
function trimLargestCache(): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_VERSION);
    if (!cacheStr) return;

    const cache = JSON.parse(cacheStr) as Record<string, string[]>;
    let largestKey = "";
    let largestSize = 0;

    // Find largest entry
    for (const [key, times] of Object.entries(cache)) {
      const size = new Blob([JSON.stringify(times)]).size;
      if (size > largestSize) {
        largestSize = size;
        largestKey = key;
      }
    }

    if (largestKey) {
      // Remove oldest 50% of times from largest entry
      const times = cache[largestKey];
      const newTimes = times.slice(Math.floor(times.length / 2));

      if (newTimes.length === 0) {
        delete cache[largestKey];
        console.log(`[cacheLifecycle] Removed cache entry: ${largestKey}`);
      } else {
        cache[largestKey] = newTimes;
        console.log(
          `[cacheLifecycle] Trimmed cache entry ${largestKey}: ${times.length} → ${newTimes.length} times`,
        );
      }

      localStorage.setItem(CACHE_VERSION, JSON.stringify(cache));
    }
  } catch (error) {
    console.error("[cacheLifecycle] Trim error:", error);
  }
}

/**
 * Get cache health status
 */
export function getCacheHealth(): {
  entries: number;
  routes: number;
  sizeKb: number;
  healthPercent: number;
} {
  const stats = getCacheStats();
  const cacheStr = localStorage.getItem(CACHE_VERSION) || "{}";
  const sizeBytes = new Blob([cacheStr]).size;
  const sizeKb = sizeBytes / 1024;
  const healthPercent = Math.round((sizeBytes / MAX_CACHE_SIZE_BYTES) * 100);

  return {
    entries: stats.entries,
    routes: stats.routes.length,
    sizeKb: Math.round(sizeKb),
    healthPercent: Math.min(healthPercent, 100),
  };
}
