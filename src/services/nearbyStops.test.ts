import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNearbyCatalogCache, getNearbyStops, parseCatalog } from './nearbyStops';

afterEach(async () => {
  vi.restoreAllMocks();
  await clearNearbyCatalogCache();
});

describe('nearby stop catalog', () => {
  it('maps SL sites into canonical stop results', () => {
    const result = parseCatalog([{ id: 1080, name: 'Odenplan', lat: 59.343, lon: 18.046, transport_modes: ['METRO', 'BUS'] }]);
    expect(result[0]).toMatchObject({ id: 'sl:1080', name: 'Odenplan', coord: [59.343, 18.046], modes: ['metro', 'bus'], locationType: 'station' });
  });

  it('returns stops sorted by distance and bounded by the query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 1, name: 'Near', lat: 59.33, lon: 18.06 },
      { id: 2, name: 'Far', lat: 59.35, lon: 18.06 },
    ]), { status: 200 })));
    const result = await getNearbyStops({ origin: [59.33, 18.06], radiusMeters: 5000, limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Near');
    expect(result[0].distance).toBe(0);
  });

  it('uses cached catalog data when a refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'Near', lat: 59.33, lon: 18.06 }]), { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await getNearbyStops({ origin: [59.33, 18.06], radiusMeters: 5000, limit: 3 });
    vi.mocked(Date.now).mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    const result = await getNearbyStops({ origin: [59.33, 18.06], radiusMeters: 5000, limit: 3 });
    expect(result[0].name).toBe('Near');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
