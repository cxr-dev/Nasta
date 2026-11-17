import type { Page } from '@playwright/test';
import { defaultTestPage } from './commuterApp';

export async function seedSavedCommute(page: Page) {
  await page.addInitScript((savedPage) => {
    if (localStorage.getItem('nasta_routes')) return;
    localStorage.setItem('nasta_routes', JSON.stringify([savedPage]));
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'light' }));
  }, defaultTestPage);
}

// The production persistentCache envelope. Used for deterministic offline setup
// without depending on external API availability or timing background writes.
export async function seedCachedSchedule(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('nasta-cache', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('cache')) request.result.createObjectStore('cache');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').put({
          value: { '100|14|1': {
            line: '14', direction_code: 1,
            scheduledTimes: [new Date(Date.now() + 600_000).toISOString()],
            updatedAt: Date.now() - 180_000,
            validDate: new Date().toISOString().split('T')[0],
          } }, expires: Date.now() + 86_400_000,
        }, 'schedule:v1');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}

export function liveDepartures() {
  return { departures: [{
    line: { designation: '14', transport_mode: 'METRO' }, direction_code: 1,
    destination: 'Mörby centrum', display: '4 min',
    expected: new Date(Date.now() + 240_000).toISOString(),
    scheduled: new Date(Date.now() + 240_000).toISOString(),
  }], stop_deviations: [] };
}
