import { describe, expect, it, vi } from 'vitest';
import type { Page } from '../types/page';
import type { Settings } from './storage';
import {
  BACKUP_SCHEMA_VERSION,
  createBackupDocument,
  mergePages,
  normalizeRestoredPages,
  parseBackupDocument,
  persistRestoredData,
  summarizePages,
} from './backup';

const settings: Settings = {
  refreshInterval: 30000,
  hasSwipedRoutes: false,
  theme: 'dark',
  language: 'en',
  disruptionAlertsEnabled: true,
  disruptionSeverityThreshold: 'warning',
  disruptionLanguage: 'auto',
  enabledTransportTypes: ['bus'],
  transportFilterMode: 'multi',
  activeTransportType: null,
  locationServicesEnabled: false,
  walkingEtaEnabled: false,
  afterworkVenuesEnabled: false,
  afterworkStartHour: 15,
  afterworkTypes: [],
  eventsEnabled: false,
  groupDisruptedSegments: false,
  sortMode: 'time',
  groupingMode: 'none',
  groupSleeping: false,
};

function page(id: string, segmentIds: string[] = []): Page {
  return {
    id,
    name: id,
    segments: segmentIds.map((segmentId) => ({
      id: segmentId,
      line: '17',
      lineName: '17',
      direction: { code: 1, destination: 'Skarpnäck', stopPointId: 'sp' },
      fromStop: { id: 'from', name: 'Slussen', siteId: '100' },
      toStop: { id: 'to', name: 'Skarpnäck', siteId: '200' },
      transportType: 'metro',
    })),
  };
}

describe('backup service', () => {
  it('creates and parses a versioned document with useful counts', () => {
    const pages = [page('work', ['departure-1', 'journey-1'])];
    pages[0].segments[1].journeyMeta = {
      journeyId: 'journey-1',
      originLabel: 'Slussen',
      destLabel: 'Skarpnäck',
      legs: [],
      totalDurationMin: 10,
      transfers: 0,
      query: { origin: 'Slussen', destination: 'Skarpnäck' },
      status: 'planned',
      updatedAt: 1,
    };
    const document = createBackupDocument(pages, settings, new Date('2026-08-11T10:00:00.000Z'));

    expect(document).toMatchObject({
      app: 'nasta',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-08-11T10:00:00.000Z',
    });
    expect(summarizePages(document.pages)).toEqual({ pages: 1, departures: 1, journeys: 1 });
    expect(parseBackupDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('rejects malformed and unsupported documents', () => {
    expect(() => parseBackupDocument({})).toThrow();
    expect(() => parseBackupDocument({ app: 'nasta', schemaVersion: 99 })).toThrow();
    expect(() => parseBackupDocument({
      app: 'nasta',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: 'not-a-date',
      pages: [],
      settings,
    })).toThrow();
  });

  it('normalizes active journeys to planned journeys without live snapshots', () => {
    const active = page('work', ['journey-1']);
    active.segments[0].journeyMeta = {
      journeyId: 'journey-1',
      originLabel: 'Slussen',
      destLabel: 'Skarpnäck',
      legs: [],
      totalDurationMin: 10,
      transfers: 0,
      query: { origin: 'Slussen', destination: 'Skarpnäck' },
      status: 'active',
      activeSnapshot: { journeyId: 'journey-1', selectedAt: 1, plannedDepartureTime: 2, plannedArrivalTime: 3, legs: [] },
      updatedAt: 1,
    };

    const restored = normalizeRestoredPages([active]);
    expect(restored[0].segments[0].journeyMeta).toMatchObject({ status: 'planned' });
    expect(restored[0].segments[0].journeyMeta).not.toHaveProperty('activeSnapshot');
  });

  it('merges idempotently and keeps current content on matching IDs', () => {
    const current = [page('work', ['departure-1'])];
    current[0].name = 'Current work';
    const incoming = [page('work', ['departure-1', 'departure-2']), page('home', ['departure-3'])];

    const first = mergePages(current, incoming);
    expect(first.pages.map((value) => value.id)).toEqual(['work', 'home']);
    expect(first.pages[0].name).toBe('Current work');
    expect(first.pages[0].segments.map((value) => value.id)).toEqual(['departure-1', 'departure-2']);
    expect(first.summary).toMatchObject({ addedPages: 1, addedSegments: 2, alreadyPresent: 1, keptCurrent: 0 });

    const second = mergePages(first.pages, incoming);
    expect(second.pages).toEqual(first.pages);
    expect(second.summary).toMatchObject({ addedPages: 0, addedSegments: 0, alreadyPresent: 3, keptCurrent: 0 });
  });

  it('rolls back the first write when the second persistence write fails', () => {
    localStorage.setItem('nasta_routes', 'old-routes');
    localStorage.setItem('nasta_settings', 'old-settings');
    const originalSetItem = localStorage.setItem;
    const setItem = vi.spyOn(localStorage, 'setItem');
    setItem
      .mockImplementationOnce(originalSetItem)
      .mockImplementationOnce(() => { throw new Error('quota'); })
      .mockImplementation(originalSetItem);

    expect(() => persistRestoredData([], settings)).toThrow('quota');
    expect(localStorage.getItem('nasta_routes')).toBe('old-routes');
    expect(localStorage.getItem('nasta_settings')).toBe('old-settings');
    setItem.mockRestore();
  });
});
