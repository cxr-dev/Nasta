import type { Route } from '../types/route';

const ROUTES_KEY = 'nasta_routes';
const SETTINGS_KEY = 'nasta_settings';

export interface Settings {
  darkMode: boolean;
  refreshInterval: number;
  funMode: boolean;
  hasSwipedRoutes: boolean;
  showNotifications: boolean;
  theme: string;
  themeVariant: 'A' | 'B';
  language: 'auto' | 'sv' | 'en';
}

const defaultSettings: Settings = {
  darkMode: true,
  refreshInterval: 30000,
  funMode: true,
  hasSwipedRoutes: false,
  showNotifications: true,
  theme: 'default',
  themeVariant: 'A',
  language: 'auto'
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
    return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
