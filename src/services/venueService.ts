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

import { persistentCache } from './persistentCache';

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
  // check persistent cache (venues cached longer)
  try {
    const p = await persistentCache.get(`venues:${key}`);
    if (p) return p as Venue[];
  } catch (e) {}

  const results: Venue[] = [];

  // 1) Try Supabase function for beer (fast, provides price levels)
  if (types.includes('beer')) {
    const supabaseBase = 'https://izrgqxgsuhogrukisfrd.supabase.co/functions/v1';
    const url = `${supabaseBase}/get-venues`;
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (anon) headers.Authorization = `Bearer ${anon}`;
    const fallbackCityId = (import.meta.env.VITE_SUPABASE_DEFAULT_CITY_ID as string | undefined) ?? '5a76887f-302e-4faf-9a39-520c4689f663';

    try {
      // If a fallback city id is configured, prefer that request shape to avoid 400
      const tryBody = fallbackCityId ? JSON.stringify({ city_id: fallbackCityId, mode: 'seo' }) : JSON.stringify({ lat, lon, radius, type: 'beer' });
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method: 'POST', headers, body: tryBody, signal: controller.signal });
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
      } else {
        // handle 400 that requires city_id by retrying with fallbackCityId
        if (res.status === 400) {
          const text = await res.text().catch(() => '');
          if (/city_id/i.test(text) || /city_id is required/i.test(text)) {
            const retryBody = JSON.stringify({ city_id: fallbackCityId, mode: 'seo' });
            const retryController = new AbortController();
            const rid = setTimeout(() => retryController.abort(), 8000);
            const retryRes = await fetch(url, { method: 'POST', headers, body: retryBody, signal: retryController.signal }).catch(() => null);
            clearTimeout(rid);
            if (retryRes && retryRes.ok) {
              const payload = await retryRes.json().catch(() => null);
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
                } catch (ee) {
                  // skip
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore supabase failure and fall back to Overpass below
    }
  }

  // 2) Use Overpass for requested types (wine/cocktail) and as fallback
  try {
    // broaden Overpass query and add name-keyword matching + ranking signals
    const amenities = ['bar','pub','restaurant','nightclub','cafe'];
    const nameKeywords = [
      'vinbar','wine bar','vinbaren','natural wine','naturvin','enoteca','vino','vinoteca','wine lounge','cave','cellar','bodega',
      'cocktailbar','cocktail bar','cocktail','speakeasy','mixology','aperitivo','lounge','martini','negroni','highball'
    ].map(s => s.replace(/\"/g, ''));

    const excludeNameKeywords = ['irish pub','sports bar','olearys','bishop arms','pitchers'];

    const maxRadius = 5000;
    const radii = [radius, Math.min(Math.round(radius * 1.5), maxRadius), Math.min(radius * 2, maxRadius), maxRadius];
    let elements: any[] = [];
    const url = 'https://overpass-api.de/api/interpreter';

    for (const r of radii) {
      // build an Overpass query that fetches amenities and also any elements with name matching our keywords
      const q = `[out:json][timeout:25];(\n  node["amenity"~"${amenities.join('|')}"](around:${r},${lat},${lon});\n  way["amenity"~"${amenities.join('|')}"](around:${r},${lat},${lon});\n  rel["amenity"~"${amenities.join('|')}"](around:${r},${lat},${lon});\n  node["shop"~"wine|beverages"](around:${r},${lat},${lon});\n  node["name"~"${nameKeywords.join('|')}",i](around:${r},${lat},${lon});\n  way["name"~"${nameKeywords.join('|')}",i](around:${r},${lat},${lon});\n  rel["name"~"${nameKeywords.join('|')}",i](around:${r},${lat},${lon});\n);out center;`;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(q)}`,
        signal: controller.signal,
      }).catch(() => null as any);
      clearTimeout(id);

      if (!res) continue;
      if (!res.ok) {
        // if server responds but empty or 4xx/5xx, try next radius
        continue;
      }

      const payload = await res.json().catch(() => null);
      if (payload && Array.isArray(payload.elements) && payload.elements.length > 0) {
        elements = payload.elements;
        break; // stop at first radius that returns results
      }
    }

    if (elements.length) {
      for (const el of elements) {
        const tags = el.tags ?? {};
        const elLat = el.lat ?? (el.center && el.center.lat) ?? null;
        const elLon = el.lon ?? (el.center && el.center.lon) ?? null;
        if (elLat === null || elLon === null) continue;
        const name = (tags.name ?? el.name ?? '').toString().trim();
        if (!name) continue;

        const lname = name.toLowerCase();
        const tagStr = Object.values(tags).join(' ').toLowerCase();

        // Negative filters: skip obvious sports/irish/splashy pub cases
        if (/(sport=|live_music=yes|karaoke=yes|gambling=yes)/i.test(JSON.stringify(tags))) continue;
        if (new RegExp(excludeNameKeywords.join('|'), 'i').test(lname)) continue;

        // Scoring system (heuristic)
        let score = 0;
        const typeScores = { wine: 0, cocktail: 0, beer: 0 };

        // Positive signals
        if (/\bbar=wine\b/.test(tagStr)) { score += 10; typeScores.wine += 10; }
        if (/\bcocktail=yes\b/.test(tagStr) || /\bdrink:cocktail=yes\b/.test(tagStr)) { score += 10; typeScores.cocktail += 10; }
        if (/\bwine=yes\b/.test(tagStr) || /\bdrink:wine=yes\b/.test(tagStr)) { score += 8; typeScores.wine += 8; }
        if (/(vinbar|wine bar|vinbaren|naturvin|natural wine|enoteca|vinoteca|vino|wine lounge|cave|cellar|bodega)/i.test(lname)) { score += 8; typeScores.wine += 8; }
        if (/(cocktail|speakeasy|mixology|aperitivo|martini|negroni|highball)/i.test(lname)) { score += 8; typeScores.cocktail += 8; }
        if (/(bryggeri|brewery|pub|öl|ölbar|taproom)/i.test(lname) || tags.amenity === 'pub') { score += 4; typeScores.beer += 4; }

        // Semantic quality indicators
        if (tags.outdoor_seating === 'yes' || tags.terrace === 'yes') { score += 3; }
        if (tags.reservation === 'yes' || tags.booking === 'yes') { score += 2; }
        if (tags.internet_access === 'wlan' || tags.internet_access === 'wifi') { score += 1; }
        if (tags.smoking === 'no') { score += 1; }
        if (tags.wheelchair === 'yes') { score += 1; }
        if (tags.opening_hours && /2[2-4]|23:|00:|01:/.test(tags.opening_hours)) { score += 2; }
        if (/(cuisine=(italian|french|tapas|small_plates))/i.test(JSON.stringify(tags))) { score += 2; }

        // Negative signals
        if (/(sport=|sports=|sports_bar|irish pub)/i.test(tagStr)) { score -= 10; }
        if (tags.live_music === 'yes') { score -= 8; }
        if (tags.karaoke === 'yes') { score -= 8; }

        const distance = haversineDistance(lat, lon, Number(elLat), Number(elLon));

        // Determine a soft classification from typeScores (only if clear)
        let classified: 'beer' | 'wine' | 'cocktail' | undefined = undefined;
        const highest = Object.entries(typeScores).sort((a,b) => b[1]-a[1])[0];
        if (highest && highest[1] >= 8) {
          classified = highest[0] as 'beer'|'wine'|'cocktail';
        }

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
        (venue as any)._score = score;
        (venue as any)._typeScores = typeScores;
        results.push(venue);
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
  }).sort((a,b) => {
    const sa = (a as any)._score ?? 0;
    const sb = (b as any)._score ?? 0;
    if (sb !== sa) return sb - sa; // higher score first
    return (a.distance ?? 0) - (b.distance ?? 0);
  }).slice(0, 12);

  cache.set(key, { expiry: now + TTL, data: out });
  try { await persistentCache.set(`venues:${key}`, out, 7 * 24 * 60 * 60 * 1000); } catch (e) {}
  return out;
}
