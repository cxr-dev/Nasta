import { writable, get } from "svelte/store";
import type { Departure } from "../types/departure";
import { getDepartures } from "../services/departureService";
import { getCachedSchedule } from "../services/scheduleCache";

interface DepartureWithSource extends Departure {
  /** 'cache' = from schedule cache, 'api' = from live API, 'enriched' = cache + API deviations */
  source?: "cache" | "api" | "enriched";
  /** Timestamp when this was cached */
  cachedAt?: number;
}

export interface SegmentCacheMeta {
  line: string;
  directionText: string;
}

export type SiteConfidenceState = "live" | "cached" | "predicted" | "stale";

function createDepartureStore() {
  const data = writable<Map<string, Departure[]>>(new Map());
  const { subscribe, set, update } = data;
  const confidenceBySite = writable<Map<string, SiteConfidenceState>>(
    new Map(),
  );
  const isLoading = writable(false);
  const isUpdating = writable(false);
  const lastError = writable<string | null>(null);
  const lastSuccessfulFetch = writable<number>(0);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let stopNamesMap = new Map<string, string>();
  let currentSiteIds: string[] = [];
  let currentDirection: string | null = null;
  let currentRequestId: string | null = null;

  let isFetching = false;

  /**
   * Hybrid fetch strategy:
   * 1. Check cache immediately → display (only on initial load)
   * 2. Fetch API in parallel for enrichment
   * 3. Merge: use API times, layer cache deviations
   *
   * Request identity: each fetch batch gets a requestId to prevent stale responses
   * from overwriting current route data after a route switch.
   */
  const fetchAllHybrid = async (
    segmentData: Array<{
      siteId: string;
      stopName: string;
      line: string;
      directionText: string;
    }>,
    clearFirst = false,
    direction: string | null = null,
    requestId: string | null = null,
  ) => {
    // Detect direction change - force clear if different direction
    if (direction && direction !== currentDirection) {
      if (import.meta.env.DEV)
        console.log("[departureStore] Direction changed, clearing data");
      currentDirection = direction;
      clearFirst = true;
    }

    // Set request ID if provided (atomic on route change)
    if (requestId && requestId !== currentRequestId) {
      currentRequestId = requestId;
      if (import.meta.env.DEV)
        console.log(`[departureStore] Request ID set to ${requestId}`);
    }

    if (isFetching) {
      if (import.meta.env.DEV)
        console.log("[departureStore] Fetch skipped - already fetching");
      return;
    }
    isFetching = true;

    // Set appropriate loading state
    if (clearFirst) {
      isLoading.set(true);
    } else {
      isUpdating.set(true);
    }
    lastError.set(null);

    const results = clearFirst
      ? new Map<string, Departure[]>()
      : new Map(get({ subscribe }));
    const nextConfidence = clearFirst
      ? new Map<string, SiteConfidenceState>()
      : new Map(get(confidenceBySite));

    try {
      // Phase 1: Check cache for each segment and display immediately
      const cacheResults = new Map<string, Departure[] | null>();
      const siteIdsNeedingApi: typeof segmentData = [];

      for (const seg of segmentData) {
        const cached = getCachedSchedule(
          seg.siteId,
          seg.line,
          seg.directionText,
          24,
        );
        if (cached) {
          if (import.meta.env.DEV)
            console.log(
              `[departureStore] Cache hit: ${seg.siteId} (${seg.stopName}) - ${cached.length} departures`,
            );
          cacheResults.set(seg.siteId, cached);
          results.set(seg.siteId, cached);
          nextConfidence.set(seg.siteId, "cached");
        } else {
          if (import.meta.env.DEV)
            console.log(
              `[departureStore] Cache miss: ${seg.siteId} (${seg.stopName}), will fetch API`,
            );
          cacheResults.set(seg.siteId, null);
          siteIdsNeedingApi.push(seg);
        }
      }

      // Display cached data immediately on initial load only.
      // For refreshes, keep existing data visible until API results arrive.
      if (clearFirst) {
        set(results);
      }

      // Phase 2: Fetch fresh API data in parallel for enrichment
      if (siteIdsNeedingApi.length > 0) {
        await Promise.all(
          siteIdsNeedingApi.map(async (seg) => {
            try {
              if (import.meta.env.DEV)
                console.log(
                  `[departureStore] API fetch: ${seg.siteId} (${seg.stopName})`,
                );
              const apiDepartures = await getDepartures(
                seg.stopName,
                seg.siteId,
              );

              // STALE RESPONSE CHECK: only update if this request ID still matches
              if (requestId && requestId !== currentRequestId) {
                if (import.meta.env.DEV) {
                  console.log(
                    `[departureStore] Ignoring stale response for ${seg.siteId} (requestId: ${requestId}, current: ${currentRequestId})`,
                  );
                }
                return; // Ignore stale response
              }

              // Use API data (which auto-caches)
              results.set(seg.siteId, apiDepartures);
              nextConfidence.set(seg.siteId, "live");

              // Update store with API results
              update((store) => {
                store.set(seg.siteId, apiDepartures);
                return store;
              });
              confidenceBySite.update((state) => {
                state.set(seg.siteId, "live");
                return state;
              });
              // Mark successful fetch time for stale indicator
              if (apiDepartures.length > 0) {
                lastSuccessfulFetch.set(Date.now());
              }
            } catch (e) {
              if (import.meta.env.DEV)
                console.error(
                  `[departureStore] API error for ${seg.siteId}:`,
                  e,
                );

              // STALE RESPONSE CHECK: don't even set error if request is stale
              if (requestId && requestId !== currentRequestId) {
                if (import.meta.env.DEV) {
                  console.log(
                    `[departureStore] Ignoring stale error for ${seg.siteId} (requestId: ${requestId}, current: ${currentRequestId})`,
                  );
                }
                return;
              }

              // Surface error to user
              lastError.set("Failed to fetch departures");
              // Fall back to empty if API fails
              results.set(seg.siteId, []);
              const hadCache = cacheResults.get(seg.siteId);
              nextConfidence.set(seg.siteId, hadCache ? "cached" : "stale");
            }
          }),
        );
      }

      // Final check: only update confidence if request ID still matches
      if (!requestId || requestId === currentRequestId) {
        confidenceBySite.set(nextConfidence);
      }
    } catch (error) {
      if (import.meta.env.DEV)
        console.error("[departureStore] Overall fetch error:", error);
      lastError.set("Failed to fetch departures");
    } finally {
      isFetching = false;
      isLoading.set(false);
      isUpdating.set(false);
    }
  };

  // Legacy API - convert to new segment data format
  const fetchAll = async (
    siteIds: string[],
    stopNames: Map<string, string>,
    segmentMetaBySiteId: Map<string, SegmentCacheMeta> = new Map(),
    clearFirst = false,
    direction: string | null = null,
    requestId: string | null = null,
  ) => {
    const segmentData = siteIds.map((id) => ({
      siteId: id,
      stopName: stopNames.get(id) || "",
      line: segmentMetaBySiteId.get(id)?.line ?? "",
      directionText: segmentMetaBySiteId.get(id)?.directionText ?? "",
    }));
    await fetchAllHybrid(segmentData, clearFirst, direction, requestId);
  };

  return {
    subscribe,
    isLoading: {
      subscribe: (cb: (val: boolean) => void) => {
        const unsub = isLoading.subscribe(cb);
        return unsub;
      },
    },
    confidenceBySite: {
      subscribe: (cb: (val: Map<string, SiteConfidenceState>) => void) => {
        const unsub = confidenceBySite.subscribe(cb);
        return unsub;
      },
    },
    isUpdating: {
      subscribe: (cb: (val: boolean) => void) => {
        const unsub = isUpdating.subscribe(cb);
        return unsub;
      },
    },
    lastError: {
      subscribe: (cb: (val: string | null) => void) => {
        const unsub = lastError.subscribe(cb);
        return unsub;
      },
    },
    lastSuccessfulFetch: {
      subscribe: (cb: (val: number) => void) => {
        const unsub = lastSuccessfulFetch.subscribe(cb);
        return unsub;
      },
    },
    fetchForSites: fetchAll,
    getCurrentRequestId: () => currentRequestId,
    setRequestId: (id: string | null) => {
      currentRequestId = id;
    },
    /**
     * Manually set data for a specific request ID.
     * Only updates the store if the request ID matches the current request ID.
     * Used for testing and for handling responses that need request identity filtering.
     */
    setDataForRequest: (
      requestId: string | null,
      dataMap: Map<string, Departure[]>,
    ) => {
      // Only update if request ID matches (or no request filtering)
      if (requestId && requestId !== currentRequestId) {
        if (import.meta.env.DEV) {
          console.log(
            `[departureStore] Ignoring setDataForRequest for stale requestId ${requestId} (current: ${currentRequestId})`,
          );
        }
        return;
      }

      // Update the store atomically
      set(dataMap);
    },
    /**
     * Clear all departure data. Used when switching routes.
     */
    clear: () => {
      set(new Map());
      confidenceBySite.set(new Map());
    },
    startAutoRefresh: (
      siteIds: string[],
      stopNames: Map<string, string>,
      segmentMetaBySiteId: Map<string, SegmentCacheMeta> = new Map(),
      interval: number,
      clearFirst = false,
      direction: string | null = null,
      requestId: string | null = null,
    ) => {
      if (refreshTimer) clearInterval(refreshTimer);
      stopNamesMap = stopNames;
      currentSiteIds = siteIds;
      if (requestId) {
        currentRequestId = requestId;
      }
      fetchAll(
        siteIds,
        stopNames,
        segmentMetaBySiteId,
        clearFirst,
        direction,
        requestId,
      );
      refreshTimer = setInterval(
        () =>
          fetchAll(
            siteIds,
            stopNames,
            segmentMetaBySiteId,
            false,
            direction,
            requestId,
          ),
        interval,
      );
    },
    stopAutoRefresh: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    refresh: async (
      siteIds: string[],
      stopNames: Map<string, string>,
      segmentMetaBySiteId: Map<string, SegmentCacheMeta> = new Map(),
      clearFirst = false,
      direction: string | null = null,
      requestId: string | null = null,
    ) => {
      await fetchAll(
        siteIds,
        stopNames,
        segmentMetaBySiteId,
        clearFirst,
        direction,
        requestId,
      );
    },
  };
}

export const departureStore = createDepartureStore();
export type { Departure };
