import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/slApi", () => ({
  parseSlTimestamp: vi.fn((raw: string) => new Date(raw).getTime()),
}));

vi.mock("../services/persistentCache", () => ({
  persistentCache: {
    migrateFromLocalStorage: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

let learnFromApiResponse: any;
let getPredictedDepartures: any;
let getKnownRoutes: any;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const mod = await import("./timetableCache");
  learnFromApiResponse = mod.learnFromApiResponse;
  getPredictedDepartures = mod.getPredictedDepartures;
  getKnownRoutes = mod.getKnownRoutes;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("learnFromApiResponse", () => {
  it("stores departure minutes grouped by transit day", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].time).toBe("10:30");
    expect(predicted[0].line).toBe("76");
    expect(predicted[0].minutes).toBe(30);
  });

  it("skips entries without scheduled or expected field", async () => {
    await learnFromApiResponse("1001", [
      {
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("skips entries without line designation", async () => {
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("deduplicates identical departure times across multiple learns", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    const dep = {
      scheduled: "2026-01-05T10:30:00+01:00",
      line: { designation: "76", name: "76", transport_mode: "bus" },
      direction_code: 1,
      destination: "Ropsten",
    };

    await learnFromApiResponse("1001", [dep]);
    await learnFromApiResponse("1001", [dep]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(1);
  });

  it("stores multiple departure times in sorted order", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:45:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(2);
    expect(predicted[0].time).toBe("10:30");
    expect(predicted[1].time).toBe("10:45");
  });

  it("returns early for empty response without loading store", async () => {
    await learnFromApiResponse("1001", []);
    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("uses expected field as fallback when scheduled is missing", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        expected: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].time).toBe("10:30");
  });
});

describe("getPredictedDepartures", () => {
  it("returns empty array for unknown route", async () => {
    const predicted = await getPredictedDepartures("unknown", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("returns predicted departures with correct properties", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].minutes).toBe(30);
    expect(predicted[0].destination).toBe("Ropsten");
    expect(predicted[0].predicted).toBe(true);
    expect(predicted[0].transportType).toBe("bus");
  });

  it("infers tram transport type from transport_mode", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "30", name: "30", transport_mode: "tram" },
        direction_code: 1,
        destination: "Solna station",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "30", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].transportType).toBe("tram");
  });

  it("infers tram from lightrail transport_mode", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "30", name: "30", transport_mode: "lightrail" },
        direction_code: 1,
        destination: "Solna station",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "30", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].transportType).toBe("tram");
  });

  it("filters by direction_code", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
      {
        scheduled: "2026-01-05T11:00:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 2,
        destination: "Slussen",
      },
    ]);

    const dir1 = await getPredictedDepartures("1001", "76", 1, 5);
    const dir2 = await getPredictedDepartures("1001", "76", 2, 5);
    expect(dir1).toHaveLength(1);
    expect(dir1[0].destination).toBe("Ropsten");
    expect(dir2).toHaveLength(1);
    expect(dir2[0].destination).toBe("Slussen");
  });

  it("respects MAX_PREDICTED_MINUTES (6 hours)", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T17:00:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("returns at most count departures", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
      {
        scheduled: "2026-01-05T11:00:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
      {
        scheduled: "2026-01-05T11:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 2);
    expect(predicted).toHaveLength(2);
  });

  it("skips past departures on the same day", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T09:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("returns empty for expired cache (older than 30 days)", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    vi.setSystemTime(new Date("2026-02-05T11:00:00+01:00"));

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toEqual([]);
  });

  it("handles night service (00:00-03:59) under previous transit day", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T22:00:00+01:00") });
    // Night service at 00:30 on Tuesday -> belongs to Monday's transit day
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-06T00:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const predicted = await getPredictedDepartures("1001", "76", 1, 5);
    expect(predicted).toHaveLength(1);
    expect(predicted[0].time).toBe("00:30");
    expect(predicted[0].minutes).toBe(150);
  });
});

describe("getKnownRoutes", () => {
  it("returns all non-expired routes for a site", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", name: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    const routes = await getKnownRoutes("1001");
    expect(routes).toHaveLength(1);
    expect(routes[0].line).toBe("76");
    expect(routes[0].destination).toBe("Ropsten");
  });

  it("excludes expired entries", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-05T10:00:00+01:00") });
    await learnFromApiResponse("1001", [
      {
        scheduled: "2026-01-05T10:30:00+01:00",
        line: { designation: "76", transport_mode: "bus" },
        direction_code: 1,
        destination: "Ropsten",
      },
    ]);

    vi.setSystemTime(new Date("2026-02-10T10:00:00+01:00"));

    const routes = await getKnownRoutes("1001");
    expect(routes).toHaveLength(0);
  });
});
