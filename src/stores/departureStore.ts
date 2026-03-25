import { writable, get } from 'svelte/store';
import type { Departure } from '../types/departure';
import { getDepartures } from '../services/slApi';

function createDepartureStore() {
  const { subscribe, set, update } = writable<Map<string, Departure[]>>(new Map());
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const fetchAll = async (siteIds: string[]) => {
    const results = new Map<string, Departure[]>();
    await Promise.all(
      siteIds.map(async (siteId) => {
        try {
          const departures = await getDepartures(siteId);
          results.set(siteId, departures);
        } catch (e) {
          console.error(`Failed to fetch departures for ${siteId}:`, e);
          results.set(siteId, []);
        }
      })
    );
    set(results);
  };

  return {
    subscribe,
    fetchForSites: fetchAll,
    startAutoRefresh: (siteIds: string[], interval: number) => {
      if (refreshTimer) clearInterval(refreshTimer);
      fetchAll(siteIds);
      refreshTimer = setInterval(() => fetchAll(siteIds), interval);
    },
    stopAutoRefresh: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    refresh: async (siteIds: string[]) => {
      await fetchAll(siteIds);
    }
  };
}

export const departureStore = createDepartureStore();
