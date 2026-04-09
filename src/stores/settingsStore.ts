import { writable, get } from 'svelte/store';
import type { Settings } from '../services/storage';
import { loadSettings, saveSettings } from '../services/storage';

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(loadSettings());

  return {
    subscribe,
    setDarkMode: (darkMode: boolean) => {
      update(settings => {
        const updated = { ...settings, darkMode };
        saveSettings(updated);
        return updated;
      });
    },
    toggleDarkMode: () => {
      update(settings => {
        const updated = { ...settings, darkMode: !settings.darkMode };
        saveSettings(updated);
        return updated;
      });
    },
    setRefreshInterval: (interval: number) => {
      update(settings => {
        const updated = { ...settings, refreshInterval: interval };
        saveSettings(updated);
        return updated;
      });
    },
    toggleFunMode: () => {
      update(settings => {
        const updated = { ...settings, funMode: !settings.funMode };
        saveSettings(updated);
        return updated;
      });
    },
    markSwiped: () => {
      update(settings => {
        const updated = { ...settings, hasSwipedRoutes: true };
        saveSettings(updated);
        return updated;
      });
    },
    toggleNotifications: () => {
      update(settings => {
        const updated = { ...settings, showNotifications: !settings.showNotifications };
        saveSettings(updated);
        return updated;
      });
    },
    setTheme: (theme: string, themeVariant: 'A' | 'B') => {
      update(settings => {
        const updated = { ...settings, theme, themeVariant };
        saveSettings(updated);
        return updated;
      });
    }
  };
}

export const settingsStore = createSettingsStore();
