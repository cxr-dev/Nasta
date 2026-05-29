// Lightweight IndexedDB-backed persistent cache
// API: get(key): Promise<any|null>, set(key, value, ttlMs): Promise<void>, remove(key): Promise<void>

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nasta-cache', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('cache', mode);
    const store = tx.objectStore('cache');
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
}

export const persistentCache = {
  async get(key: string): Promise<any | null> {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('cache', 'readonly');
      const store = tx.objectStore('cache');
      const req = store.get(key);
      req.onsuccess = () => {
        const val = req.result;
        if (!val) return resolve(null);
        if (val.expires && Date.now() > val.expires) {
          // expired
          try {
            const dtx = db.transaction('cache', 'readwrite');
            dtx.objectStore('cache').delete(key);
          } catch (e) {}
          return resolve(null);
        }
        resolve(val.value);
      };
      req.onerror = () => resolve(null);
    });
  },

  async set(key: string, value: any, ttlMs: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const payload = { value, expires: Date.now() + ttlMs };
      const req = store.put(payload, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async remove(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};
