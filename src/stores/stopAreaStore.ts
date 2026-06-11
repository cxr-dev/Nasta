import { writable, get } from "svelte/store";

const STORAGE_KEY = "nasta_stop_area_mapping";

interface StopAreaStore {
  /** siteId → stopAreaId lookup map */
  mapping: Map<string, string>;
  /** Timestamp of last update */
  lastUpdatedAt: number;
}

function createStopAreaStore() {
  const { subscribe, set, update } = writable<StopAreaStore>({
    mapping: new Map(),
    lastUpdatedAt: 0,
  });

  /** Set a siteId→stopAreaId mapping */
  function setMapping(siteId: string, stopAreaId: string): void {
    update((state) => {
      const next = new Map(state.mapping);
      next.set(siteId, stopAreaId);
      return { mapping: next, lastUpdatedAt: Date.now() };
    });
    persist();
  }

  /** Lookup stopAreaId for a siteId */
  function getStopAreaId(siteId: string): string | undefined {
    return get({ subscribe }).mapping.get(siteId);
  }

  /** Persist mapping to localStorage */
  function persist(): void {
    try {
      const state = get({ subscribe });
      const obj: Record<string, string> = {};
      state.mapping.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore storage failures
    }
  }

  /** Load persisted mapping from localStorage */
  function hydrate(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (typeof obj !== "object" || obj === null) return;
      const mapping = new Map<string, string>();
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
          mapping.set(k, v);
        }
      }
      set({ mapping, lastUpdatedAt: Date.now() });
    } catch {
      // Ignore parse errors
    }
  }

  /** Clear all mappings */
  function clear(): void {
    set({ mapping: new Map(), lastUpdatedAt: Date.now() });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }

  // Hydrate on creation
  hydrate();

  return {
    subscribe,
    setMapping,
    getStopAreaId,
    persist,
    hydrate,
    clear,
  };
}

export const stopAreaStore = createStopAreaStore();