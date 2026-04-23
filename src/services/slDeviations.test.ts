import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviations, pickPreferredMessageText } from "./slDeviations";

describe("slDeviations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("maps severity from priority levels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            deviation_case_id: 1,
            created: "2026-01-01T10:00:00+01:00",
            modified: "2026-01-01T10:00:00+01:00",
            priority: { importance_level: 4, influence_level: 2, urgency_level: 1 },
            message_variants: [{ language: "sv", header: "Kritisk störning" }],
            scope: { stop_areas: [{ id: 1001 }], lines: [{ id: 76, designation: "76" }] },
          },
        ],
      }),
    );

    const { messages } = await getDeviations(["1001"], ["76"]);
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe("critical");
  });

  it("falls back to cached data on fetch error", async () => {
    localStorage.setItem(
      "nasta_deviations_cache_v1",
      JSON.stringify({
        updatedAt: Date.now(),
        messages: [
          {
            id: "cached-1",
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            severity: "warning",
            importanceLevel: 3,
            influenceLevel: 2,
            urgencyLevel: 1,
            messageVariants: [{ language: "sv", header: "Cache" }],
            scope: { lines: [], stopAreas: [] },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { messages, fromCache } = await getDeviations(["1001"], ["76"]);
    expect(fromCache).toBe(true);
    expect(messages[0].id).toBe("cached-1");
  });

  it("prefers swedish variant and falls back to english", () => {
    const message = {
      id: "m1",
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      severity: "warning" as const,
      importanceLevel: 1,
      influenceLevel: 1,
      urgencyLevel: 1,
      messageVariants: [
        { language: "en", header: "English message" },
        { language: "sv", header: "Svenskt meddelande" },
      ],
      scope: { lines: [], stopAreas: [] },
    };

    expect(pickPreferredMessageText(message, "sv").header).toBe("Svenskt meddelande");
    expect(pickPreferredMessageText(message, "en").header).toBe("English message");
  });
});

