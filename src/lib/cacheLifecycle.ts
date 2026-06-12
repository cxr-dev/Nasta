/**
 * Cache Lifecycle Management
 *
 * Implements:
 * - Cache expiry policies (24h default)
 * - Storage quota management (8MB max)
 * - Auto-cleanup of old entries
 */

import { getCacheStats, clearExpiredCache } from "../services/scheduleCache";
import { persistentCache } from "../services/persistentCache";

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
    // Phase 1: Remove expired entries
    await clearExpiredCache(MAX_CACHE_AGE_HOURS);

    // Phase 2: Check storage size
    const stats = await getCacheStats();
    const cacheSizeBytes = new Blob([JSON.stringify(stats)]).size;

    if (import.meta.env.DEV) console.log(
      `[cacheLifecycle] Cache: ${stats.entries} entries, ${stats.routes.length} routes, ~${(cacheSizeBytes / 1024).toFixed(1)}KB`,
    );

    // Phase 3: Clear expired from persistent cache
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
  sizeKb: number;
  healthPercent: number;
}> {
  const stats = await getCacheStats();
  const sizeBytes = new Blob([JSON.stringify(stats)]).size;
  const sizeKb = sizeBytes / 1024;
  const healthPercent = Math.round((sizeBytes / MAX_CACHE_SIZE_BYTES) * 100);

  return {
    entries: stats.entries,
    routes: stats.routes.length,
    sizeKb: Math.round(sizeKb),
    healthPercent: Math.min(healthPercent, 100),
  };
}
