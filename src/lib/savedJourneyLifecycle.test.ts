import { describe, expect, it } from 'vitest';
import type { Page, Segment } from '../types/page';
import type { JourneyMeta } from '../types/journey';
import {
  isCurrentSavedJourney,
  reduceSavedJourneyAction,
  resolveSavedJourneyRefreshes,
} from './savedJourneyLifecycle';

const NOW = 1_700_000_000_000;

function makeMeta(overrides: Partial<JourneyMeta> = {}): JourneyMeta {
  return {
    journeyId: 'journey-old',
    originLabel: 'Home',
    destLabel: 'Work',
    legs: [{
      originName: 'Home',
      destName: 'Work',
      transportType: 'metro',
      line: '17',
      lineName: '17',
      directionCode: 1,
      directionName: 'Hagsätra',
      departureTime: NOW + 10 * 60_000,
      arrivalTime: NOW + 25 * 60_000,
      durationMin: 15,
      platformPosition: 'middle',
    }],
    totalDurationMin: 15,
    transfers: 0,
    query: { origin: 'Home', destination: 'Work', routeType: 'leasttime' },
    status: 'planned',
    updatedAt: NOW - 1_000,
    ...overrides,
  };
}

function makeSegment(id: string, journeyMeta = makeMeta()): Segment {
  return {
    id,
    line: '17',
    lineName: '17',
    direction: { code: 1, destination: 'Work', stopPointId: 'stop' },
    fromStop: { id: `${id}-from`, name: 'Home', siteId: '1' },
    toStop: { id: `${id}-to`, name: 'Work', siteId: '2' },
    transportType: 'metro',
    journeyMeta,
  } as Segment;
}

function makePage(segments: Segment[]): Page {
  return { id: 'page-1', name: 'Page', segments };
}

describe('reduceSavedJourneyAction', () => {
  it('starts a planned journey with an active snapshot', () => {
    const result = reduceSavedJourneyAction(makeMeta(), 'start', NOW);

    expect(result.changed).toBe(true);
    expect(result.shouldRefresh).toBe(false);
    expect(result.nextMeta.status).toBe('active');
    expect(result.nextMeta.activeSnapshot?.startedAt).toBe(NOW);
  });

  it('requests a refresh when starting an expired journey', () => {
    const result = reduceSavedJourneyAction(
      makeMeta({ legs: [{ ...makeMeta().legs[0], departureTime: NOW - 1 }] }),
      'start',
      NOW,
    );

    expect(result.changed).toBe(false);
    expect(result.shouldRefresh).toBe(true);
  });

  it('supports late start and missed snapshot start', () => {
    const meta = makeMeta({
      lastMissedJourney: {
        journeyId: 'journey-missed',
        selectedAt: NOW - 20_000,
        plannedDepartureTime: NOW - 10_000,
        plannedArrivalTime: NOW + 20_000,
        legs: makeMeta().legs,
      },
    });

    expect(reduceSavedJourneyAction(meta, 'start-late', NOW).nextMeta.status).toBe('active');
    const missed = reduceSavedJourneyAction(meta, 'start-missed', NOW);
    expect(missed.nextMeta.activeSnapshot?.journeyId).toBe('journey-missed');
    expect(missed.nextMeta.lastMissedJourney).toBeUndefined();
  });

  it('completes and cancels journeys with refresh requested', () => {
    const active = makeMeta({ status: 'active', activeSnapshot: { journeyId: 'journey-old', selectedAt: NOW, plannedDepartureTime: NOW, plannedArrivalTime: NOW, legs: makeMeta().legs } });
    const completed = reduceSavedJourneyAction(active, 'complete', NOW);
    const cancelled = reduceSavedJourneyAction(active, 'cancel', NOW);

    expect(completed.nextMeta.status).toBe('completed');
    expect(completed.shouldRefresh).toBe(true);
    expect(cancelled.nextMeta.status).toBe('planned');
    expect(cancelled.shouldRefresh).toBe(true);
  });

  it('ignores invalid actions without changing metadata', () => {
    const meta = makeMeta();
    const result = reduceSavedJourneyAction(meta, 'start-missed', NOW);

    expect(result).toEqual({ nextMeta: meta, changed: false, shouldRefresh: false });
  });
});

describe('resolveSavedJourneyRefreshes', () => {
  it('refreshes eligible journeys and preserves a missed snapshot', async () => {
    const oldMeta = makeMeta({
      legs: [{ ...makeMeta().legs[0], departureTime: NOW - 60_000 }],
    });
    const page = makePage([makeSegment('segment-1', oldMeta)]);
    const lookup = async () => [{
      id: 'journey-new',
      originLabel: 'Home',
      destLabel: 'New Work',
      legs: [{ ...makeMeta().legs[0], departureTime: NOW + 20 * 60_000, arrivalTime: NOW + 40 * 60_000 }],
      totalDurationMin: 20,
      departureTime: NOW + 20 * 60_000,
      arrivalTime: NOW + 40 * 60_000,
      transfers: 0,
    }];

    const result = await resolveSavedJourneyRefreshes({ page, force: true, now: NOW, lookup });
    const nextMeta = result.updates[0].patch.journeyMeta as JourneyMeta;

    expect(nextMeta.journeyId).toBe('journey-new');
    expect(nextMeta.status).toBe('planned');
    expect(nextMeta.lastMissedJourney?.journeyId).toBe('journey-old');
    expect(result.updates[0].expectedUpdatedAt).toBe(oldMeta.updatedAt);
  });

  it('isolates a failed segment lookup', async () => {
    const page = makePage([
      makeSegment('segment-1'),
      makeSegment('segment-2', makeMeta({ query: { origin: 'Other', destination: 'Work', routeType: 'leasttime' } })),
    ]);
    const lookup = async (request: { origin: string }) => {
      if (request.origin === 'Home') throw new Error('planner unavailable');
      return [];
    };

    const result = await resolveSavedJourneyRefreshes({ page, force: true, now: NOW, lookup });

    expect(result.updates).toHaveLength(0);
    expect(result.failedSegmentIds).toEqual(['segment-1', 'segment-2']);
  });
});

describe('isCurrentSavedJourney', () => {
  it('rejects a refresh after the journey changed', () => {
    const segment = makeSegment('segment-1', makeMeta({ updatedAt: NOW }));
    const update = {
      segmentId: segment.id,
      journeyId: 'journey-old',
      expectedUpdatedAt: NOW - 1,
      patch: {},
    };

    expect(isCurrentSavedJourney(segment, update)).toBe(false);
  });
});
