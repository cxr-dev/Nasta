/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNextDeparture } from "./nextDepartureResolver";
import { getDepartures, searchTrips } from "./slApi";

vi.mock("./slApi", () => ({
  getDepartures: vi.fn(),
  searchTrips: vi.fn(),
}));

describe("NextDepartureResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns real-time departure if available", async () => {
    const mockRealtime = [
      {
        line: "76",
        direction_code: 1,
        minutes: 10,
        destination: "Ropsten",
        time: "10:00",
      },
    ];
    vi.mocked(getDepartures).mockResolvedValue({ departures: mockRealtime as any, stopDeviations: [] });

    const result = await getNextDeparture("9001", "76", 1);

    expect(result.source).toBe("realtime");
    expect(result.departure?.line).toBe("76");
    expect(getDepartures).toHaveBeenCalledWith("9001", 120, undefined);
    expect(searchTrips).not.toHaveBeenCalled();
  });

  it("falls back to planned trips if real-time is empty and destId is provided", async () => {
    vi.mocked(getDepartures).mockResolvedValue({ departures: [], stopDeviations: [] });
    const mockPlanned = [
      {
        line: "76",
        direction_code: 1,
        minutes: 45,
        destination: "Ropsten",
        time: "10:45",
        predicted: true,
      },
    ];
    vi.mocked(searchTrips).mockResolvedValue(mockPlanned as any);

    const result = await getNextDeparture("9001", "76", 1, "9002");

    expect(result.source).toBe("planned");
    expect(result.departure?.line).toBe("76");
    expect(result.departure?.predicted).toBe(true);
    expect(searchTrips).toHaveBeenCalledWith("9001", "9002", undefined, undefined);
  });

  it("returns source 'none' if both sources are empty (today and tomorrow)", async ({
  }) => {
    vi.mocked(getDepartures).mockResolvedValue({ departures: [], stopDeviations: [] });
    vi.mocked(searchTrips).mockResolvedValue([]);

    const result = await getNextDeparture("9001", "76", 1, "9002");

    expect(result.source).toBe("none");
    expect(result.departure).toBeNull();
    // Verify it tried searching twice (once for today, once for tomorrow)
    expect(searchTrips).toHaveBeenCalledTimes(2);
  });

  it("searches for tomorrow's first departure if today is empty", async () => {
    vi.mocked(getDepartures).mockResolvedValue({ departures: [], stopDeviations: [] });
    // First call (today) returns empty, second call (tomorrow) returns a trip
    vi.mocked(searchTrips)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          line: "76",
          direction_code: 1,
          minutes: 360,
          destination: "Ropsten",
          time: "05:12",
        },
      ] as any);

    const result = await getNextDeparture("9001", "76", 1, "9002");

    expect(result.source).toBe("planned");
    expect(result.departure?.time).toBe("05:12");
    expect(result.departure?.isFirstMorning).toBe(true);
    expect(searchTrips).toHaveBeenCalledTimes(2);
  });

  it("handles errors gracefully and returns source 'none'", async () => {
    vi.mocked(getDepartures).mockRejectedValue(new Error("API Fail"));

    const result = await getNextDeparture("9001", "76", 1, "9002");

    expect(result.source).toBe("none");
    expect(result.departure).toBeNull();
  });
});
