import { writable } from 'svelte/store';
import type { Settings } from '../services/storage';
import type { TransportType } from '../types/route';
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
    },
    setLanguage: (language: Settings['language']) => {
      update(settings => {
        const updated = { ...settings, language };
        saveSettings(updated);
        return updated;
      });
    },
    setDisruptionAlertsEnabled: (enabled: boolean) => {
      update(settings => {
        const updated = { ...settings, disruptionAlertsEnabled: enabled };
        saveSettings(updated);
        return updated;
      });
    },
    setDisruptionSeverityThreshold: (
      threshold: Settings['disruptionSeverityThreshold']
    ) => {
      update(settings => {
        const updated = { ...settings, disruptionSeverityThreshold: threshold };
        saveSettings(updated);
        return updated;
      });
    },
    setDisruptionLanguage: (language: Settings['disruptionLanguage']) => {
      update(settings => {
        const updated = { ...settings, disruptionLanguage: language };
        saveSettings(updated);
        return updated;
      });
    },
    setLocationServicesEnabled: (enabled: boolean) => {
      update(settings => {
        const updated = { ...settings, locationServicesEnabled: enabled };
        saveSettings(updated);
        return updated;
      });
    },
    setWalkingEtaEnabled: (enabled: boolean) => {
      update(settings => {
        const updated = { ...settings, walkingEtaEnabled: enabled };
        saveSettings(updated);
        return updated;
      });
    },
    setAfterworkVenuesEnabled: (enabled: boolean) => {
      update(settings => {
        const updated = { ...settings, afterworkVenuesEnabled: enabled };
        saveSettings(updated);
        return updated;
      });
    },
    setAfterworkTypes: (types: Settings['afterworkTypes']) => {
      update(settings => {
        const updated = { ...settings, afterworkTypes: types };
        saveSettings(updated);
        return updated;
      });
    },
    toggleAfterworkType: (type: Settings['afterworkTypes'][number]) => {
      update(settings => {
        const afterworkTypes = settings.afterworkTypes ?? [];
        const updatedTypes = afterworkTypes.includes(type)
          ? afterworkTypes.filter(item => item !== type)
          : [...afterworkTypes, type];
        const updated = { ...settings, afterworkTypes: updatedTypes };
        saveSettings(updated);
        return updated;
      });
    },
    setEventsEnabled: (enabled: boolean) => {
      update(settings => {
        const updated = { ...settings, eventsEnabled: enabled };
        saveSettings(updated);
        return updated;
      });
    },
    setTransportFilterMode: (mode: 'multi' | 'single') => {
      update(settings => {
        const updated = { ...settings, transportFilterMode: mode };
        saveSettings(updated);
        return updated;
      });
    },
    setActiveTransportType: (type: TransportType | null) => {
      update(settings => {
        const updated = { ...settings, activeTransportType: type };
        saveSettings(updated);
        return updated;
      });
    },
  };
}

export const settingsStore = createSettingsStore();
