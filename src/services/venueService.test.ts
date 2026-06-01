import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchNearbyVenues } from './venueService';

describe('venueService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses supabase and overpass responses defensively', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('supabase')) {
        return new Response(JSON.stringify({
          venues: [{ id: 'b1', name: 'Beer Bar', lat: 59.33, lon: 18.06, openingHours: '11:00-23:00', priceLevel: 2 }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        elements: [{ id: 1, lat: 59.331, lon: 18.061, tags: { name: 'Cocktail Club', opening_hours: '12:00-01:00' } }]
      }), { status: 200 });
    }) as any);

    const venues = await fetchNearbyVenues(59.33, 18.06, 2000, ['beer', 'cocktail']);
    expect(venues).toHaveLength(2);
    expect(venues.map(v => v.name).sort()).toEqual(['Beer Bar', 'Cocktail Club']);
    expect(venues.every(v => v.source === 'supabase' || v.source === 'overpass')).toBe(true);
  });
});
