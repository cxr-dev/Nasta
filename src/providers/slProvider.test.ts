import { describe, it, expect, vi, beforeEach } from "vitest";
import { slProvider } from "./slProvider.js";
import type { TransitProvider } from "./types.js";

(globalThis as any).fetch = vi.fn();

function mockFetchResponse(data: unknown) {
  (globalThis as any).fetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

describe("slProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("capabilities", () => {
    it("reports providerId === 'sl'", () => {
      expect(slProvider.capabilities.providerId).toBe("sl");
    });

    it("enables search, realtime, schedules, predictions, disruptions, stopSequences", () => {
      const f = slProvider.capabilities.features;
      expect(f.search).toBe(true);
      expect(f.realtime).toBe(true);
      expect(f.schedules).toBe(true);
      expect(f.predictions).toBe(true);
      expect(f.disruptions).toBe(true);
      expect(f.stopSequences).toBe(true);
    });

    it("disables vehiclePositions, routeGeometry, tripMetadata, occupancy", () => {
      const f = slProvider.capabilities.features;
      expect(f.vehiclePositions).toBe(false);
      expect(f.routeGeometry).toBe(false);
      expect(f.tripMetadata).toBe(false);
      expect(f.occupancy).toBe(false);
    });
  });

  describe("ownsStop", () => {
    it("returns true for sl: prefixed IDs", () => {
      expect(slProvider.ownsStop("sl:1234")).toBe(true);
      expect(slProvider.ownsStop("sl:9001")).toBe(true);
      expect(slProvider.ownsStop("sl:")).toBe(true);
    });

    it("returns false for other prefixes", () => {
      expect(slProvider.ownsStop("sjostad:luma")).toBe(false);
      expect(slProvider.ownsStop("gtfs:1234")).toBe(false);
      expect(slProvider.ownsStop(":local-only")).toBe(false);
    });

    it("returns false for unprefixed IDs", () => {
      expect(slProvider.ownsStop("1234")).toBe(false);
      expect(slProvider.ownsStop("")).toBe(false);
    });
  });

  // Timetable-dependent tests run FIRST before any API calls populate the cache
  describe("getPredictedDepartures", () => {
    it("returns empty array when empty timetable cache", async () => {
      const deps = await slProvider.getPredictedDepartures!("sl:1001", "4", 0, 5);
      expect(deps).toEqual([]);
    });
  });

  describe("getNextScheduledDeparture", () => {
    it("returns null when empty timetable cache", async () => {
      const dep = await slProvider.getNextScheduledDeparture!("sl:1001", "4", 0);
      expect(dep).toBeNull();
    });
  });

  describe("getKnownRoutes", () => {
    it("returns empty array when empty timetable cache", async () => {
      const routes = await slProvider.getKnownRoutes!("sl:1001");
      expect(routes).toEqual([]);
    });
  });

  describe("searchStops", () => {
    it("wraps SL stop finder API results", async () => {
      mockFetchResponse({
        locations: [
          {
            id: "90910010001234",
            name: "T-Centralen",
            type: "stop",
            coord: [59.33, 18.06],
            productClasses: [1, 2],
            matchQuality: 0.95,
          },
        ],
      });

      const results = await slProvider.searchStops!("T-Centralen");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sl:1234");
      expect(results[0].name).toBe("T-Centralen");
      expect(results[0].coord).toEqual([59.33, 18.06]);
      expect(results[0].modes).toContain("metro");
      expect(results[0].relevance).toBe(19);
      expect(results[0].locationType).toBe("stop");
    });

    it("returns empty array when API fails", async () => {
      (globalThis as any).fetch.mockRejectedValue(new Error("network error"));
      const results = await slProvider.searchStops!("unknown");
      expect(results).toEqual([]);
    });
  });

  describe("getDepartures", () => {
    it("wraps SL departures API", async () => {
      const now = new Date("2026-06-25T12:00:00Z").getTime();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      mockFetchResponse({
        departures: [
          {
            line: { designation: "4", name: "Linje 4", transport_mode: "metro" },
            destination: "Radiohuset",
            direction_code: 0,
            scheduled: "2026-06-25T12:05:00",
            expected: "2026-06-25T12:05:00",
            display: "5 min",
            deviation: null,
            journey: { id: 12345 },
            stop_point: { id: "SP-1001" },
            stop_area: { id: 9001 },
          },
        ],
        stop_deviations: [],
      });

      const deps = await slProvider.getDepartures("sl:1001");
      expect(deps).toHaveLength(1);
      expect(deps[0].stopId).toBe("sl:1001");
      expect(deps[0].line).toBe("4");
      expect(deps[0].lineName).toBe("Linje 4");
      expect(deps[0].destination).toBe("Radiohuset");
      expect(deps[0].directionCode).toBe(0);
      expect(deps[0].transportMode).toBe("metro");
      expect(deps[0].dataSource).toBe("realtime");
      expect(deps[0].providerMetadata?.journeyRef).toBe("12345");

      vi.useRealTimers();
    });

    it("filters by line when specified", async () => {
      mockFetchResponse({
        departures: [
          { line: { designation: "4" }, destination: "A", direction_code: 0, scheduled: "2026-06-25T12:05:00" },
          { line: { designation: "17" }, destination: "B", direction_code: 1, scheduled: "2026-06-25T12:10:00" },
        ],
        stop_deviations: [],
      });

      const deps = await slProvider.getDepartures("sl:1001", "4");
      expect(deps).toHaveLength(1);
      expect(deps[0].line).toBe("4");
    });
  });

  describe("getDisruptions", () => {
    it("wraps SL deviations API", async () => {
      mockFetchResponse([
        {
          deviation_case_id: 42,
          created: "2026-06-25T10:00:00+02:00",
          modified: "2026-06-25T10:30:00+02:00",
          priority: { importance_level: 3, influence_level: 2, urgency_level: 1 },
          message_variants: [
            { language: "sv", header: "Förseningar", details: "10 min försening" },
            { language: "en", header: "Delays", details: "10 min delay" },
          ],
          scope: {
            lines: [{ id: 76, designation: "76" }],
            stop_areas: [{ id: 1001, name: "Centralen" }],
          },
        },
      ]);

      const disruptions = await slProvider.getDisruptions!(["sl:1001"], ["76"]);
      expect(disruptions).toHaveLength(1);
      expect(disruptions[0].id).toBe("sl:deviation-42");
      // importance_level=3 => score=3*2+2+1=9 => "critical"
      expect(disruptions[0].severity).toBe("critical");
      expect(disruptions[0].title).toBe("Delays");
      expect(disruptions[0].description).toBe("10 min delay");
      expect(disruptions[0].effect).toBe("no_service");
      expect(disruptions[0].affectedRoutes).toContain("sl:line-76");
      expect(disruptions[0].affectedStops).toContain("sl:stoparea-1001");
    });
  });

  describe("resolveStopId", () => {
    it("resolves stop name to EntityId", async () => {
      mockFetchResponse({
        locations: [
          { id: "90910010009001", name: "Centralen", type: "stop" },
        ],
      });

      const id = await slProvider.resolveStopId!("Centralen");
      expect(id).toBe("sl:9001");
    });

    it("returns null when no match", async () => {
      mockFetchResponse({ locations: [] });
      const id = await slProvider.resolveStopId!("xyzzynon");
      expect(id).toBeNull();
    });
  });

  describe("getStopSequence", () => {
    it("returns null when API resolves no stops", async () => {
      mockFetchResponse({ locations: [] });

      const seq = await slProvider.getStopSequence!("sl:1001", "Ropsten", "4", 0);
      expect(seq).toBeNull();
    });
  });
});
