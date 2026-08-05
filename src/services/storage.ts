import type { Page, TransportType, SortMode, GroupingMode } from '../types/page';
import type { ThemePreference } from '../themes';

const ROUTES_KEY = 'nasta_routes';
const SETTINGS_KEY = 'nasta_settings';

export interface Settings {
  refreshInterval: number;
  hasSwipedRoutes: boolean;
  theme: ThemePreference;
  language: 'auto' | 'sv' | 'en';
  disruptionAlertsEnabled: boolean;
  disruptionSeverityThreshold: 'info' | 'warning' | 'critical';
  disruptionLanguage: 'sv' | 'en' | 'auto';
  enabledTransportTypes: TransportType[];
  transportFilterMode: 'multi' | 'single';
  activeTransportType: TransportType | null;
  locationServicesEnabled: boolean;
  walkingEtaEnabled: boolean;
  afterworkVenuesEnabled: boolean;
  afterworkStartHour: number;
  afterworkTypes: Array<'beer' | 'wine' | 'cocktail'>;
  eventsEnabled: boolean;
  groupDisruptedSegments: boolean;
  sortMode: SortMode;
  groupingMode: GroupingMode;
  groupSleeping: boolean;
}

const defaultSettings: Settings = {
  refreshInterval: 30000,
  hasSwipedRoutes: false,
  theme: 'system',
  language: 'auto',
  disruptionAlertsEnabled: true,
  disruptionSeverityThreshold: 'warning',
  disruptionLanguage: 'auto',
  enabledTransportTypes: ['bus', 'train', 'metro', 'boat', 'tram'],
  transportFilterMode: 'multi',
  activeTransportType: null,
  locationServicesEnabled: false,
  walkingEtaEnabled: false,
  afterworkVenuesEnabled: false,
  afterworkStartHour: 15,
  afterworkTypes: [],
  eventsEnabled: false,
  groupDisruptedSegments: false,
  sortMode: 'manual',
  groupingMode: 'none',
  groupSleeping: false,
};

export function loadPages(): Page[] {
  try {
    const data = localStorage.getItem(ROUTES_KEY);
    if (!data) return [];
    
    const pages: any[] = JSON.parse(data);
    if (!Array.isArray(pages)) return [];

    let migrated = false;
    const cleanPages = pages.map(page => {
      if (!page || !Array.isArray(page.segments)) return page;
      
      const cleanSegments = page.segments.map((seg: any) => {
        if (!seg) return seg;

        // Migration 1: legacy directionText → direction object
        if (seg.directionText && !seg.direction) {
          migrated = true;
          const { directionText, ...rest } = seg;
          seg = {
            ...rest,
            direction: {
              code: 1,
              destination: directionText,
              stopPointId: ''
            }
          };
        }

        if (seg.journeyMeta) {
          const journey = seg.journeyMeta;
          const query = journey.query ?? {
            origin: journey.originLabel ?? seg.fromStop?.name ?? '',
            destination: journey.destLabel ?? seg.toStop?.name ?? '',
          };
          if (!journey.query || !journey.status) migrated = true;
          seg = {
            ...seg,
            journeyMeta: {
              ...journey,
              query,
              status: journey.status ?? 'planned',
            },
          };
        }

        return seg;
      });
      
      return { ...page, segments: cleanSegments };
    });

    if (migrated) {
      console.log('[Storage] Migrated legacy page data to new format');
      savePages(cleanPages);
    }
    
    return cleanPages;
  } catch (e) {
    console.error('[Storage] Failed to load pages:', e);
    return [];
  }
}

export function savePages(pages: Page[]): void {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(pages));
}

export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    const parsed: Record<string, unknown> = data ? JSON.parse(data) : {};
    const merged = { ...defaultSettings, ...parsed } as Settings;

    // Theme migration is intentionally resolved after spreading defaults so
    // malformed legacy values cannot leak into the new public settings shape.
    if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
      merged.theme = parsed.theme;
    } else if (typeof parsed.darkMode === 'boolean') {
      merged.theme = parsed.darkMode ? 'dark' : 'light';
    } else if (parsed.themeVariant === 'A' || parsed.themeVariant === 'B') {
      // Legacy variants represented the light/dark choice for the old palette
      // model. The old B variant was the dark choice for the palettes users
      // most commonly had selected; palette identity itself is discarded.
      merged.theme = parsed.themeVariant === 'B' ? 'dark' : 'light';
    } else {
      merged.theme = 'system';
    }

    delete (merged as Partial<Settings> & { darkMode?: unknown }).darkMode;
    delete (merged as Partial<Settings> & { themeVariant?: unknown }).themeVariant;
    if (parsed.groupDisruptedSegments === true && !parsed.groupingMode) {
      merged.groupingMode = 'disrupted';
    }
    if (typeof parsed.locationServicesEnabled !== 'boolean') {
      const legacyLocationPrompt = localStorage.getItem('nasta_location_prompted');
      if (legacyLocationPrompt === 'enabled') {
        merged.locationServicesEnabled = true;
      }
    }
    return merged;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
