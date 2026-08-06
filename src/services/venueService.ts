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
  hasOutdoorSeating?: boolean;
  isSpecificWine?: boolean;
  isSpecificCocktail?: boolean;
  imageUrl?: string;
  imageCredit?: string;
  imageSource?: string;
  imageResolvedAt?: number;
  /** @internal Used for type-based filtering/sorting */
  _classified?: "beer" | "wine" | "cocktail";
  /** @internal Used for relevance-based sorting */
  _score?: number;
};

function toHttpsImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('https://')) return value;
  if (value.startsWith('wikimedia_commons:')) {
    const file = value.slice('wikimedia_commons:'.length).trim();
    if (file) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  }
  return undefined;
}

import { distanceMeters } from "./geo";
import { persistentCache } from "./persistentCache";

const venuesInflight = new Map<string, Promise<Venue[]>>();
const _venuesCache = new Map<string, { expiry: number; data: Venue[] }>();
const MAX_VENUE_RESULTS = 12;
const OVERPASS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function readLocalOverpassCache(key: string): Venue[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.expires !== "number" || Date.now() > parsed.expires) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value as Venue[];
  } catch {
    return null;
  }
}

function writeLocalOverpassCache(key: string, value: Venue[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ expires: Date.now() + OVERPASS_CACHE_TTL, value }),
    );
  } catch {
    // ignore storage failures
  }
}

function roundCoordinate(value: number, resolution = 0.004) {
  return Number((Math.round(value / resolution) * resolution).toFixed(4));
}

/** Process a single Supabase API record into a Venue object */
function processSupabaseRecord(
  v: Record<string, any>,
  source: string,
  userLat: number,
  userLon: number,
): Venue | null {
  try {
    const vid = v.id ?? v.venue_id ?? v._id ?? Math.random().toString(36).slice(2, 9);
    const name = v.name ?? v.title ?? "Unknown";
    const addr = v.address ?? v.addr ?? undefined;
    const vlat = v.lat ?? v.latitude ?? v.lat_dd ?? v.center?.lat ?? null;
    const vlon = v.lon ?? v.longitude ?? v.lon_dd ?? v.center?.lon ?? null;
    const vlatNum = vlat !== null ? Number(vlat) : NaN;
    const vlonNum = vlon !== null ? Number(vlon) : NaN;
    const rawPrice = v.beer_price ?? v.wine_price ?? v.cocktail_price ?? v.price ?? v.beerPrice ?? undefined;
    const happy = v.beer_price_happy_hour ?? v.beer_price_happy ?? v.happy_hour_price ?? null;
    const drink = v.beer_name ?? v.wine_name ?? v.cocktail_name ?? v.beer ?? undefined;
    const priceLevel =
      typeof rawPrice === "number"
        ? rawPrice <= 35
          ? 1
          : rawPrice <= 55
            ? 2
            : 3
        : (v.price_level ?? v.priceLevel);
    const distance =
      !Number.isNaN(vlatNum) && !Number.isNaN(vlonNum)
        ? distanceMeters(userLat, userLon, vlatNum, vlonNum)
        : undefined;

    const venue: Venue = {
      id: `supabase-${vid}`,
      name,
      address: addr,
      lat: !Number.isNaN(vlatNum) ? vlatNum : undefined,
      lon: !Number.isNaN(vlonNum) ? vlonNum : undefined,
      openingHours: v.opening_hours ?? v.openingHours ?? undefined,
      priceLevel: priceLevel === undefined ? undefined : (priceLevel as 1 | 2 | 3),
      rawPrice: typeof rawPrice === "number" ? rawPrice : undefined,
      happyHourPrice: typeof happy === "number" ? happy : null,
      drinkName: drink,
      distance,
      source,
      imageUrl: toHttpsImage(v.image_url ?? v.imageUrl ?? v.photo_url ?? v.photoUrl),
      imageCredit: toHttpsImage(v.image_url ?? v.imageUrl ?? v.photo_url ?? v.photoUrl) ? source : undefined,
    };
    venue._classified = "beer";
    venue._score = 4;
    return venue;
  } catch {
    return null;
  }
}

function cacheKey(
  lat: number,
  lon: number,
  radius: number,
  types: Array<"beer" | "wine" | "cocktail">,
) {
  return `${roundCoordinate(lat)}-${roundCoordinate(lon)}-${radius}-${types.slice().sort().join(",")}`;
}

