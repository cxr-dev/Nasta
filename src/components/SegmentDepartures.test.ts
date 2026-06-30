import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Departure } from "../types/departure";
import {
  getLiveMinutes,
  formatDepartureTime,
  mergeDeparturesWithPredictions,
} from "../lib/departureDisplay";
import {
  getDisruptionDisplay,
  isSegmentDisrupted,
} from "./segmentUtils";

describe("getLiveMinutes", () => {
  const baseDep: Departure = {
    line: "74",
    lineName: "",
    destination: "Odenplan",
    direction_code: 1,
    minutes: 5,
    time: "08:15",
    transportType: "bus",
  };

  it("falls back to dep.minutes when expectedAt is undefined", () => {
    expect(getLiveMinutes(baseDep, Date.now())).toBe(5);
  });

  it("calculates minutes from expectedAt relative to now", () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now + 3 * 60 * 1000 }; // 3 min from now
    expect(getLiveMinutes(dep, now)).toBe(3);
  });

  it("clamps to 0 when departure is in the past", () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now - 60000 }; // 1 min ago
    expect(getLiveMinutes(dep, now)).toBe(0);
  });

  it("floors fractional minutes", () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now + 90500 }; // 1m 30.5s
    expect(getLiveMinutes(dep, now)).toBe(1);
  });
});

describe("mergeDeparturesWithPredictions", () => {
  const liveBase: Departure = {
    line: "76",
    lineName: "76",
    destination: "Norra Hammarbyhamnen",
    direction_code: 1,
    minutes: 0,
    time: "16:30",
    transportType: "bus",
  };

  it("drops predicted departures that are within the same departure slot as a live departure", () => {
    const live = [
      { ...liveBase, expectedAt: 16 * 60 * 60 * 1000 + 30 * 60 * 1000 },
    ];
    const predicted: Departure[] = [
      {
        ...liveBase,
        time: "16:29",
        expectedAt: 16 * 60 * 60 * 1000 + 29 * 60 * 1000,
        predicted: true,
      },
      {
        ...liveBase,
        time: "16:39",
        expectedAt: 16 * 60 * 60 * 1000 + 39 * 60 * 1000,
        predicted: true,
      },
    ];

    expect(
      mergeDeparturesWithPredictions(live, predicted).map((d) => d.time),
    ).toEqual(["16:30", "16:39"]);
  });

  it("falls back to matching the displayed clock time when expectedAt is absent on live departures", () => {
    const live = [{ ...liveBase, expectedAt: undefined }];
    const predicted: Departure[] = [
      { ...liveBase, time: "16:30", expectedAt: 1, predicted: true },
      { ...liveBase, time: "16:39", expectedAt: 2, predicted: true },
    ];

    expect(
      mergeDeparturesWithPredictions(live, predicted).map((d) => d.time),
    ).toEqual(["16:30", "16:39"]);
  });

  it("prioritizes live departures over predicted ones in the result order", () => {
    const baseTime = 16 * 60 * 60 * 1000;
    const live = [
      { ...liveBase, time: "16:35", expectedAt: baseTime + 35 * 60 * 1000 },
    ];
    const predicted: Departure[] = [
      { ...liveBase, time: "16:40", predicted: true }, // predicted without expectedAt
    ];

    const result = mergeDeparturesWithPredictions(live, predicted);

    // Live (with expectedAt) should come before predicted (without expectedAt)
    expect(result[0].time).toBe("16:35");
    expect(result[0].expectedAt).toBeDefined();
    expect(result[1].time).toBe("16:40");
    expect(result[1].predicted).toBe(true);
  });
});



describe("isSegmentDisrupted", () => {
  it("returns true when site devs exist", () => {
    expect(isSegmentDisrupted(2, "ok")).toBe(true);
  });

  it("returns true when health state is affected", () => {
    expect(isSegmentDisrupted(0, "affected")).toBe(true);
  });

  it("returns true when health state is critical", () => {
    expect(isSegmentDisrupted(0, "critical")).toBe(true);
  });

  it("returns false when no site devs and health state is ok", () => {
    expect(isSegmentDisrupted(0, "ok")).toBe(false);
  });

  it("returns false when no site devs and no health state", () => {
    expect(isSegmentDisrupted(0, null)).toBe(false);
    expect(isSegmentDisrupted(0, undefined)).toBe(false);
  });

  it("returns true when both sources indicate disruption", () => {
    expect(isSegmentDisrupted(3, "critical")).toBe(true);
  });
});

