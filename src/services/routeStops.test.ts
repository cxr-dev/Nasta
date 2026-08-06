/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./persistentCache", () => ({
  persistentCache: {
    migrateFromLocalStorage: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

const mockPersistentCache = await import("./persistentCache").then(
  (m) => m.persistentCache,
);
const { clearRouteStopsCache, resolveStopSequence } = await import("./routeStops");

(globalThis as any).fetch = vi.fn();

interface MockRoute {
  urlMatcher: string;
  responseBody: unknown;
  ok?: boolean;
}

function setupFetchMock(routes: MockRoute[]) {
  (globalThis as any).fetch = vi.fn().mockImplementation(
    (url: string, _init?: RequestInit) => {
      const route = routes.find((r) => url.includes(r.urlMatcher));
      if (route) {
        return Promise.resolve({
          ok: route.ok !== false,
          status: route.ok !== false ? 200 : 500,
          json: async () => route.responseBody,
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    },
  );
}

describe("routeStops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRouteStopsCache();
    (mockPersistentCache.get as any).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns stop names from Trip API on first call (cache miss)", async () => {
    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", disassembledName: "Ropsten", type: "stop" },
          ],
        },
      },
      {
        urlMatcher: "trips",
        responseBody: {
          journeys: [
            {
              legs: [
                {
                  stopSequence: [
                    { name: "Slussen", parent: { disassembledName: "Slussen" } },
                    { name: "Gamla stan", parent: { disassembledName: "Gamla stan" } },
                    { name: "T-Centralen", parent: { disassembledName: "T-Centralen" } },
                    { name: "Ropsten", parent: { disassembledName: "Ropsten" } },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    expect(result).toEqual(["Gamla stan", "T-Centralen"]);
    // Verify Stop Finder was called with destination name
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("name_sf=Ropsten"),
      expect.any(Object),
    );
    // Verify Trip API was called
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("name_origin=90910010009001"),
      expect.any(Object),
    );
    // Should have cached the result
    expect(mockPersistentCache.set).toHaveBeenCalledWith(
      expect.stringContaining("route-stops:v1:9001|13|1"),
      expect.objectContaining({ stops: ["Gamla stan", "T-Centralen"] }),
      expect.any(Number),
    );
  });

  it("shares concurrent requests and serves the result from memory", async () => {
    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", disassembledName: "Ropsten", type: "stop" },
          ],
        },
      },
      {
        urlMatcher: "trips",
        responseBody: {
          journeys: [{ legs: [{ stopSequence: [
            { name: "Slussen", parent: { disassembledName: "Slussen" } },
            { name: "Ropsten", parent: { disassembledName: "Ropsten" } },
          ] }] }],
        },
      },
    ]);

    const [first, second] = await Promise.all([
      resolveStopSequence("9001", "Ropsten", "13", 1),
      resolveStopSequence("9001", "Ropsten", "13", 1),
    ]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    (globalThis.fetch as any).mockClear();
    expect(await resolveStopSequence("9001", "Ropsten", "13", 1)).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("continues a background request when an expanded preview is aborted", async () => {
    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", disassembledName: "Ropsten", type: "stop" },
          ],
        },
      },
      {
        urlMatcher: "trips",
        responseBody: {
          journeys: [{ legs: [{ stopSequence: [
            { name: "Slussen", parent: { disassembledName: "Slussen" } },
            { name: "Gamla stan", parent: { disassembledName: "Gamla stan" } },
            { name: "Ropsten", parent: { disassembledName: "Ropsten" } },
          ] }] }],
        },
      },
    ]);

    const backgroundRequest = resolveStopSequence("9001", "Ropsten", "13", 1);
    const controller = new AbortController();
    controller.abort();

    expect(await resolveStopSequence("9001", "Ropsten", "13", 1, controller.signal)).toBeNull();
    expect(await backgroundRequest).toEqual(["Gamla stan"]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(await resolveStopSequence("9001", "Ropsten", "13", 1)).toEqual(["Gamla stan"]);
  });

  it("returns cached result without calling API", async () => {
    (mockPersistentCache.get as any).mockResolvedValue({
      stops: ["Odenplan", "St Eriksplan"],
      ts: Date.now(),
    });

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    expect(result).toEqual(["Odenplan", "St Eriksplan"]);
    // fetch should NOT have been called (cache hit)
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("calls API when cache is expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));

    // Set cache with old timestamp (2 hours ago)
    (mockPersistentCache.get as any).mockResolvedValue({
      stops: ["Odenplan"],
      ts: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", disassembledName: "Ropsten", type: "stop" },
          ],
        },
      },
      {
        urlMatcher: "trips",
        responseBody: {
          journeys: [
            {
              legs: [
                {
                  stopSequence: [
                    { name: "Slussen", parent: { disassembledName: "Slussen" } },
                    { name: "Ropsten", parent: { disassembledName: "Ropsten" } },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    // Fetch was called (cache expired)
    expect(globalThis.fetch).toHaveBeenCalled();
    // No intermediate stops (origin→destination directly, 0 in between)
    expect(result).toEqual([]);
  });

  it("returns null when Stop Finder gets no results", async () => {
    setupFetchMock([
      { urlMatcher: "stop-finder", responseBody: { locations: [] } },
    ]);

    const result = await resolveStopSequence("9001", "Nowhere", "13", 1);

    expect(result).toBeNull();
    // Trip API should NOT be called if Stop Finder fails
    const tripCalls = (globalThis as any).fetch.mock.calls.filter(
      ([url]: string[]) => url.includes("trips"),
    );
    expect(tripCalls).toHaveLength(0);
  });

  it("returns null when Trip API returns no journeys", async () => {
    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", type: "stop" },
          ],
        },
      },
      { urlMatcher: "trips", responseBody: { journeys: [] } },
    ]);

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    expect(result).toBeNull();
  });

  it("returns null when Trip API returns error", async () => {
    setupFetchMock([
      {
        urlMatcher: "stop-finder",
        responseBody: {
          locations: [
            { id: "90910010009999", name: "Ropsten", type: "stop" },
          ],
        },
      },
      { urlMatcher: "trips", responseBody: {}, ok: false },
    ]);

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    expect(result).toBeNull();
  });

  it("returns null on network error (fetch throws)", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await resolveStopSequence("9001", "Ropsten", "13", 1);

    expect(result).toBeNull();
  });

  it("respects abort signal", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await resolveStopSequence(
      "9001",
      "Ropsten",
      "13",
      1,
      abortController.signal,
    );

    expect(result).toBeNull();
  });
});
