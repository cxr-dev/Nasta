export type EventItem = {
  id: string;
  name: string;
  startTime?: string;
  location?: string;
  description?: string;
  ticketUrl?: string;
  lat?: number;
  lon?: number;
};

import { persistentCache } from "./persistentCache";

const VISIT_STOCKHOLM_EVENTS_URL =
  "https://api.visitstockholm.com/api/public-v1/events/";
const MAX_EVENT_PAGE_SIZE = 100;

// Simple in-memory cache for events: key -> { expires, value }
const eventsCache = new Map<string, { expires: number; value: EventItem[] }>();
const eventInflight = new Map<string, Promise<EventItem[]>>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

function roundCoordinate(value: number, resolution = 0.006) {
  return Number((Math.round(value / resolution) * resolution).toFixed(4));
}

function cacheKey(lat: number, lon: number, radius: number) {
  return `${roundCoordinate(lat)}-${roundCoordinate(lon)}-${radius}`;
}

function toDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function normalizeText(value: any) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    return (
      value.en ??
      value.sv ??
      Object.values(value).find((v) => typeof v === "string") ??
      ""
    );
  }
  return "";
}

export async function fetchNearbyEvents(
  lat: number,
  lon: number,
  radius = 5000,
  signal?: AbortSignal,
): Promise<EventItem[]> {
  const key = cacheKey(lat, lon, radius);
  const cached = eventsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const inflight = eventInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      // check persistent cache (longer TTL)
      try {
        const p = await persistentCache.get(`events:${key}`);
        if (p) {
          const persisted = p as EventItem[];
          eventsCache.set(key, {
            expires: Date.now() + CACHE_TTL_MS,
            value: persisted,
          });
          return persisted;
        }
      } catch (e) {}

      const sourceUrl = `${VISIT_STOCKHOLM_EVENTS_URL}?${new URLSearchParams({
        size: String(MAX_EVENT_PAGE_SIZE),
      }).toString()}`;

      const fetchEvents = async (url: string, signalToUse?: AbortSignal) => {
        const res = await fetch(url, { signal: signalToUse });
        if (!res.ok) {
          throw new Error(`Event API returned ${res.status}`);
        }
        return res.json();
      };

      const parseResponse = (payload: any) => {
        const list = Array.isArray(payload)
          ? payload
          : payload && Array.isArray(payload.results)
            ? payload.results
            : payload && Array.isArray(payload.events)
              ? payload.events
              : payload && Array.isArray(payload.data)
                ? payload.data
                : [];

        return list.map((e: any) => {
          const eventLat =
            e.location?.latitude ?? e.location?.lat ?? e.latitude ?? e.lat;
          const eventLon =
            e.location?.longitude ??
            e.location?.lon ??
            e.lon ??
            e.location?.lng;
          return {
            id: (e.id ?? e.url ?? JSON.stringify(e)).toString(),
            name: normalizeText(e.title ?? e.name ?? e.eventName ?? "Untitled"),
            startTime:
              e.start_date ??
              e.startTime ??
              e.date ??
              e.startTimeLocal ??
              undefined,
            location: normalizeText(
              e.venue_name ??
                e.place ??
                e.address ??
                e.city ??
                e.location?.name,
            ),
            ticketUrl:
              e.external_website_url ??
              e.ticketUrl ??
              e.ticket_url ??
              e.url ??
              undefined,
            description: normalizeText(e.description ?? e.summary ?? undefined),
            lat: typeof eventLat === "number" ? eventLat : undefined,
            lon: typeof eventLon === "number" ? eventLon : undefined,
          } as EventItem;
        });
      };

      const filterEvents = (events: EventItem[]) =>
        events
          .filter((event) => event.lat !== undefined && event.lon !== undefined)
          .filter(
            (event) =>
              toDistanceKm(lat, lon, event.lat!, event.lon!) <= radius / 1000,
          )
          .sort((a, b) => {
            if (!a.startTime || !b.startTime) return 0;
            return a.startTime.localeCompare(b.startTime);
          });

      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);
        const payload = await fetchEvents(
          sourceUrl,
          signal ?? controller.signal,
        );
        clearTimeout(id);

        const filtered = filterEvents(parseResponse(payload));
        eventsCache.set(key, {
          expires: Date.now() + CACHE_TTL_MS,
          value: filtered,
        });
        try {
          await persistentCache.set(
            `events:${key}`,
            filtered,
            24 * 60 * 60 * 1000,
          );
        } catch (e) {}
        return filtered;
      } catch (primaryError) {
        console.debug(
          "fetchNearbyEvents: direct event API fetch failed",
          primaryError,
        );
      }

      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(sourceUrl)}`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);
        const payload = await fetchEvents(
          proxyUrl,
          signal ?? controller.signal,
        );
        clearTimeout(id);

        const filtered = filterEvents(parseResponse(payload));
        eventsCache.set(key, {
          expires: Date.now() + CACHE_TTL_MS,
          value: filtered,
        });
        try {
          await persistentCache.set(
            `events:${key}`,
            filtered,
            24 * 60 * 60 * 1000,
          );
        } catch (e) {}
        return filtered;
      } catch (proxyError) {
        console.debug(
          "fetchNearbyEvents: proxy fallback also failed",
          proxyError,
        );
      }

      // Fallback: in DEV show a small demo list to avoid empty UI; in production return empty
      if (import.meta.env.DEV) {
        const demo = [
          {
            id: "mock-1",
            name: "Live Music – Demo",
            startTime: new Date().toISOString(),
            location: "Nearby pub",
            description: "Local band playing tonight",
            lat,
            lon,
          },
        ];
        eventsCache.set(key, { expires: Date.now() + 30 * 1000, value: demo });
        return demo;
      }

      eventsCache.set(key, { expires: Date.now() + 10 * 1000, value: [] }); // short cache for failure
      return [];
    } finally {
      eventInflight.delete(key);
    }
  })();

  eventInflight.set(key, request);
  return request;
}
