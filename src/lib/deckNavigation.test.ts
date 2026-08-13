import { describe, expect, it } from 'vitest';
import {
  adjacentDeckDestination,
  buildDeckDestinations,
  deckDestinationIndex,
  parseDeckHistory,
  serializeDeckHistory,
} from './deckNavigation';

describe('deck navigation', () => {
  it('orders one saved page before Nearby', () => {
    expect(buildDeckDestinations(['page-1'], null)).toEqual([
      { kind: 'page', pageId: 'page-1' },
      { kind: 'nearby' },
    ]);
  });

  it('keeps a retained station board after Nearby with twenty saved pages', () => {
    const pageIds = Array.from({ length: 20 }, (_, index) => `page-${index + 1}`);
    const destinations = buildDeckDestinations(pageIds, 'station-1');

    expect(destinations).toHaveLength(22);
    expect(destinations.slice(-3)).toEqual([
      { kind: 'page', pageId: 'page-20' },
      { kind: 'nearby' },
      { kind: 'board', stopId: 'station-1' },
    ]);
  });

  it('moves to adjacent destinations and stops at deck bounds', () => {
    const destinations = buildDeckDestinations(['page-1'], 'station-1');

    expect(adjacentDeckDestination(destinations, { kind: 'page', pageId: 'page-1' }, -1)).toBeNull();
    expect(adjacentDeckDestination(destinations, { kind: 'page', pageId: 'page-1' }, 1)).toEqual({ kind: 'nearby' });
    expect(adjacentDeckDestination(destinations, { kind: 'nearby' }, 1)).toEqual({ kind: 'board', stopId: 'station-1' });
    expect(adjacentDeckDestination(destinations, { kind: 'board', stopId: 'station-1' }, 1)).toBeNull();
  });

  it('finds destinations by stable identity', () => {
    const destinations = buildDeckDestinations(['page-1', 'page-2'], 'station-1');

    expect(deckDestinationIndex(destinations, { kind: 'page', pageId: 'page-2' })).toBe(1);
    expect(deckDestinationIndex(destinations, { kind: 'nearby' })).toBe(2);
    expect(deckDestinationIndex(destinations, { kind: 'board', stopId: 'station-1' })).toBe(3);
    expect(deckDestinationIndex(destinations, { kind: 'board', stopId: 'missing' })).toBe(-1);
  });

  it('serializes and parses page, Nearby, and board history without discarding unrelated state', () => {
    const base = { unrelated: true };
    const destinations = [
      { kind: 'page', pageId: 'page-1' } as const,
      { kind: 'nearby' } as const,
      { kind: 'board', stopId: 'station-1' } as const,
    ];

    for (const destination of destinations) {
      const state = serializeDeckHistory(base, destination);
      expect(state.unrelated).toBe(true);
      expect(parseDeckHistory(state)).toEqual(destination);
    }
    expect(parseDeckHistory({ unrelated: true })).toBeNull();
  });
});
