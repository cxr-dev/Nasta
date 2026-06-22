import { describe, expect, it, vi, beforeEach } from "vitest";

const { getMock, setMock } = vi.hoisted(() => ({
  getMock: vi.fn(async () => undefined),
  setMock: vi.fn(async () => undefined),
}));

vi.mock("./persistentCache", () => ({
  persistentCache: {
    get: getMock,
    set: setMock,
  },
}));

async function loadEventService() {
  const mod = await import("./eventService");
  return mod.fetchNearbyEvents;
}

describe("eventService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it("parses direct array payloads", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify([
            {
              id: "e1",
              name: "Jazz Night",
              startTime: `${todayIso}T19:00:00+02:00`,
              location: {
                name: "Central",
                lat: 59.33,
                lon: 18.06,
              },
            },
          ]),
          { status: 200 },
        );
      }) as any,
    );

    const fetchNearbyEvents = await loadEventService();
    const events = await fetchNearbyEvents(59.33, 18.06);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Jazz Night");
  });

  it("parses wrapped event payloads", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            events: [
              {
                id: "e1",
                name: "Jazz Night",
                startTime: `${todayIso}T19:00:00+02:00`,
                location: "Central",
                lat: 59.33,
                lon: 18.06,
              },
            ],
          }),
          { status: 200 },
        );
      }) as any,
    );

    const fetchNearbyEvents = await loadEventService();
    const events = await fetchNearbyEvents(59.33, 18.06);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Jazz Night");
  });

  it("returns an empty array for empty payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as any,
    );

    const fetchNearbyEvents = await loadEventService();
    await expect(fetchNearbyEvents(59.33, 18.06)).resolves.toEqual([]);
  });
});
