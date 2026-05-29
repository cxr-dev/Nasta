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

import { persistentCache } from './persistentCache';

// Simple in-memory cache for events: key -> { expires, value }
const eventsCache = new Map<string, { expires: number; value: EventItem[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

function cacheKey(lat: number, lon: number, radius: number) {
  return `${lat.toFixed(4)}-${lon.toFixed(4)}-${radius}`;
}

export async function fetchNearbyEvents(lat: number, lon: number, radius = 5000, signal?: AbortSignal): Promise<EventItem[]> {
  const key = cacheKey(lat, lon, radius);
  const cached = eventsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  // check persistent cache (longer TTL)
  try {
    const p = await persistentCache.get(`events:${key}`);
    if (p) return p as any[];
  } catch (e) {}

  // Try Stockholm Stad Event API first
  try {
    // Prefer VisitStockholm API (public) which exposes event lists at /api/events
    const base = 'https://api.visitstockholm.com/api/events';
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius), upcoming: 'true', limit: '10' });
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const finalSignal = signal ?? controller.signal;
    const res = await fetch(`${base}?${params.toString()}`, { signal: finalSignal });
    clearTimeout(id);
    if (res.ok) {
      // resilient parsing: try json(), otherwise text() -> JSON.parse
      let payload: any = null;
      try {
        payload = await res.json();
      } catch (jsonErr) {
        try {
          const txt = await res.text();
          payload = txt ? JSON.parse(txt) : null;
        } catch (txtErr) {
          console.debug('fetchNearbyEvents: failed to parse body', { jsonErr, txtErr });
          payload = null;
        }
      }

      // If payload still null, attempt to read text for debugging
      if (!payload) {
        try {
          const raw = await res.text();
          console.debug('fetchNearbyEvents: raw response', raw.slice ? raw.slice(0, 2000) : raw);
        } catch (_) {}
      }

      // Try common shapes; VisitStockholm often returns { events: { items: [...] } }
      const list = Array.isArray(payload)
        ? payload
        : payload && Array.isArray(payload.events?.items)
        ? payload.events.items
        : payload && Array.isArray(payload.events)
        ? payload.events
        : payload && Array.isArray(payload.data)
        ? payload.data
        : [];

      const out: EventItem[] = [];
      for (const e of list) {
        out.push({
          id: (e.id ?? e.href ?? e.event_id ?? JSON.stringify(e)).toString(),
          name: e.title ?? e.name ?? e.eventName ?? 'Untitled',
          startTime: e.start_date ?? e.startTime ?? e.date ?? e.startTimeLocal ?? undefined,
          location:
            (e.location && (e.location.address || e.location.name)) ?? e.venue_name ?? e.venue ?? e.place ?? undefined,
          ticketUrl: e.external_website_url ?? e.ticketUrl ?? e.ticket_url ?? e.url ?? undefined,
          description: e.description ?? e.summary ?? undefined,
          lat: (e.location && (e.location.latitude ?? e.location.lat)) ?? e.lat ?? e.latitude ?? undefined,
          lon: (e.location && (e.location.longitude ?? e.location.lon)) ?? e.lon ?? e.longitude ?? undefined,
        });
      }
      // cache and return if we got events
      eventsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: out });
      try { await persistentCache.set(`events:${key}`, out, 24 * 60 * 60 * 1000); } catch (e) {}
      return out;
    }
  } catch (e) {
    // detect CORS / network failures and attempt a proxied fetch via AllOrigins as fallback (development-friendly)
    console.debug('fetchNearbyEvents: primary fetch failed', e);
    try {
      const target = `${'https://api.visitstockholm.com/api/events'}?${new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius), upcoming: 'true', limit: '10' }).toString()}`;
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
      const pController = new AbortController();
      const pid = setTimeout(() => pController.abort(), 8000);
      const pres = await fetch(proxy, { signal: pController.signal }).catch(() => null);
      clearTimeout(pid);
      if (pres && pres.ok) {
        let payload: any = null;
        try {
          payload = await pres.json();
        } catch (jsonErr) {
          try { const txt = await pres.text(); payload = txt ? JSON.parse(txt) : null; } catch (_) { payload = null; }
        }
        const list = Array.isArray(payload)
          ? payload
          : payload && Array.isArray(payload.events?.items)
          ? payload.events.items
          : payload && Array.isArray(payload.events)
          ? payload.events
          : payload && Array.isArray(payload.data)
          ? payload.data
          : [];
        const out: EventItem[] = [];
        for (const e of list) {
          out.push({
            id: (e.id ?? e.href ?? e.event_id ?? JSON.stringify(e)).toString(),
            name: e.title ?? e.name ?? e.eventName ?? 'Untitled',
            startTime: e.start_date ?? e.startTime ?? e.date ?? e.startTimeLocal ?? undefined,
            location:
              (e.location && (e.location.address || e.location.name)) ?? e.venue_name ?? e.venue ?? e.place ?? undefined,
            ticketUrl: e.external_website_url ?? e.ticketUrl ?? e.ticket_url ?? e.url ?? undefined,
            description: e.description ?? e.summary ?? undefined,
            lat: (e.location && (e.location.latitude ?? e.location.lat)) ?? e.lat ?? e.latitude ?? undefined,
            lon: (e.location && (e.location.longitude ?? e.location.lon)) ?? e.lon ?? e.longitude ?? undefined,
          });
        }
        eventsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: out });
        return out;
      }
    } catch (proxyErr) {
      console.debug('fetchNearbyEvents: proxy fallback also failed', proxyErr);
    }
  }

  // Fallback: in DEV show a small demo list to avoid empty UI; in production return empty
  if (import.meta.env.DEV) {
    const demo = [
      { id: 'mock-1', name: 'Live Music – Demo', startTime: new Date().toISOString(), location: 'Nearby pub', description: 'Local band playing tonight', lat, lon },
    ];
    eventsCache.set(key, { expires: Date.now() + 30 * 1000, value: demo });
    return demo;
  }

  eventsCache.set(key, { expires: Date.now() + 10 * 1000, value: [] }); // short cache for failure
  return [];
}

