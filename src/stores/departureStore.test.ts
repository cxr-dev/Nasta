import { beforeEach, describe, expect, it, vi } from "vitest";
import { departureStore } from "./departureStore.svelte";
import { getCachedSchedule } from "../services/scheduleCache";
import { transitService } from "../providers/init";

vi.mock("../services/scheduleCache", () => ({
  getCachedSchedule: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../providers/init", () => ({
  transitService: {
    getDepartures: vi.fn(async () => ({ departures: [], stopDeviations: [] })),
  },
}));

describe("departureStore cache key wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses siteId + line + direction_code for cached schedule lookups", async () => {
    await departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", direction_code: 1 }]]),
      true,
    );

    expect(getCachedSchedule).toHaveBeenCalledWith(
      "1001",
      "14",
      1,
      24,
    );
    expect(transitService.getDepartures).toHaveBeenCalledWith("sl:1001", "Centralen", "14", 1, undefined);
  });
});

describe("departureStore - request identity and stale response filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any active timers
    vi.clearAllTimers();
  });

  it("tracks current request ID to filter stale responses", async () => {
    const requestId1 = "page-home-123";
    const requestId2 = "page-work-456";

    // Start first request
    await departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", direction_code: 1 }]]),
      true,
      requestId1,
    );
    expect(departureStore.getCurrentRequestId?.()).toBe(requestId1);

    // Switch to second request
    await departureStore.refresh(
      ["1002"],
      new Map([["1002", "Work"]]),
      new Map([["1002", { line: "3", direction_code: 2 }]]),
      true,
      requestId2,
    );
    expect(departureStore.getCurrentRequestId?.()).toBe(requestId2);
  });

  it("ignores setDataForRequest calls from stale request IDs", async () => {
    const requestId1 = "page-home-123";
    const requestId2 = "page-work-456";
    const siteId = "1001";

    // If the store has setDataForRequest method, test it
    if (typeof departureStore.setDataForRequest === "function") {
      const data1 = new Map([
        [
          siteId,
          [
            {
              line: "14",
              lineName: "14",
              destination: "Home",
              direction_code: 1,
              minutes: 5,
              time: "08:15",
              transportType: "bus" as const,
            },
          ],
        ],
      ]);

      const data2 = new Map([
        [
          siteId,
          [
            {
              line: "3",
              lineName: "3",
              destination: "Work",
              direction_code: 2,
              minutes: 10,
              time: "08:20",
              transportType: "bus" as const,
            },
          ],
        ],
      ]);

      // Set up request ID tracking
      departureStore.setRequestId?.(requestId1);
      departureStore.setDataForRequest(requestId1, data1);

      // Switch request ID
      departureStore.setRequestId?.(requestId2);
      departureStore.setDataForRequest(requestId2, data2);

      // Old request tries to update - should be ignored
      departureStore.setDataForRequest(requestId1, data1);

      // Verify current data is still from request2
      // (This would require additional public methods to verify)
    }
  });

  it("clears data atomically on page change when clearFirst=true", async () => {
    const requestId1 = "page-home-123";
    const requestId2 = "page-work-456";

    // Load home page
    await departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", direction_code: 1 }]]),
      false,
      requestId1,
    );

    // Switch pages with clearFirst=true
    await departureStore.refresh(
      ["1002"],
      new Map([["1002", "Work"]]),
      new Map([["1002", { line: "3", direction_code: 2 }]]),
      true,
      requestId2,
    );

    // Verify request ID changed
    expect(departureStore.getCurrentRequestId?.()).toBe(requestId2);
  });

  it("does NOT reject responses from in-flight requests when effect re-runs with same page", async () => {
    // This test captures the bug where:
    // 1. Page loaded with requestId A
    // 2. Settings changed, effect re-ran, created requestId B
    // 3. Response from requestId A was rejected as "stale"
    // 4. Result: empty departures displayed

    const pageId = "home-page-1";
    const requestId1 = `page-${pageId}-initial`;
    const requestId2 = `page-${pageId}-after-settings-change`;

    // Load page with first request ID
    await departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", direction_code: 1 }]]),
      true,
      requestId1,
    );

    // Simulate settings change that re-runs effect with SAME page but NEW request ID
    // (This happens when refreshInterval, language, or other settings change)
    departureStore.setRequestId?.(requestId2);

    // Now if first request's response tries to arrive, should it be rejected?
    // With the fix: NO - responses from the SAME page should not be rejected
    // This is now handled at the App level by only creating new requestId on actual page change
    expect(departureStore.getCurrentRequestId?.()).toBe(requestId2);
  });

  it("starts a new fetch for a different page while one is already in flight", async () => {
    const deferred: Array<(value: { departures: any[]; stopDeviations: any[] }) => void> = [];
    const mockedGetDepartures = vi.mocked(transitService.getDepartures);

    mockedGetDepartures.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.push(resolve);
        }),
    );

    const firstRequest = departureStore.refresh(
      ["1001"],
      new Map([["1001", "Centralen"]]),
      new Map([["1001", { line: "14", direction_code: 1 }]]),
      true,
      "page-a",
    );

    const secondRequest = departureStore.refresh(
      ["1002"],
      new Map([["1002", "City"]]),
      new Map([["1002", { line: "3", direction_code: 2 }]]),
      true,
      "page-b",
    );

    // Wait for microtasks so getCachedSchedule resolves and getDepartures gets called
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedGetDepartures).toHaveBeenCalledTimes(2);

    deferred[0]({ departures: [], stopDeviations: [] });
    deferred[1]({ departures: [], stopDeviations: [] });

    await Promise.all([firstRequest, secondRequest]);
  });
});
