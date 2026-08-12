import { persistentCache } from './persistentCache';
import { distanceMeters } from './geo';
import type { Coord, NearbyStopQuery, TransitStopSearchResult, TransportMode } from '../types/transit';

const SITE_CATALOG_URL = 'https://transport.integration.sl.se/v1/sites';
const CACHE_KEY = 'nearby:sl-sites:v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CATALOG_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

type CachedCatalog = { fetchedAt: number; stops: TransitStopSearchResult[] };
let catalogPromise: Promise<TransitStopSearchResult[]> | null = null;

const modeMap: Record<string, TransportMode> = {
  BUS: 'bus', METRO: 'metro', TRAIN: 'train', TRAM: 'tram', FERRY: 'boat', SHIP: 'boat', BOAT: 'boat',
};

function toModes(value: unknown): TransportMode[] {
  const names: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') names.push(item);
      else if (item && typeof item === 'object' && typeof (item as { transport_mode?: unknown }).transport_mode === 'string') {
        names.push((item as { transport_mode: string }).transport_mode);
      }
    }
  }
  return [...new Set(names.map((name) => modeMap[name.toUpperCase()]).filter(Boolean))];
}

function parseCatalog(value: unknown): TransitStopSearchResult[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const source = row as Record<string, unknown>;
    const id = typeof source.id === 'number' || typeof source.id === 'string' ? String(source.id) : '';
    const name = typeof source.name === 'string' ? source.name : '';
    const lat = typeof source.lat === 'number' ? source.lat : undefined;
    const lon = typeof source.lon === 'number' ? source.lon : undefined;
    if (!id || !name || lat == null || lon == null) return [];
    const modes = toModes(source.transport_modes ?? source.modes ?? source.lines);
    return [{
      id: `sl:${id}`,
      name,
      coord: [lat, lon] as Coord,
      modes: modes.length > 0 ? modes : ['bus'],
      relevance: 0,
      locationType: 'station',
      locality: typeof source.locality === 'string' ? source.locality : undefined,
      providerMetadata: { siteId: id },
    }];
  });
}

async function fetchCatalog(signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
  const response = await fetch(SITE_CATALOG_URL, { signal });
  if (!response.ok) throw new Error(`SL sites request failed (${response.status})`);
  return parseCatalog(await response.json());
}

async function loadCatalog(signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
  const cached = await persistentCache.get(CACHE_KEY) as CachedCatalog | null;
  if (cached?.stops?.length && Date.now() - cached.fetchedAt < CATALOG_FRESH_MS) return cached.stops;

  try {
    const stops = await fetchCatalog(signal);
    await persistentCache.set(CACHE_KEY, { fetchedAt: Date.now(), stops }, CACHE_TTL_MS);
    return stops;
  } catch (error) {
    if (cached?.stops?.length) return cached.stops;
    throw error;
  }
}

export async function getNearbyStops(query: NearbyStopQuery, signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog(signal).finally(() => { catalogPromise = null; });
  }
  const catalog = await catalogPromise;
  return catalog
    .map((stop) => ({
      ...stop,
      distance: stop.coord ? distanceMeters(query.origin[0], query.origin[1], stop.coord[0], stop.coord[1]) : undefined,
    }))
    .filter((stop) => stop.distance != null && stop.distance <= query.radiusMeters)
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, query.limit);
}

export function clearNearbyCatalogCache(): Promise<void> {
  catalogPromise = null;
  return persistentCache.remove(CACHE_KEY);
}

export { parseCatalog };
