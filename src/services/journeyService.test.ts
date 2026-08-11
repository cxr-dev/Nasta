import { describe, expect, it, vi } from 'vitest';
import type { Journey } from '../types/journey';
import {
  appendJourneyOptions,
  DEFAULT_JOURNEY_ROUTE_TYPE,
  normalizeJourneyStopNames,
  prioritizeJourneys,
  searchJourneys,
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

describe('journey connection parsing', () => {
  it('uses the complete itinerary bounds for duration and preserves access, interchange, and egress', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ journeys: [{ legs: [
      { type: 'walk', duration: 300, transportation: { product: { class: 100 } }, origin: { name: 'Home', disassembledName: 'Home', departureTimePlanned: '2026-08-06T10:00:00' }, destination: { name: 'Station', disassembledName: 'Station', arrivalTimePlanned: '2026-08-06T10:05:00' } },
      { duration: 900, transportation: { name: 'Metro 17', disassembledName: '17', product: { name: 'METRO', class: 2 } }, origin: { name: 'Station', disassembledName: 'Station', departureTimePlanned: '2026-08-06T10:05:00' }, destination: { name: 'Centralen', disassembledName: 'Centralen', arrivalTimePlanned: '2026-08-06T10:20:00' } },
      { duration: 300, transportation: { product: { class: 99 } }, origin: { name: 'Centralen', disassembledName: 'Centralen', departureTimePlanned: '2026-08-06T10:20:00' }, destination: { name: 'Bus stop', disassembledName: 'Bus stop', arrivalTimePlanned: '2026-08-06T10:25:00' } },
      { duration: 900, transportation: { name: 'Bus 4', disassembledName: '4', product: { name: 'BUS', class: 5 } }, origin: { name: 'Bus stop', disassembledName: 'Bus stop', departureTimePlanned: '2026-08-06T10:25:00' }, destination: { name: 'Work stop', disassembledName: 'Work stop', arrivalTimePlanned: '2026-08-06T10:40:00' } },
      { type: 'walk', duration: 180, transportation: { product: { class: 100 } }, origin: { name: 'Work stop', disassembledName: 'Work stop', departureTimePlanned: '2026-08-06T10:40:00' }, destination: { name: 'Work', disassembledName: 'Work', arrivalTimePlanned: '2026-08-06T10:43:00' } },
    ] }] }), { status: 200 })) as any);

    const [journey] = await searchJourneys({ origin: 'Home', dest: 'Work', originCoord: [59.33, 18.06], destCoord: [59.34, 18.07] });
    expect(journey.totalDurationMin).toBe(43);
    expect(journey.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ beforeLegIndex: 0, kind: 'walk', durationMin: 5 }),
      expect.objectContaining({ beforeLegIndex: 1, kind: 'transfer', durationMin: 5 }),
      expect.objectContaining({ beforeLegIndex: 2, kind: 'walk', durationMin: 3 }),
    ]));
  });

  it('keeps the fastest results first and appends a distinct direct alternative', async () => {
    const transit = (line: string, from: string, to: string, departure: string, arrival: string) => ({
      duration: 600,
      transportation: { name: `Buss ${line}`, disassembledName: line, product: { name: 'BUS', class: 5 } },
      origin: { name: from, disassembledName: from, departureTimePlanned: departure },
      destination: { name: to, disassembledName: to, arrivalTimePlanned: arrival },
      direction: 1,
      directionName: 'Centrum',
    });
    const fastest = {
      journeys: [{ legs: [
        transit('1', 'Start', 'Byte', '2026-08-06T10:00:00', '2026-08-06T10:10:00'),
        transit('2', 'Byte', 'Mål', '2026-08-06T10:12:00', '2026-08-06T10:22:00'),
      ] }],
    };
    const direct = {
      journeys: [{ legs: [
        transit('6', 'Drevergatan', 'Odenplan', '2026-08-06T10:05:00', '2026-08-06T10:30:00'),
      ] }],
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
      new URL(url).searchParams.get('max_changes') === '0' ? direct : fastest,
    ), { status: 200 })) as any);

    const journeys = await searchJourneys({ origin: 'Home', dest: 'Work', originCoord: [59.33, 18.06], destCoord: [59.34, 18.07] });

    expect(journeys).toHaveLength(2);
    expect(journeys.map((journey) => journey.transfers)).toEqual([1, 0]);
    expect(journeys.at(-1)?.legs[0].originName).toBe('Drevergatan');
  });
});
