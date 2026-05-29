export type Venue = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  openingHours?: string;
  priceLevel?: 1 | 2 | 3;
  distance?: number;
  source?: string;
};

function haversineDistance(lat1:number, lon1:number, lat2:number, lon2:number){
  const toRad = (v:number) => (v * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function fetchNearbyVenues(
  lat: number,
  lon: number,
  radius = 2000,
  types: Array<'beer' | 'wine' | 'cocktail'> = ['beer', 'wine', 'cocktail']
): Promise<Venue[]> {
  // Use Overpass API (OpenStreetMap) as primary source — no API key required.
  const amenities = ['bar','pub','restaurant'];
  const q = `[out:json][timeout:25];(\n  node["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n  way["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n  rel["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n);out center;`;
  const url = 'https://overpass-api.de/api/interpreter';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(q)}`,
    });

    if (!res.ok) return [];
    const payload = await res.json().catch(() => null);
    if (!payload || !Array.isArray(payload.elements)) return [];

    const venues: Venue[] = [];
    for (const el of payload.elements) {
      const tags = el.tags ?? {};
      const elLat = el.lat ?? (el.center && el.center.lat) ?? null;
      const elLon = el.lon ?? (el.center && el.center.lon) ?? null;
      if (elLat === null || elLon === null) continue;
      const name = (tags.name ?? el.name ?? '').trim();
      if (!name) continue;

      // Classify type heuristically
      const lname = name.toLowerCase();
      let classified: 'beer' | 'wine' | 'cocktail' = 'beer';
      if ((tags.bar && String(tags.bar).toLowerCase().includes('wine')) || /\b(wine|vin|vino|vinbar)\b/i.test(lname)) {
        classified = 'wine';
      } else if ((tags.bar && String(tags.bar).toLowerCase().includes('cocktail')) || /\b(cocktail|speakeasy|lounge|mixology)\b/i.test(lname)) {
        classified = 'cocktail';
      } else if (tags.amenity === 'pub' || tags.pint) {
        classified = 'beer';
      } else if (/(bryggeri|brewery|pub|öl|ölbar|taproom)/i.test(lname)) {
        classified = 'beer';
      }

      const distance = haversineDistance(lat, lon, Number(elLat), Number(elLon));
      venues.push({
        id: `osm-${el.id}`,
        name,
        lat: Number(elLat),
        lon: Number(elLon),
        openingHours: tags.opening_hours ?? undefined,
        priceLevel: 2,
        distance,
        source: 'overpass',
      });

      // attach internal classification for filtering later
      (venues[venues.length - 1] as any)._classified = classified;
    }

    // Filter by requested types when possible (best-effort) and sort by distance
    const filtered = venues
      .filter(v => !!v.name)
      .filter(v => {
        const cls = (v as any)._classified as ('beer'|'wine'|'cocktail') | undefined;
        if (!cls) return true;
        return types.includes(cls);
      })
      .sort((a,b) => (a.distance ?? 0) - (b.distance ?? 0));

    return filtered.slice(0, 12);
  } catch (e) {
    // On any failure, return empty list — UI will show a friendly empty state
    return [];
  }
}
