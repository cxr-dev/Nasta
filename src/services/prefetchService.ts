import { fetchNearbyEvents } from "./eventService";
import { fetchNearbyVenues } from "./venueService";
import type { Segment } from "../types/page";
import type { Settings } from "./storage";

// Prefetch orchestration: iterate segments and fetch venues/events with controlled concurrency
export async function prefetchSegments(
  segments: Segment[],
  settings: Settings,
  opts?: { concurrency?: number },
) {
  const concurrency = opts?.concurrency ?? 1;
  const queue = segments.slice();
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (queue.length > 0) {
      const seg = queue.shift();
      if (!seg) break;
      const coords = seg.fromStop?.coord;
      if (!coords || coords.length < 2) continue;
      const lat = coords[0];
      const lon = coords[1];
      try {
        if (settings.afterworkVenuesEnabled) {
          const types =
            settings.afterworkTypes && settings.afterworkTypes.length
              ? settings.afterworkTypes
              : ["beer"];
          // Prefetch individual groups separately to warm the exact cache keys that the UI tabs will query.
          if (types.includes("beer")) {
            await fetchNearbyVenues(lat, lon, 1200, ["beer"]);
          }
          if (types.includes("wine") || types.includes("cocktail")) {
            await fetchNearbyVenues(lat, lon, 1200, ["wine", "cocktail"]);
          }
        }
        if (settings.eventsEnabled) {
          await fetchNearbyEvents(lat, lon, 3000);
        }
      } catch (e) {
        // ignore per-segment failures
      }
    }
  };

  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
}
