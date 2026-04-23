import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { deviationStore } from "./deviationStore";

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

  it("maps matching segment to critical health state", async () => {
    await deviationStore.refresh([
      {
        id: "seg-1",
        line: "76",
        lineName: "76",
        directionText: "Odenplan",
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
});

