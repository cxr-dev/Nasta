import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { deviationStore } from "./deviationStore.svelte";
import { getDeviations } from "../services/slDeviations";
import { isExternalTimetableSource } from "../lib/sourceClassification";
import { stopAreaStore } from "./stopAreaStore";

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

  describe("Station facility alerts", () => {
    beforeEach(() => {
      stopAreaStore.clear();
    });

    it("separates escalator work at a pass-through stop from segment health", async () => {
      stopAreaStore.setMapping("9001", "sa-bredang");
      stopAreaStore.setMapping("9002", "sa-ropsten");
      stopAreaStore.setMapping("9003", "sa-mariatorget");
      stopAreaStore.setMapping("9004", "sa-morby");
      stopAreaStore.setMapping("9191", "sa-tcentralen");

      vi.mocked(getDeviations).mockResolvedValueOnce({
        fromCache: false,
        messages: [
          {
            id: "dev-escalator",
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            severity: "critical",
            importanceLevel: 4,
            influenceLevel: 2,
            urgencyLevel: 2,
            messageVariants: [
              {
                language: "sv",
                header: "T-Centralen: Utbyte av rulltrappor begränsar framkomligheten",
              },
            ],
            scope: {
              stopAreas: [{ id: "sa-tcentralen", name: "T-Centralen" }],
              lines: [
                { id: "13", designation: "13", transportMode: "metro" },
                { id: "14", designation: "14", transportMode: "metro" },
              ],
            },
          },
        ],
      });

      await deviationStore.refresh([
        {
          id: "seg-13-bredang-ropsten",
          line: "13",
          lineName: "13",
          direction: { code: 1, destination: "Ropsten", stopPointId: "" },
          fromStop: { id: "s1", name: "Bredäng", siteId: "9001" },
          toStop: { id: "s2", name: "Ropsten", siteId: "9002" },
          transportType: "metro",
        },
        {
          id: "seg-14-mariatorget-morby",
          line: "14",
          lineName: "14",
          direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
          fromStop: { id: "s3", name: "Mariatorget", siteId: "9003" },
          toStop: { id: "s4", name: "Mörby centrum", siteId: "9004" },
          transportType: "metro",
        },
      ]);

      const state = get(deviationStore);
      const health1 = state.bySegmentId.get("seg-13-bredang-ropsten");
      const health2 = state.bySegmentId.get("seg-14-mariatorget-morby");
      expect(health1?.state).toBe("ok");
      expect(health2?.state).toBe("ok");
      expect(state.stationAlerts).toHaveLength(1);
      expect(state.stationAlerts[0].id).toBe("dev-escalator");
      expect(state.stationAlerts[0].stations).toEqual(["T-Centralen"]);
      expect(state.stationAlerts[0].segmentIds).toEqual([
        "seg-13-bredang-ropsten",
        "seg-14-mariatorget-morby",
      ]);
    });

    it("deduplicates station names when the API repeats the same stop area", async () => {
      stopAreaStore.setMapping("9001", "sa-bredang");
      stopAreaStore.setMapping("9002", "sa-ropsten");
      stopAreaStore.setMapping("9191", "sa-tcentralen");

      vi.mocked(getDeviations).mockResolvedValueOnce({
        fromCache: false,
        messages: [
          {
            id: "dev-dup-stations",
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            severity: "info",
            importanceLevel: 1,
            influenceLevel: 1,
            urgencyLevel: 1,
            messageVariants: [
              {
                language: "sv",
                header: "Avstängd hiss vid T-Centralen",
              },
            ],
            scope: {
              // Same stop area repeated twice — simulates API duplicate
              stopAreas: [
                { id: "sa-tcentralen", name: "T-Centralen" },
                { id: "sa-tcentralen", name: "T-Centralen" },
              ],
              lines: [
                { id: "13", designation: "13", transportMode: "metro" },
              ],
            },
          },
        ],
      });

      await deviationStore.refresh([
        {
          id: "seg-13-bredang-ropsten",
          line: "13",
          lineName: "13",
          direction: { code: 1, destination: "Ropsten", stopPointId: "" },
          fromStop: { id: "s1", name: "Bredäng", siteId: "9001" },
          toStop: { id: "s2", name: "Ropsten", siteId: "9002" },
          transportType: "metro",
        },
      ]);

      const state = get(deviationStore);
      expect(state.stationAlerts).toHaveLength(1);
      // stations array must be deduplicated — no ["T-Centralen", "T-Centralen"]
      expect(state.stationAlerts[0].stations).toEqual(["T-Centralen"]);
    });

    it("keeps escalator work as direct disruption when segment endpoint matches", async () => {
      stopAreaStore.setMapping("9191", "sa-tcentralen");
      stopAreaStore.setMapping("9192", "sa-odenplan");

      vi.mocked(getDeviations).mockResolvedValueOnce({
        fromCache: false,
        messages: [
          {
            id: "dev-escalator-direct",
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            severity: "warning",
            importanceLevel: 3,
            influenceLevel: 2,
            urgencyLevel: 1,
            messageVariants: [
              {
                language: "sv",
                header: "T-Centralen: Hiss ur funktion",
              },
            ],
            scope: {
              stopAreas: [{ id: "sa-tcentralen", name: "T-Centralen" }],
              lines: [{ id: "19", designation: "19", transportMode: "metro" }],
            },
          },
        ],
      });

      await deviationStore.refresh([
        {
          id: "seg-19-tcentralen-odenplan",
          line: "19",
          lineName: "19",
          direction: { code: 1, destination: "Odenplan", stopPointId: "" },
          fromStop: { id: "s1", name: "T-Centralen", siteId: "9191" },
          toStop: { id: "s2", name: "Odenplan", siteId: "9192" },
          transportType: "metro",
        },
      ]);

      const state = get(deviationStore);
      const health = state.bySegmentId.get("seg-19-tcentralen-odenplan");
      expect(health?.state).toBe("affected");
      expect(health?.reason).toBe("T-Centralen: Hiss ur funktion");
      expect(state.stationAlerts).toHaveLength(0);
    });

    it("keeps signal failure as line disruption even at a stop the segment doesn't pass through", async () => {
      stopAreaStore.setMapping("9001", "sa-bredang");
      stopAreaStore.setMapping("9002", "sa-ropsten");
      stopAreaStore.setMapping("9003", "sa-slussen");

      vi.mocked(getDeviations).mockResolvedValueOnce({
        fromCache: false,
        messages: [
          {
            id: "dev-signal",
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            severity: "critical",
            importanceLevel: 4,
            influenceLevel: 3,
            urgencyLevel: 2,
            messageVariants: [
              {
                language: "sv",
                header: "Slussen: Signalfel på linje 13",
              },
            ],
            scope: {
              stopAreas: [{ id: "sa-slussen", name: "Slussen" }],
              lines: [{ id: "13", designation: "13", transportMode: "metro" }],
            },
          },
        ],
      });

      await deviationStore.refresh([
        {
          id: "seg-13-bredang-ropsten",
          line: "13",
          lineName: "13",
          direction: { code: 1, destination: "Ropsten", stopPointId: "" },
          fromStop: { id: "s1", name: "Bredäng", siteId: "9001" },
          toStop: { id: "s2", name: "Ropsten", siteId: "9002" },
          transportType: "metro",
        },
      ]);

      const state = get(deviationStore);
      const health = state.bySegmentId.get("seg-13-bredang-ropsten");
      expect(health?.state).toBe("critical");
      expect(health?.reason).toBe("Slussen: Signalfel på linje 13");
      expect(state.stationAlerts).toHaveLength(0);
    });
  });
});
