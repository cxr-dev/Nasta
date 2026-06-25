import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { getStopKey, isSjostadstrafikenStop, getNextDepartures, getFirstTomorrowDeparture } from "./staticTimetable";

const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/Stockholm";
});

afterAll(() => {
  process.env.TZ = originalTz;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getStopKey", () => {
  it("returns luma_brygga for Luma stop names", () => {
    expect(getStopKey("Lumaparken")).toBe("luma_brygga");
    expect(getStopKey("Luma brygga")).toBe("luma_brygga");
  });

  it("returns barnangsbryggan for Barnängen stop names", () => {
    expect(getStopKey("Barnängen")).toBe("barnangsbryggan");
    expect(getStopKey("Barnängsbryggan")).toBe("barnangsbryggan");
  });

  it("returns henriksdalsbryggan for Henriksdal stop names", () => {
    expect(getStopKey("Henriksdal")).toBe("henriksdalsbryggan");
    expect(getStopKey("Henriksdalsbryggan")).toBe("henriksdalsbryggan");
  });

  it("strips accents for matching", () => {
    expect(getStopKey("Bärnängen")).toBe("barnangsbryggan");
    expect(getStopKey("Lüma")).toBe("luma_brygga");
  });

  it("is case insensitive", () => {
    expect(getStopKey("LUMA")).toBe("luma_brygga");
    expect(getStopKey("barnangen")).toBe("barnangsbryggan");
  });

  it("returns null for unknown stops", () => {
    expect(getStopKey("Centralen")).toBeNull();
    expect(getStopKey("")).toBeNull();
  });
});

describe("isSjostadstrafikenStop", () => {
  it("returns true for Sjöstadstrafiken stop names", () => {
    expect(isSjostadstrafikenStop("Lumaparken")).toBe(true);
    expect(isSjostadstrafikenStop("Barnängen")).toBe(true);
    expect(isSjostadstrafikenStop("Henriksdal")).toBe(true);
  });

  it("returns false for non-ferry stop names", () => {
    expect(isSjostadstrafikenStop("Centralen")).toBe(false);
    expect(isSjostadstrafikenStop("T-Centralen")).toBe(false);
  });
});

describe("getNextDepartures", () => {
  it("returns empty array for unknown stop", () => {
    expect(getNextDepartures("NonExistent")).toEqual([]);
  });

  it("returns next departures from Luma on weekday morning", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps).toHaveLength(2);
    expect(deps[0].line).toBe("SJO");
    expect(deps[0].lineName).toBe("Sjöstadstrafiken");
    expect(deps[0].time).toBe("10:05");
    expect(deps[0].minutes).toBe(5);
    expect(deps[0].transportType).toBe("boat");
    expect(deps[1].time).toBe("10:25");
  });

  it("returns next departures from Barnängen on weekday morning", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00") });

    const deps = getNextDepartures("Barnängen");
    expect(deps[0].time).toBe("10:00");
    expect(deps[0].destination).toBe("Lumabryggan");
    expect(deps[1].time).toBe("10:20");
    expect(deps[1].destination).toBe("Lumabryggan");
  });

  it("returns next departures from Henriksdal on weekday morning", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00") });

    const deps = getNextDepartures("Henriksdal");
    expect(deps).toHaveLength(2);
    expect(deps[0].time).toBe("10:10");
    expect(deps[0].destination).toBe("Barnängsbryggan");
  });

  it("respects custom count parameter", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00") });

    const deps = getNextDepartures("Lumaparken", 4);
    expect(deps).toHaveLength(4);
  });

  it("uses weekend schedule on Saturday", () => {
    vi.useFakeTimers({ now: new Date("2026-01-10T09:00:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps[0].time).toBe("09:05");
  });

  it("uses weekend schedule on Sunday", () => {
    vi.useFakeTimers({ now: new Date("2026-01-11T09:00:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps[0].time).toBe("09:05");
  });

  it("uses weekday schedule on Monday", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T09:00:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps[0].time).toBe("09:05");
  });

  it("returns fewer departures when near end of day", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:30:00") });

    const deps = getNextDepartures("Lumaparken", 3);
    expect(deps).toHaveLength(1);
    expect(deps[0].time).toBe("23:45");
    expect(deps[0].minutes).toBe(15);
  });

  it("returns empty when no more departures today", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:55:00") });

    const deps = getNextDepartures("Lumaparken", 2);
    expect(deps).toHaveLength(0);
  });

  it("returns empty on weekend night when no more departures today", () => {
    vi.useFakeTimers({ now: new Date("2026-01-10T23:55:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps).toHaveLength(0);
  });

  it("schedules 0-minute-away departure as Now with correct line info", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T06:05:00") });

    const deps = getNextDepartures("Lumaparken");
    expect(deps[0].minutes).toBe(0);
    expect(deps[0].time).toBe("06:05");
    expect(deps[0].line).toBe("SJO");
  });

  it("produces SJO line with boat type for all three stops", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T07:00:00") });

    for (const stop of ["Lumaparken", "Barnängen", "Henriksdal"]) {
      const deps = getNextDepartures(stop);
      expect(deps[0].transportType).toBe("boat");
      expect(deps[0].line).toBe("SJO");
    }
  });
});

describe("getFirstTomorrowDeparture", () => {
  it("returns first departure time for matching line and direction", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    const result = getFirstTomorrowDeparture("Lumaparken", "SJO", 1);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("06:05");
  });

  it("returns null for unknown stop", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    expect(getFirstTomorrowDeparture("NonExistent", "SJO", 1)).toBeNull();
  });

  it("returns null when line does not match", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    expect(getFirstTomorrowDeparture("Lumaparken", "NONEXISTENT", 1)).toBeNull();
  });

  it("returns null when direction does not match", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    expect(getFirstTomorrowDeparture("Lumaparken", "SJO", 999)).toBeNull();
  });

  it("returns weekend schedule for Saturday night", () => {
    vi.useFakeTimers({ now: new Date("2026-01-10T23:00:00") });

    const result = getFirstTomorrowDeparture("Lumaparken", "SJO", 1);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("08:05");
  });

  it("returns weekday schedule for Sunday night", () => {
    vi.useFakeTimers({ now: new Date("2026-01-11T23:00:00") });

    const result = getFirstTomorrowDeparture("Lumaparken", "SJO", 1);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("06:05");
  });

  it("finds direction 2 departure at Barnängen", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    const result = getFirstTomorrowDeparture("Barnängen", "SJO", 2);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("06:10");
  });

  it("finds direction 1 departure at Barnängen", () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T23:00:00") });

    const result = getFirstTomorrowDeparture("Barnängen", "SJO", 1);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("06:00");
  });
});