export async function fetchNearbyVenues(
  lat: number,
  lon: number,
  radius = 2000,
  types: Array<"beer" | "wine" | "cocktail"> = ["beer", "wine", "cocktail"],
  signal?: AbortSignal,
): Promise<Venue[]> {
  const key = cacheKey(lat, lon, radius, types);
  const now = Date.now();
  const cache = _venuesCache;
  const TTL = 30 * 60 * 1000;

  const cached = cache.get(key);
  if (cached && cached.expiry > now) return cached.data;

  const inflight = venuesInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    console.debug("venueService: fetchNearbyVenues", { lat, lon, radius, types });
    try {
      const localCacheKey = `nasta_venues_v2:${key}`;
      const localCache = readLocalOverpassCache(localCacheKey);
      if (localCache) return localCache;

      try {
        const p = await persistentCache.get(`venues_v2:${key}`);
        if (p) return p as Venue[];
      } catch (e) {}

      const results: Venue[] = [];
      const supabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as
        | string
        | undefined) ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6cmdxeGdzdWhvZ3J1a2lzZnJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjYxMjMsImV4cCI6MjA3ODUwMjEyM30.ck2Azg890FZQZI_IQ9AkpDWVOWjwZJ_4691GVxWZ4_o";
      const fallbackCityId =
        (import.meta.env.VITE_SUPABASE_DEFAULT_CITY_ID as string | undefined) ??
        "5a76887f-302e-4faf-9a39-520c4689f663";

      if (types.includes("beer")) {
        try {
          const supabaseBase =
            "https://izrgqxgsuhogrukisfrd.supabase.co/functions/v1";
          const url = `${supabaseBase}/get-venues`;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (supabaseAnon) headers.Authorization = `Bearer ${supabaseAnon}`;
          const body = JSON.stringify({ city_id: fallbackCityId, mode: "seo" });
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000);
          const combinedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
          const res = await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: combinedSignal,
          }).catch((_err) => {
            console.warn("venueService: supabase direct fetch failed", _err);
            return null as any;
          });
          clearTimeout(id);

          let supabaseProcessed = false;
          if (res && res.ok) {
            supabaseProcessed = true;
            console.debug(
              "venueService: supabase response ok; processing venues",
              url,
            );
            const payload = await res.json().catch(() => null);
            const list = Array.isArray(payload)
              ? payload
              : payload && Array.isArray(payload.venues)
                ? payload.venues
                : [];
            for (const v of list) {
              const venue = processSupabaseRecord(v, "supabase", lat, lon);
              if (venue) results.push(venue);
            }
          }

          // If the direct Supabase request failed (CORS or network), optionally retry via a CORS proxy.
          const useProxy = Boolean(import.meta.env.VITE_USE_CORS_PROXY);
          const proxyBase =
            (import.meta.env.VITE_CORS_PROXY_BASE as string | undefined) ??
            "https://corsproxy.io/?";
          if (!supabaseProcessed && useProxy) {
            try {
              console.debug(
                "venueService: supabase fetch failed, trying CORS proxy",
                proxyBase,
              );
              const proxyUrl = `${proxyBase}${encodeURIComponent(url)}`;
              const controller2 = new AbortController();
              const id2 = setTimeout(() => controller2.abort(), 8000);
              const combinedSignal2 = signal ? AbortSignal.any([controller2.signal, signal]) : controller2.signal;
              const res2 = await fetch(proxyUrl, {
                method: "POST",
                headers,
                body,
                signal: combinedSignal2,
              }).catch(() => null as any);
              clearTimeout(id2);
              if (res2 && res2.ok) {
                const payload = await res2.json().catch(() => null);
                const list = Array.isArray(payload)
                  ? payload
                  : payload && Array.isArray(payload.venues)
                    ? payload.venues
                    : [];
                for (const v of list) {
                  const venue = processSupabaseRecord(v, "supabase-proxy", lat, lon);
                  if (venue) results.push(venue);
                }
              }
            } catch (_e) {
              console.warn("venueService: supabase proxy fallback failed", _e);
            }
          }
        } catch (_e) {
          console.warn("venueService: supabase block failed", _e);
        }
      }

      let overpassQuerySucceeded = false;
      try {
        console.debug("venueService: preparing Overpass query");
        const beerOnly = types.length === 1 && types[0] === "beer";
        const wineOrCocktail = types.some(
          (t) => t === "wine" || t === "cocktail",
        );
        const queryRadius = Math.min(radius, beerOnly ? 2500 : 1500);
        let elements: any[] = [];
        const url = "https://overpass-api.de/api/interpreter";
        const useProxy = Boolean(import.meta.env.VITE_USE_CORS_PROXY);
        const proxyBase =
          (import.meta.env.VITE_CORS_PROXY_BASE as string | undefined) ??
          "https://corsproxy.io/?";

        const amenities = beerOnly
          ? [
              "bar",
              "pub",
              "restaurant",
              "nightclub",
              "cafe",
              "brewery",
              "taproom",
              "biergarten",
            ]
          : ["bar", "pub", "restaurant", "nightclub", "cafe"];
        const nameKeywords = beerOnly
          ? [
              "brew",
              "bryggeri",
              "bar",
              "inn",
              "arms",
              "head",
              "moon",
              "twist",
              "pub",
              "öl",
              "ölbar",
              "taproom",
            ]
          : [
              "vinbar",
              "wine bar",
              "vinbaren",
              "natural wine",
              "naturvin",
              "enoteca",
              "vino",
              "vinoteca",
              "wine lounge",
              "cave",
              "cellar",
              "bodega",
              "cocktailbar",
              "cocktail bar",
              "cocktail",
              "speakeasy",
              "mixology",
              "aperitivo",
              "lounge",
              "martini",
              "negroni",
              "highball",
            ];
        const qParts = [
          `node["amenity"~"${amenities.join("|")}"](around:${queryRadius},${lat},${lon});`,
          `way["amenity"~"${amenities.join("|")}"](around:${queryRadius},${lat},${lon});`,
          `rel["amenity"~"${amenities.join("|")}"](around:${queryRadius},${lat},${lon});`,
        ];

        qParts.push(
          `node["name"~"${nameKeywords.join("|")}",i](around:${queryRadius},${lat},${lon});`,
        );
        qParts.push(
          `way["name"~"${nameKeywords.join("|")}",i](around:${queryRadius},${lat},${lon});`,
        );
        qParts.push(
          `rel["name"~"${nameKeywords.join("|")}",i](around:${queryRadius},${lat},${lon});`,
        );

        if (!beerOnly) {
          qParts.push(
            `node["shop"~"wine|beverages"](around:${queryRadius},${lat},${lon});`,
          );
        } else {
          qParts.push(
            `node["shop"~"alcohol|beer|beverages"](around:${queryRadius},${lat},${lon});`,
          );
          qParts.push(
            `node["craft"="brewery"](around:${queryRadius},${lat},${lon});`,
          );
          qParts.push(
            `node["microbrewery"="yes"](around:${queryRadius},${lat},${lon});`,
          );
          qParts.push(
            `node["brewery"](around:${queryRadius},${lat},${lon});`,
          );
        }

        const q = `[out:json][timeout:20];(\n${qParts.join("\n")}\n);out center;`;

        const excludeNameKeywords = [
          "irish pub",
          "sports bar",
          "olearys",
          "bishop arms",
          "pitchers",
        ];

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000);
        const combinedSignal3 = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
        let res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: `data=${encodeURIComponent(q)}`,
          signal: combinedSignal3,
        }).catch(() => null as any);

        if ((!res || !res.ok) && useProxy) {
          try {
            const proxyUrl = `${proxyBase}${encodeURIComponent(url)}`;
            res = await fetch(proxyUrl, {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded;charset=UTF-8",
              },
              body: `data=${encodeURIComponent(q)}`,
              signal: combinedSignal3,
            }).catch(() => null as any);
          } catch {
            res = null as any;
          }
        }

        if (res && res.ok) {
          const payload = await res.json().catch(() => null);
          if (payload && Array.isArray(payload.elements)) {
            elements = payload.elements;
          }
          overpassQuerySucceeded = true;
        }
        clearTimeout(id);

        for (const el of elements) {
          const tags = el.tags ?? {};
          const elLat = el.lat ?? (el.center && el.center.lat) ?? null;
          const elLon = el.lon ?? (el.center && el.center.lon) ?? null;
          if (elLat === null || elLon === null) continue;
          const name = (tags.name ?? el.name ?? "").toString().trim();
          if (!name) continue;

          const lname = name.toLowerCase();
          const tagStr = Object.values(tags).join(" ").toLowerCase();
          if (
            /(sport=|live_music=yes|karaoke=yes|gambling=yes)/i.test(
              JSON.stringify(tags),
            )
          )
            continue;
          if (new RegExp(excludeNameKeywords.join("|"), "i").test(lname))
            continue;

          let score = 0;
          const typeScores = { wine: 0, cocktail: 0, beer: 0 };
          if (/\bbar=wine\b/.test(tagStr)) {
            score += 10;
            typeScores.wine += 10;
          }
          if (
            /\bcocktail=yes\b/.test(tagStr) ||
            /\bdrink:cocktail=yes\b/.test(tagStr)
          ) {
            score += 10;
            typeScores.cocktail += 10;
          }
          if (
            /\bwine=yes\b/.test(tagStr) ||
            /\bdrink:wine=yes\b/.test(tagStr)
          ) {
            score += 8;
            typeScores.wine += 8;
          }
          if (
            /(vinbar|wine bar|vinbaren|naturvin|natural wine|enoteca|vino|vinoteca|wine lounge|cave|cellar|bodega)/i.test(
              lname,
            )
          ) {
            score += 8;
            typeScores.wine += 8;
          }
          if (
            /(cocktail|speakeasy|mixology|aperitivo|lounge|martini|negroni|highball)/i.test(
              lname,
            )
          ) {
            score += 8;
            typeScores.cocktail += 8;
          }

          // 2. Pubs and beer bars (beer category)
          if (
            /(bryggeri|brewery|pub|öl|ölbar|taproom|biergarten|beer|ale|stout|ipa|lager|craft|microbrew|inn|arms)/i.test(lname) ||
            /\bbar\b/i.test(lname) ||
            tags.amenity === "pub" ||
            tags.amenity === "biergarten" ||
            tags.amenity === "bar"
          ) {
            score += 4;
            typeScores.beer += 4;
          }

          // 3. Upscale / Fancy / Premium restaurants & bars (gets medium scores so they rank beautifully under generic Wine/Cocktail views)
          const cuisine = String(tags.cuisine ?? "").toLowerCase();
          const isFancyCuisine = /(fine_dining|french|italian|tapas|spanish|bistrot|bistro|seafood|mediterranean|brasserie)/i.test(cuisine);
          const nameFancyKeyword = /(bistrot|bistro|brasserie|gastropub|dining|takbar|roof|lounge|krog|grill|restaurang)/i.test(lname);
          
          if (tags.amenity === "restaurant") {
            if (isFancyCuisine || nameFancyKeyword) {
              score += 5; // Fancy dining gets a strong boost
            } else {
              score += 1; // Generic restaurant gets a tiny boost
            }
          }
          
          if (tags.amenity === "bar") {
            score += 4; // Baseline boost for generic drink spots
            if (isFancyCuisine || nameFancyKeyword) {
              score += 4; // Premium/fancy bars get more
            }
          }

          if (tags.outdoor_seating === "yes" || tags.terrace === "yes") {
            score += 3;
          }
          if (tags.reservation === "yes" || tags.booking === "yes") {
            score += 2;
          }
          if (
            tags.internet_access === "wlan" ||
            tags.internet_access === "wifi"
          ) {
            score += 1;
          }
          if (tags.smoking === "no") {
            score += 1;
          }
          if (tags.wheelchair === "yes") {
            score += 1;
          }
          if (
            tags.opening_hours &&
            /2[2-4]|23:|00:|01:/.test(tags.opening_hours)
          ) {
            score += 2;
          }
          if (
            /(cuisine=(italian|french|tapas|small_plates))/i.test(
              JSON.stringify(tags),
            )
          ) {
            score += 2;
          }
          if (/(sport=|sports=|sports_bar|irish pub)/i.test(tagStr)) {
            score -= 10;
          }
          if (tags.live_music === "yes") {
            score -= 8;
          }
          if (tags.karaoke === "yes") {
            score -= 8;
          }

          const distance = distanceMeters(
            lat,
            lon,
            Number(elLat),
            Number(elLon),
          );

          let classified: "beer" | "wine" | "cocktail" | undefined = undefined;
          if (typeScores.wine > 0 || typeScores.cocktail > 0 || typeScores.beer > 0) {
            const highest = Object.entries(typeScores).sort(
              (a, b) => b[1] - a[1],
            )[0];
            // Only classify if it strictly meets a strong score to keep generic upscale places unclassified
            if (highest && highest[1] >= 8) {
              classified = highest[0] as "beer" | "wine" | "cocktail";
            } else if (highest && highest[0] === "beer" && highest[1] > 0) {
              // Pubs/breweries easily classify as beer
              classified = "beer";
            }
          }
          
          if (!classified && tags.amenity === "pub") {
            classified = "beer";
          }

          const normalizedBar = String(tags.bar ?? "").toLowerCase();
          const normalizedCuisine = String(tags.cuisine ?? "").toLowerCase();
          const nameWineKeyword =
            /(?:vinbar|wine bar|vinbaren|naturvin|natural wine|enoteca|vino|vinoteca|wine lounge|bistrot)/i.test(
              name,
            );
          const nameCocktailKeyword =
            /(?:cocktail|cocktailbar|cocktail bar|speakeasy|mixology|aperitivo|martini|negroni|highball)/i.test(
              name,
            );
          const hasWineTag =
            normalizedBar === "wine" || normalizedCuisine === "wine";
          const hasCocktailTag =
            normalizedBar === "cocktail" || normalizedCuisine === "cocktail";
          const isSpecificWine =
            (hasWineTag || nameWineKeyword) &&
            !hasCocktailTag &&
            !nameCocktailKeyword;
          const isSpecificCocktail =
            (hasCocktailTag || nameCocktailKeyword) &&
            !hasWineTag &&
            !nameWineKeyword;
          const hasOutdoorSeating =
            /^(?:yes|true)$/i.test(String(tags.outdoor_seating ?? "")) ||
            /^(?:yes|terrace)$/i.test(String(tags.terrace ?? ""));

          results.push({
            id: `osm-${el.id}`,
            name,
            lat: Number(elLat),
            lon: Number(elLon),
            openingHours: tags.opening_hours ?? undefined,
            distance,
            source: "overpass",
            imageUrl: toHttpsImage(tags.image ?? tags.wikimedia_commons),
            imageCredit: toHttpsImage(tags.image ?? tags.wikimedia_commons)
              ? tags.wikimedia_commons ? 'Wikimedia Commons' : 'OpenStreetMap'
              : undefined,
            hasOutdoorSeating,
            isSpecificWine,
            isSpecificCocktail,
          });
          const last = results[results.length - 1];
          last._classified = classified;
          last._score = score;
        }
      } catch (_e) {
        console.warn("venueService: Overpass query failed", _e);
      }

      const uniq: Venue[] = [];
      for (const v of results) {
        const name = v.name.trim().toLowerCase();
        const dup = uniq.find(
          (u) =>
            u.name.trim().toLowerCase() === name &&
            Math.abs((u.distance ?? 0) - (v.distance ?? 0)) < 50,
        );
        if (dup) {
          if (v.source === "supabase") {
            // Overpass entry is authoritative — just overlay pricing
            dup.rawPrice = v.rawPrice;
            dup.drinkName = v.drinkName;
            dup.happyHourPrice = v.happyHourPrice;
          } else if (dup.source === "supabase" || dup.source === "supabase-proxy") {
            // v is Overpass, dup is Supabase — replace metadata, keep pricing
            const price = dup.rawPrice;
            const drink = dup.drinkName;
            const happy = dup.happyHourPrice;
            Object.assign(dup, v);
            dup.rawPrice = price;
            dup.drinkName = drink;
            dup.happyHourPrice = happy;
          }
        } else {
          uniq.push(v);
        }
      }

      const out = uniq
        .filter((v) => {
          const cls = v._classified;
          if (!types || types.length === 0) return true;
          if (!cls) return true;
          return types.includes(cls);
        })
        .sort((a, b) => {
          const sa = a._score ?? 0;
          const sb = b._score ?? 0;
          if (sb !== sa) return sb - sa;
          return (a.distance ?? 0) - (b.distance ?? 0);
        })
        .slice(0, MAX_VENUE_RESULTS);

      // If Overpass was needed (wine/cocktail) and failed, and no other data source
      // provided results, throw so UI shows error card with retry instead of "No venues found"
      const needsOverpass = types.some((t) => t === "wine" || t === "cocktail");
      if (needsOverpass && !overpassQuerySucceeded && out.length === 0) {
        throw new Error("Wine/cocktail venue query failed");
      }

      const shouldPersist =
        overpassQuerySucceeded ||
        results.some(
          (r) => r.source === "supabase" || r.source === "supabase-proxy",
        );

      if (shouldPersist) {
        cache.set(key, { expiry: now + TTL, data: out });
        writeLocalOverpassCache(localCacheKey, out);
        try {
          await persistentCache.set(
            `venues_v2:${key}`,
            out,
            7 * 24 * 60 * 60 * 1000,
          );
        } catch (e) {}
      }
      return out;
    } finally {
      venuesInflight.delete(key);
    }
  })();

  venuesInflight.set(key, request);
  return request;
}