describe("formatDepartureTime", () => {
  const baseDep: Departure = {
    line: "SJO",
    lineName: "Sjöstadstrafiken",
    destination: "Henriksdalsbryggan",
    direction_code: 1,
    minutes: 12,
    time: "08:15",
    transportType: "boat",
  };

  it("shows minutes for short live SL-style departures", () => {
    const now = 1_000_000;
    const dep = { ...baseDep, expectedAt: now + 12 * 60_000 };
    expect(formatDepartureTime(dep, now)).toBe("12 min");
  });

  it("shows clock time for long live departures", () => {
    const now = 1_000_000;
    const expectedAt = now + 61 * 60_000;
    const dep = { ...baseDep, expectedAt };
    expect(formatDepartureTime(dep, now)).toBe(
      new Date(expectedAt).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Stockholm",
      }),
    );
  });

  it("shows minutes for short static Sjöstadstrafiken departures", () => {
    const now = 1_000_000;
    const dep = { ...baseDep, minutes: 18, expectedAt: undefined };
    expect(formatDepartureTime(dep, now)).toBe("18 min");
  });

  it("shows the scheduled time for long static Sjöstadstrafiken departures", () => {
    const now = 1_000_000;
    const dep = { ...baseDep, minutes: 90, time: "19:45", expectedAt: undefined };
    expect(formatDepartureTime(dep, now)).toBe("19:45");
  });
});

describe("destination-agnostic departure filtering", () => {
  // Regression test: departures should not be dropped just because the
  // API's destination string differs slightly from the stored segment destination.
  // Filtering must rely on line + direction_code as the primary keys.

  function filterDepartures(
    apiDeps: Departure[],
    line: string,
    directionCode: number,
  ): Departure[] {
    return apiDeps.filter((dep) => {
      if (dep.line !== line) return false;
      if ((dep.direction_code ?? -1) !== directionCode) return false;
      return true;
    });
  }

  it("includes departures when destination strings differ but line/direction match", () => {
    const apiDeps: Departure[] = [
      {
        line: "57",
        lineName: "Spårväg",
        destination: "Hjorthagen",
        direction_code: 0,
        minutes: 11,
        time: "19:17",
        transportType: "tram",
        expectedAt: Date.now() + 11 * 60_000,
      },
    ];

    const result = filterDepartures(apiDeps, "57", 0);

    expect(result).toHaveLength(1);
    expect(result[0].destination).toBe("Hjorthagen");
    expect(result[0].minutes).toBe(11);
  });

  it("includes departures when API destination is abbreviated or has extra text", () => {
    const apiDeps: Departure[] = [
      {
        line: "57",
        lineName: "Spårväg",
        destination: "Hjorthagen (end station)",
        direction_code: 0,
        minutes: 5,
        time: "19:11",
        transportType: "tram",
        expectedAt: Date.now() + 5 * 60_000,
      },
    ];

    const result = filterDepartures(apiDeps, "57", 0);

    // With line+direction_code filtering, abbreviation differences don't matter
    expect(result).toHaveLength(1);
  });

  it("excludes departures with different line even if destination matches", () => {
    const apiDeps: Departure[] = [
      {
        line: "56",
        lineName: "Spårväg",
        destination: "Hjorthagen",
        direction_code: 0,
        minutes: 11,
        time: "19:17",
        transportType: "tram",
      },
    ];

    const result = filterDepartures(apiDeps, "57", 0);

    expect(result).toHaveLength(0);
  });

  it("excludes departures with different direction_code even if line matches", () => {
    const apiDeps: Departure[] = [
      {
        line: "57",
        lineName: "Spårväg",
        destination: "Hjorthagen",
        direction_code: 1,
        minutes: 11,
        time: "19:17",
        transportType: "tram",
      },
    ];

    const result = filterDepartures(apiDeps, "57", 0);

    expect(result).toHaveLength(0);
  });

  it("includes departures when API provides no destination but line/direction match", () => {
    const apiDeps: Departure[] = [
      {
        line: "57",
        lineName: "Spårväg",
        destination: "",
        direction_code: 0,
        minutes: 11,
        time: "19:17",
        transportType: "tram",
      },
    ];

    const result = filterDepartures(apiDeps, "57", 0);

    expect(result).toHaveLength(1);
  });
});

