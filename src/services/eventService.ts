export type EventItemCategory = { slug: string; title: string };

export type EventItem = {
  id: string;
  name: string;
  startTime?: string;
  location?: string;
  description?: string;
  ticketUrl?: string;
  lat?: number;
  lon?: number;
  categories?: EventItemCategory[];
  imageUrl?: string;
  imageCredit?: string;
  imageSource?: string;
  imageLicense?: string;
  imageResolvedAt?: number;
};

function toHttpsImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('https://')) return undefined;
  return value;
}

import { distanceMeters } from "./geo";
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

// Visit Stockholm's public event feed intentionally excludes event images. Keep this
// narrow contract for an explicitly licensed source or deterministic test fixture.
function trustedEventImage(event: any): Pick<EventItem, 'imageUrl' | 'imageCredit' | 'imageSource' | 'imageLicense' | 'imageResolvedAt'> {
  const imageUrl = toHttpsImage(
    event.image_url ??
      event.imageUrl ??
      event.image?.url ??
      event.image?.image_url ??
      event.image?.src ??
      event.images?.[0]?.url ??
      event.images?.[0]?.image_url ??
      event.media?.[0]?.url ??
      event.media?.[0]?.image_url ??
      event.media?.image?.url ??
      event.media?.image?.image_url ??
      event.renditions?.[0]?.url,
  );
  const license = normalizeText(event.image_license ?? event.imageLicense ?? event.image?.license ?? event.media?.[0]?.license);
  const credit = normalizeText(event.image_credit ?? event.imageCredit ?? event.image?.credit ?? event.image?.photographer ?? event.media?.[0]?.credit);
  const recognized = /^(CC BY(?: 4\.0)?|CC0|Public Domain)$/i.test(license.trim());
  if (!imageUrl || !credit || !recognized) return {};
  return {
    imageUrl,
    imageCredit: credit,
    imageSource: normalizeText(event.image_source ?? event.imageSource ?? event.image?.source) || 'Visit Stockholm',
    imageLicense: license,
    imageResolvedAt: Date.now(),
  };
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

  // If the caller's signal is already aborted, return inflight or cached-stale rather than failing
  // immediately before we even reach the persistent cache or static file.
  const inflight = eventInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    const filterEvents = (events: EventItem[]) =>
      events
        .filter((event) => event.lat !== undefined && event.lon !== undefined)
        .filter(
          (event) =>
            distanceMeters(lat, lon, event.lat!, event.lon!) <= radius,
        )
        .filter((event) => {
          if (!event.startTime) return true;
          const today = new Date().toISOString().slice(0, 10);
          // Date-only (YYYY-MM-DD): keep only events starting today
          if (/^\d{4}-\d{2}-\d{2}$/.test(event.startTime)) {
            return event.startTime === today;
          }
          // Datetime string: keep only events starting today
          return event.startTime.slice(0, 10) === today;
        })
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return 0;
          return a.startTime.localeCompare(b.startTime);
        });

    try {
      // check persistent cache (longer TTL) — not signal-gated, always worth checking
      try {
        const p = await persistentCache.get(`events:${key}`);
        if (p) {
          const persisted = p as EventItem[];
          const filtered = filterEvents(persisted);
          eventsCache.set(key, {
            expires: Date.now() + CACHE_TTL_MS,
            value: filtered,
          });
          return filtered;
        }
      } catch (e) {}

      // If signal is already aborted at this point there is no cache to serve —
      // bail early so we don't waste a network slot.
      if (signal?.aborted) {
        return [];
      }

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
            startTime: (() => {
              const d = e.start_date ?? e.startTime ?? e.date ?? e.startTimeLocal;
              const t = d && e.schedule?.dates?.[0]?.start_time;
              return t ? `${d}T${t}:00` : d ?? undefined;
            })(),
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
            ...trustedEventImage(e),
            lat: typeof eventLat === "number" ? eventLat : undefined,
            lon: typeof eventLon === "number" ? eventLon : undefined,
            categories: Array.isArray(e.categories)
              ? e.categories.map((c: any) => ({
                  slug: typeof c.slug === "string" ? c.slug : "",
                  title: normalizeText(c.title),
                })).filter((c: EventItemCategory) => c.slug && c.title)
              : undefined,
          } as EventItem;
        });
      };

      // Static file: built at deploy time by prebuild script — primary source for production.
      // Use an internal AbortController with a generous timeout so that a caller aborting the
      // tab-switch signal doesn't kill the fetch — the data is local/precached so it's fast.
      try {
        const staticUrl = `${import.meta.env.BASE_URL}events-data.json`;
        const staticCtrl = new AbortController();
        const staticTimeout = setTimeout(() => staticCtrl.abort(), 5000);
        // Combine with caller signal only when it exists and is not yet aborted
        const staticSignal =
          signal && !signal.aborted
            ? AbortSignal.any([staticCtrl.signal, signal])
            : staticCtrl.signal;
        const staticRes = await fetch(staticUrl, { signal: staticSignal });
        clearTimeout(staticTimeout);
        if (!staticRes.ok) throw new Error(`events-data.json returned ${staticRes.status}`);
        const payload = await staticRes.json();
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
      } catch (staticError) {
        if ((staticError as any)?.name === "AbortError") {
          // Only log when it's a genuine timeout, not a tab-switch abort
          console.debug("fetchNearbyEvents: static events-data.json timed out or aborted");
        } else {
          console.debug(
            "fetchNearbyEvents: static events-data.json not available (expected in dev)",
            staticError,
          );
        }
      }

      // Dev fallback: CORS proxy for local development where static file doesn't exist.
      // Uses AbortSignal.any so both the 8s internal timeout AND the caller signal can cancel it.
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(sourceUrl)}`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);
        const combinedSignal =
          signal && !signal.aborted
            ? AbortSignal.any([controller.signal, signal])
            : controller.signal;
        const payload = await fetchEvents(proxyUrl, combinedSignal);
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
