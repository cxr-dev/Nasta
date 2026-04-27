import { describe, it, expect } from "vitest";
import type { Departure } from "../types/departure";
import {
  createDepartureDeduplicationKey,
  deduplicateDeparturesByKey,
} from "../lib/departureDeduplication";

describe("departureDeduplication", () => {
  const baseDep: Departure = {
    line: "76",
    lineName: "76",
    destination: "Norra Hammarbyhamnen",
    directionText: "Norra Hammarbyhamnen",
    minutes: 5,
    time: "16:30",
    transportType: "bus",
  };

  describe("createDepartureDeduplicationKey", () => {
    it("creates a key from siteId, line, normalized direction, and expected time", () => {
      const siteId = "9001";
      const dep: Departure = {
        ...baseDep,
        expectedAt: 1000000000000,
      };

      const key = createDepartureDeduplicationKey(siteId, dep);

      // Key should include siteId, line, normalized direction
      expect(key).toContain("9001");
      expect(key).toContain("76");
      // Expected time slot should be in the key
      expect(key).toBeTruthy();
    });

    it("normalizes direction text for consistent keying", () => {
      const siteId = "9001";
      const dep1: Departure = {
        ...baseDep,
        directionText: "Norra Hammarbyhamnen",
      };
      const dep2: Departure = {
        ...baseDep,
        directionText: "norra hammarbyhamnen", // lowercase
      };

      const key1 = createDepartureDeduplicationKey(siteId, dep1);
      const key2 = createDepartureDeduplicationKey(siteId, dep2);

      expect(key1).toBe(key2);
    });

    it("uses expectedAt for time slot when available", () => {
      const siteId = "9001";
      const dep1: Departure = {
        ...baseDep,
        expectedAt: 1000000000000,
      };
      const dep2: Departure = {
        ...baseDep,
        expectedAt: 1000000000000 + 30_000, // 30 seconds later - same slot
      };

      const key1 = createDepartureDeduplicationKey(siteId, dep1);
      const key2 = createDepartureDeduplicationKey(siteId, dep2);

      // Should be same slot (both within 90-second window)
      expect(key1).toBe(key2);
    });

    it("uses time for time slot when expectedAt is not available", () => {
      const siteId = "9001";
      const dep1: Departure = {
        ...baseDep,
        time: "16:30",
      };
      const dep2: Departure = {
        ...baseDep,
        time: "16:30",
      };

      const key1 = createDepartureDeduplicationKey(siteId, dep1);
      const key2 = createDepartureDeduplicationKey(siteId, dep2);

      expect(key1).toBe(key2);
    });
  });

  describe("deduplicateDeparturesByKey", () => {
    it("removes duplicate departures with the same key", () => {
      const siteId = "9001";
      const live: Departure = {
        ...baseDep,
        expectedAt: 1000000000000,
      };
      const predicted: Departure = {
        ...baseDep,
        predicted: true,
        expectedAt: 1000000000000 + 30_000, // 30 seconds later - same slot
      };

      const departures = [live, predicted];
      const deduped = deduplicateDeparturesByKey(siteId, departures);

      // Should only have one departure for this slot
      expect(deduped.length).toBe(1);
      // Live should win over predicted
      expect(deduped[0].predicted).not.toBe(true);
    });

    it("preserves different departure slots", () => {
      const siteId = "9001";
      const dep1: Departure = {
        ...baseDep,
        expectedAt: 1000000000000,
      };
      const dep2: Departure = {
        ...baseDep,
        expectedAt: 1000000000000 + 300_000, // 5 minutes later - different slot
      };

      const departures = [dep1, dep2];
      const deduped = deduplicateDeparturesByKey(siteId, departures);

      // Should keep both - different slots
      expect(deduped.length).toBe(2);
    });

    it("keeps the first (live) version when duplicates exist", () => {
      const siteId = "9001";
      const live: Departure = {
        ...baseDep,
        expectedAt: 1000000000000,
      };
      const predicted: Departure = {
        ...baseDep,
        predicted: true,
        expectedAt: 1000000000000 + 20_000,
      };

      const departures = [live, predicted];
      const deduped = deduplicateDeparturesByKey(siteId, departures);

      expect(deduped[0]).toBe(live);
      expect(deduped.length).toBe(1);
    });

    it("handles ferries and buses consistently", () => {
      const siteId = "9001";
      const bus: Departure = {
        ...baseDep,
        line: "76",
        transportType: "bus",
        expectedAt: 1000000000000,
      };
      const ferry: Departure = {
        ...baseDep,
        line: "421",
        transportType: "ferry",
        expectedAt: 1000000000000 + 30_000, // Same slot
      };

      const departures = [bus, ferry];
      const deduped = deduplicateDeparturesByKey(siteId, departures);

      // Different lines, so should not deduplicate
      expect(deduped.length).toBe(2);
    });

    it("normalizes direction differences that should match", () => {
      const siteId = "9001";
      const dep1: Departure = {
        ...baseDep,
        directionText: "Norra Hammarbyhamnen",
        destination: "Norra Hammarbyhamnen",
        expectedAt: 1000000000000,
      };
      const dep2: Departure = {
        ...baseDep,
        directionText: "norra hammarbyhamnen",
        destination: "Norra Hammarbyhamnen",
        expectedAt: 1000000000000 + 30_000,
        predicted: true,
      };

      const departures = [dep1, dep2];
      const deduped = deduplicateDeparturesByKey(siteId, departures);

      // Should deduplicate because normalized direction matches
      expect(deduped.length).toBe(1);
      expect(deduped[0].predicted).not.toBe(true);
    });
  });
});
