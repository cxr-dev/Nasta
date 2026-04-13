import { describe, it, expect } from 'vitest';
import type { Departure } from '../types/departure';
import { getLiveMinutes, mergeDeparturesWithPredictions } from '../lib/departureDisplay';

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

describe('mergeDeparturesWithPredictions', () => {
  const liveBase: Departure = {
    line: '76',
    lineName: '76',
    destination: 'Norra Hammarbyhamnen',
    directionText: 'Norra Hammarbyhamnen',
    minutes: 0,
    time: '16:30',
    transportType: 'bus',
  };

  it('drops predicted departures that are within the same departure slot as a live departure', () => {
    const live = [{ ...liveBase, expectedAt: 16 * 60 * 60 * 1000 + 30 * 60 * 1000 }];
    const predicted: Departure[] = [
      { ...liveBase, time: '16:29', expectedAt: 16 * 60 * 60 * 1000 + 29 * 60 * 1000, predicted: true },
      { ...liveBase, time: '16:39', expectedAt: 16 * 60 * 60 * 1000 + 39 * 60 * 1000, predicted: true }
    ];

    expect(mergeDeparturesWithPredictions(live, predicted).map(d => d.time)).toEqual(['16:30', '16:39']);
  });

  it('falls back to matching the displayed clock time when expectedAt is absent on live departures', () => {
    const live = [{ ...liveBase, expectedAt: undefined }];
    const predicted: Departure[] = [
      { ...liveBase, time: '16:30', expectedAt: 1, predicted: true },
      { ...liveBase, time: '16:39', expectedAt: 2, predicted: true }
    ];

    expect(mergeDeparturesWithPredictions(live, predicted).map(d => d.time)).toEqual(['16:30', '16:39']);
  });
});
