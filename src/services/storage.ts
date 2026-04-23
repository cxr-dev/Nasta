import type { Route } from '../types/route';

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
  commuteNudgesEnabled: boolean;
  homeAnchor: string;
  workAnchor: string;
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
  commuteNudgesEnabled: false,
  homeAnchor: '',
  workAnchor: ''
};

export function loadRoutes(): Route[] {
  try {
    const data = localStorage.getItem(ROUTES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
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
