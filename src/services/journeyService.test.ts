import { describe, expect, it } from 'vitest';
import { normalizeJourneyStopNames } from './journeyService';

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
