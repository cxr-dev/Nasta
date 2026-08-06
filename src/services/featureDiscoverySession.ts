import { fetchNearbyEvents, type EventItem } from './eventService';
import { fetchNearbyVenues, type Venue } from './venueService';

export type FeatureDiscoveryMode = 'beer' | 'wineCocktail' | 'events';

export interface FeatureDiscoveryQuery {
  lat: number;
  lon: number;
  mode: FeatureDiscoveryMode;
}

export const FEATURE_DISCOVERY_VENUE_RADIUS = 1200;
export const FEATURE_DISCOVERY_EVENT_RADIUS = 5000;

type FeatureDiscoveryItems<M extends FeatureDiscoveryMode> = M extends 'events' ? EventItem[] : Venue[];
type StoredResult = { expires: number; items: Venue[] | EventItem[] };

const resultCache = new Map<string, StoredResult>();
const inFlight = new Map<string, Promise<Venue[] | EventItem[]>>();
const VENUE_TTL = 30 * 60 * 1000;
const EVENT_TTL = 60 * 60 * 1000;

function queryKey({ lat, lon, mode }: FeatureDiscoveryQuery): string {
  return `${lat.toFixed(4)}:${lon.toFixed(4)}:${mode}`;
}

function ttlFor(mode: FeatureDiscoveryMode): number {
  return mode === 'events' ? EVENT_TTL : VENUE_TTL;
}

function readCached(query: FeatureDiscoveryQuery): StoredResult | undefined {
  const key = queryKey(query);
  const cached = resultCache.get(key);
  if (!cached) return undefined;
  if (cached.expires <= Date.now()) {
    resultCache.delete(key);
    return undefined;
  }
  return cached;
}

async function loadUncached(query: FeatureDiscoveryQuery): Promise<Venue[] | EventItem[]> {
  if (query.mode === 'events') {
    return fetchNearbyEvents(query.lat, query.lon, FEATURE_DISCOVERY_EVENT_RADIUS);
  }
  const types: Array<'beer' | 'wine' | 'cocktail'> = query.mode === 'beer' ? ['beer'] : ['wine', 'cocktail'];
  return fetchNearbyVenues(query.lat, query.lon, FEATURE_DISCOVERY_VENUE_RADIUS, types);
}

export function peekFeatureDiscovery<M extends FeatureDiscoveryMode>(
  query: FeatureDiscoveryQuery & { mode: M },
): FeatureDiscoveryItems<M> | undefined {
  return readCached(query)?.items as FeatureDiscoveryItems<M> | undefined;
}

export function loadFeatureDiscovery<M extends FeatureDiscoveryMode>(
  query: FeatureDiscoveryQuery & { mode: M },
): Promise<FeatureDiscoveryItems<M>>;
export function loadFeatureDiscovery(
  query: FeatureDiscoveryQuery,
): Promise<Venue[] | EventItem[]> {
  const cached = readCached(query);
  if (cached) return Promise.resolve(cached.items);

  const key = queryKey(query);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = loadUncached(query)
    .then((items) => {
      resultCache.set(key, { expires: Date.now() + ttlFor(query.mode), items });
      return items;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export async function prefetchFeatureDiscovery(
  query: FeatureDiscoveryQuery,
): Promise<void> {
  await loadFeatureDiscovery(query);
}
