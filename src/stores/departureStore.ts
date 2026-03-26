import { writable, get } from 'svelte/store';
import type { Departure } from '../types/departure';
import { getDepartures } from '../services/departureService';

function createDepartureStore() {
  const { subscribe, set, update } = writable<Map<string, Departure[]>>(new Map());
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let stopNamesMap = new Map<string, string>();

  const fetchAll = async (siteIds: string[], stopNames: Map<string, string>) => {
    stopNamesMap = stopNames;
    const results = new Map<string, Departure[]>();
    await Promise.all(
      siteIds.map(async (siteId) => {
        try {
          const stopName = stopNames.get(siteId) || '';
          const departures = await getDepartures(stopName, siteId);
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
    startAutoRefresh: (siteIds: string[], stopNames: Map<string, string>, interval: number) => {
      if (refreshTimer) clearInterval(refreshTimer);
      fetchAll(siteIds, stopNames);
      refreshTimer = setInterval(() => fetchAll(siteIds, stopNames), interval);
    },
    stopAutoRefresh: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    refresh: async (siteIds: string[], stopNames: Map<string, string>) => {
      await fetchAll(siteIds, stopNames);
    }
  };
}

export const departureStore = createDepartureStore();
export type { Departure };
