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
              image: { url: "https://images.example.test/jazz.jpg" },
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
    expect(events[0].imageUrl).toBe("https://images.example.test/jazz.jpg");
    expect(events[0].imageCredit).toBe("Visit Stockholm");
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

  it("extracts schedule.dates[0].start_time into startTime", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "e2",
                title: "Timed Event",
                start_date: todayIso,
                schedule: { dates: [{ start_time: "18:00" }] },
                location: { lat: 59.33, lon: 18.06 },
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
    expect(events[0].startTime).toBe(`${todayIso}T18:00:00`);
  });

  it("handles date-only events without schedule time", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "e3",
                title: "All-Day Event",
                start_date: todayIso,
                location: { lat: 59.33, lon: 18.06 },
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
    expect(events[0].startTime).toBe(todayIso);
  });

  it("parses categories from API response", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "e4",
                title: "Categorized Event",
                start_date: todayIso,
                location: { lat: 59.33, lon: 18.06 },
                categories: [
                  { slug: "music", title: "Music" },
                  { slug: "stage-film", title: "Stage & Film" },
                ],
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
    expect(events[0].categories).toBeDefined();
    expect(events[0].categories!).toHaveLength(2);
    expect(events[0].categories![0].slug).toBe("music");
    expect(events[0].categories![0].title).toBe("Music");
    expect(events[0].categories![1].slug).toBe("stage-film");
    expect(events[0].categories![1].title).toBe("Stage & Film");
  });

  it("handles missing categories gracefully", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "e5",
                title: "No Categories",
                start_date: todayIso,
                location: { lat: 59.33, lon: 18.06 },
              },
            ],
          }),
          { status: 200 },
        );
      }) as any,
    );

    const fetchNearbyEvents = await loadEventService();
    const events = await fetchNearbyEvents(59.33, 18.06);
    expect(events[0].categories).toBeUndefined();
  });

  it("filters out events without location", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "e6",
                title: "No Location Event",
                start_date: todayIso,
              },
            ],
          }),
          { status: 200 },
        );
      }) as any,
    );

    const fetchNearbyEvents = await loadEventService();
    const events = await fetchNearbyEvents(59.33, 18.06);
    expect(events).toHaveLength(0);
  });
});
