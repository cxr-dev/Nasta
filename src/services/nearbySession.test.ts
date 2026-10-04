import { describe, expect, it, vi } from 'vitest';
import { createNearbySession, type NearbyClock } from './nearbySession';
import type { TransitDeparture, TransitStopSearchResult, TransitService } from '../providers/types';

function makeClock(): NearbyClock & { advance(ms: number): void; intervals(): number } {
  let now = 0;
  let nextId = 0;
  const timeouts = new Map<number, { at: number; fn: () => void }>();
  const intervalTimers = new Map<number, { at: number; delay: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, delay) {
      const id = ++nextId;
      timeouts.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(handle) { timeouts.delete(handle); },
    setInterval(fn, delay) {
      const id = ++nextId;
      intervalTimers.set(id, { at: now + delay, delay, fn });
      return id;
    },
    clearInterval(handle) { intervalTimers.delete(handle); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const dueTimeout = [...timeouts.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        const dueInterval = [...intervalTimers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!dueTimeout && !dueInterval) break;
        if (!dueInterval || (dueTimeout && dueTimeout[1].at <= dueInterval[1].at)) {
          now = dueTimeout![1].at;
          timeouts.delete(dueTimeout![0]);
          dueTimeout![1].fn();
        } else {
          now = dueInterval[1].at;
          intervalTimers.set(dueInterval[0], { ...dueInterval[1], at: dueInterval[1].at + dueInterval[1].delay });
          dueInterval[1].fn();
        }
      }
      now = end;
    },
    intervals: () => intervalTimers.size,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

const stop = (id = 'sl:1'): TransitStopSearchResult => ({
  id, name: `Stop ${id}`, coord: [59.33, 18.06], modes: ['metro'], relevance: 1, locationType: 'station',
});
const departure: TransitDeparture = {
  id: 'd1', stopId: 'sl:1', line: '14', lineName: '14', directionCode: 1, destination: 'Mörby centrum', transportMode: 'metro', minutes: 4, scheduledTime: '12:04', dataSource: 'realtime',
};

function service(overrides: Partial<TransitService> = {}): Pick<TransitService, 'searchStops' | 'getNearbyStops' | 'getDepartures'> {
  return {
    searchStops: vi.fn(async () => []),
    getNearbyStops: vi.fn(async () => [stop()]),
    getDepartures: vi.fn(async () => ({ departures: [departure], stopDeviations: [] })),
    ...overrides,
  } as Pick<TransitService, 'searchStops' | 'getNearbyStops' | 'getDepartures'>;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('nearby session', () => {
  it('immediately emits and retains a nearby catalog while inactive', async () => {
    const clock = makeClock();
    const transit = service();
    const session = createNearbySession({ transit, clock });
    const snapshots: string[] = [];
    session.subscribe((snapshot) => snapshots.push(snapshot.nearbyStops.map((item) => item.id).join(',')));

    session.setOrigin([59.33, 18.06], 12);
    session.activate('nearby', null);
    await flush();
    session.deactivate();

    expect(snapshots[0]).toBe('');
    expect(transit.getNearbyStops).toHaveBeenCalledWith({ origin: [59.33, 18.06], radiusMeters: 2000, limit: 12 }, expect.any(AbortSignal));
    expect(snapshots.at(-1)).toBe('sl:1');
  });

  it('invalidates a pending query before its debounce completes', async () => {
    const clock = makeClock();
    const search = vi.fn(async (query: string) => [stop(`sl:${query}`)]);
    const session = createNearbySession({ transit: service({ searchStops: search }), clock });
    session.activate('nearby', null);
    session.setQuery('cen');
    session.setQuery('sluss');
    clock.advance(220);
    await flush();

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('sluss', expect.any(AbortSignal));
  });

  it('does not publish a late catalog completion after deactivation', async () => {
    const clock = makeClock();
    const pending = deferred<TransitStopSearchResult[]>();
    const session = createNearbySession({ transit: service({ getNearbyStops: vi.fn(() => pending.promise) }), clock });
    const snapshots: string[] = [];
    session.subscribe((snapshot) => snapshots.push(snapshot.nearbyStops.map((item) => item.id).join(',')));
    session.setOrigin([59.33, 18.06], null);
    session.activate('nearby', null);
    session.deactivate();
    pending.resolve([stop('sl:late')]);
    await flush();

    expect(snapshots).not.toContain('sl:late');
  });

  it('keeps exactly one board timer and ignores a late prior board response', async () => {
    const clock = makeClock();
    const first = deferred<{ departures: TransitDeparture[]; stopDeviations: unknown[] }>();
    const getDepartures = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({ departures: [departure], stopDeviations: [] });
    const session = createNearbySession({ transit: service({ getDepartures }), clock });
    session.activate('board', stop('sl:first'));
    session.activate('board', stop('sl:second'));
    first.resolve({ departures: [{ ...departure, id: 'late' }], stopDeviations: [] });
    await flush();

    expect(clock.intervals()).toBe(1);
    await expect(session.refresh()).resolves.toBeUndefined();
    expect(clock.intervals()).toBe(1);
    session.deactivate();
    expect(clock.intervals()).toBe(0);
  });
});
