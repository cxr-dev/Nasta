import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRoutes, saveRoutes, loadSettings, saveSettings } from './storage';

describe('storage service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('routes', () => {
    it('returns empty array when no routes stored', () => {
      expect(loadRoutes()).toEqual([]);
    });

    it('returns stored routes', () => {
      const routes = [{ 
        id: '1', 
        name: 'Arbete', 
        direction: 'toWork' as const, 
        segments: [] 
      }];
      localStorage.setItem('nasta_routes', JSON.stringify(routes));
      expect(loadRoutes()).toEqual(routes);
    });

    it('returns empty array on parse error', () => {
      localStorage.setItem('nasta_routes', 'invalid json');
      expect(loadRoutes()).toEqual([]);
    });

    it('saves routes to localStorage', () => {
      const routes = [{ 
        id: '1', 
        name: 'Hem', 
        direction: 'fromWork' as const, 
        segments: [] 
      }];
      saveRoutes(routes);
      expect(localStorage.getItem('nasta_routes')).toBe(JSON.stringify(routes));
    });
  });

  describe('settings', () => {
    it('returns default settings when none stored', () => {
      expect(loadSettings()).toEqual({
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
      });
    });

    it('returns stored settings', () => {
      localStorage.setItem('nasta_settings', JSON.stringify({ darkMode: false }));
      const settings = loadSettings();
      expect(settings.darkMode).toBe(false);
      expect(settings.refreshInterval).toBe(30000);
    });

    it('saves settings to localStorage', () => {
      const settings = {
        darkMode: false,
        refreshInterval: 60000,
        funMode: false,
        hasSwipedRoutes: true,
        showNotifications: false,
        theme: 'electric-pulse',
        themeVariant: 'B' as const,
        language: 'en' as const,
        disruptionAlertsEnabled: true,
        disruptionSeverityThreshold: 'critical' as const,
        disruptionLanguage: 'sv' as const,
        commuteNudgesEnabled: true,
        homeAnchor: 'Liljeholmen',
        workAnchor: 'T-Centralen'
      };
      saveSettings(settings);
      expect(localStorage.getItem('nasta_settings')).toBe(JSON.stringify(settings));
    });
  });
});
