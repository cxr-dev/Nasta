import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../types/page";

const { fetchNearbyVenuesMock, fetchNearbyEventsMock } = vi.hoisted(() => ({
  fetchNearbyVenuesMock: vi.fn(async () => []),
  fetchNearbyEventsMock: vi.fn(async () => []),
}));

vi.mock("./venueService", () => ({
  fetchNearbyVenues: fetchNearbyVenuesMock,
}));

vi.mock("./eventService", () => ({
  fetchNearbyEvents: fetchNearbyEventsMock,
}));

async function loadPrefetchSegments() {
  const mod = await import("./prefetchService");
  return mod.prefetchSegments;
}

function makeSegment(id: string, coord?: [number, number]): Segment {
  return {
    id,
    line: "76",
    lineName: "76",
    direction: { code: 1, destination: "Norra Hammarbyhamnen", stopPointId: "" },
    fromStop: {
      id: `${id}-from`,
      name: "Lindarängsvägen",
      siteId: `${100 + Number(id.replace(/\D/g, "") || 0)}`,
      ...(coord ? { coord } : {}),
    },
    toStop: {
      id: `${id}-to`,
      name: "Norra Hammarbyhamnen",
      siteId: `${200 + Number(id.replace(/\D/g, "") || 0)}`,
    },
    transportType: "bus",
  } as Segment;
}

describe("prefetchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("prefetches the exact venue keys and events for valid segments", async () => {
    const prefetchSegments = await loadPrefetchSegments();
    const segments = [makeSegment("1", [59.33, 18.06]), makeSegment("2")];
    const settings = {
      afterworkVenuesEnabled: true,
      afterworkTypes: ["beer", "wine"],
      eventsEnabled: true,
    } as any;

    await prefetchSegments(segments, settings, { concurrency: 2 });

    expect(fetchNearbyVenuesMock).toHaveBeenCalledTimes(2);
    expect(fetchNearbyVenuesMock).toHaveBeenNthCalledWith(
      1,
      59.33,
      18.06,
      1200,
      ["beer"],
    );
    expect(fetchNearbyVenuesMock).toHaveBeenNthCalledWith(
      2,
      59.33,
      18.06,
      1200,
      ["wine", "cocktail"],
    );
    expect(fetchNearbyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchNearbyEventsMock).toHaveBeenCalledWith(59.33, 18.06, 3000);
  });

  it("continues prefetching later segments when an earlier call fails", async () => {
    fetchNearbyVenuesMock.mockRejectedValueOnce(new Error("boom"));

    const prefetchSegments = await loadPrefetchSegments();
    const segments = [makeSegment("1", [59.33, 18.06]), makeSegment("2", [59.34, 18.07])];
    const settings = {
      afterworkVenuesEnabled: true,
      afterworkTypes: ["beer"],
      eventsEnabled: false,
    } as any;

    await expect(prefetchSegments(segments, settings, { concurrency: 1 })).resolves.toBeUndefined();

    expect(fetchNearbyVenuesMock).toHaveBeenCalledTimes(2);
  });
});
