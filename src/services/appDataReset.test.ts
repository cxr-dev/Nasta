import { beforeEach, describe, expect, it } from 'vitest';
import { clearAppOwnedData } from './appDataReset';
import { persistentCache } from './persistentCache';

describe('app data reset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes app-owned local data and persistent cache entries', async () => {
    localStorage.setItem('nasta_routes', 'routes');
    localStorage.setItem('nasta_recent_stops', 'stops');
    localStorage.setItem('nasta_venues_v2:test', 'venues');
    localStorage.setItem('unrelated_preference', 'keep');
    await persistentCache.set('schedule:v1', { cached: true }, 60_000);

    await clearAppOwnedData();

    expect(localStorage.getItem('nasta_routes')).toBeNull();
    expect(localStorage.getItem('nasta_recent_stops')).toBeNull();
    expect(localStorage.getItem('nasta_venues_v2:test')).toBeNull();
    expect(localStorage.getItem('unrelated_preference')).toBe('keep');
    expect(await persistentCache.get('schedule:v1')).toBeNull();
  });
});
