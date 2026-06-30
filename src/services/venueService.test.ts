import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadVenueService() {
  const mod = await import("./venueService");
  return mod.fetchNearbyVenues;
}

describe("venueService", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
    // Clear persistentCache (IndexedDB survives vi.resetModules with fake-indexeddb)
    const { persistentCache } = await import("./persistentCache");
    const keys = await persistentCache.getAllKeys();
    for (const k of keys) await persistentCache.remove(k);
  });

  it("merges Overpass metadata with Supabase pricing for matching venues", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("supabase")) {
        return new Response(
          JSON.stringify({
            venues: [
              {
                id: "b1",
                name: "Beer Bar",
                lat: 59.33,
                lon: 18.06,
                openingHours: "11:00-23:00",
                priceLevel: 2,
                beer_price: 45,
                beer_name: "Session IPA",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          elements: [
            {
              id: 1,
              lat: 59.33005,
              lon: 18.06005,
              tags: {
                name: "Beer Bar",
                opening_hours: "12:00-01:00",
                outdoor_seating: "yes",
              },
            },
            {
              id: 2,
              lat: 59.331,
              lon: 18.061,
              tags: { name: "Cocktail Club", opening_hours: "18:00-02:00" },
            },
          ],
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock as any);
    const fetchNearbyVenues = await loadVenueService();

    const venues = await fetchNearbyVenues(59.33, 18.06, 2000, [
      "beer",
      "cocktail",
    ]);

    expect(venues).toHaveLength(2);
    expect(venues.map((v) => v.name).sort()).toEqual([
      "Beer Bar",
      "Cocktail Club",
    ]);

    const beerBar = venues.find((v) => v.name === "Beer Bar")!;
    expect(beerBar.source).toBe("overpass");
    expect(beerBar.lat).toBe(59.33005);
    expect(beerBar.lon).toBe(18.06005);
    expect(beerBar.openingHours).toBe("12:00-01:00");
    expect(beerBar.hasOutdoorSeating).toBe(true);
    expect(beerBar.rawPrice).toBe(45);
    expect(beerBar.drinkName).toBe("Session IPA");

    const cocktailClub = venues.find((v) => v.name === "Cocktail Club")!;
    expect(cocktailClub.source).toBe("overpass");
    expect(cocktailClub.lat).toBe(59.331);
    expect(cocktailClub.lon).toBe(18.061);
  });

  it("filters non-matching venues and sorts matching ones by relevance", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toContain("supabase");

      return new Response(
        JSON.stringify({
          elements: [
            {
              id: 1,
              lat: 59.33,
              lon: 18.06,
              tags: {
                name: "Wine Palace",
                bar: "wine",
              },
            },
            {
              id: 2,
              lat: 59.3302,
              lon: 18.0602,
              tags: {
                name: "Natural Wine Lounge",
                opening_hours: "12:00-01:00",
                outdoor_seating: "yes",
              },
            },
            {
              id: 3,
              lat: 59.3304,
              lon: 18.0604,
              tags: {
                name: "Cocktail Club",
                cocktail: "yes",
              },
            },
            {
              id: 4,
              lat: 59.3306,
              lon: 18.0606,
              tags: {
                name: "Generic Bar",
                amenity: "bar",
              },
            },
            {
              id: 5,
              lat: 59.3308,
              lon: 18.0608,
              tags: {
                name: "Irish Pub",
                amenity: "pub",
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock as any);
    const fetchNearbyVenues = await loadVenueService();

    const venues = await fetchNearbyVenues(59.33, 18.06, 2000, ["wine"]);

    expect(venues.map((venue) => venue.name)).toEqual([
      "Natural Wine Lounge",
      "Wine Palace",
    ]);
    expect(venues).toHaveLength(2);
  });

  it("reuses the in-memory cache for repeated calls with the same inputs", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          elements: [
            {
              id: 1,
              lat: 59.33,
              lon: 18.06,
              tags: {
                name: "Wine Palace",
                bar: "wine",
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock as any);
    const fetchNearbyVenues = await loadVenueService();

    const first = await fetchNearbyVenues(59.33, 18.06, 2000, ["wine"]);
    const second = await fetchNearbyVenues(59.33, 18.06, 2000, ["wine"]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
