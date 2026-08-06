import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearLocationSession,
  distanceMeters,
  getLocationSnapshot,
  getMemoizedDistance,
  formatDistance,
  getWalkingTime,
  loadGrantedLocation,
  requestLocation,
  subscribeToLocation,
} from './geo';

function setGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
}

function setPermission(state: PermissionState | undefined) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state === undefined ? undefined : { query: vi.fn().mockResolvedValue({ state }) },
  });
}

beforeEach(() => {
  clearLocationSession();
  setPermission(undefined);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearLocationSession();
});

describe('distanceMeters', () => {
  it('returns 0 for same point', () => {
    expect(distanceMeters(59.33, 18.06, 59.33, 18.06)).toBe(0);
  });

  it('calculates distance between Stockholm and Gothenburg', () => {
    const dist = distanceMeters(59.33, 18.06, 57.71, 11.97);
    expect(dist).toBeGreaterThan(390_000);
    expect(dist).toBeLessThan(400_000);
  });

  it('calculates short distances accurately', () => {
    const dist = distanceMeters(59.33, 18.06, 59.331, 18.061);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);
  });

  it('is symmetric', () => {
    const a = distanceMeters(59.33, 18.06, 57.71, 11.97);
    const b = distanceMeters(57.71, 11.97, 59.33, 18.06);
    expect(a).toBe(b);
  });

  it('rounds to nearest integer meter', () => {
    const result = distanceMeters(59.33, 18.06, 59.3301, 18.0601);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('getMemoizedDistance', () => {
  it('returns distance in km for a stop', () => {
    const dist = getMemoizedDistance('1001', 59.33, 18.06, 59.331, 18.061);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });

  it('returns cached result for same coordinates', () => {
    const a = getMemoizedDistance('1002', 59.33, 18.06, 59.34, 18.07);
    const b = getMemoizedDistance('1002', 59.33, 18.06, 59.34, 18.07);
    expect(a).toBe(b);
  });

  it('returns different results for different stop IDs', () => {
    const a = getMemoizedDistance('s1', 59.33, 18.06, 59.34, 18.07);
    const b = getMemoizedDistance('s2', 59.33, 18.06, 59.34, 18.08);
    expect(a).not.toBe(b);
  });
});

describe('formatDistance', () => {
  it('formats under 1km as meters', () => {
    expect(formatDistance(0.35)).toBe('350m');
  });

  it('formats over 1km as km with one decimal', () => {
    expect(formatDistance(1.2)).toBe('1.2km');
  });

  it('formats exactly 1km as 1.0km', () => {
    expect(formatDistance(1.0)).toBe('1.0km');
  });
});

describe('getWalkingTime', () => {
  it('returns at least 1 minute', () => {
    expect(getWalkingTime(0.01)).toBe(1);
  });

  it('calculates ~13 min for 1km', () => {
    expect(getWalkingTime(1.0)).toBe(13);
  });

  it('scales linearly', () => {
    const t1 = getWalkingTime(0.5);
    const t2 = getWalkingTime(1.0);
    expect(t2).toBeCloseTo(t1 * 2, -1);
  });
});

describe('shared location session', () => {
  it('shares one native request between concurrent explicit callers', async () => {
    let resolvePosition: ((position: GeolocationPosition) => void) | undefined;
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      resolvePosition = success;
    });
    setGeolocation(getCurrentPosition);

    const first = requestLocation();
    const second = requestLocation();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    resolvePosition?.({ coords: { latitude: 59.33, longitude: 18.06 } } as GeolocationPosition);
    await expect(first).resolves.toEqual([59.33, 18.06]);
    await expect(second).resolves.toEqual([59.33, 18.06]);
    expect(getLocationSnapshot().position).toEqual([59.33, 18.06]);
  });

  it('publishes completed state to subscribers', async () => {
    const snapshots: Array<ReturnType<typeof getLocationSnapshot>> = [];
    const unsubscribe = subscribeToLocation((snapshot) => snapshots.push(snapshot));
    setGeolocation(vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 59.33, longitude: 18.06 } } as GeolocationPosition);
    }));

    await requestLocation();
    unsubscribe();

    expect(snapshots.at(-1)).toEqual({
      position: [59.33, 18.06],
      isLoading: false,
      access: 'granted',
    });
  });

  it.each(['prompt', 'denied'] as PermissionState[])('does not prompt during granted-only startup when permission is %s', async (state) => {
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    setPermission(state);

    await expect(loadGrantedLocation()).resolves.toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('does not prompt during startup when permission state is unavailable', async () => {
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);

    await expect(loadGrantedLocation()).resolves.toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('loads silently when the platform has already granted permission', async () => {
    setPermission('granted');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 59.33, longitude: 18.06 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    await expect(loadGrantedLocation()).resolves.toEqual([59.33, 18.06]);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('finishes a denied request without a retry loop', async () => {
    setGeolocation(vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
      failure?.({ code: 1 } as GeolocationPositionError);
    }));

    await expect(requestLocation()).resolves.toBeNull();
    expect(getLocationSnapshot()).toEqual({ position: null, isLoading: false, access: 'denied' });
  });
});
