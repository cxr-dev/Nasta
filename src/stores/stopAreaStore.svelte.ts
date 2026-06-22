const STORAGE_KEY = "nasta_stop_area_mapping";

let _mapping: Map<string, string> = $state(new Map());
let _lastUpdatedAt: number = $state(0);

/** Persist mapping to localStorage */
function persist(): void {
  try {
    const obj: Record<string, string> = {};
    _mapping.forEach((v, k) => {
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
    _mapping = mapping;
    _lastUpdatedAt = Date.now();
  } catch {
    // Ignore parse errors
  }
}

/** Set a siteId→stopAreaId mapping */
function setMapping(siteId: string, stopAreaId: string): void {
  const next = new Map(_mapping);
  next.set(siteId, stopAreaId);
  _mapping = next;
  _lastUpdatedAt = Date.now();
  persist();
}

/** Lookup stopAreaId for a siteId */
function getStopAreaId(siteId: string): string | undefined {
  return _mapping.get(siteId);
}

/** Clear all mappings */
function clear(): void {
  _mapping = new Map();
  _lastUpdatedAt = Date.now();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
}

// Hydrate on creation
hydrate();

export const stopAreaStore = {
  setMapping,
  getStopAreaId,
  clear,
};
