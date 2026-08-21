import { describe, it, expect, vi } from "vitest";
import { ProviderRegistry } from "../providers/registry.js";
import { createTransitService, TransitServiceImpl } from "./transitService.js";
import type { TransitProvider, EntityId } from "../providers/types.js";

/** Build a mock provider with optional method overrides. */
function mockProvider(
  id: string,
  overrides?: Partial<TransitProvider>,
): TransitProvider {
  return {
    capabilities: {
      providerId: id,
      displayName: id,
      features: {
        search: false, realtime: false, schedules: false,
        predictions: false, disruptions: false, stopSequences: false,
        vehiclePositions: false, routeGeometry: false,
        tripMetadata: false, occupancy: false,
      },
    },
    ownsStop(stopId: EntityId): boolean {
      return stopId.startsWith(`${id}:`);
    },
    getDepartures: vi.fn().mockResolvedValue({ departures: [], stopDeviations: [] }),
    ...overrides,
  };
}

describe("TransitServiceImpl", () => {
  it("createTransitService returns a TransitService instance", () => {
    const registry = new ProviderRegistry();
    const svc = createTransitService(registry);
    expect(svc).toBeInstanceOf(TransitServiceImpl);
  });

  it("getProviders returns empty array when registry empty", () => {
    const registry = new ProviderRegistry();
    const svc = createTransitService(registry);
    expect(svc.getProviders()).toEqual([]);
  });

  it("getProviders returns capabilities from registry", () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider("sl"));
    registry.register(mockProvider("sjostad"));
    const svc = createTransitService(registry);

    const providers = svc.getProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].providerId).toBe("sl");
    expect(providers[1].providerId).toBe("sjostad");
  });

  // ─── Delegation tests ──────────────────────────────────────

  it("getDepartures delegates to resolved provider", async () => {
    const registry = new ProviderRegistry();
    const mock = mockProvider("sl", {
      getDepartures: vi.fn().mockResolvedValue({ departures: [{ id: "d1" }], stopDeviations: [] }),
    });
    registry.register(mock);

    const svc = createTransitService(registry);
    const result = await svc.getDepartures("sl:123", "Test", "4", 1);

    expect(result).toEqual({ departures: [{ id: "d1" }], stopDeviations: [] });
    expect(mock.getDepartures).toHaveBeenCalledWith("sl:123", "4", 1, undefined, undefined);
  });

  it("getDepartures throws for unknown provider", async () => {
    const registry = new ProviderRegistry();
    const svc = createTransitService(registry);

    try {
      await svc.getDepartures("unknown:1", "X");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("No provider found");
    }
  });

  it("searchStops aggregates from search-enabled providers", async () => {
    const registry = new ProviderRegistry();
    const p1 = mockProvider("a", {
      capabilities: { providerId: "a", displayName: "A", features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      searchStops: vi.fn().mockResolvedValue([{ id: "a:1", name: "Stop A", modes: [], relevance: 50, locationType: "stop" }]),
    });
    const p2 = mockProvider("b", {
      capabilities: { providerId: "b", displayName: "B", features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      searchStops: vi.fn().mockResolvedValue([{ id: "b:1", name: "Stop B", modes: [], relevance: 50, locationType: "stop" }]),
    });
    registry.register(p1);
    registry.register(p2);

    const svc = createTransitService(registry);
    const results = await svc.searchStops("test");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(["a:1", "b:1"]);
  });

  it("searchStops skips providers without search feature", async () => {
    const registry = new ProviderRegistry();
    const p1 = mockProvider("a", {
      capabilities: { providerId: "a", displayName: "A", features: { search: false, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
    });
    registry.register(p1);

    const svc = createTransitService(registry);
    expect(await svc.searchStops("test")).toEqual([]);
  });

  it('throws when every search provider fails without a partial result', async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider('sl', {
      capabilities: { providerId: 'sl', displayName: 'SL', features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      searchStops: vi.fn().mockRejectedValue(new Error('offline')),
    }));

    await expect(createTransitService(registry).searchStops('test')).rejects.toThrow('offline');
  });

  it("getPredictedDepartures delegates when provider supports it", async () => {
    const registry = new ProviderRegistry();
    const mock = mockProvider("sl", {
      capabilities: { providerId: "sl", displayName: "SL", features: { search: false, realtime: false, schedules: false, predictions: true, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      getPredictedDepartures: vi.fn().mockResolvedValue([{ id: "pd1" }]),
    });
    registry.register(mock);

    const svc = createTransitService(registry);
    const result = await svc.getPredictedDepartures("sl:1", "Stop", "4", 0, 5);

    expect(result).toEqual([{ id: "pd1" }]);
    expect(mock.getPredictedDepartures).toHaveBeenCalledWith("sl:1", "4", 0, 5);
  });

  it("getPredictedDepartures returns [] when provider lacks feature", async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider("sl"));

    const svc = createTransitService(registry);
    expect(await svc.getPredictedDepartures("sl:1", "S", "4", 0, 5)).toEqual([]);
  });

  it("getNextScheduledDeparture delegates when provider supports it", async () => {
    const registry = new ProviderRegistry();
    const mock = mockProvider("sl", {
      getNextScheduledDeparture: vi.fn().mockResolvedValue({ id: "ns1" }),
    });
    registry.register(mock);

    const svc = createTransitService(registry);
    const result = await svc.getNextScheduledDeparture("sl:1", "S", "4", 0);

    expect(result).toEqual({ id: "ns1" });
  });

  it("getNextScheduledDeparture returns null when provider lacks feature", async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider("sl"));

    const svc = createTransitService(registry);
    expect(await svc.getNextScheduledDeparture("sl:1", "S", "4", 0)).toBeNull();
  });

  it("getKnownRoutes delegates when provider supports it", async () => {
    const registry = new ProviderRegistry();
    const mock = mockProvider("sl", {
      getKnownRoutes: vi.fn().mockResolvedValue([{ line: "4", lineName: "Line 4", destination: "dest", directionCode: 0, transportMode: "tram" }]),
    });
    registry.register(mock);

    const svc = createTransitService(registry);
    const result = await svc.getKnownRoutes("sl:1", "S");

    expect(result).toHaveLength(1);
    expect(result[0].line).toBe("4");
  });

  it("getKnownRoutes returns [] when provider lacks feature", async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider("sl"));

    const svc = createTransitService(registry);
    expect(await svc.getKnownRoutes("sl:1", "S")).toEqual([]);
  });

  it("getDisruptions groups segments by provider and aggregates", async () => {
    const registry = new ProviderRegistry();
    const mock = mockProvider("sl", {
      capabilities: { providerId: "sl", displayName: "SL", features: { search: false, realtime: false, schedules: false, predictions: false, disruptions: true, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      getDisruptions: vi.fn().mockResolvedValue([
        {
          id: "sl:d1",
          severity: "warning",
          title: "Delays",
          effect: "significant_delays",
          affectedRoutes: [],
          affectedStops: ["sl:1", "sl:2"],
          updatedAt: 1000,
        },
      ]),
    });
    registry.register(mock);

    const svc = createTransitService(registry);
    const segments = [
      { stopId: "sl:1" as EntityId, stopName: "S1", line: "4" },
      { stopId: "sl:3" as EntityId, stopName: "S3", line: "7" },
    ];
    const result = await svc.getDisruptions(segments);

    expect(result.size).toBe(1);           // only sl:1 got an entry
    expect(result.get("sl:1")).toHaveLength(1);
    expect(mock.getDisruptions).toHaveBeenCalledWith(
      ["sl:1", "sl:3"], ["4", "7"],
    );
  });

  it("resolveStopId tries search providers in order", async () => {
    const registry = new ProviderRegistry();
    const p1 = mockProvider("a", {
      capabilities: { providerId: "a", displayName: "A", features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      resolveStopId: vi.fn().mockResolvedValue(null),
    });
    const p2 = mockProvider("b", {
      capabilities: { providerId: "b", displayName: "B", features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      resolveStopId: vi.fn().mockResolvedValue("b:42"),
    });
    registry.register(p1);
    registry.register(p2);

    const svc = createTransitService(registry);
    const result = await svc.resolveStopId("test");

    expect(result).toBe("b:42");
    expect(p1.resolveStopId).toHaveBeenCalled();
    expect(p2.resolveStopId).toHaveBeenCalled();
  });

  it("resolveStopId returns null when nothing matches", async () => {
    const registry = new ProviderRegistry();
    const p1 = mockProvider("a", {
      capabilities: { providerId: "a", displayName: "A", features: { search: true, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: false, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
    });
    registry.register(p1);

    const svc = createTransitService(registry);
    expect(await svc.resolveStopId("test")).toBeNull();
  });

  it("getStopSequence returns first non-null from stopSequences providers", async () => {
    const registry = new ProviderRegistry();
    const p1 = mockProvider("a", {
      capabilities: { providerId: "a", displayName: "A", features: { search: false, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: true, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      getStopSequence: vi.fn().mockResolvedValue(null),
    });
    const p2 = mockProvider("b", {
      capabilities: { providerId: "b", displayName: "B", features: { search: false, realtime: false, schedules: false, predictions: false, disruptions: false, stopSequences: true, vehiclePositions: false, routeGeometry: false, tripMetadata: false, occupancy: false } },
      getStopSequence: vi.fn().mockResolvedValue({ routeId: "b:r1", directionCode: 0, headsign: "dest", stops: [] }),
    });
    registry.register(p1);
    registry.register(p2);

    const svc = createTransitService(registry);
    const result = await svc.getStopSequence("a:1", "dest", "4", 0);

    expect(result).not.toBeNull();
    expect(result!.routeId).toBe("b:r1");
  });

  // ─── Future methods still throw ────────────────────────────

  it("future methods throw descriptive error", async () => {
    const registry = new ProviderRegistry();
    const svc = createTransitService(registry);

    await expect(svc.getVehiclePositions([])).rejects.toThrow(/not implemented/);
    await expect(svc.getRouteShape("sl:s")).rejects.toThrow(/not implemented/);
    await expect(svc.getTripDetails("sl:t")).rejects.toThrow(/not implemented/);
    await expect(svc.getRealtimeUpdates("sl:t")).rejects.toThrow(/not implemented/);
  });
});
