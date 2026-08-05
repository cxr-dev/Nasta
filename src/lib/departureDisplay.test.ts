import { describe, expect, it } from 'vitest';
import type { Departure } from '../types/departure';
import { getDepartureUrgency, getEffectiveDisruption } from './departureDisplay';

const baseDeparture: Departure = {
  line: '13',
  lineName: 'Metro',
  destination: 'Ropsten',
  direction_code: 1,
  minutes: 10,
  time: '15:10',
  transportType: 'metro',
};

describe('getDepartureUrgency', () => {
  const now = 1_000_000;

  it('uses expectedAt for live urgency', () => {
    expect(getDepartureUrgency({ ...baseDeparture, expectedAt: now + 30_000 }, now)).toBe('now');
    expect(getDepartureUrgency({ ...baseDeparture, expectedAt: now + 90_000 }, now)).toBe('imminent');
    expect(getDepartureUrgency({ ...baseDeparture, expectedAt: now + 4 * 60_000 }, now)).toBe('soon');
    expect(getDepartureUrgency({ ...baseDeparture, expectedAt: now + 6 * 60_000 }, now)).toBe('later');
  });

  it('falls back to numeric scheduled minutes', () => {
    expect(getDepartureUrgency({ ...baseDeparture, minutes: 0 }, now)).toBe('now');
    expect(getDepartureUrgency({ ...baseDeparture, minutes: 2 }, now)).toBe('imminent');
    expect(getDepartureUrgency({ ...baseDeparture, minutes: 5 }, now)).toBe('soon');
    expect(getDepartureUrgency({ ...baseDeparture, minutes: 6 }, now)).toBe('later');
  });
});

describe('getEffectiveDisruption', () => {
  it('does not preserve severity when no disruption message is visible', () => {
    expect(getEffectiveDisruption('critical', 0)).toBe('normal');
    expect(getEffectiveDisruption('affected', 0)).toBe('normal');
  });

  it('keeps severity when a message is visible', () => {
    expect(getEffectiveDisruption('critical', 1)).toBe('critical');
    expect(getEffectiveDisruption('affected', 2)).toBe('affected');
  });
});
