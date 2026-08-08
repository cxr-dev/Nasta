import { describe, expect, it } from 'vitest';
import type { JourneyMeta, JourneyLeg } from '../types/journey';
import type { Segment } from '../types/page';
import {
  buildShareUrl,
  encodeShareIntent,
  intentFromJourney,
  intentFromSegment,
  parseShareHash,
} from './shareModel';

const leg: JourneyLeg = {
  originName: 'Slussen',
  originSiteId: '1000',
  destName: 'Kista centrum',
  destSiteId: '2000',
  transportType: 'metro',
  line: '14',
  lineName: '14',
  directionCode: 1,
  directionName: 'Mörby centrum',
  departureTime: 1_720_000_000_000,
  arrivalTime: 1_720_001_000_000,
  durationMin: 10,
  platformPosition: 'middle',
};

const meta = (overrides: Partial<JourneyMeta>): JourneyMeta => ({
  journeyId: 'journey-1',
  originLabel: 'Slussen',
  destLabel: 'Kista centrum',
  legs: [leg],
  totalDurationMin: 10,
  transfers: 0,
  query: { origin: 'Slussen', destination: 'Kista centrum' },
  status: 'planned',
  updatedAt: 1,
  ...overrides,
});

const segment: Segment = {
  id: 'departure-1',
  line: '76',
  lineName: '76',
  direction: { code: 1, destination: 'Kaknästornet', stopPointId: '' },
  fromStop: { id: 'stop-1', name: 'Lindarängsvägen', siteId: '100' },
  toStop: { id: 'stop-2', name: 'Kaknästornet', siteId: '200' },
  transportType: 'bus',
};

describe('intentFromJourney', () => {
  it('builds a journey intent from the search query', () => {
    const intent = intentFromJourney(
      meta({
        query: {
          origin: 'Slussen',
          destination: 'Kista centrum',
          timeMode: 'departure',
          date: '2026-08-08',
          time: '14:30',
          originCoord: [59.319, 18.072],
          destinationCoord: [59.403, 17.944],
        },
      }),
    );
    expect(intent).not.toBeNull();
    expect(intent!.kind).toBe('journey');
    expect(intent!.origin).toBe('Slussen');
    expect(intent!.dest).toBe('Kista centrum');
    expect(intent!.timeMode).toBe('departure');
    expect(intent!.date).toBe('2026-08-08');
    expect(intent!.time).toBe('14:30');
    expect(intent!.firstLegTransport).toBe('metro');
    expect(intent!.firstLegLine).toBe('14');
    expect(intent!.originCoord).toEqual([59.319, 18.072]);
    expect(intent!.destCoord).toEqual([59.403, 17.944]);
  });

  it('defaults timeMode to now and drops malformed date/time', () => {
    const intent = intentFromJourney(
      meta({ query: { origin: 'Slussen', destination: 'Kista', date: '8/8', time: 'noon' } }),
    );
    expect(intent!.timeMode).toBe('now');
    expect(intent!.date).toBeUndefined();
    expect(intent!.time).toBeUndefined();
  });

  it('returns null when origin or destination is missing', () => {
    expect(intentFromJourney(meta({ query: { origin: '', destination: 'Kista' } }))).toBeNull();
    expect(intentFromJourney(meta({ query: { origin: 'Slussen', destination: '' } }))).toBeNull();
  });

  it('truncates over-long labels and line names', () => {
    const long = 'x'.repeat(200);
    const intent = intentFromJourney(
      meta({
        query: { origin: long, destination: long },
        legs: [{ ...leg, line: '123456789012345' }],
      }),
    );
    expect(intent!.origin.length).toBe(120);
    expect(intent!.dest.length).toBe(120);
    expect(intent!.firstLegLine).toBe('123456789012');
  });
});

describe('intentFromSegment', () => {
  it('builds a departure intent from a saved segment', () => {
    const intent = intentFromSegment(segment);
    expect(intent).toEqual({
      kind: 'departure',
      siteId: '100',
      stop: 'Lindarängsvägen',
      line: '76',
      direction: 'Kaknästornet',
      transportType: 'bus',
    });
  });

  it('returns null when the stop has no site id', () => {
    expect(intentFromSegment({ ...segment, fromStop: { id: 's', name: 'X', siteId: '' } })).toBeNull();
  });
});

describe('encodeShareIntent / parseShareHash round trip', () => {
  it('round-trips a journey intent', () => {
    const intent = intentFromJourney(
      meta({
        query: {
          origin: 'Slussen',
          destination: 'Kista centrum',
          timeMode: 'arrival',
          date: '2026-08-08',
          time: '09:00',
          originCoord: [59.319, 18.072],
        },
      }),
    )!;
    const parsed = parseShareHash(encodeShareIntent(intent));
    expect(parsed).toEqual(intent);
  });

  it('round-trips a departure intent', () => {
    const parsed = parseShareHash(encodeShareIntent(intentFromSegment(segment)!));
    expect(parsed).toEqual(intentFromSegment(segment));
  });

  it('omits empty optional journey fields', () => {
    const hash = encodeShareIntent(
      intentFromJourney(meta({ legs: [], query: { origin: 'A', destination: 'B' } }))!,
    );
    expect(hash).not.toContain('dt=');
    expect(hash).not.toContain('tt=');
    expect(hash).not.toContain('oc=');
    expect(hash).not.toContain('t=');
  });

  it('builds a full share URL from a base', () => {
    const hash = encodeShareIntent(intentFromSegment(segment)!);
    expect(buildShareUrl('https://example.com/Nasta/', intentFromSegment(segment)!)).toBe(
      `https://example.com/Nasta/${hash}`,
    );
  });
});

describe('parseShareHash rejection', () => {
  it('rejects non-share and versionless hashes', () => {
    expect(parseShareHash('')).toBeNull();
    expect(parseShareHash('#foo')).toBeNull();
    expect(parseShareHash('#share')).toBeNull();
    expect(parseShareHash('#share?v=2&type=journey&o=A&d=B&tm=now')).toBeNull();
  });

  it('rejects malformed journey payloads', () => {
    expect(parseShareHash('#share?v=1&type=journey&o=A&tm=now')).toBeNull();
    expect(parseShareHash('#share?v=1&type=journey&o=A&d=B&tm=later')).toBeNull();
  });

  it('rejects malformed departure payloads', () => {
    expect(parseShareHash('#share?v=1&type=departure&s=1&n=Stop&l=76&dir=X')).toBeNull();
    expect(parseShareHash('#share?v=1&type=departure&s=1&n=Stop&l=76&dir=X&t=rocket')).toBeNull();
  });

  it('tolerates unknown extra params and bad coords', () => {
    const parsed = parseShareHash('#share?v=1&type=journey&o=A&d=B&tm=now&extra=x&oc=999,999');
    expect(parsed).not.toBeNull();
    if (parsed && parsed.kind === 'journey') expect(parsed.originCoord).toBeUndefined();
  });
});
