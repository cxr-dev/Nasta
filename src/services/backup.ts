import type { Page, Segment, TransportType } from '../types/page';
import { savePages, saveSettings } from './storage';
import type { Settings } from './storage';

export const BACKUP_SCHEMA_VERSION = 1 as const;

export interface BackupDocument {
  app: 'nasta';
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  pages: Page[];
  settings: Settings;
}

export interface BackupCounts {
  pages: number;
  departures: number;
  journeys: number;
}

export interface MergeSummary {
  addedPages: number;
  addedSegments: number;
  alreadyPresent: number;
  keptCurrent: number;
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

const transportTypes: TransportType[] = ['bus', 'train', 'metro', 'boat', 'tram'];
const themes = ['light', 'dark', 'system'] as const;
const languages = ['auto', 'sv', 'en'] as const;
const thresholds = ['info', 'warning', 'critical'] as const;
const groupingModes = ['none', 'disrupted', 'station', 'transport'] as const;
const sortModes = ['time', 'station', 'transport', 'line', 'distance'] as const;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) return false;
  return (
    typeof value.refreshInterval === 'number' &&
    typeof value.hasSwipedRoutes === 'boolean' &&
    isEnum(value.theme, themes) &&
    isEnum(value.language, languages) &&
    typeof value.disruptionAlertsEnabled === 'boolean' &&
    isEnum(value.disruptionSeverityThreshold, thresholds) &&
    isEnum(value.disruptionLanguage, languages) &&
    Array.isArray(value.enabledTransportTypes) && value.enabledTransportTypes.every((type) => isEnum(type, transportTypes)) &&
    isEnum(value.transportFilterMode, ['multi', 'single']) &&
    (value.activeTransportType === null || isEnum(value.activeTransportType, transportTypes)) &&
    typeof value.locationServicesEnabled === 'boolean' &&
    typeof value.walkingEtaEnabled === 'boolean' &&
    typeof value.afterworkVenuesEnabled === 'boolean' &&
    typeof value.afterworkStartHour === 'number' &&
    Array.isArray(value.afterworkTypes) && value.afterworkTypes.every((type: unknown) => isEnum(type, ['beer', 'wine', 'cocktail'])) &&
    typeof value.eventsEnabled === 'boolean' &&
    typeof value.groupDisruptedSegments === 'boolean' &&
    isEnum(value.sortMode, sortModes) &&
    isEnum(value.groupingMode, groupingModes) &&
    typeof value.groupSleeping === 'boolean'
  );
}

function isSegment(value: unknown): value is Segment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.line === 'string' &&
    typeof value.lineName === 'string' &&
    isRecord(value.direction) && typeof value.direction.code === 'number' && typeof value.direction.destination === 'string' &&
    isRecord(value.fromStop) && typeof value.fromStop.id === 'string' && typeof value.fromStop.name === 'string' && typeof value.fromStop.siteId === 'string' &&
    isRecord(value.toStop) && typeof value.toStop.id === 'string' && typeof value.toStop.name === 'string' && typeof value.toStop.siteId === 'string' &&
    isEnum(value.transportType, transportTypes)
  );
}

function isPage(value: unknown): value is Page {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && typeof value.name === 'string' && Array.isArray(value.segments) && value.segments.every(isSegment);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createBackupDocument(pages: Page[], settings: Settings, exportedAt = new Date()): BackupDocument {
  return {
    app: 'nasta',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    pages: clone(pages),
    settings: clone(settings),
  };
}

export function persistRestoredData(pages: Page[], settings: Settings): void {
  const previousPages = localStorage.getItem('nasta_routes');
  const previousSettings = localStorage.getItem('nasta_settings');
  try {
    savePages(pages);
    saveSettings(settings);
  } catch (error) {
    try {
      if (previousPages === null) localStorage.removeItem('nasta_routes');
      else localStorage.setItem('nasta_routes', previousPages);
      if (previousSettings === null) localStorage.removeItem('nasta_settings');
      else localStorage.setItem('nasta_settings', previousSettings);
    } catch {
      // Preserve the original persistence error for the caller.
    }
    throw error;
  }
}

export function parseBackupDocument(value: unknown): BackupDocument {
  if (!isRecord(value) || value.app !== 'nasta' || value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupFormatError('Unsupported Nästa backup format');
  }
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new BackupFormatError('Backup export date is invalid');
  }
  if (!Array.isArray(value.pages) || !value.pages.every(isPage) || !isSettings(value.settings)) {
    throw new BackupFormatError('Backup data is incomplete or invalid');
  }
  return clone(value as BackupDocument);
}

export function summarizePages(pages: Page[]): BackupCounts {
  let departures = 0;
  let journeys = 0;
  for (const page of pages) {
    for (const segment of page.segments) {
      if (segment.journeyMeta) journeys += 1;
      else departures += 1;
    }
  }
  return { pages: pages.length, departures, journeys };
}

export function normalizeRestoredPages(pages: Page[]): Page[] {
  const restored = clone(pages);
  for (const page of restored) {
    for (const segment of page.segments) {
      const journey = segment.journeyMeta;
      if (!journey || journey.status !== 'active') continue;
      segment.journeyMeta = {
        ...journey,
        status: 'planned',
        activeSnapshot: undefined,
      };
      delete segment.journeyMeta.activeSnapshot;
    }
  }
  return restored;
}

export function mergePages(current: Page[], incoming: Page[]): { pages: Page[]; summary: MergeSummary } {
  const pages = clone(current);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const segmentById = new Map(pages.flatMap((page) => page.segments.map((segment) => [segment.id, segment] as const)));
  const summary: MergeSummary = { addedPages: 0, addedSegments: 0, alreadyPresent: 0, keptCurrent: 0 };

  for (const sourcePage of normalizeRestoredPages(incoming)) {
    const targetPage = pageById.get(sourcePage.id);
    if (!targetPage) {
      const newPage = clone(sourcePage);
      pages.push(newPage);
      pageById.set(newPage.id, newPage);
      for (const segment of newPage.segments) {
        segmentById.set(segment.id, segment);
        summary.addedSegments += 1;
      }
      summary.addedPages += 1;
      continue;
    }

    for (const sourceSegment of sourcePage.segments) {
      const existingSegment = segmentById.get(sourceSegment.id);
      if (existingSegment) {
        summary.alreadyPresent += 1;
        if (JSON.stringify(existingSegment) !== JSON.stringify(sourceSegment)) summary.keptCurrent += 1;
        continue;
      }
      targetPage.segments.push(clone(sourceSegment));
      segmentById.set(sourceSegment.id, targetPage.segments.at(-1)!);
      summary.addedSegments += 1;
    }
  }

  return { pages, summary };
}
