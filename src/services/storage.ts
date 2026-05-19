import type { Route, TransportType } from '../types/route';

const ROUTES_KEY = 'nasta_routes';
const SETTINGS_KEY = 'nasta_settings';

export interface Settings {
  darkMode: boolean;
  refreshInterval: number;
  /** @deprecated kept for backwards compatibility */
  funMode: boolean;
  hasSwipedRoutes: boolean;
  /** @deprecated kept for backwards compatibility */
  showNotifications: boolean;
  theme: string;
  themeVariant: 'A' | 'B';
  language: 'auto' | 'sv' | 'en';
  disruptionAlertsEnabled: boolean;
  disruptionSeverityThreshold: 'info' | 'warning' | 'critical';
  disruptionLanguage: 'sv' | 'en' | 'auto';
  enabledTransportTypes: TransportType[];
  walkingEtaEnabled: boolean;
}

const defaultSettings: Settings = {
  darkMode: true,
  refreshInterval: 30000,
  funMode: false,
  hasSwipedRoutes: false,
  showNotifications: false,
  theme: 'default',
  themeVariant: 'A',
  language: 'auto',
  disruptionAlertsEnabled: true,
  disruptionSeverityThreshold: 'warning',
  disruptionLanguage: 'auto',
  enabledTransportTypes: ['bus', 'train', 'metro', 'boat'],
  walkingEtaEnabled: true
};

export function loadRoutes(): Route[] {
  try {
    const data = localStorage.getItem(ROUTES_KEY);
    if (!data) return [];
    
    const routes: any[] = JSON.parse(data);
    if (!Array.isArray(routes)) return [];

    let migrated = false;
    const cleanRoutes = routes.map(route => {
      if (!route || !Array.isArray(route.segments)) return route;
      
      const cleanSegments = route.segments.map((seg: any) => {
        // If it's an old segment with directionText but no direction object
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
      
      return { ...route, segments: cleanSegments };
    });

    if (migrated) {
      console.log('[Storage] Migrated legacy route data to new format');
      saveRoutes(cleanRoutes);
    }
    
    return cleanRoutes;
  } catch (e) {
    console.error('[Storage] Failed to load routes:', e);
    return [];
  }
}

export function saveRoutes(routes: Route[]): void {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    const parsed = data ? JSON.parse(data) : {};
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