// --- getDisruptionDisplay tests ---

describe("getDisruptionDisplay", () => {
  const emptyHealth = undefined;
  const emptySiteDevs: any[] = [];

  // Priority 1: Deviations API messages
  describe("Priority 1 — health.messages", () => {
    it("returns message text and severity from health state", () => {
      const health = {
        state: "affected" as const,
        severity: "warning" as const,
        reason: null,
        messages: [{
          id: "m1", createdAt: 1, modifiedAt: 1, importanceLevel: 3, influenceLevel: 2, urgencyLevel: 2,
          severity: "warning" as const,
          messageVariants: [{ language: "sv", header: "Banarbete pågår" }],
          scope: { lines: [], stopAreas: [] },
        }],
        updatedAt: Date.now(),
      };
      const result = getDisruptionDisplay(emptySiteDevs, health, "info", "sv");
      expect(result.messages).toEqual([{ message: "Banarbete pågår" }]);
      expect(result.severity).toBe("affected");
    });

    it("uses 'critical' severity when health state is critical", () => {
      const health = {
        state: "critical" as const,
        severity: "critical" as const,
        reason: null,
        messages: [{
          id: "m2", createdAt: 1, modifiedAt: 1, importanceLevel: 5, influenceLevel: 3, urgencyLevel: 3,
          severity: "critical" as const,
          messageVariants: [{ language: "sv", header: "Inställt" }],
          scope: { lines: [], stopAreas: [] },
        }],
        updatedAt: Date.now(),
      };
      const result = getDisruptionDisplay(emptySiteDevs, health, "info", "sv");
      expect(result.messages).toEqual([{ message: "Inställt" }]);
      expect(result.severity).toBe("critical");
    });

    it("falls through to health.reason when message text is empty", () => {
      const health = {
        state: "affected" as const,
        severity: "warning" as const,
        reason: "Förseningar pga signalfel",
        messages: [{
          id: "m3", createdAt: 1, modifiedAt: 1, importanceLevel: 2, influenceLevel: 1, urgencyLevel: 1,
          severity: "warning" as const,
          messageVariants: [{ language: "sv", header: "" }], // empty header
          scope: { lines: [], stopAreas: [] },
        }],
        updatedAt: Date.now(),
      };
      const result = getDisruptionDisplay(emptySiteDevs, health, "info", "sv");
      expect(result.messages).toEqual([{ message: "Förseningar pga signalfel" }]);
      expect(result.severity).toBe("affected");
    });
  });

  // Priority 2: health.reason fallback
  describe("Priority 2 — health.reason", () => {
    it("returns health.reason when messages are absent", () => {
      const health = {
        state: "affected" as const,
        severity: "warning" as const,
        reason: "Spårfel — 10 min försening",
        messages: [],
        updatedAt: Date.now(),
      };
      const result = getDisruptionDisplay(emptySiteDevs, health, "info", "sv");
      expect(result.messages).toEqual([{ message: "Spårfel — 10 min försening" }]);
      expect(result.severity).toBe("affected");
    });

    it("returns 'critical' when health state is critical with reason only", () => {
      const health = {
        state: "critical" as const,
        severity: "critical" as const,
        reason: "Inställd trafik",
        messages: [],
        updatedAt: Date.now(),
      };
      const result = getDisruptionDisplay(emptySiteDevs, health, "info", "sv");
      expect(result.severity).toBe("critical");
    });
  });

  // Priority 3: Departure-level deviations
  describe("Priority 3 — departureDeviations", () => {
    it("includes departures with importance_level at or above threshold", () => {
      const departures = [
        { importance_level: 3, consequence: "delay", message: "5 min försenad" },
      ];
      const result = getDisruptionDisplay(emptySiteDevs, emptyHealth, "warning", "sv", undefined, departures);
      expect(result.messages).toEqual([{ message: "5 min försenad" }]);
      expect(result.severity).toBe("affected");
    });

    it("filters out departures below threshold", () => {
      const departures = [
        { importance_level: 1, consequence: "info", message: "Mindre försening" },
      ];
      // threshold is "critical" (rank 3), importance_level 1 maps to "info" (rank 1) — filtered
      const result = getDisruptionDisplay(emptySiteDevs, emptyHealth, "critical", "sv", undefined, departures);
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });

    it("uses highest importance departure for severity", () => {
      const departures = [
        { importance_level: 1, consequence: "info", message: "Info" },
        { importance_level: 5, consequence: "critical", message: "Inställt" },
        { importance_level: 2, consequence: "warning", message: "Varning" },
      ];
      const result = getDisruptionDisplay(emptySiteDevs, emptyHealth, "info", "sv", undefined, departures);
      expect(result.messages).toHaveLength(3);
      expect(result.severity).toBe("critical"); // highest importance (5 → critical)
    });
  });

  // Priority 4: siteDevs with line and scope filtering
  describe("Priority 4 — siteDevs (stop deviations)", () => {
    it("returns normal when siteDevs is empty and no other sources", () => {
      const result = getDisruptionDisplay([], emptyHealth, "info", "sv");
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });

    it("returns normal when siteDevs has entries but segmentLine is missing", () => {
      const siteDevs = [{ message: "Some deviation", importance_level: 3 }];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", undefined);
      expect(result.severity).toBe("normal");
    });

    it("includes siteDevs that match the segment line", () => {
      const siteDevs = [{
        message: "Grön linje avstängd",
        importance_level: 3,
        scope: { lines: [19], stop_areas: [], stop_points: [] },
      }];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19");
      expect(result.messages).toEqual([{ message: "Grön linje avstängd" }]);
      expect(result.severity).toBe("affected");
    });

    it("excludes siteDevs with non-matching line", () => {
      const siteDevs = [{
        message: "Röd linje avstängd",
        importance_level: 3,
        scope: { lines: [14], stop_areas: [], stop_points: [] },
      }];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19");
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });

    it("excludes siteDevs matching line but wrong stopArea when stopSiteId provided", () => {
      const siteDevs = [{
        message: "Odenplan stängt",
        importance_level: 4,
        scope: {
          lines: [19],
          stop_points: [],
          stop_areas: [{ id: "9001" }],
        },
      }];
      // stopSiteId 9999 does NOT match scope.stop_areas[0].id "9001"
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19", undefined, "9999");
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });

    it("includes siteDevs matching line AND stopArea when stopSiteId matches", () => {
      const siteDevs = [{
        message: "Slussen avstängt",
        importance_level: 4,
        scope: {
          lines: [19],
          stop_points: [],
          stop_areas: [{ id: "9002" }],
        },
      }];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19", undefined, "9002");
      expect(result.messages).toEqual([{ message: "Slussen avstängt" }]);
    });

    it("includes siteDevs matching line AND stop_points when stopSiteId matches", () => {
      const siteDevs = [{
        message: "Centralen stängt",
        importance_level: 3,
        scope: {
          lines: [19],
          stop_points: [{ id: "5001" }],
          stop_areas: [],
        },
      }];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19", undefined, "5001");
      expect(result.messages).toEqual([{ message: "Centralen stängt" }]);
    });

    it("filters siteDevs below threshold severity", () => {
      const siteDevs = [{
        message: "Info",
        importance_level: 1,
        scope: { lines: [19], stop_areas: [], stop_points: [] },
      }];
      // threshold "critical" (rank 3), importance_level 1 → "info" (rank 1) → filtered
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "critical", "sv", "19");
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });

    it("uses highest importance for severity across multiple matching siteDevs", () => {
      const siteDevs = [
        { message: "Liten störning", importance_level: 1, scope: { lines: [19], stop_areas: [], stop_points: [] } },
        { message: "Stor störning", importance_level: 5, scope: { lines: [19], stop_areas: [], stop_points: [] } },
        { message: "Mellan störning", importance_level: 3, scope: { lines: [19], stop_areas: [], stop_points: [] } },
      ];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "info", "sv", "19");
      expect(result.messages).toHaveLength(3);
      expect(result.severity).toBe("critical"); // level 5
    });

    it("returns normal when all matching siteDevs are below threshold", () => {
      const siteDevs = [
        { message: "Låg", importance_level: 1, scope: { lines: [19], stop_areas: [], stop_points: [] } },
        { message: "Medel", importance_level: 2, scope: { lines: [19], stop_areas: [], stop_points: [] } },
      ];
      const result = getDisruptionDisplay(siteDevs, emptyHealth, "critical", "sv", "19");
      expect(result.messages).toEqual([]);
      expect(result.severity).toBe("normal");
    });
  });
});