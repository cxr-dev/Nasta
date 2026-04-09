import { describe, it, expect } from 'vitest';
import type { Departure } from '../types/departure';

// Mirrors the getLiveMinutes logic from SegmentDepartures.svelte
function getLiveMinutes(dep: Departure, now: number): number {
  if (dep.expectedAt !== undefined) {
    return Math.max(0, Math.floor((dep.expectedAt - now) / 60000));
  }
  return dep.minutes;
}

describe('getLiveMinutes', () => {
  const baseDep: Departure = {
    line: '74',
    lineName: '',
    destination: 'Odenplan',
    directionText: 'Odenplan',
    minutes: 5,
    time: '08:15',
    transportType: 'bus'
  };

  it('falls back to dep.minutes when expectedAt is undefined', () => {
    expect(getLiveMinutes(baseDep, Date.now())).toBe(5);
  });

  it('calculates minutes from expectedAt relative to now', () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now + 3 * 60 * 1000 }; // 3 min from now
    expect(getLiveMinutes(dep, now)).toBe(3);
  });

  it('clamps to 0 when departure is in the past', () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now - 60000 }; // 1 min ago
    expect(getLiveMinutes(dep, now)).toBe(0);
  });

  it('floors fractional minutes', () => {
    const now = 1000000000000;
    const dep = { ...baseDep, expectedAt: now + 90500 }; // 1m 30.5s
    expect(getLiveMinutes(dep, now)).toBe(1);
  });
});
