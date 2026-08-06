import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchNearbyEventsMock, fetchNearbyVenuesMock } = vi.hoisted(() => ({
  fetchNearbyEventsMock: vi.fn(),
  fetchNearbyVenuesMock: vi.fn(),
}));

vi.mock('./eventService', () => ({ fetchNearbyEvents: fetchNearbyEventsMock }));
vi.mock('./venueService', () => ({
  fetchNearbyVenues: fetchNearbyVenuesMock,
}));

async function loadSession() {
  return import('./featureDiscoverySession');
}

describe('featureDiscoverySession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fetchNearbyEventsMock.mockResolvedValue([]);
    fetchNearbyVenuesMock.mockResolvedValue([]);
  });

  it('shares concurrent foreground and prefetch requests', async () => {
    let resolve: ((value: unknown[]) => void) | undefined;
    fetchNearbyEventsMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { loadFeatureDiscovery, prefetchFeatureDiscovery } = await loadSession();
    const query = { lat: 59.33, lon: 18.06, mode: 'events' as const };

    const foreground = loadFeatureDiscovery(query);
    const prefetch = prefetchFeatureDiscovery(query);
    resolve?.([{ id: 'event-1' }]);

    await expect(foreground).resolves.toEqual([{ id: 'event-1' }]);
    await expect(prefetch).resolves.toBeUndefined();
    expect(fetchNearbyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchNearbyEventsMock).toHaveBeenCalledWith(59.33, 18.06, 5000);
  });

  it('returns memory hits, including successful empty results, without another provider call', async () => {
    const { loadFeatureDiscovery, peekFeatureDiscovery } = await loadSession();
    const query = { lat: 59.33, lon: 18.06, mode: 'beer' as const };

    await loadFeatureDiscovery(query);
    expect(peekFeatureDiscovery(query)).toEqual([]);
    await loadFeatureDiscovery(query);

    expect(fetchNearbyVenuesMock).toHaveBeenCalledTimes(1);
    expect(fetchNearbyVenuesMock).toHaveBeenCalledWith(59.33, 18.06, 1200, ['beer']);
  });

  it('uses the canonical wine and cocktail query without name-based image enrichment', async () => {
    const venues = [{ id: 'venue-1' }];
    fetchNearbyVenuesMock.mockResolvedValue(venues);
    const { peekFeatureDiscovery, prefetchFeatureDiscovery } = await loadSession();
    const query = { lat: 59.33, lon: 18.06, mode: 'wineCocktail' as const };

    await prefetchFeatureDiscovery(query);

    expect(fetchNearbyVenuesMock).toHaveBeenCalledWith(59.33, 18.06, 1200, ['wine', 'cocktail']);
    expect(peekFeatureDiscovery(query)).toEqual(venues);
  });

  it('does not cache failures, so retry can call the provider again', async () => {
    fetchNearbyEventsMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ id: 'event-2' }]);
    const { loadFeatureDiscovery, peekFeatureDiscovery } = await loadSession();
    const query = { lat: 59.33, lon: 18.06, mode: 'events' as const };

    await expect(loadFeatureDiscovery(query)).rejects.toThrow('offline');
    expect(peekFeatureDiscovery(query)).toBeUndefined();
    await expect(loadFeatureDiscovery(query)).resolves.toEqual([{ id: 'event-2' }]);
    expect(fetchNearbyEventsMock).toHaveBeenCalledTimes(2);
  });

  it('reloads a venue result after the session TTL expires', async () => {
    vi.useFakeTimers();
    try {
      const { loadFeatureDiscovery } = await loadSession();
      const query = { lat: 59.33, lon: 18.06, mode: 'beer' as const };

      await loadFeatureDiscovery(query);
      vi.advanceTimersByTime(30 * 60 * 1000 + 1);
      await loadFeatureDiscovery(query);

      expect(fetchNearbyVenuesMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
