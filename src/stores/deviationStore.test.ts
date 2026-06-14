import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { deviationStore } from "./deviationStore.svelte";
import { getDeviations } from "../services/slDeviations";
import { isExternalTimetableSource } from "../lib/sourceClassification";

vi.mock("../services/slDeviations", () => ({
  getDeviations: vi.fn(async () => ({
    fromCache: false,
    messages: [
      {
        id: "dev-1",
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        severity: "critical",
        importanceLevel: 4,
        influenceLevel: 2,
        urgencyLevel: 2,
        messageVariants: [{ language: "sv", header: "Signal fel" }],
        scope: {
          stopAreas: [{ id: "1001" }],
          lines: [{ id: "76", designation: "76", transportMode: "bus" }],
        },
      },
    ],
  })),
  pickPreferredMessageText: vi.fn((message: any) => ({
    header: message.messageVariants[0]?.header ?? "",
    language: "sv",
  })),
}));

describe("deviationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not match tram segment against bus-scoped deviation", async () => {
    await deviationStore.refresh([
      {
        id: "seg-tram-bus-dev",
        line: "76",
        lineName: "76",
        direction: { code: 1, destination: "Odenplan", stopPointId: "123" },
        fromStop: { id: "s1", name: "Lindarängsvägen", siteId: "1001" },
        toStop: { id: "s2", name: "Odenplan", siteId: "1002" },
        transportType: "tram",
      },
    ]);

    const state = get(deviationStore);
    const health = state.bySegmentId.get("seg-tram-bus-dev");
    expect(health?.state).toBe("ok");
  });

  it("maps matching tram segment to affected health state", async () => {
    vi.mocked(getDeviations).mockResolvedValueOnce({
      fromCache: false,
      messages: [
        {
          id: "dev-tram",
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          severity: "warning",
          importanceLevel: 3,
          influenceLevel: 2,
          urgencyLevel: 2,
          messageVariants: [{ language: "sv", header: "Spårvagnsfel" }],
          scope: {
            stopAreas: [{ id: "3001" }],
            lines: [{ id: "7", designation: "7", transportMode: "tram" }],
          },
        },
      ],
    });

    await deviationStore.refresh([
      {
        id: "seg-tram-match",
        line: "7",
        lineName: "7",
        direction: { code: 1, destination: "T-Centralen", stopPointId: "123" },
        fromStop: { id: "s3", name: "Spårvagnshållplats", siteId: "3001" },
        toStop: { id: "s4", name: "T-Centralen", siteId: "3002" },
        transportType: "tram",
      },
    ]);

    const state = get(deviationStore);
    const health = state.bySegmentId.get("seg-tram-match");
    expect(health?.state).toBe("affected");
    expect(health?.reason).toBe("Spårvagnsfel");
  });

  it("maps matching segment to critical health state", async () => {
    await deviationStore.refresh([
      {
        id: "seg-1",
        line: "76",
        lineName: "76",
        direction: { code: 1, destination: "Odenplan", stopPointId: "123" },
        fromStop: { id: "s1", name: "Lindarängsvägen", siteId: "1001" },
        toStop: { id: "s2", name: "Odenplan", siteId: "1002" },
        transportType: "bus",
      },
    ]);

    const state = get(deviationStore);
    const health = state.bySegmentId.get("seg-1");
    expect(health?.state).toBe("critical");
    expect(health?.reason).toBe("Signal fel");
  });

  describe("Sjostadstrafiken deviations exclusion", () => {
    it("excludes Sjostadstrafiken ferry stops from deviations requests", () => {
      const lumaSource = {
        siteId: "sjostad-luma",
        stopName: "Luma Brygga",
      };
      const barnSource = {
        siteId: "sjostad-barn",
        stopName: "Barnängen",
      };
      const henrikSource = {
        siteId: "sjostad-henrik",
        stopName: "Henriksdal",
      };

      expect(isExternalTimetableSource(lumaSource)).toBe(true);
      expect(isExternalTimetableSource(barnSource)).toBe(true);
      expect(isExternalTimetableSource(henrikSource)).toBe(true);
    });

    it("includes regular SL stops in deviations requests", () => {
      const slSource = {
        siteId: "9001",
        stopName: "Centralen",
      };

      expect(isExternalTimetableSource(slSource)).toBe(false);
    });

    it("filters out Sjostadstrafiken segments before building deviations request", () => {
      const segments = [
        {
          id: "seg-1",
          line: "1",
          lineName: "1",
          direction: { code: 1, destination: "Norrmalm", stopPointId: "" },
          fromStop: { id: "s1", name: "Centralen", siteId: "9001" },
          toStop: { id: "s2", name: "Odenplan", siteId: "1002" },
          transportType: "bus" as const,
        },
        {
          id: "seg-2",
          line: "421",
          lineName: "421",
          direction: { code: 1, destination: "Henriksdal", stopPointId: "" },
          fromStop: { id: "s3", name: "Henriksdal", siteId: "sjostad-henrik" },
          toStop: { id: "s4", name: "Barnängen", siteId: "sjostad-barn" },
          transportType: "ferry" as const,
        },
        {
          id: "seg-3",
          line: "3",
          lineName: "3",
          direction: { code: 1, destination: "Södermalm", stopPointId: "" },
          fromStop: { id: "s5", name: "Slussen", siteId: "9003" },
          toStop: { id: "s6", name: "Södermalm", siteId: "1003" },
          transportType: "bus" as const,
        },
      ];

      // When building deviations request, should only include non-Sjostadstrafiken stops
      const nonExternalSegments = segments.filter(
        (seg) =>
          !isExternalTimetableSource({
            siteId: seg.fromStop.siteId,
            stopName: seg.fromStop.name,
          }),
      );

      expect(nonExternalSegments.length).toBe(2);
      expect(nonExternalSegments[0].id).toBe("seg-1");
      expect(nonExternalSegments[1].id).toBe("seg-3");
    });
  });
});
