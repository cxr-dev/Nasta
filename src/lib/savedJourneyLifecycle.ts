import type { Page, Segment } from '../types/page';
import type {
  Journey,
  JourneyMeta,
  JourneySearchRequest,
} from '../types/journey';
import {
  DEFAULT_JOURNEY_ROUTE_TYPE,
  searchJourneys,
  selectNextJourney,
} from '../services/journeyService';

export type SavedJourneyAction =
  | 'start'
  | 'start-late'
  | 'start-missed'
  | 'complete'
  | 'cancel';

export interface SavedJourneyActionResult {
  nextMeta: JourneyMeta;
  changed: boolean;
  shouldRefresh: boolean;
}

export function reduceSavedJourneyAction(
  meta: JourneyMeta,
  action: SavedJourneyAction,
  now: number,
): SavedJourneyActionResult {
  if (action === 'start' && meta.status !== 'active') {
    if (meta.legs[0]?.departureTime && meta.legs[0].departureTime <= now) {
      return { nextMeta: meta, changed: false, shouldRefresh: true };
    }

    return {
      nextMeta: buildActiveMeta(meta, meta.legs, now),
      changed: true,
      shouldRefresh: false,
    };
  }

  if (action === 'start-late' && meta.status !== 'active') {
    return {
      nextMeta: buildActiveMeta(meta, meta.legs, now),
      changed: true,
      shouldRefresh: false,
    };
  }

  if (action === 'start-missed' && meta.status !== 'active' && meta.lastMissedJourney) {
    return {
      nextMeta: {
        ...meta,
        status: 'active',
        activeSnapshot: meta.lastMissedJourney,
        lastMissedJourney: undefined,
        updatedAt: now,
      },
      changed: true,
      shouldRefresh: false,
    };
  }

  if (action === 'complete') {
    return {
      nextMeta: {
        ...meta,
        status: 'completed',
        activeSnapshot: undefined,
        updatedAt: now,
      },
      changed: true,
      shouldRefresh: true,
    };
  }

  if (action === 'cancel') {
    return {
      nextMeta: {
        ...meta,
        status: 'planned',
        activeSnapshot: undefined,
        updatedAt: now,
      },
      changed: true,
      shouldRefresh: true,
    };
  }

  return { nextMeta: meta, changed: false, shouldRefresh: false };
}

function buildActiveMeta(
  meta: JourneyMeta,
  legs: JourneyMeta['legs'],
  now: number,
): JourneyMeta {
  return {
    ...meta,
    status: 'active',
    activeSnapshot: {
      journeyId: meta.journeyId,
      selectedAt: now,
      startedAt: now,
      plannedDepartureTime: legs[0]?.departureTime ?? now,
      plannedArrivalTime: legs.at(-1)?.arrivalTime ?? now,
      legs,
    },
    updatedAt: now,
  };
}

export type SavedJourneyLookup = (
  request: JourneySearchRequest,
) => Promise<Journey[]>;

export interface SavedJourneyRefreshUpdate {
  segmentId: string;
  journeyId: string;
  expectedUpdatedAt: number;
  patch: Partial<Segment>;
}

export interface SavedJourneyRefreshResult {
  updates: SavedJourneyRefreshUpdate[];
  failedSegmentIds: string[];
}

export interface ResolveSavedJourneyRefreshesOptions {
  page: Page;
  force?: boolean;
  now?: number;
  lookup?: SavedJourneyLookup;
}

export async function resolveSavedJourneyRefreshes({
  page,
  force = false,
  now = Date.now(),
  lookup = searchJourneys,
}: ResolveSavedJourneyRefreshesOptions): Promise<SavedJourneyRefreshResult> {
  const refreshBefore = now + 60_000;
  const candidates = page.segments.filter((segment) => {
    const meta = segment.journeyMeta;
    if (!meta || meta.status === 'active') return false;
    if (force || meta.status !== 'planned') return true;
    return !meta.legs[0]?.departureTime || meta.legs[0].departureTime <= refreshBefore;
  });

  const settled = await Promise.all(candidates.map(async (segment) => {
    const meta = segment.journeyMeta;
    if (!meta) return { kind: 'skip' as const };

    try {
      const next = await lookup({
        origin: meta.query.origin,
        dest: meta.query.destination,
        originCoord: meta.query.originCoord,
        destCoord: meta.query.destinationCoord,
        timeMode: meta.query.timeMode,
        date: meta.query.date,
        time: meta.query.time,
        transportModes: meta.query.transportModes,
        maxChanges: meta.query.maxChanges,
        routeType: meta.query.routeType ?? DEFAULT_JOURNEY_ROUTE_TYPE,
      });
      const selected = selectNextJourney(
        next,
        now,
        meta.query.routeType ?? DEFAULT_JOURNEY_ROUTE_TYPE,
      );
      if (!selected) return { kind: 'skip' as const };

      const missed =
        meta.status === 'planned' &&
        Boolean(meta.legs[0]?.departureTime) &&
        meta.legs[0].departureTime <= now;
      const lastMissedJourney = missed && meta.legs[0]
        ? {
            journeyId: meta.journeyId,
            selectedAt: meta.updatedAt,
            plannedDepartureTime: meta.legs[0].departureTime,
            plannedArrivalTime: meta.legs.at(-1)?.arrivalTime ?? meta.legs[0].arrivalTime,
            legs: meta.legs,
          }
        : undefined;
      const nextMeta: JourneyMeta = {
        ...meta,
        journeyId: selected.id,
        legs: selected.legs,
        totalDurationMin: selected.totalDurationMin,
        transfers: selected.transfers,
        updatedAt: now,
        status: 'planned',
        query: selected.query ?? meta.query,
        lastMissedAt: missed ? now : undefined,
        lastMissedJourney,
      };

      return {
        kind: 'update' as const,
        update: {
          segmentId: segment.id,
          journeyId: meta.journeyId,
          expectedUpdatedAt: meta.updatedAt,
          patch: {
            journeyMeta: nextMeta,
            line: selected.legs[0]?.line ?? segment.line,
            lineName: selected.legs[0]?.lineName ?? segment.lineName,
            direction: { ...segment.direction, destination: selected.destLabel },
          },
        },
      };
    } catch {
      return { kind: 'failed' as const, segmentId: segment.id };
    }
  }));

  return {
    updates: settled.flatMap((result) => result.kind === 'update' ? [result.update] : []),
    failedSegmentIds: settled.flatMap((result) => result.kind === 'failed' ? [result.segmentId] : []),
  };
}

export function isCurrentSavedJourney(
  segment: Segment | undefined,
  update: SavedJourneyRefreshUpdate,
): boolean {
  return Boolean(
    segment?.journeyMeta &&
    segment.journeyMeta.journeyId === update.journeyId &&
    segment.journeyMeta.updatedAt === update.expectedUpdatedAt,
  );
}
