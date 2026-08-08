/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSites, getDepartures, parseSlTimestamp, mapProductClassesToTransportTypes, searchTrips } from "./slApi";

(globalThis as any).fetch = vi.fn();

describe("slApi service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parseSlTimestamp", () => {
    it("parses ISO timestamps with explicit timezone", () => {
      // Timestamps with explicit timezone should be parsed directly
      const ms1 = parseSlTimestamp("2024-01-01T08:04:00Z");
      const ms2 = parseSlTimestamp("2024-01-01T08:04:00+01:00");
      expect(ms1).toBe(new Date("2024-01-01T08:04:00Z").getTime());
      expect(ms2).toBe(new Date("2024-01-01T08:04:00+01:00").getTime());
    });

    it("interprets timezone-naive timestamps as Stockholm local time", () => {
      // In January, Stockholm is UTC+1
      // '2024-01-01T08:04:00' should be interpreted as Stockholm local time (08:04 CET)
      // which is 07:04 UTC
      const parsed = parseSlTimestamp("2024-01-01T08:04:00");
      const expected = new Date("2024-01-01T07:04:00Z").getTime();
      expect(parsed).toBe(expected);
    });

    it("handles summer time (DST) correctly", () => {
      // In June, Stockholm is UTC+2
      // '2024-06-01T14:00:00' should be Stockholm local time (14:00 CEST)
      // which is 12:00 UTC
      const parsed = parseSlTimestamp("2024-06-01T14:00:00");
      const expected = new Date("2024-06-01T12:00:00Z").getTime();
      expect(parsed).toBe(expected);
    });
  });

  describe("searchSites", () => {
    it("returns empty array for short query", async () => {
      expect(await searchSites("a")).toEqual([]);
      expect(await searchSites("")).toEqual([]);
    });

    it("returns search results", async () => {
      const mockSites = {
        locations: [
          {
            id: "90910010009001",
            name: "Test stop",
            type: "stop",
            coord: [59.3, 18.1],
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSites,
      });

      const results = await searchSites("test");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Test stop");
    });

    it("returns empty array on API error", async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await searchSites("test");
      expect(result).toEqual([]);
    });

    it("returns empty array on JSON parse error", async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new Error("Invalid JSON"); },
      });
      const result = await searchSites("test");
      expect(result).toEqual([]);
    });

    it("returns empty array on fetch AbortError", async () => {
      (globalThis as any).fetch = vi.fn().mockRejectedValue({ name: "AbortError" });
      const result = await searchSites("test");
      expect(result).toEqual([]);
    });

    it("returns empty array on network error", async () => {
      (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const result = await searchSites("test");
      expect(result).toEqual([]);
    });
  });

  describe("getDepartures", () => {
    it("rejects departures whose timestamp has already passed", async () => {
      vi.useFakeTimers();
      // Set system time to 2024-01-01T08:00:30 UTC
      // This is 09:00:30 in Stockholm (UTC+1)
      vi.setSystemTime(new Date("2024-01-01T08:00:30Z"));

      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            expected: "2024-01-01T08:04:00", // Stockholm time 08:04 = UTC 07:04
            scheduled: "2024-01-01T08:00:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(0);
    });

    it("correctly handles future departures", async () => {
      vi.useFakeTimers();
      // Set system time to 2024-01-01T08:00:30 UTC
      // This is 09:00:30 in Stockholm (UTC+1)
      vi.setSystemTime(new Date("2024-01-01T08:00:30Z"));

      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            expected: "2024-01-01T09:10:00", // Stockholm time 09:10 = UTC 08:10
            scheduled: "2024-01-01T09:00:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      // Parsed time 08:10 UTC, now is 08:00:30 UTC
      // Minutes = Math.ceil((08:10 - 08:00:30) / 60) = Math.ceil(9.5) = 10
      expect(result.departures[0].minutes).toBe(10);
    });

    it("extracts journeyRef and tripId from API response", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76", name: "76", transport_mode: "bus" },
            destination: "Test",
            direction_code: 1,
            expected: "2099-01-01T10:00:00",
            journey: { id: "journey-xyz" },
            trip: { id: "trip-123" },
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      expect(result.departures[0].journeyRef).toBe("journey-xyz");
      expect(result.departures[0].tripId).toBe("trip-123");
    });

    it("throws on API error", async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(getDepartures("9001")).rejects.toThrow("API error: 404");
    });

    it("handles empty departures array correctly", async () => {
      const mockDepartures = {
        departures: [],
        stop_deviations: [],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("001172");
      expect(result.departures).toEqual([]);
      expect(Array.isArray(result.departures)).toBe(true);
      expect(result.stopDeviations).toEqual([]);
    });

    it("handles null/undefined departures array gracefully", async () => {
      // Test case where API response doesn't include departures key at all
      const mockResponse = {};
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getDepartures("001172");
      expect(result.departures).toEqual([]);
      expect(result.stopDeviations).toEqual([]);
    });

    it("filters out invalid departure objects", async () => {
      const mockDepartures = {
        departures: [
          // Valid
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            expected: "2099-01-01T10:00:00",
          },
          // Invalid - missing line
          {
            destination: "Test",
            direction_code: 1,
            expected: "2099-01-01T10:05:00",
          },
          // Invalid - missing destination
          {
            line: { designation: "2" },
            direction_code: 1,
            expected: "2099-01-01T10:10:00",
          },
          // Valid
          {
            line: { designation: "2" },
            destination: "Test2",
            direction_code: 2,
            expected: "2099-01-01T10:15:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("001172");
      // Should only include 2 valid departures
      expect(result.departures).toHaveLength(2);
      expect(result.departures[0].line).toBe("76");
      expect(result.departures[1].line).toBe("2");
    });

    it("maps transport_mode tram to transportType tram", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "30", name: "30", transport_mode: "tram" },
            destination: "Solna station",
            direction_code: 1,
            expected: "2099-01-01T10:00:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures[0].transportType).toBe("tram");
    });

    it("maps transport_mode lightrail to transportType tram", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "30", name: "30", transport_mode: "lightrail" },
            destination: "Solna station",
            direction_code: 1,
            expected: "2099-01-01T10:00:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures[0].transportType).toBe("tram");
    });

    it("falls back to timeToDeparture when expected is missing", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            timeToDeparture: 3,
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      expect(result.departures[0].minutes).toBe(3);
    });

    it("prefers expected over scheduled for expectedAt", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T08:00:30Z"));
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            expected: "2024-01-01T09:10:00",
            scheduled: "2024-01-01T09:00:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      expect(result.departures[0].expectedAt).toBe(
        parseSlTimestamp("2024-01-01T09:10:00"),
      );
      expect(result.departures[0].minutes).toBe(10);
    });

    it("falls back to the scheduled epoch when expected is missing", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            scheduled: "2099-01-01T10:05:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      expect(result.departures[0].expectedAt).toBe(
        parseSlTimestamp("2099-01-01T10:05:00"),
      );
    });

    it("omits expectedAt and time when only relative minutes exist", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            timeToDeparture: 3,
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures[0].expectedAt).toBeUndefined();
      expect(result.departures[0].time).toBe("");
    });

    it("keeps a departure whose scheduled time falls on the next day (midnight crossing)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T22:55:00Z"));
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            scheduled: "2024-01-02T00:10:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(1);
      expect(result.departures[0].expectedAt).toBe(
        parseSlTimestamp("2024-01-02T00:10:00"),
      );
      expect(result.departures[0].minutes).toBe(15);
    });

    it("rejects departures when both timestamp and timeToDeparture are missing", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures).toHaveLength(0);
    });

    it("throws on network fetch error", async () => {
      (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      await expect(getDepartures("9001")).rejects.toThrow("Connection refused");
    });

    it("maps departure-level deviations from API", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction_code: 1,
            expected: "2099-01-01T10:00:00",
            deviations: [
              { importance_level: 3, consequence: "DELAYED", message: "5 min sen" },
            ],
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("9001");
      expect(result.departures[0].deviations).toHaveLength(1);
      expect(result.departures[0].deviations![0].importance_level).toBe(3);
      expect(result.departures[0].deviations![0].message).toBe("5 min sen");
    });
  });

  describe("searchTrips", () => {
    it("returns planned trips between origin and destination", async () => {
      const mockResponse = {
        journeys: [
          {
            legs: [
              {
                origin: {
                  id: "90910010009001",
                  time: "10:00:00",
                  date: "2026-06-15",
                  stopPoint: { id: "sp1" },
                },
                destination: { name: "Centralen" },
                line: { designation: "19", name: "19" },
                direction: { code: 1 },
                transport_mode: "metro",
              },
            ],
          },
        ],
      };

      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await searchTrips("9001", "9002");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].line).toBe("19");
      expect(results[0].predicted).toBe(true);
      expect(results[0].transportType).toBe("metro");
    });

    it("returns empty array when no matching legs found", async () => {
      const mockResponse = {
        journeys: [
          {
            legs: [
              {
                origin: { id: "90910010009999", time: "10:00:00", date: "2026-06-15" },
                destination: { name: "Other" },
                line: { designation: "X" },
                direction: { code: 1 },
              },
            ],
          },
        ],
      };

      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await searchTrips("9001", "9002");
      expect(results).toEqual([]);
    });

    it("throws on API error", async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(searchTrips("9001", "9002")).rejects.toThrow("Trip API error: 500");
    });

    it("returns empty for empty journeys response", async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const results = await searchTrips("9001", "9002");
      expect(results).toEqual([]);
    });
  });
  describe("mapProductClassesToTransportTypes", () => {
    it("maps class 4 (light rail) to tram", () => {
      expect(mapProductClassesToTransportTypes([4])).toEqual(["tram"]);
    });

    it("maps classes 1 and 2 to metro, class 4 to tram", () => {
      const types = mapProductClassesToTransportTypes([1, 2, 4]);
      expect(types).toContain("metro");
      expect(types).toContain("tram");
    });

    it("returns empty array for empty input", () => {
      expect(mapProductClassesToTransportTypes([])).toEqual([]);
    });

    it("handles mixed classes with tram", () => {
      const types = mapProductClassesToTransportTypes([4, 128]);
      expect(types).toEqual(["tram", "bus"]);
    });

    it("maps class 256 to boat", () => {
      expect(mapProductClassesToTransportTypes([256])).toEqual(["boat"]);
    });

    it("maps multiple classes including boat", () => {
      const types = mapProductClassesToTransportTypes([1, 256, 128]);
      expect(types).toContain("metro");
      expect(types).toContain("boat");
      expect(types).toContain("bus");
    });
  });
});
