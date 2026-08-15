import { describe, expect, it } from 'vitest';
import { getWalkingDirectionsUrl, resolveWalkingMapApp } from './openWalkingDirections';

describe('walking directions', () => {
  it('uses Apple Maps by default on Apple mobile platforms', () => {
    expect(resolveWalkingMapApp('default', 'Mozilla/5.0 (iPhone)')).toBe('apple');
  });

  it('uses Google Maps by default elsewhere', () => {
    expect(resolveWalkingMapApp('default', 'Mozilla/5.0 (Linux; Android 14)')).toBe('google');
  });

  it('respects saved Apple and Google preferences but never uses Waze for walking', () => {
    expect(resolveWalkingMapApp('apple', 'Mozilla/5.0 (Linux; Android 14)')).toBe('apple');
    expect(resolveWalkingMapApp('google', 'Mozilla/5.0 (iPhone)')).toBe('google');
    expect(resolveWalkingMapApp('waze', 'Mozilla/5.0 (iPhone)')).toBe('apple');
  });

  it('builds walking URLs with the exact destination coordinates', () => {
    expect(getWalkingDirectionsUrl('google', 59.3293, 18.0686, 'Mozilla/5.0 (Linux; Android 14)')).toBe('https://www.google.com/maps/dir/?api=1&destination=59.3293,18.0686&travelmode=walking');
    expect(getWalkingDirectionsUrl('default', 59.3293, 18.0686, 'Mozilla/5.0 (iPhone)')).toBe('https://maps.apple.com/?daddr=59.3293,18.0686&dirflg=w');
  });
});
