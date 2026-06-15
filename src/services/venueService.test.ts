import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchNearbyVenues } from './venueService';

describe('venueService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('merges Overpass metadata with Supabase pricing for matching venues', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('supabase')) {
        return new Response(JSON.stringify({
          venues: [{
            id: 'b1', name: 'Beer Bar', lat: 59.33, lon: 18.06,
            openingHours: '11:00-23:00', priceLevel: 2,
            beer_price: 45, beer_name: 'Session IPA',
          }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        elements: [
          {
            id: 1, lat: 59.33005, lon: 18.06005,
            tags: { name: 'Beer Bar', opening_hours: '12:00-01:00', outdoor_seating: 'yes' },
          },
          {
            id: 2, lat: 59.331, lon: 18.061,
            tags: { name: 'Cocktail Club', opening_hours: '18:00-02:00' },
          },
        ]
      }), { status: 200 });
    }) as any);

    const venues = await fetchNearbyVenues(59.33, 18.06, 2000, ['beer', 'cocktail']);
    expect(venues).toHaveLength(2);
    expect(venues.map(v => v.name).sort()).toEqual(['Beer Bar', 'Cocktail Club']);

    // Merged venue — Overpass metadata with Supabase pricing
    const beerBar = venues.find(v => v.name === 'Beer Bar')!;
    expect(beerBar.source).toBe('overpass');
    expect(beerBar.lat).toBe(59.33005);
    expect(beerBar.lon).toBe(18.06005);
    expect(beerBar.openingHours).toBe('12:00-01:00');
    expect(beerBar.hasOutdoorSeating).toBe(true);
    expect(beerBar.rawPrice).toBe(45);
    expect(beerBar.drinkName).toBe('Session IPA');

    // Pure Overpass venue
    const cocktailClub = venues.find(v => v.name === 'Cocktail Club')!;
    expect(cocktailClub.source).toBe('overpass');
    expect(cocktailClub.lat).toBe(59.331);
    expect(cocktailClub.lon).toBe(18.061);
  });
});
