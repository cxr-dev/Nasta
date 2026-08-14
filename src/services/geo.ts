/**
 * Simple geolocation and distance utilities for Nästa PWA.
 * Prioritizes minimal bundle size and architectural simplicity.
 */

export type LocationAccessState = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported';

export interface LocationSnapshot {
  position: [number, number] | null;
  /** Browser-reported horizontal accuracy in meters, when available. */
  accuracy: number | null;
  isLoading: boolean;
  access: LocationAccessState;
}

let locationSnapshot: LocationSnapshot = {
  position: null,
  accuracy: null,
  isLoading: false,
  access: 'unknown',
};
let locationRequest: Promise<[number, number] | null> | null = null;
let sessionGeneration = 0;
const locationListeners = new Set<(snapshot: LocationSnapshot) => void>();
const distanceCache = new Map<string, number>();

function publishLocationSnapshot(next: LocationSnapshot) {
  locationSnapshot = next;
  for (const listener of locationListeners) listener(locationSnapshot);
}

function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

async function getBrowserLocationAccess(): Promise<LocationAccessState> {
  if (!hasGeolocation()) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';

  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'unknown';
  }
}

function startLocationRequest(): Promise<[number, number] | null> {
  const requestGeneration = sessionGeneration;
  let failureAccess: LocationAccessState = 'unknown';
  let requestAccuracy: number | null = null;

  publishLocationSnapshot({ ...locationSnapshot, isLoading: true });
  const request = new Promise<[number, number] | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        requestAccuracy = Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
          ? position.coords.accuracy
          : null;
        resolve([position.coords.latitude, position.coords.longitude]);
      },
      (error) => {
        failureAccess = error.code === 1 ? 'denied' : 'unknown';
        resolve(null);
      },
      { timeout: 4000, enableHighAccuracy: false },
    );
  });

  locationRequest = request;
  void request.then((position) => {
    if (requestGeneration !== sessionGeneration) return;
    publishLocationSnapshot({
      position,
      accuracy: position ? requestAccuracy : null,
      isLoading: false,
      access: position ? 'granted' : failureAccess,
    });
  }).finally(() => {
    if (locationRequest === request) locationRequest = null;
  });

  return request;
}

/** Returns the shared in-memory location state without exposing persistent coordinates. */
export function getLocationSnapshot(): LocationSnapshot {
  return locationSnapshot;
}

/** Subscribes to shared location changes. The current state is delivered immediately. */
export function subscribeToLocation(listener: (snapshot: LocationSnapshot) => void): () => void {
  locationListeners.add(listener);
  listener(locationSnapshot);
  return () => locationListeners.delete(listener);
}

/**
 * Requests the current location. Concurrent callers share one browser request, and callers that
 * unmount do not cancel the request for other consumers.
 */
export function requestLocation(): Promise<[number, number] | null> {
  if (locationSnapshot.position) return Promise.resolve(locationSnapshot.position);
  if (locationRequest) return locationRequest;
  if (!hasGeolocation()) {
    publishLocationSnapshot({ position: null, accuracy: null, isLoading: false, access: 'unsupported' });
    return Promise.resolve(null);
  }
  return startLocationRequest();
}

/**
 * Restores location for an enabled app setting. A prompt state may request the native platform
 * permission dialog on cold PWA activation; denied and unsupported states remain short-circuited.
 */
export async function loadGrantedLocation(): Promise<[number, number] | null> {
  if (locationSnapshot.position) return locationSnapshot.position;
  if (locationRequest) return locationRequest;

  publishLocationSnapshot({ ...locationSnapshot, isLoading: true });
  const access = await getBrowserLocationAccess();
  if (access === 'denied' || access === 'unsupported') {
    publishLocationSnapshot({ ...locationSnapshot, isLoading: false, access });
    return null;
  }
  if (access !== locationSnapshot.access) publishLocationSnapshot({ ...locationSnapshot, access });
  return requestLocation();
}

/** Clears the in-memory position when the user disables Platsjänster. */
export function clearLocationSession() {
  sessionGeneration += 1;
  locationRequest = null;
  publishLocationSnapshot({ position: null, accuracy: null, isLoading: false, access: 'unknown' });
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
 * Haversine distance in meters - shared with venue/event services.
 */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(calculateHaversine(lat1, lon1, lat2, lon2) * 1000);
}

/**
 * Returns whether a displayed distance is meaningful relative to the browser's
 * reported location uncertainty. A missing accuracy value keeps legacy/browser
 * fallback behavior because the platform did not provide enough information to
 * make a stronger decision.
 */
export function isDistanceReliable(distanceInMeters: number, accuracyInMeters: number | null): boolean {
  if (!Number.isFinite(distanceInMeters) || distanceInMeters < 0) return false;
  if (accuracyInMeters == null || !Number.isFinite(accuracyInMeters) || accuracyInMeters < 0) return true;
  return accuracyInMeters < distanceInMeters * 0.5;
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
