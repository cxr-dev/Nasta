export type Venue = {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  address?: string;
  openingHours?: string;
  priceLevel?: 1 | 2 | 3;
  rawPrice?: number; // numeric price from provider (e.g., SEK)
  drinkName?: string;
  happyHourPrice?: number | null;
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
  // In-memory cache
  const key = `${lat.toFixed(4)}-${lon.toFixed(4)}-${types.slice().sort().join(',')}-${radius}`;
  const now = Date.now();
  (fetchNearbyVenues as any)._cache = (fetchNearbyVenues as any)._cache || new Map();
  const cache = (fetchNearbyVenues as any)._cache as Map<string, { expiry: number; data: Venue[] }>;
  const TTL = 30 * 60 * 1000;
  const cached = cache.get(key);
  if (cached && cached.expiry > now) return cached.data;

  const results: Venue[] = [];

  // 1) Try Supabase function for beer (fast, provides price levels)
  if (types.includes('beer')) {
    try {
      const supabaseBase = 'https://izrgqxgsuhogrukisfrd.supabase.co/functions/v1';
      const url = `${supabaseBase}/get-venues`;
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (anon) headers.Authorization = `Bearer ${anon}`;

      const body = JSON.stringify({ lat, lon, radius, type: 'beer' });
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        // Example response uses payload.venues
        const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.venues) ? payload.venues : []);
        for (const v of list) {
          try {
            const vid = v.id ?? v.venue_id ?? v._id ?? Math.random().toString(36).slice(2,9);
            const name = v.name ?? v.title ?? 'Unknown';
            const addr = v.address ?? v.addr ?? undefined;
            const vlat = v.lat ?? v.latitude ?? v.lat_dd ?? v.center?.lat ?? null;
            const vlon = v.lon ?? v.longitude ?? v.lon_dd ?? v.center?.lon ?? null;
            const vlatNum = vlat !== null ? Number(vlat) : NaN;
            const vlonNum = vlon !== null ? Number(vlon) : NaN;

            const rawPrice = v.beer_price ?? v.price ?? v.beerPrice ?? undefined;
            const happy = v.beer_price_happy_hour ?? v.beer_price_happy ?? null;
            const drink = v.beer_name ?? v.beer ?? undefined;

            const priceLevel = typeof rawPrice === 'number'
              ? rawPrice <= 35 ? 1 : rawPrice <= 55 ? 2 : 3
              : (v.price_level ?? v.priceLevel ?? 2);

            const distance = (!Number.isNaN(vlatNum) && !Number.isNaN(vlonNum)) ? haversineDistance(lat, lon, vlatNum, vlonNum) : undefined;

            results.push({
              id: `supabase-${vid}`,
              name,
              address: addr,
              lat: !Number.isNaN(vlatNum) ? vlatNum : undefined,
              lon: !Number.isNaN(vlonNum) ? vlonNum : undefined,
              openingHours: v.opening_hours ?? v.openingHours ?? undefined,
              priceLevel: priceLevel as 1|2|3,
              rawPrice: typeof rawPrice === 'number' ? rawPrice : undefined,
              happyHourPrice: typeof happy === 'number' ? happy : null,
              drinkName: drink,
              distance,
              source: 'supabase',
            });
          } catch (e) {
            // skip malformed
          }
        }
      }
    } catch (e) {
      // ignore supabase failure and fall back to Overpass below
    }
  }

  // 2) Use Overpass for requested types (wine/cocktail) and as fallback
  try {
    const amenities = ['bar','pub','restaurant'];
    const q = `[out:json][timeout:25];(\n  node["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n  way["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n  rel["amenity"~"${amenities.join('|')}"](around:${radius},${lat},${lon});\n);out center;`;
    const url = 'https://overpass-api.de/api/interpreter';

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(q)}`,
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const payload = await res.json().catch(() => null);
      if (payload && Array.isArray(payload.elements)) {
        for (const el of payload.elements) {
          const tags = el.tags ?? {};
          const elLat = el.lat ?? (el.center && el.center.lat) ?? null;
          const elLon = el.lon ?? (el.center && el.center.lon) ?? null;
          if (elLat === null || elLon === null) continue;
          const name = (tags.name ?? el.name ?? '').trim();
          if (!name) continue;

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
          const venue: Venue = {
            id: `osm-${el.id}`,
            name,
            lat: Number(elLat),
            lon: Number(elLon),
            openingHours: tags.opening_hours ?? undefined,
            priceLevel: 2,
            distance,
            source: 'overpass',
          };
          (venue as any)._classified = classified;
          results.push(venue);
        }
      }
    }
  } catch (e) {
    // ignore overpass errors
  }

  // deduplicate by name + prox
  const uniq: Venue[] = [];
  for (const v of results) {
    const name = v.name.trim().toLowerCase();
    const dup = uniq.find(u => u.name.trim().toLowerCase() === name && Math.abs((u.distance ?? 0) - (v.distance ?? 0)) < 50);
    if (dup) {
      // prefer supabase
      if (v.source === 'supabase') Object.assign(dup, v);
    } else {
      uniq.push(v);
    }
  }

  const out = uniq.filter(v => {
    const cls = (v as any)._classified as ('beer'|'wine'|'cocktail') | undefined;
    if (!types || types.length === 0) return true;
    if (!cls) return true;
    return types.includes(cls);
  }).sort((a,b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 12);

  cache.set(key, { expiry: now + TTL, data: out });
  return out;
}
