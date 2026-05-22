/**
 * Simple geolocation and distance utilities for Nästa PWA.
 * Prioritizes minimal bundle size and architectural simplicity.
 */

let cachedPosition: [number, number] | null = null;
const distanceCache = new Map<string, number>();

/**
 * Returns the current position using a one-time request with a 4s timeout.
 * Fails silently by returning null on timeout, error, or abort.
 */
export async function getQuickLocation(signal?: AbortSignal): Promise<[number, number] | null> {
  if (cachedPosition) return cachedPosition;

  if (!navigator.geolocation) return null;

  return new Promise((resolve) => {
    const callback = (pos: GeolocationPosition) => {
      if (signal?.aborted) return resolve(null);
      cachedPosition = [pos.coords.latitude, pos.coords.longitude];
      resolve(cachedPosition);
    };
    navigator.geolocation.getCurrentPosition(
      callback,
      () => resolve(null),
      { timeout: 4000, enableHighAccuracy: false }
    );
    signal?.addEventListener('abort', () => resolve(null), { once: true });
  });
}

/**
 * Calculates Haversine distance between two points in km.
 */
function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns memoized distance in km between a stop and the user's location.
 * Computes once per stop per session.
 */
export function getMemoizedDistance(
  stopId: string,
  stopLat: number,
  stopLon: number,
  userLat: number,
  userLon: number
): number {
  const key = `${stopId}:${userLat.toFixed(4)}:${userLon.toFixed(4)}`;
  const cached = distanceCache.get(key);
  if (cached !== undefined) return cached;

  const dist = calculateHaversine(stopLat, stopLon, userLat, userLon);
  distanceCache.set(key, dist);
  return dist;
}

/**
 * Converts distance in km to a formatted string (e.g. "350m" or "1.2km").
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/**
 * Estimates walking time in minutes based on 1.3 m/s walking speed.
 */
export function getWalkingTime(km: number): number {
  const meters = km * 1000;
  const seconds = meters / 1.3;
  return Math.max(1, Math.round(seconds / 60));
}
