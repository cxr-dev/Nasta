import { describe, it, expect } from "vitest";
import {
  estimateVehicleStopIndex,
  toStockholmDateString,
  fetchJourneyStops,
  cacheKey,
  __clearJourneyServiceCachesForTests,
} from "./journeyService";
import type { JourneyStop } from "./journeyService";
import type { Segment } from "../types/route";
import type { Departure } from "../types/departure";
import { vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  __clearJourneyServiceCachesForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toStockholmDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    // 2026-04-10 12:00 UTC = 2026-04-10 14:00 Stockholm (UTC+2 in summer)
    const ts = new Date("2026-04-10T12:00:00Z").getTime();
    expect(toStockholmDateString(ts)).toBe("2026-04-10");
  });

  it("returns correct date for early morning Stockholm time", () => {
    // 2026-04-10 01:30 UTC = 2026-04-10 03:30 Stockholm — still April 10
    const ts = new Date("2026-04-10T01:30:00Z").getTime();
    expect(toStockholmDateString(ts)).toBe("2026-04-10");
  });
});

describe("estimateVehicleStopIndex", () => {
  it("returns 0 for empty stops array", () => {
    expect(estimateVehicleStopIndex([], 0, Date.now())).toBe(0);
  });

  it("returns index of last passed stop when stops have scheduledAt times", () => {
    const now = 1_000_000;
    const stops: JourneyStop[] = [
      { name: "A", siteId: "1", idx: 0, scheduledAt: 900_000 },
      { name: "B", siteId: "2", idx: 1, scheduledAt: 950_000 },
      { name: "C", siteId: "3", idx: 2, scheduledAt: 1_050_000 }, // future
    ];
    // B is last passed stop (950_000 <= 1_000_000, C is future)
    expect(estimateVehicleStopIndex(stops, 1_050_000, now)).toBe(1);
  });

  it("returns 0 when all stops are in the future", () => {
    const now = 800_000;
    const stops: JourneyStop[] = [
      { name: "A", siteId: "1", idx: 0, scheduledAt: 900_000 },
      { name: "B", siteId: "2", idx: 1, scheduledAt: 950_000 },
    ];
    expect(estimateVehicleStopIndex(stops, 950_000, now)).toBe(0);
  });

  it("estimates position from time when no scheduledAt present", () => {
    const now = Date.now();
    const expectedAtOurStop = now + 4 * 60_000; // 4 min from now
    const stops: JourneyStop[] = [
      { name: "S1", siteId: "1", idx: 0 },
      { name: "S2", siteId: "2", idx: 1 },
      { name: "S3", siteId: "3", idx: 2 },
      { name: "Our stop", siteId: "4", idx: 3 },
      { name: "S5", siteId: "5", idx: 4 },
    ];
    const result = estimateVehicleStopIndex(stops, expectedAtOurStop, now);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(3); // hasn't reached our stop yet
  });
});

