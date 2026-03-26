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
    }
  };
}

export const settingsStore = createSettingsStore();
