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
  // Placeholder external API — keep defensive handling.
  const url = `https://api.example.com/events?lat=${lat}&lon=${lon}&radius=${radius}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // In dev mode, return a small mocked list so the UI can be previewed locally
      if (import.meta.env.DEV) {
        return [
          { id: 'mock-1', name: 'Live Music – Demo', startTime: new Date().toISOString(), location: 'Nearby pub', description: 'Local band playing tonight', lat, lon },
          { id: 'mock-2', name: 'Cocktails & Friends', startTime: new Date(Date.now() + 3600_000).toISOString(), location: 'Bar XYZ', description: 'Happy hour tasting' , lat: lat + 0.001, lon: lon + 0.001},
        ];
      }
      return [];
    }
    const payload = await res.json().catch(() => null);

    // Defensive parsing: accept either an array or an object with an `events` array
    if (Array.isArray(payload)) return payload as EventItem[];
    if (payload && Array.isArray(payload.events)) return payload.events as EventItem[];
    if (payload && Array.isArray(payload.items)) return payload.items as EventItem[];
    return [];
  } catch (e) {
    if (import.meta.env.DEV) {
      return [
        { id: 'mock-1', name: 'Live Music – Demo', startTime: new Date().toISOString(), location: 'Nearby pub', description: 'Local band playing tonight', lat, lon },
      ];
    }
    return [];
  }
}
