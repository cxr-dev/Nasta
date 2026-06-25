import { describe, it, expect, vi, beforeEach } from "vitest";
import { sjostadProvider } from "./sjostadProvider.js";
import type { Departure } from "../types/departure.js";

// Mock staticTimetable module
vi.mock("../services/staticTimetable.js", () => ({
  getNextDepartures: vi.fn(),
  getFirstTomorrowDeparture: vi.fn(),
  getStopKey: vi.fn(),
}));

import {
  getNextDepartures,
  getFirstTomorrowDeparture,
  getStopKey,
} from "../services/staticTimetable.js";

const mockDeparture: Departure = {
  line: "SJO",
  lineName: "Sjöstadstrafiken",
  destination: "Henriksdalsbryggan",
  direction_code: 1,
  minutes: 5,
  time: "12:05",
  transportType: "boat",
};

const mockDeparture2: Departure = {
  line: "SJO",
  lineName: "Sjöstadstrafiken",
  destination: "Lumabryggan",
  direction_code: 1,
  minutes: 10,
  time: "12:10",
  transportType: "boat",
};

describe("sjostadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("capabilities", () => {
    it("reports providerId === 'sjostad'", () => {
      expect(sjostadProvider.capabilities.providerId).toBe("sjostad");
    });

    it("reports displayName === 'Sjöstadstrafiken'", () => {
      expect(sjostadProvider.capabilities.displayName).toBe("Sjöstadstrafiken");
    });

    it("enables search, schedules, predictions", () => {
      const f = sjostadProvider.capabilities.features;
      expect(f.search).toBe(true);
      expect(f.realtime).toBe(false);
      expect(f.schedules).toBe(true);
      expect(f.predictions).toBe(true);
      expect(f.disruptions).toBe(false);
      expect(f.stopSequences).toBe(false);
    });

    it("disables vehiclePositions, routeGeometry, tripMetadata, occupancy", () => {
      const f = sjostadProvider.capabilities.features;
      expect(f.vehiclePositions).toBe(false);
      expect(f.routeGeometry).toBe(false);
      expect(f.tripMetadata).toBe(false);
      expect(f.occupancy).toBe(false);
    });
  });

  describe("ownsStop", () => {
    it("returns true for sjostad: prefixed IDs", () => {
      expect(sjostadProvider.ownsStop("sjostad:luma_brygga")).toBe(true);
      expect(sjostadProvider.ownsStop("sjostad:barnangsbryggan")).toBe(true);
      expect(sjostadProvider.ownsStop("sjostad:")).toBe(true);
    });

    it("returns false for other prefixes", () => {
      expect(sjostadProvider.ownsStop("sl:1234")).toBe(false);
      expect(sjostadProvider.ownsStop("gtfs:1001")).toBe(false);
    });

    it("returns false for unprefixed strings", () => {
      expect(sjostadProvider.ownsStop("luma_brygga")).toBe(false);
      expect(sjostadProvider.ownsStop("")).toBe(false);
    });
  });

  describe("searchStops", () => {
    it("returns matching stop for query", async () => {
      const results = await sjostadProvider.searchStops!("luma");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sjostad:luma_brygga");
      expect(results[0].name).toBe("Lumabryggan");
      expect(results[0].modes).toEqual(["boat"]);
      expect(results[0].locationType).toBe("stop");
    });

    it("returns all stops for broad query", async () => {
      const results = await sjostadProvider.searchStops!("brygga");
      expect(results).toHaveLength(3);
    });

    it("returns empty array for no match", async () => {
      const results = await sjostadProvider.searchStops!("zzzzz");
      expect(results).toHaveLength(0);
    });
  });

  describe("getDepartures", () => {
    it("returns transit departures from static timetable", async () => {
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture]);

      const deps = await sjostadProvider.getDepartures("sjostad:luma_brygga");
      expect(deps).toHaveLength(1);
      expect(deps[0].stopId).toBe("sjostad:luma_brygga");
      expect(deps[0].line).toBe("SJO");
      expect(deps[0].lineName).toBe("Sjöstadstrafiken");
      expect(deps[0].destination).toBe("Henriksdalsbryggan");
      expect(deps[0].directionCode).toBe(1);
      expect(deps[0].transportMode).toBe("boat");
      expect(deps[0].minutes).toBe(5);
      expect(deps[0].scheduledTime).toBe("12:05");
      expect(deps[0].dataSource).toBe("static");
      expect(getNextDepartures).toHaveBeenCalledWith("Lumabryggan", 20);
    });

    it("filters by line when specified", async () => {
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture, mockDeparture2]);

      const deps = await sjostadProvider.getDepartures("sjostad:luma_brygga", "SJO");
      expect(deps).toHaveLength(2);
    });

    it("filters by directionCode when specified", async () => {
      const depDir2: Departure = { ...mockDeparture, direction_code: 2, minutes: 8, time: "12:08" };
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture, depDir2]);

      const deps = await sjostadProvider.getDepartures("sjostad:henriksdalsbryggan", undefined, 2);
      expect(deps).toHaveLength(1);
      expect(deps[0].directionCode).toBe(2);
    });
  });

  describe("getPredictedDepartures", () => {
    it("returns filtered predicted departures", async () => {
      const depDir2: Departure = { ...mockDeparture, direction_code: 2, minutes: 8, time: "12:08" };
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture, depDir2]);

      const deps = await sjostadProvider.getPredictedDepartures!("sjostad:barnangsbryggan", "SJO", 2, 5);
      expect(deps).toHaveLength(1);
      expect(deps[0].directionCode).toBe(2);
      expect(deps[0].dataSource).toBe("static");
    });
  });

  describe("getNextScheduledDeparture", () => {
    it("returns null for unknown stop key", async () => {
      const dep = await sjostadProvider.getNextScheduledDeparture!("sjostad:unknown", "SJO", 1);
      expect(dep).toBeNull();
    });

    it("returns first upcoming departure when available", async () => {
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture]);

      const dep = await sjostadProvider.getNextScheduledDeparture!("sjostad:luma_brygga", "SJO", 1);
      expect(dep).not.toBeNull();
      expect(dep!.line).toBe("SJO");
      expect(dep!.minutes).toBe(5);
      expect(dep!.dataSource).toBe("static");
    });

    it("falls back to first tomorrow departure", async () => {
      vi.mocked(getNextDepartures).mockReturnValue([]);
      vi.mocked(getFirstTomorrowDeparture).mockReturnValue({ time: "06:05" });

      const dep = await sjostadProvider.getNextScheduledDeparture!("sjostad:luma_brygga", "SJO", 1);
      expect(dep).not.toBeNull();
      expect(dep!.scheduledTime).toBe("06:05");
      expect(dep!.destination).toBe("Henriksdalsbryggan");
      expect(dep!.dataSource).toBe("static");
    });

    it("returns null when both sources are empty", async () => {
      vi.mocked(getNextDepartures).mockReturnValue([]);
      vi.mocked(getFirstTomorrowDeparture).mockReturnValue(null);

      const dep = await sjostadProvider.getNextScheduledDeparture!("sjostad:henriksdalsbryggan", "SJO", 1);
      expect(dep).toBeNull();
    });
  });

  describe("getKnownRoutes", () => {
    it("returns deduplicated routes from departures", async () => {
      const depDir2: Departure = { ...mockDeparture, direction_code: 2, destination: "Lumabryggan", minutes: 8, time: "12:08" };
      vi.mocked(getNextDepartures).mockReturnValue([mockDeparture, mockDeparture, depDir2]);

      const routes = await sjostadProvider.getKnownRoutes!("sjostad:barnangsbryggan");
      expect(routes).toHaveLength(2);
      expect(routes[0].line).toBe("SJO");
      expect(routes[0].lineName).toBe("Sjöstadstrafiken");
      expect(routes[0].directionCode).toBe(1);
      expect(routes[0].transportMode).toBe("boat");
    });

    it("returns empty array for unknown stop", async () => {
      const routes = await sjostadProvider.getKnownRoutes!("sjostad:unknown");
      expect(routes).toEqual([]);
    });
  });

  describe("resolveStopId", () => {
    it("resolves stop name to EntityId via getStopKey", async () => {
      vi.mocked(getStopKey).mockReturnValue("luma_brygga");

      const id = await sjostadProvider.resolveStopId!("Lumabryggan");
      expect(id).toBe("sjostad:luma_brygga");
      expect(getStopKey).toHaveBeenCalledWith("Lumabryggan");
    });

    it("returns null when no stop key matches", async () => {
      vi.mocked(getStopKey).mockReturnValue(null);

      const id = await sjostadProvider.resolveStopId!("Unknown place");
      expect(id).toBeNull();
    });
  });
});
