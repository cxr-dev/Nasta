// Lightweight IndexedDB-backed persistent cache with in-memory fallback
// API: get(key): Promise<any|null>, set(key, value, ttlMs): Promise<void>, remove(key): Promise<void>

const MIGRATED_KEYS = new Set<string>();

// In-memory store for environments without indexedDB (like test environments)
interface InMemoryEntry {
  value: unknown;
  expires: number;
}
let inMemoryStore: Record<string, InMemoryEntry> = {};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB not available'));
      return;
    }
    const req = indexedDB.open("nasta-cache", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  try {
    const db = await openDB();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("cache", mode);
      const store = tx.objectStore("cache");
      try {
        const result = callback(store);
        Promise.resolve(result)
          .then((v) => {
            tx.oncomplete = () => resolve(v);
          })
          .catch((err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  } catch {
    // Fallback to in-memory
    throw new Error('Use in-memory');
  }
}

export const persistentCache = {
  async migrateFromLocalStorage(localStorageKey: string, cacheKey: string, ttlMs?: number): Promise<void> {
    if (MIGRATED_KEYS.has(localStorageKey)) return;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(localStorageKey);
        if (raw) {
          const value = JSON.parse(raw);
          await this.set(cacheKey, value, ttlMs || 1000 * 60 * 60 * 24 * 365 * 10); // 10 years default if no TTL
          localStorage.removeItem(localStorageKey);
        }
      }
    } catch {
      // ignore errors
    }
    MIGRATED_KEYS.add(localStorageKey);
  },

  async get(key: string): Promise<unknown | null> {
    // Try in-memory first (for test environments)
    if (typeof indexedDB === 'undefined') {
      const entry = inMemoryStore[key];
      if (!entry) return null;
      if (entry.expires && Date.now() > entry.expires) {
        delete inMemoryStore[key];
        return null;
      }
      return entry.value;
    }

    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction("cache", "readonly");
        const store = tx.objectStore("cache");
        const req = store.get(key);
        req.onsuccess = () => {
          const val = req.result;
          if (!val) return resolve(null);
          if (val.expires && Date.now() > val.expires) {
            // expired
            try {
              const dtx = db.transaction("cache", "readwrite");
              dtx.objectStore("cache").delete(key);
            } catch (e) {}
            return resolve(null);
          }
          resolve(val.value);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      // Fallback to in-memory
      const entry = inMemoryStore[key];
      if (!entry) return null;
      if (entry.expires && Date.now() > entry.expires) {
        delete inMemoryStore[key];
        return null;
      }
      return entry.value;
    }
  },

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    // Always update in-memory first
    inMemoryStore[key] = {
      value,
      expires: Date.now() + ttlMs
    };

    if (typeof indexedDB === 'undefined') return;

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        const payload = { value, expires: Date.now() + ttlMs };
        const req = store.put(payload, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback to in-memory only
      return;
    }
  },

  async remove(key: string): Promise<void> {
    // Always update in-memory first
    delete inMemoryStore[key];

    if (typeof indexedDB === 'undefined') return;

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("cache", "readwrite");
        const store = tx.objectStore("cache");
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback to in-memory only
      return;
    }
  },

  async clearExpired(): Promise<void> {
    // Clear in-memory expired entries
    const now = Date.now();
    for (const key in inMemoryStore) {
      if (inMemoryStore[key].expires && now > inMemoryStore[key].expires) {
        delete inMemoryStore[key];
      }
    }

    if (typeof indexedDB === 'undefined') return;

    try {
      const db = await openDB();
      const keys = await new Promise<string[]>((resolve) => {
        const tx = db.transaction("cache", "readonly");
        const store = tx.objectStore("cache");
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => resolve([]);
      });
      for (const key of keys) {
        await this.get(key); // get() will auto-delete expired keys
      }
    } catch {
      // Ignore errors
      return;
    }
  },

  async getAllKeys(): Promise<string[]> {
    if (typeof indexedDB === 'undefined') {
      return Object.keys(inMemoryStore);
    }

    try {
      const db = await openDB();
      return new Promise<string[]>((resolve) => {
        const tx = db.transaction("cache", "readonly");
        const store = tx.objectStore("cache");
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => resolve([]);
      });
    } catch {
      return Object.keys(inMemoryStore);
    }
  }
};
