import { describe, it, expect } from 'vitest';
import { calculateArrival } from './arrivalCalculator';
import type { Stop } from '../types/route';
import type { Departure } from '../types/departure';

describe('arrivalCalculator', () => {
  const createDepartures = (mins: number[]): Map<string, Departure[]> => {
    const map = new Map<string, Departure[]>();
    map.set('9001', mins.map(m => ({
      line: '76',
      destination: 'Test',
      minutes: m,
      time: '08:00'
    })));
    return map;
  };

  it('returns null for empty stops', () => {
    const result = calculateArrival([], new Map());
    expect(result).toBeNull();
  });

  it('returns null when no departures', () => {
    const stops: Stop[] = [{ id: '1', name: 'Test', siteId: '9001' }];
    const result = calculateArrival(stops, new Map());
    expect(result).toBeNull();
  });

  it('calculates arrival with single stop', () => {
    const stops: Stop[] = [{ id: '1', name: 'Test', siteId: '9001' }];
    const departures = createDepartures([5]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.departureMinutes).toBe(5);
    expect(result!.totalMinutes).toBe(5);
  });

  it('calculates arrival with travel times', () => {
    const stops: Stop[] = [
      { id: '1', name: 'Start', siteId: '9001' },
      { id: '2', name: 'Middle', siteId: '9002', travelMinutesToNext: 10 },
      { id: '3', name: 'End', siteId: '9003', travelMinutesToNext: 15 }
    ];
    const departures = createDepartures([5]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.departureMinutes).toBe(5);
    expect(result!.totalMinutes).toBe(30);
  });

  it('handles stops without travel times', () => {
    const stops: Stop[] = [
      { id: '1', name: 'Start', siteId: '9001' },
      { id: '2', name: 'End', siteId: '9002' }
    ];
    const departures = createDepartures([10]);
    const result = calculateArrival(stops, departures);
    
    expect(result).not.toBeNull();
    expect(result!.totalMinutes).toBe(10);
  });
});
