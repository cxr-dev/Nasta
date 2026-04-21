import { beforeEach, describe, expect, it, vi } from "vitest";
import { departureStore } from "./departureStore";
import { getCachedSchedule } from "../services/scheduleCache";
import { getDepartures } from "../services/departureService";

vi.mock("../services/scheduleCache", () => ({
  getCachedSchedule: vi.fn(() => null),
}));

vi.mock("../services/departureService", () => ({
  getDepartures: vi.fn(async () => []),
}));

describe("departureStore cache key wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses siteId + line + directionText for cached schedule lookups", async () => {
    await departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", directionText: "Mörby centrum" }]]),
      true,
      "toWork",
    );

    expect(getCachedSchedule).toHaveBeenCalledWith(
      "1001",
      "14",
      "Mörby centrum",
      24,
    );
    expect(getDepartures).toHaveBeenCalledWith("Centralen", "1001");
  });
});
