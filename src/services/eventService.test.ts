import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchNearbyEvents } from "./eventService";

describe("eventService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts array or wrapped event payloads", async () => {
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

    const events = await fetchNearbyEvents(59.33, 18.06);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Jazz Night");
  });
});
