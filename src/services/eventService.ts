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

export async function fetchNearbyEvents(lat: number, lon: number, radius = 5000): Promise<EventItem[]> {
  // Try Stockholm Stad Event API first
  try {
    const base = 'https://eventapi.stockholm.se/events';
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius), upcoming: 'true', limit: '10' });
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}?${params.toString()}`, { signal: controller.signal });
    clearTimeout(id);
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      // Try common shapes
      const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.events) ? payload.events : (payload && Array.isArray(payload.data) ? payload.data : []));
      const out: EventItem[] = [];
      for (const e of list) {
        out.push({
          id: e.id ?? e.eventId ?? JSON.stringify(e),
          name: e.name ?? e.title ?? e.eventName ?? 'Untitled',
          startTime: e.startTime ?? e.start_date ?? e.date ?? undefined,
          location: e.location?.name ?? e.venue ?? e.place ?? undefined,
          ticketUrl: e.ticketUrl ?? e.ticket_url ?? e.url ?? undefined,
          description: e.description ?? e.summary ?? undefined,
          lat: e.location?.lat ?? e.lat ?? undefined,
          lon: e.location?.lon ?? e.lon ?? undefined,
        });
      }
      if (out.length > 0) return out;
    }
  } catch (e) {
    // ignore and fall back to placeholder or Overpass fallback
  }

  // Fallback dev/demo when local development
  if (import.meta.env.DEV) {
    return [
      { id: 'mock-1', name: 'Live Music – Demo', startTime: new Date().toISOString(), location: 'Nearby pub', description: 'Local band playing tonight', lat, lon },
    ];
  }

  return [];
}
