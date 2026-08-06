import type { Settings } from '../services/storage';
import type { TransportType } from '../types/page';
import type { ThemePreference } from '../themes';
import { loadSettings, saveSettings } from '../services/storage';

let _settings = $state<Settings>(loadSettings());
let _persistenceFailed = $state(false);
let _pendingSettings: Settings | null = null;
const persistenceSubscribers: Array<(failed: boolean) => void> = [];

function persistSettings(next: Settings): boolean {
  _settings = next;
  _pendingSettings = next;
  try {
    saveSettings(_settings);
    _persistenceFailed = false;
    _pendingSettings = null;
  } catch {
    _persistenceFailed = true;
  }
  for (const subscriber of persistenceSubscribers) subscriber(_persistenceFailed);
  return !_persistenceFailed;
}

export function retryPersistence(): boolean {
  return _pendingSettings ? persistSettings(_pendingSettings) : true;
}

export function subscribePersistence(fn: (failed: boolean) => void): () => void {
  persistenceSubscribers.push(fn);
  fn(_persistenceFailed);
  return () => {
    const index = persistenceSubscribers.indexOf(fn);
    if (index >= 0) persistenceSubscribers.splice(index, 1);
  };
}

export function getSettings(): Settings {
  return _settings;
}

export function setRefreshInterval(interval: number) {
  return persistSettings({ ..._settings, refreshInterval: interval });
}

export function markSwiped() {
  return persistSettings({ ..._settings, hasSwipedRoutes: true });
}

export function setTheme(theme: ThemePreference) {
  return persistSettings({ ..._settings, theme });
}

export function toggleTheme() {
  setTheme(_settings.theme === 'dark' ? 'light' : 'dark');
}

export function setLanguage(language: Settings['language']) {
  return persistSettings({ ..._settings, language });
}

export function setDisruptionAlertsEnabled(enabled: boolean) {
  return persistSettings({ ..._settings, disruptionAlertsEnabled: enabled });
}

export function setDisruptionSeverityThreshold(threshold: Settings['disruptionSeverityThreshold']) {
  return persistSettings({ ..._settings, disruptionSeverityThreshold: threshold });
}

export function setDisruptionLanguage(language: Settings['disruptionLanguage']) {
  return persistSettings({ ..._settings, disruptionLanguage: language });
}

export function setLocationServicesEnabled(enabled: boolean) {
  return persistSettings({ ..._settings, locationServicesEnabled: enabled });
}

export function setWalkingEtaEnabled(enabled: boolean) {
  return persistSettings({ ..._settings, walkingEtaEnabled: enabled });
}

export function setAfterworkVenuesEnabled(enabled: boolean) {
  return persistSettings({ ..._settings, afterworkVenuesEnabled: enabled });
}

export function setAfterworkStartHour(hour: number) {
  return persistSettings({ ..._settings, afterworkStartHour: Math.min(23, Math.max(0, hour)) });
}

export function setEventsEnabled(enabled: boolean) {
  return persistSettings({ ..._settings, eventsEnabled: enabled });
}

export function setGroupDisruptedSegments(enabled: boolean) {
  return persistSettings({ ..._settings, groupingMode: enabled ? 'disrupted' : 'none' });
}

export function setSortMode(mode: Settings['sortMode']) {
  return persistSettings({ ..._settings, sortMode: mode });
}

export function setGroupingMode(mode: Settings['groupingMode']) {
  return persistSettings({ ..._settings, groupingMode: mode });
}

export function setActiveTransportType(type: TransportType | null) {
  return persistSettings({ ..._settings, activeTransportType: type });
}

export function setGroupSleeping(enabled: boolean) {
  return persistSettings({ ..._settings, groupSleeping: enabled });
}
