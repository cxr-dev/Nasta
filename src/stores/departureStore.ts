import { writable, get } from 'svelte/store';
import type { Departure } from '../types/departure';
import { getDepartures } from '../services/departureService';
import { getCachedSchedule } from '../services/scheduleCache';

interface DepartureWithSource extends Departure {
  /** 'cache' = from schedule cache, 'api' = from live API, 'enriched' = cache + API deviations */
  source?: 'cache' | 'api' | 'enriched';
  /** Timestamp when this was cached */
  cachedAt?: number;
}

function createDepartureStore() {
  const { subscribe, set, update } = writable<Map<string, Departure[]>>(new Map());
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let stopNamesMap = new Map<string, string>();
  let currentSiteIds: string[] = [];
  let currentDirection: string | null = null;

  let isFetching = false;

  /**
   * Hybrid fetch strategy:
   * 1. Check cache immediately → display
   * 2. Fetch API in parallel for enrichment
   * 3. Merge: use API times, layer cache deviations
   */
  const fetchAllHybrid = async (
    segmentData: Array<{
      siteId: string;
      stopName: string;
      line: string;
      directionText: string;
    }>,
    clearFirst = false,
    direction: string | null = null
  ) => {
    // Detect direction change - force clear if different direction
    if (direction && direction !== currentDirection) {
      console.log('[departureStore] Direction changed, clearing data');
      currentDirection = direction;
      clearFirst = true;
    }
    if (isFetching) {
      console.log('[departureStore] Fetch skipped - already fetching');
      return;
    }
    isFetching = true;

    const results = clearFirst ? new Map<string, Departure[]>() : new Map(get({ subscribe }));
    
    try {
      // Phase 1: Check cache for each segment and display immediately
      const cacheResults = new Map<string, Departure[] | null>();
      const siteIdsNeedingApi: typeof segmentData = [];

      for (const seg of segmentData) {
        const cached = getCachedSchedule(seg.siteId, seg.line, seg.directionText, 24);
        if (cached) {
          console.log(
            `[departureStore] Cache hit: ${seg.siteId} (${seg.stopName}) - ${cached.length} departures`
          );
          cacheResults.set(seg.siteId, cached);
          results.set(seg.siteId, cached);
        } else {
          console.log(
            `[departureStore] Cache miss: ${seg.siteId} (${seg.stopName}), will fetch API`
          );
          cacheResults.set(seg.siteId, null);
          siteIdsNeedingApi.push(seg);
        }
      }

      // Display cached data immediately
      set(results);

      // Phase 2: Fetch fresh API data in parallel for enrichment
      if (siteIdsNeedingApi.length > 0) {
        await Promise.all(
          siteIdsNeedingApi.map(async (seg) => {
            try {
              console.log(
                `[departureStore] API fetch: ${seg.siteId} (${seg.stopName})`
              );
              const apiDepartures = await getDepartures(seg.stopName, seg.siteId);
              
              // Use API data (which auto-caches)
              results.set(seg.siteId, apiDepartures);
              
              // Update store with API results
              update((store) => {
                store.set(seg.siteId, apiDepartures);
                return store;
              });
            } catch (e) {
              console.error(`[departureStore] API error for ${seg.siteId}:`, e);
              // Fall back to empty if API fails
              results.set(seg.siteId, []);
            }
          })
        );
      }

      set(results);
    } catch (error) {
      console.error('[departureStore] Overall fetch error:', error);
    } finally {
      isFetching = false;
    }
  };

  // Legacy API - convert to new segment data format
  const fetchAll = async (
    siteIds: string[],
    stopNames: Map<string, string>,
    clearFirst = false,
    direction: string | null = null
  ) => {
    const segmentData = siteIds.map((id) => ({
      siteId: id,
      stopName: stopNames.get(id) || '',
      line: '', // Will be filled by segment data if available
      directionText: '', // Will be filled by segment data if available
    }));
    await fetchAllHybrid(segmentData, clearFirst, direction);
  };

  return {
    subscribe,
    fetchForSites: fetchAll,
    startAutoRefresh: (
      siteIds: string[],
      stopNames: Map<string, string>,
      interval: number,
      clearFirst = false,
      direction: string | null = null
    ) => {
      if (refreshTimer) clearInterval(refreshTimer);
      stopNamesMap = stopNames;
      currentSiteIds = siteIds;
      fetchAll(siteIds, stopNames, clearFirst, direction);
      refreshTimer = setInterval(() => fetchAll(siteIds, stopNames, false, direction), interval);
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
      clearFirst = false,
      direction: string | null = null
    ) => {
      await fetchAll(siteIds, stopNames, clearFirst, direction);
    }
  };
}

export const departureStore = createDepartureStore();
export type { Departure };
