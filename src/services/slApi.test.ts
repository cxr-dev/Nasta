/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSites, getDepartures, parseSlTimestamp } from "./slApi";

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
  });

  describe("getDepartures", () => {
    it("returns departures with correct minute calculation", async () => {
      vi.useFakeTimers();
      // Set system time to 2024-01-01T08:00:30 UTC
      // This is 09:00:30 in Stockholm (UTC+1)
      vi.setSystemTime(new Date("2024-01-01T08:00:30Z"));

      const mockDepartures = {
        departures: [
          {
            line: { designation: "76" },
            destination: "Test",
            direction: "Test direction",
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
      expect(result).toHaveLength(1);
      expect(result[0].line).toBe("76");
      // Parsed time 07:04 UTC, now is 08:00:30 UTC
      // Minutes = (07:04 - 08:00:30) / 60 = negative, clamped to 0
      // This shows the timestamp is in the past
      expect(result[0].minutes).toBe(0);
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
            direction: "Test direction",
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
      expect(result).toHaveLength(1);
      // Parsed time 08:10 UTC, now is 08:00:30 UTC
      // Minutes = (08:10 - 08:00:30) / 60 ≈ 9.58 → 9 minutes
      expect(result[0].minutes).toBe(9);
    });

    it("extracts journeyRef and tripId from API response", async () => {
      const mockDepartures = {
        departures: [
          {
            line: { designation: "76", name: "76", transport_mode: "bus" },
            destination: "Test",
            direction: "Test direction",
            expected: "2024-01-01T10:00:00",
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
      expect(result).toHaveLength(1);
      expect(result[0].journeyRef).toBe("journey-xyz");
      expect(result[0].tripId).toBe("trip-123");
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
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles null/undefined departures array gracefully", async () => {
      // Test case where API response doesn't include departures key at all
      const mockResponse = {};
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getDepartures("001172");
      expect(result).toEqual([]);
    });

    it("filters out invalid departure objects", async () => {
      const mockDepartures = {
        departures: [
          // Valid
          {
            line: { designation: "76" },
            destination: "Test",
            direction: "Test direction",
            expected: "2024-01-01T10:00:00",
          },
          // Invalid - missing line
          {
            destination: "Test",
            direction: "Test direction",
            expected: "2024-01-01T10:05:00",
          },
          // Invalid - missing destination
          {
            line: { designation: "2" },
            direction: "Test direction",
            expected: "2024-01-01T10:10:00",
          },
          // Valid
          {
            line: { designation: "2" },
            destination: "Test2",
            direction: "Test direction 2",
            expected: "2024-01-01T10:15:00",
          },
        ],
      };
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepartures,
      });

      const result = await getDepartures("001172");
      // Should only include 2 valid departures
      expect(result).toHaveLength(2);
      expect(result[0].line).toBe("76");
      expect(result[1].line).toBe("2");
    });
  });
});
