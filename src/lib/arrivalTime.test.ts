import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeArrivalTime } from './arrivalTime';
import type { Route } from '../types/route';
import type { Departure } from '../stores/departureStore';

const route: Route = {
  id: 'r1', name: 'Till jobbet', direction: 'toWork',
  segments: [
    {
      id: 's1', line: '13', lineName: 'Tunnelbana 13', directionText: 'Ropsten',
      fromStop: { id: 'stop1', name: 'Luma', siteId: '1001' },
      toStop: { id: 'stop2', name: 'Slussen', siteId: '1002' },
      transportType: 'metro',
      travelTimeMinutes: 12
    },
    {
      id: 's2', line: '74', lineName: 'Buss 74', directionText: 'Frihamnen',
      fromStop: { id: 'stop3', name: 'Slussen', siteId: '1002' },
      toStop: { id: 'stop4', name: 'Frihamnen', siteId: '1003' },
      transportType: 'bus',
      travelTimeMinutes: 8
    }
  ]
};

const dep: Departure = {
  line: '13', lineName: 'Tunnelbana 13', destination: 'Ropsten', directionText: 'Ropsten',
  minutes: 5, time: '08:42', transportType: 'metro'
};

describe('computeArrivalTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T08:37:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('computes wait + travel time', () => {
    const deps = new Map([['1001', [dep]]]);
    // 5 min wait + 12 + 8 travel = 25 min from 08:37 = 09:02
    expect(computeArrivalTime(route, deps)).toBe('09:02');
  });

  it('returns null when no matching departure', () => {
    const deps = new Map<string, Departure[]>();
    expect(computeArrivalTime(route, deps)).toBeNull();
  });

  it('returns null for empty route', () => {
    const empty: Route = { id: 'r', name: '', direction: 'toWork', segments: [] };
    expect(computeArrivalTime(empty, new Map())).toBeNull();
  });
});
