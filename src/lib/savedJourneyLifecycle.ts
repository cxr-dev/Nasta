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
    if (plannedDeparture(meta) <= now) {
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
      plannedDepartureTime: plannedDeparture(meta),
      plannedArrivalTime: plannedArrival(meta),
      legs,
      connections: meta.connections,
    },
    updatedAt: now,
  };
}

function plannedDeparture(meta: JourneyMeta): number {
  return meta.departureTime ?? meta.legs[0]?.departureTime ?? 0;
}

function plannedArrival(meta: JourneyMeta): number {
  return meta.arrivalTime ?? meta.legs.at(-1)?.arrivalTime ?? plannedDeparture(meta);
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
    return !plannedDeparture(meta) || plannedDeparture(meta) <= refreshBefore;
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
        Boolean(plannedDeparture(meta)) &&
        plannedDeparture(meta) <= now;
      const lastMissedJourney = missed && meta.legs[0]
        ? {
            journeyId: meta.journeyId,
            selectedAt: meta.updatedAt,
            plannedDepartureTime: plannedDeparture(meta),
            plannedArrivalTime: plannedArrival(meta),
            legs: meta.legs,
            connections: meta.connections,
          }
        : undefined;
      const nextMeta: JourneyMeta = {
        ...meta,
        journeyId: selected.id,
        legs: selected.legs,
        departureTime: selected.departureTime,
        arrivalTime: selected.arrivalTime,
        connections: selected.connections,
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
