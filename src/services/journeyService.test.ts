import { describe, it, expect } from 'vitest';
import {
  estimateVehicleStopIndex,
  toStockholmDateString,
  buildSynthesisedStops,
} from './journeyService';
import type { JourneyStop } from './journeyService';

describe('toStockholmDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    // 2026-04-10 12:00 UTC = 2026-04-10 14:00 Stockholm (UTC+2 in summer)
    const ts = new Date('2026-04-10T12:00:00Z').getTime();
    expect(toStockholmDateString(ts)).toBe('2026-04-10');
  });

  it('returns correct date for early morning Stockholm time', () => {
    // 2026-04-10 01:30 UTC = 2026-04-10 03:30 Stockholm — still April 10
    const ts = new Date('2026-04-10T01:30:00Z').getTime();
    expect(toStockholmDateString(ts)).toBe('2026-04-10');
  });
});

describe('estimateVehicleStopIndex', () => {
  it('returns 0 for empty stops array', () => {
    expect(estimateVehicleStopIndex([], 0, Date.now())).toBe(0);
  });

  it('returns index of last passed stop when stops have scheduledAt times', () => {
    const now = 1_000_000;
    const stops: JourneyStop[] = [
      { name: 'A', siteId: '1', idx: 0, scheduledAt: 900_000 },
      { name: 'B', siteId: '2', idx: 1, scheduledAt: 950_000 },
      { name: 'C', siteId: '3', idx: 2, scheduledAt: 1_050_000 }, // future
    ];
    // B is last passed stop (950_000 <= 1_000_000, C is future)
    expect(estimateVehicleStopIndex(stops, 1_050_000, now)).toBe(1);
  });

  it('returns 0 when all stops are in the future', () => {
    const now = 800_000;
    const stops: JourneyStop[] = [
      { name: 'A', siteId: '1', idx: 0, scheduledAt: 900_000 },
      { name: 'B', siteId: '2', idx: 1, scheduledAt: 950_000 },
    ];
    expect(estimateVehicleStopIndex(stops, 950_000, now)).toBe(0);
  });

  it('estimates position from time when no scheduledAt present', () => {
    const now = Date.now();
    const expectedAtOurStop = now + 4 * 60_000; // 4 min from now
    const stops: JourneyStop[] = [
      { name: 'S1', siteId: '1', idx: 0 },
      { name: 'S2', siteId: '2', idx: 1 },
      { name: 'S3', siteId: '3', idx: 2 },
      { name: 'Our stop', siteId: '4', idx: 3 },
      { name: 'S5', siteId: '5', idx: 4 },
    ];
    const result = estimateVehicleStopIndex(stops, expectedAtOurStop, now);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(3); // hasn't reached our stop yet
  });
});

describe('buildSynthesisedStops', () => {
  it('returns 5 stops with our stop at index 3', () => {
    const stops = buildSynthesisedStops('Östhammarsgatan', '9011001234100001');
    expect(stops).toHaveLength(5);
    expect(stops[3].name).toBe('Östhammarsgatan');
    expect(stops[3].siteId).toBe('9011001234100001');
  });

  it('assigns sequential idx values starting from 0', () => {
    const stops = buildSynthesisedStops('A', 'site1');
    stops.forEach((s, i) => expect(s.idx).toBe(i));
  });
});
