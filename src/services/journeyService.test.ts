import { describe, expect, it } from 'vitest';
import type { Journey } from '../types/journey';
import {
  appendJourneyOptions,
  DEFAULT_JOURNEY_ROUTE_TYPE,
  normalizeJourneyStopNames,
  prioritizeJourneys,
  selectNextJourney,
} from './journeyService';

function makeJourney(
  id: string,
  departureTime: number,
  arrivalTime: number,
  totalDurationMin: number,
  transfers: number,
): Journey {
  return {
    id,
    originLabel: 'A',
    destLabel: 'B',
    legs: [],
    departureTime,
    arrivalTime,
    totalDurationMin,
    transfers,
  };
}

describe('normalizeJourneyStopNames', () => {
  it('prefers human-readable names over numeric disassembled values', () => {
    expect(
      normalizeJourneyStopNames([
        { name: 'T-Centralen', disassembledName: '2' },
        { name: 'Rådhuset', disassembledName: '2' },
        { name: 'Fridhemsplan', disassembledName: '2' },
      ]),
    ).toEqual(['T-Centralen', 'Rådhuset', 'Fridhemsplan']);
  });

  it('removes repeated adjacent stops from an imperfect planner response', () => {
    expect(
      normalizeJourneyStopNames([
        { name: 'T-Centralen', disassembledName: 'T-Centralen' },
        { name: 'T-Centralen', disassembledName: 'T-Centralen' },
        { name: 'Rådhuset', disassembledName: '2' },
      ]),
    ).toEqual(['T-Centralen', 'Rådhuset']);
  });

  it('does not expose a numeric internal value when no readable name exists', () => {
    expect(
      normalizeJourneyStopNames([
        { name: '2', disassembledName: '2' },
        { name: '', disassembledName: '3' },
      ]),
    ).toEqual([]);
  });
});

describe('appendJourneyOptions', () => {
  it('serializes departure searches with the SL dep enum', () => {
    const params = new URLSearchParams();
    appendJourneyOptions(params, {
      origin: 'A',
      dest: 'B',
      timeMode: 'departure',
      date: '2026-08-05',
      time: '21:00',
    });

    expect(params.get('itd_date')).toBe('20260805');
    expect(params.get('itd_time')).toBe('2100');
    expect(params.get('itd_trip_date_time_dep_arr')).toBe('dep');
    expect(params.get('calc_one_direction')).toBe('true');
    expect(params.get('route_type')).toBe(DEFAULT_JOURNEY_ROUTE_TYPE);
  });

  it('serializes arrival searches with the SL arr enum', () => {
    const params = new URLSearchParams();
    appendJourneyOptions(params, {
      origin: 'A',
      dest: 'B',
      timeMode: 'arrival',
      date: '2026-08-05',
      time: '21:00',
    });

    expect(params.get('itd_trip_date_time_dep_arr')).toBe('arr');
    expect(params.has('calc_one_direction')).toBe(false);
  });

  it('defaults route options to leasttime when no preference is provided', () => {
    const params = new URLSearchParams();
    appendJourneyOptions(params, { origin: 'A', dest: 'B' });

    expect(params.get('route_type')).toBe('leasttime');
  });
});

describe('journey prioritization', () => {
  const now = 1_000_000;
  const departed = makeJourney('departed', now - 1, now + 10_000, 2, 0);
  const laterArrival = makeJourney('later-arrival', now + 60_000, now + 18 * 60_000, 17, 0);
  const earliestArrival = makeJourney('earliest-arrival', now + 4 * 60_000, now + 12 * 60_000, 8, 1);
  const fewestChanges = makeJourney('fewest-changes', now + 8 * 60_000, now + 20 * 60_000, 12, 0);

  it('prioritizes earliest arrival for the default fastest mode', () => {
    expect(prioritizeJourneys([laterArrival, earliestArrival], 'leasttime').map((journey) => journey.id))
      .toEqual(['earliest-arrival', 'later-arrival']);
  });

  it('filters departed journeys before selecting the next journey', () => {
    expect(selectNextJourney([departed, laterArrival, earliestArrival], now, 'leasttime')?.id)
      .toBe('earliest-arrival');
    expect(selectNextJourney([departed], now, 'leasttime')).toBeUndefined();
  });

  it('prioritizes fewer changes before arrival time when requested', () => {
    expect(prioritizeJourneys([earliestArrival, fewestChanges], 'leastinterchange').map((journey) => journey.id))
      .toEqual(['fewest-changes', 'earliest-arrival']);
  });

  it('preserves planner order for least-walking results', () => {
    expect(prioritizeJourneys([laterArrival, earliestArrival], 'leastwalking').map((journey) => journey.id))
      .toEqual(['later-arrival', 'earliest-arrival']);
  });
});
