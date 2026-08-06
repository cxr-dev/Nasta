/**
 * Cache Lifecycle Management
 *
 * Implements:
 * - Cache expiry policies (24h default)
 * - Auto-cleanup of old entries
 */

import { getCacheStats, clearExpiredCache } from "../services/scheduleCache";
import { persistentCache } from "../services/persistentCache";

const MAX_CACHE_AGE_HOURS = 24;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start cache lifecycle management
 * Run once on app initialization
 */
export function initializeCacheLifecycle(): void {
  if (cleanupTimer) return;

  if (import.meta.env.DEV) console.log("[cacheLifecycle] Starting cleanup scheduler");

  // Run initial cleanup
  performCacheCleanup().catch(() => {});

  // Schedule periodic cleanup
  cleanupTimer = setInterval(() => {
    performCacheCleanup().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop cache lifecycle management
 */
export function stopCacheLifecycle(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    if (import.meta.env.DEV) console.log("[cacheLifecycle] Stopped cleanup scheduler");
  }
}

/**
 * Perform cache cleanup:
 * 1. Remove expired entries (older than 24h)
 * 2. Check storage size
 * 3. Trim if needed
 */
async function performCacheCleanup(): Promise<void> {
  try {
    await clearExpiredCache(MAX_CACHE_AGE_HOURS);

    await persistentCache.clearExpired();
  } catch (error) {
    if (import.meta.env.DEV) console.error("[cacheLifecycle] Cleanup error:", error);
  }
}

/**
 * Get cache health status
 */
export async function getCacheHealth(): Promise<{
  entries: number;
  routes: number;
}> {
  const stats = await getCacheStats();
  return {
    entries: stats.entries,
    routes: stats.routes.length,
  };
}
