import { describe, it, expect } from "vitest";
import type { Departure } from "../types/departure";
import {
  getLiveMinutes,
  formatDepartureTime,
  mergeDeparturesWithPredictions,
} from "../lib/departureDisplay";
import {
  computeDisplayDevs,
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

describe("computeDisplayDevs", () => {
  it("returns site devs when available, ignoring health reason", () => {
    const siteDevs = [{ message: "Signalproblem" }];
    const result = computeDisplayDevs(siteDevs, "Some health reason");
    expect(result).toEqual([{ message: "Signalproblem" }]);
  });

  it("returns health reason as a display dev when site devs are empty", () => {
    const result = computeDisplayDevs([], "Försenad på grund av väder");
    expect(result).toEqual([{ message: "Försenad på grund av väder" }]);
  });

  it("returns empty array when both sources are empty", () => {
    const result = computeDisplayDevs([], null);
    expect(result).toEqual([]);
  });

  it("returns empty array when both sources are missing", () => {
    const result = computeDisplayDevs([], undefined);
    expect(result).toEqual([]);
  });

  it("prefers site devs over health reason when both exist", () => {
    const siteDevs = [
      { message: "Stopp i tunnelbanan", severity: "critical" },
    ];
    const result = computeDisplayDevs(siteDevs, "Some fallback reason");
    expect(result).toEqual([
      { message: "Stopp i tunnelbanan", severity: "critical" },
    ]);
  });

  it("returns multiple site devs as-is", () => {
    const siteDevs = [
      { message: "Dev 1" },
      { message: "Dev 2" },
      { message: "Dev 3" },
    ];
    const result = computeDisplayDevs(siteDevs, null);
    expect(result).toHaveLength(3);
    expect(result).toEqual(siteDevs);
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
    destination: "Henriksdal",
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
