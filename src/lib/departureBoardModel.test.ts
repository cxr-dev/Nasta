import { describe, expect, it, vi } from "vitest";
import type { Departure } from "../types/departure";
import type { Segment } from "../types/page";
import {
  buildDepartureBoardGroups,
  resolveDepartureBoardSnapshot,
} from "./departureBoardModel";

function makeSegment(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    line: "4",
    lineName: "Blue line",
    direction: {
      code: 1,
      destination: "Destination",
      stopPointId: "point-1",
    },
    fromStop: {
      id: `stop-${id}`,
      name: `Station ${id}`,
      siteId: id,
      coord: [59.3, 18.0],
    },
    toStop: {
      id: `to-${id}`,
      name: "Destination",
      siteId: `to-${id}`,
    },
    transportType: "bus",
    ...overrides,
  };
}

function makeDeparture(overrides: Partial<Departure> = {}): Departure {
  return {
    line: "4",
    lineName: "Blue line",
    destination: "Destination",
    direction_code: 1,
    minutes: 5,
    time: "08:05",
    transportType: "bus",
    ...overrides,
  };
}

function makeTransitDeparture(overrides: Record<string, unknown> = {}) {
  return {
    id: "departure-1",
    stopId: "sl:1",
    line: "4",
    lineName: "Blue line",
    destination: "Destination",
    directionCode: 1,
    transportMode: "bus",
    minutes: 5,
    scheduledTime: "08:05",
    dataSource: "predicted",
    ...overrides,
  } as any;
}

function makeGroupInput(segments: Segment[], overrides: Record<string, unknown> = {}) {
  return {
    segments,
    departureData: new Map<string, Departure[]>(),
    sleepingBySegment: new Map(),
    sortMode: "time" as const,
    groupingMode: "none" as const,
    groupSleeping: false,
    userLocation: null,
    deviationHealthBySegment: new Map(),
    stopDeviationsMap: new Map(),
    disruptionSeverityThreshold: "warning" as const,
    locale: "en" as const,
    labels: {
      disrupted: "Disrupted",
      sleeping: "Sleeping",
      transport: {
        bus: "Bus",
        train: "Train",
        metro: "Metro",
        tram: "Tram",
        boat: "Boat",
      },
    },
    ...overrides,
  };
}

describe("resolveDepartureBoardSnapshot", () => {
  it("merges live and predicted departures while deduplicating slots", async () => {
    const live = makeDeparture({ expectedAt: 1_000_000, time: "08:00" });
    const transit = {
      getPredictedDepartures: vi.fn().mockResolvedValue([
        makeTransitDeparture({ expectedTime: 1_030_000, scheduledTime: "08:00" }),
        makeTransitDeparture({ id: "departure-2", expectedTime: 1_300_000, scheduledTime: "08:05" }),
      ]),
      getNextScheduledDeparture: vi.fn(),
    };

    const result = await resolveDepartureBoardSnapshot({
      segments: [makeSegment("1")],
      departureData: new Map([["1|4|1", [live]]]),
      transit,
    });

    expect(result.departuresBySegment.get("1")).toHaveLength(2);
    expect(result.departuresBySegment.get("1")?.[0]).toBe(live);
    expect(transit.getNextScheduledDeparture).not.toHaveBeenCalled();
  });

  it("uses live departures when prediction fails", async () => {
    const live = makeDeparture({ expectedAt: 1_000_000 });
    const transit = {
      getPredictedDepartures: vi.fn().mockRejectedValue(new Error("offline")),
      getNextScheduledDeparture: vi.fn(),
    };

    const result = await resolveDepartureBoardSnapshot({
      segments: [makeSegment("1")],
      departureData: new Map([["1|4|1", [live]]]),
      transit,
    });

    expect(result.departuresBySegment.get("1")).toEqual([live]);
    expect(transit.getNextScheduledDeparture).not.toHaveBeenCalled();
  });

  it("resolves a sleeping state when a route has no departures", async () => {
    const transit = {
      getPredictedDepartures: vi.fn().mockResolvedValue([]),
      getNextScheduledDeparture: vi.fn().mockResolvedValue({ scheduledTime: "05:12" }),
    };

    const result = await resolveDepartureBoardSnapshot({
      segments: [makeSegment("1")],
      departureData: new Map(),
      transit,
    });

    expect(result.departuresBySegment.get("1")).toEqual([]);
    expect(result.sleepingBySegment.get("1")).toEqual({
      isSleeping: true,
      nextTime: "05:12",
    });
  });

  it("keeps other segments usable when one segment fails", async () => {
    const transit = {
      getPredictedDepartures: vi.fn((stopId: string) =>
        stopId.endsWith(":1")
          ? Promise.reject(new Error("offline"))
          : Promise.resolve([makeTransitDeparture({ stopId: "sl:2" })]),
      ),
      getNextScheduledDeparture: vi.fn((stopId: string) =>
        stopId.endsWith(":1") ? Promise.reject(new Error("offline")) : Promise.resolve(null),
      ),
    };

    const result = await resolveDepartureBoardSnapshot({
      segments: [makeSegment("1"), makeSegment("2")],
      departureData: new Map(),
      transit,
    });

    expect(result.departuresBySegment.get("1")).toEqual([]);
    expect(result.departuresBySegment.get("2")).toHaveLength(1);
    expect(result.sleepingBySegment.has("1")).toBe(true);
    expect(result.sleepingBySegment.has("2")).toBe(true);
  });
});

describe("buildDepartureBoardGroups", () => {
  it("preserves page order when sort values tie", () => {
    const first = makeSegment("1");
    const second = makeSegment("2");
    const result = buildDepartureBoardGroups(makeGroupInput([first, second]));

    expect(result.departures.groups[0].items.map((item) => item.segment.id)).toEqual(["1", "2"]);
  });

  it.each(["station", "transport"] as const)("builds %s groups", (groupingMode) => {
    const first = makeSegment("1", { transportType: "train" });
    const second = makeSegment("2", { transportType: "bus" });
    const result = buildDepartureBoardGroups(makeGroupInput([first, second], { groupingMode }));

    expect(result.departures.groups).toHaveLength(2);
    expect(result.departures.groups.flatMap((group) => group.items)).toHaveLength(2);
  });

  it("separates disrupted and sleeping departures and keeps journeys separate", () => {
    const disrupted = makeSegment("1");
    const sleeping = makeSegment("2");
    const journey = makeSegment("3", { journeyMeta: {} as Segment["journeyMeta"] });
    const result = buildDepartureBoardGroups(makeGroupInput([disrupted, sleeping, journey], {
      groupingMode: "disrupted",
      groupSleeping: true,
      sleepingBySegment: new Map([["2", { isSleeping: true, nextTime: "05:12" }]]),
      stopDeviationsMap: new Map([["1", [{
        message: "Closed",
        importance_level: 4,
        scope: { lines: [4], stop_points: [{ id: 1 }] },
      }]]]),
    }));

    expect(result.departures.groups.map((group) => group.label)).toEqual(["Disrupted", "Sleeping"]);
    expect(result.journeys.groups[0].items[0].segment.id).toBe("3");
  });
});
