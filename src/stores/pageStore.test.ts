import { beforeEach, describe, expect, it } from 'vitest';
import { initialize, createPage, getPages, addSegment, moveSegment, removeSegmentWithSnapshot, restoreSegment } from './pageStore.svelte';

const segment = (id: string) => ({
  id,
  line: id,
  lineName: id,
  direction: { code: 1, destination: 'Centralen', stopPointId: '' },
  fromStop: { id: `${id}-from`, name: 'Slussen', siteId: '100' },
  toStop: { id: `${id}-to`, name: 'Centralen', siteId: '200' },
  transportType: 'metro' as const,
});

describe('pageStore saved-card transactions', () => {
  beforeEach(() => {
    localStorage.clear();
    initialize();
  });

  it('moves without duplicating and restores a removed segment at its exact index', () => {
    const firstPageId = createPage('Home');
    const secondPageId = createPage('Work');
    addSegment(firstPageId, segment('a'));
    addSegment(firstPageId, segment('b'));
    addSegment(firstPageId, segment('c'));
    const source = getPages().find((page) => page.id === firstPageId)!;
    const movedId = source.segments[1].id;

    const moved = moveSegment(firstPageId, movedId, secondPageId);
    expect(moved?.toIndex).toBe(0);
    expect(getPages().find((page) => page.id === firstPageId)?.segments.map((item) => item.line)).toEqual(['a', 'c']);
    expect(getPages().find((page) => page.id === secondPageId)?.segments.map((item) => item.line)).toEqual(['b']);

    const snapshot = removeSegmentWithSnapshot(firstPageId, source.segments[0].id);
    expect(snapshot?.index).toBe(0);
    expect(restoreSegment(snapshot!)).toBe(true);
    expect(getPages().find((page) => page.id === firstPageId)?.segments.map((item) => item.line)).toEqual(['a', 'c']);
  });
});