describe("fetchJourneyStops", () => {
  const segment: Segment = {
    id: "seg-1",
    line: "76",
    lineName: "76",
    directionText: "Norra Hammarbyhamnen",
    fromStop: { id: "from", name: "Lindarängsvägen", siteId: "100" },
    toStop: { id: "to", name: "Norra Hammarbyhamnen", siteId: "300" },
    transportType: "bus",
  };

  const departure: Departure = {
    line: "76",
    lineName: "76",
    destination: "Norra Hammarbyhamnen",
    directionText: "Norra Hammarbyhamnen",
    minutes: 4,
    time: "16:30",
    transportType: "bus",
    journeyRef: "journey-1",
  };

  it("reverses fetched stops when they are oriented opposite to the saved segment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stops: [
            {
              name: "Norra Hammarbyhamnen",
              stop: { id: "300", name: "Norra Hammarbyhamnen" },
            },
            { name: "Somewhere", stop: { id: "200", name: "Somewhere" } },
            {
              name: "Lindarängsvägen",
              stop: { id: "100", name: "Lindarängsvägen" },
            },
          ],
        }),
      }),
    );

    const data = await fetchJourneyStops("journey-reversed", segment, {
      ...departure,
      journeyRef: "journey-reversed",
    });
    expect(data.availability).toBe("live");
    expect(data.reason).toBe("live");
    expect(data.stops[0].name).toBe("Lindarängsvägen");
    expect(data.destination).toBe("Norra Hammarbyhamnen");
    expect(data.pickupStopIndex).toBe(0);
  });

  it("falls back to synthesised stops when the pickup stop is missing from API data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stops: [
            { name: "Elsewhere", stop: { id: "999", name: "Elsewhere" } },
          ],
        }),
      }),
    );

    const data = await fetchJourneyStops("journey-missing-stop", segment, {
      ...departure,
      journeyRef: "journey-missing-stop",
    });
    expect(data.availability).toBe("unavailable");
    expect(data.source).toBe("none");
    expect(data.reason).toBe("direction_mismatch");
    expect(data.pickupStopIndex).toBe(1);
    expect(data.stops[1].name).toBe("Lindarängsvägen");
  });

  it("uses pattern-scheduled fallback when journeyRef is missing and pattern was learned", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-23T10:00:00Z");
    vi.setSystemTime(now);
    const expectedAt = now.getTime() + 10 * 60_000;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stops: [
            {
              name: "Stop A",
              stop: { id: "090", name: "Stop A" },
              scheduledArrival: new Date(expectedAt - 2 * 60_000).toISOString(),
            },
            {
              name: "Lindarängsvägen",
              stop: { id: "100", name: "Lindarängsvägen" },
              scheduledArrival: new Date(expectedAt).toISOString(),
            },
            {
              name: "Stop C",
              stop: { id: "200", name: "Stop C" },
              scheduledArrival: new Date(expectedAt + 3 * 60_000).toISOString(),
            },
          ],
        }),
      }),
    );

    const live = await fetchJourneyStops("journey-for-pattern", segment, {
      ...departure,
      journeyRef: "journey-for-pattern",
      expectedAt,
    });
    expect(live.availability).toBe("live");

    const scheduled = await fetchJourneyStops(undefined, segment, {
      ...departure,
      journeyRef: undefined,
      expectedAt: expectedAt + 60_000,
    });
    expect(scheduled.availability).toBe("scheduled");
    expect(scheduled.source).toBe("pattern_schedule");
    expect(scheduled.confidence).toBe("medium");
    expect(scheduled.pickupStopIndex).toBeGreaterThanOrEqual(0);
    expect(scheduled.stops.length).toBeGreaterThanOrEqual(2);
    expect(scheduled.stops[scheduled.pickupStopIndex ?? 0].name).toBe("Lindarängsvägen");
  });

  it("falls back to unavailable when no journeyRef and no learned pattern", async () => {
    const data = await fetchJourneyStops(undefined, segment, {
      ...departure,
      journeyRef: undefined,
    });
    expect(data.availability).toBe("unavailable");
    expect(data.source).toBe("none");
    expect(data.confidence).toBe("low");
    expect(data.reason).toBe("no_ref");
    expect(data.pickupStopIndex).toBe(1);
    expect(data.stops).toHaveLength(3);
    expect(data.stops[1].name).toBe("Lindarängsvägen");
  });

  it("prefers scheduled pattern fallback when journeyRef fetch fails", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-23T10:00:00Z");
    vi.setSystemTime(now);
    const expectedAt = now.getTime() + 8 * 60_000;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stops: [
            {
              name: "Stop A",
              stop: { id: "090", name: "Stop A" },
              scheduledArrival: new Date(expectedAt - 2 * 60_000).toISOString(),
            },
            {
              name: "Lindarängsvägen",
              stop: { id: "100", name: "Lindarängsvägen" },
              scheduledArrival: new Date(expectedAt).toISOString(),
            },
            {
              name: "Stop C",
              stop: { id: "200", name: "Stop C" },
              scheduledArrival: new Date(expectedAt + 3 * 60_000).toISOString(),
            },
          ],
        }),
      })
      .mockResolvedValue({
        ok: false,
        status: 404,
      });

    vi.stubGlobal("fetch", fetchMock);

    await fetchJourneyStops("journey-pattern-source", segment, {
      ...departure,
      journeyRef: "journey-pattern-source",
      expectedAt,
    });

    const fallback = await fetchJourneyStops("journey-failing", segment, {
      ...departure,
      journeyRef: "journey-failing",
      expectedAt: expectedAt + 60_000,
    });

    expect(fallback.availability).toBe("scheduled");
    expect(fallback.source).toBe("pattern_schedule");
    expect(fallback.confidence).toBe("medium");
  });
});

describe("cacheKey", () => {
  type CacheKeyDeparture = Pick<Departure, "expectedAt">;
  const now = Date.now();
  const segment: Segment = {
    id: "seg-1",
    line: "76",
    lineName: "76",
    directionText: "Norra Hammarbyhamnen",
    fromStop: { id: "from", name: "Lindarängsvägen", siteId: "100" },
    toStop: { id: "to", name: "Norra Hammarbyhamnen", siteId: "300" },
    transportType: "bus",
  };

  it("uses journeyRef when present", () => {
    const key = cacheKey("journey123", undefined, segment, now);
    expect(key).toBe(`ref:journey123:${toStockholmDateString(now)}`);
  });

  it("uses tripId when journeyRef missing", () => {
    const key = cacheKey(undefined, "trip456", segment, now);
    expect(key).toBe(`trip:trip456:${toStockholmDateString(now)}`);
  });

  it("uses composite key with departure time minutes when both refs missing", () => {
    const expectedAt = now + 10 * 60_000; // 10 min from now
    const departure: CacheKeyDeparture = { expectedAt };
    const key = cacheKey(undefined, undefined, segment, now, departure);
    const segmentId = `${segment.fromStop.siteId}|${segment.line}|${segment.directionText || "unknown"}`;
    const timeKey = Math.floor(expectedAt / 60000).toString();
    expect(key).toBe(`synth:${segmentId}:${timeKey}`);
  });

  it("falls back to date string when departure lacks expectedAt", () => {
    const departure: CacheKeyDeparture = {};
    const key = cacheKey(undefined, undefined, segment, now, departure);
    const segmentId = `${segment.fromStop.siteId}|${segment.line}|${segment.directionText || "unknown"}`;
    expect(key).toBe(`synth:${segmentId}:${toStockholmDateString(now)}`);
  });
});
