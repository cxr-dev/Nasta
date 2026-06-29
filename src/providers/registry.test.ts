import { describe, it, expect } from "vitest";
import type { TransitProvider, EntityId, ProviderCapabilities } from "./types.js";
import { ProviderRegistry } from "./registry.js";

function mockProvider(id: string, features: Partial<ProviderCapabilities["features"]> = {}): TransitProvider {
  const defaultFeatures: ProviderCapabilities["features"] = {
    search: false,
    realtime: false,
    schedules: false,
    predictions: false,
    disruptions: false,
    stopSequences: false,
    vehiclePositions: false,
    routeGeometry: false,
    tripMetadata: false,
    occupancy: false,
  };
  return {
    capabilities: {
      providerId: id,
      displayName: id,
      features: { ...defaultFeatures, ...features },
    },
    ownsStop(stopId: EntityId): boolean {
      return stopId.startsWith(`${id}:`);
    },
    getDepartures: () => Promise.resolve({ departures: [], stopDeviations: [] }),
  } as TransitProvider;
}

describe("ProviderRegistry", () => {
  it("resolve returns null for empty registry", () => {
    const reg = new ProviderRegistry();
    expect(reg.resolve("sl:1234")).toBeNull();
  });

  it("resolve finds provider by EntityId prefix", () => {
    const reg = new ProviderRegistry();
    const sl = mockProvider("sl");
    reg.register(sl);
    expect(reg.resolve("sl:1234")).toBe(sl);
    expect(reg.resolve("sl:9011")).toBe(sl);
    expect(reg.resolve("sl:")).toBe(sl);
  });

  it("resolve returns null for unregistered prefix", () => {
    const reg = new ProviderRegistry();
    reg.register(mockProvider("sl"));
    expect(reg.resolve("sjostad:luma")).toBeNull();
    expect(reg.resolve("gtfs:1234")).toBeNull();
    expect(reg.resolve(":only-local")).toBeNull();
  });

  it("resolve returns null for malformed EntityId", () => {
    const reg = new ProviderRegistry();
    reg.register(mockProvider("sl"));
    expect(reg.resolve("noprefix")).toBeNull();
    expect(reg.resolve("")).toBeNull();
  });

  it("resolves different providers for different prefixes", () => {
    const reg = new ProviderRegistry();
    const sl = mockProvider("sl");
    const sjostad = mockProvider("sjostad");
    reg.register(sl);
    reg.register(sjostad);

    expect(reg.resolve("sl:1234")).toBe(sl);
    expect(reg.resolve("sjostad:luma")).toBe(sjostad);
  });

  it("getAll returns all registered providers in order", () => {
    const reg = new ProviderRegistry();
    const sl = mockProvider("sl");
    const sjostad = mockProvider("sjostad");
    reg.register(sl);
    reg.register(sjostad);

    const all = reg.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]).toBe(sl);
    expect(all[1]).toBe(sjostad);
  });

  it("getAll returns empty array when empty", () => {
    const reg = new ProviderRegistry();
    expect(reg.getAll()).toEqual([]);
  });

  it("withFeature filters by feature support", () => {
    const reg = new ProviderRegistry();
    const sl = mockProvider("sl", { disruptions: true, realtime: true });
    const sjostad = mockProvider("sjostad", { schedules: true });
    reg.register(sl);
    reg.register(sjostad);

    const disruptionsProviders = reg.withFeature("disruptions");
    expect(disruptionsProviders).toHaveLength(1);
    expect(disruptionsProviders[0]).toBe(sl);

    const schedulesProviders = reg.withFeature("schedules");
    expect(schedulesProviders).toHaveLength(1);
    expect(schedulesProviders[0]).toBe(sjostad);

    const realtimeProviders = reg.withFeature("realtime");
    expect(realtimeProviders).toHaveLength(1);
    expect(realtimeProviders[0]).toBe(sl);
  });

  it("withFeature returns empty array when no provider supports feature", () => {
    const reg = new ProviderRegistry();
    reg.register(mockProvider("sl", { search: true }));
    reg.register(mockProvider("sjostad", { schedules: true }));

    expect(reg.withFeature("vehiclePositions")).toEqual([]);
    expect(reg.withFeature("routeGeometry")).toEqual([]);
  });

  it("withFeature returns empty array for empty registry", () => {
    const reg = new ProviderRegistry();
    expect(reg.withFeature("search")).toEqual([]);
  });
});
