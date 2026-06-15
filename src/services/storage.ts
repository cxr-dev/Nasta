import type { Page, TransportType } from '../types/page';

const ROUTES_KEY = 'nasta_routes';
const SETTINGS_KEY = 'nasta_settings';

export interface Settings {
  darkMode: boolean;
  refreshInterval: number;
  hasSwipedRoutes: boolean;
  theme: string;
  themeVariant: 'A' | 'B';
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
}

const defaultSettings: Settings = {
  darkMode: true,
  refreshInterval: 30000,
  hasSwipedRoutes: false,
  theme: 'default',
  themeVariant: 'A',
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
        if (seg && seg.directionText && !seg.direction) {
          migrated = true;
          const { directionText, ...rest } = seg;
          return {
            ...rest,
            direction: {
              code: 1,
              destination: directionText,
              stopPointId: ''
            }
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
    const parsed = data ? JSON.parse(data) : {};
    const merged = { ...defaultSettings, ...parsed };
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
