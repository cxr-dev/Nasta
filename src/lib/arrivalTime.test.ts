import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeArrivalSummary } from './arrivalTime';
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
      travelTimeMinutes: 12,
      transferBufferMinutes: 4
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
  afterEach(() => { vi.useRealTimers(); });

  it('computes earliest realistic chained arrival including transfer buffers', () => {
    const deps = new Map<string, Departure[]>([
      ['1001', [dep]],
      ['1002', [
        {
          line: '74', lineName: 'Buss 74', destination: 'Frihamnen', directionText: 'Frihamnen',
          minutes: 17, time: '08:54', transportType: 'bus'
        },
        {
          line: '74', lineName: 'Buss 74', destination: 'Frihamnen', directionText: 'Frihamnen',
          minutes: 23, time: '09:00', transportType: 'bus'
        }
      ]]
    ]);
    const result = computeArrivalSummary(route, deps);
    expect(result).toEqual({
      time: '09:08',
      transferSlackMinutes: 2,
      transferState: 'tight'
    });
  });

  it('returns null when no matching departure', () => {
    const deps = new Map<string, Departure[]>();
    expect(computeArrivalSummary(route, deps)).toBeNull();
  });

  it('returns null for empty route', () => {
    const empty: Route = { id: 'r', name: '', direction: 'toWork', segments: [] };
    expect(computeArrivalSummary(empty, new Map())).toBeNull();
  });

  it('defaults transferBufferMinutes to 0 for older saved routes', () => {
    const oldRoute: Route = {
      ...route,
      segments: route.segments.map(({ transferBufferMinutes, ...segment }) => segment)
    };
    const deps = new Map<string, Departure[]>([
      ['1001', [dep]],
      ['1002', [{
        line: '74', lineName: 'Buss 74', destination: 'Frihamnen', directionText: 'Frihamnen',
        minutes: 17, time: '08:54', transportType: 'bus'
      }]]
    ]);
    expect(computeArrivalSummary(oldRoute, deps)?.time).toBe('09:02');
  });
});
