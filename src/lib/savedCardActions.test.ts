import { describe, expect, it } from 'vitest';
import { getSavedCardActions } from './savedCardActions';
import type { Page, Segment } from '../types/page';

const departure: Segment = {
  id: 'departure-1',
  line: '76',
  lineName: '76',
  direction: { code: 1, destination: 'Kaknästornet', stopPointId: '' },
  fromStop: { id: 'stop-1', name: 'Lindarängsvägen', siteId: '100' },
  toStop: { id: 'stop-2', name: 'Kaknästornet', siteId: '200' },
  transportType: 'bus',
};

const journey: Segment = {
  ...departure,
  id: 'journey-1',
  journeyMeta: {
    journeyId: 'journey-1',
    originLabel: 'Slussen',
    destLabel: 'Kista centrum',
    legs: [],
    totalDurationMin: 24,
    transfers: 1,
    query: { origin: 'Slussen', destination: 'Kista centrum' },
    status: 'planned',
    updatedAt: 1,
  },
};

const labels = { share: 'Share', edit: 'Edit', move: 'Move', remove: 'Remove' };

describe('saved card action resolver', () => {
  it('returns one shared action set for both entry points', () => {
    const pages: Page[] = [{ id: 'page-1', name: 'Home', segments: [departure] }, { id: 'page-2', name: 'Work', segments: [] }];
    const fromLongPress = getSavedCardActions(departure, pages, labels);
    const fromMoreButton = getSavedCardActions(departure, pages, labels);
    expect(fromLongPress).toEqual(fromMoreButton);
    expect(fromLongPress.map((action) => action.id)).toEqual(['share', 'edit', 'move', 'remove']);
  });

  it('hides move on a one-page app and edit for active journeys', () => {
    const onePage: Page[] = [{ id: 'page-1', name: 'Home', segments: [departure] }];
    expect(getSavedCardActions(departure, onePage, labels).map((action) => action.id)).toEqual(['share', 'edit', 'remove']);
    const activeJourney = { ...journey, journeyMeta: { ...journey.journeyMeta!, status: 'active' as const } };
    expect(getSavedCardActions(activeJourney, [onePage[0], { id: 'page-2', name: 'Work', segments: [] }], labels).map((action) => action.id)).toEqual(['share', 'move', 'remove']);
  });
});
