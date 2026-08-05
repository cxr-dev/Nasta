import type { Settings } from '../services/storage';
import type { TransportType } from '../types/page';
import type { ThemePreference } from '../themes';
import { loadSettings, saveSettings } from '../services/storage';

let _settings = $state<Settings>(loadSettings());

export function getSettings(): Settings {
  return _settings;
}

export function setRefreshInterval(interval: number) {
  _settings = { ..._settings, refreshInterval: interval };
  saveSettings(_settings);
}

export function markSwiped() {
  _settings = { ..._settings, hasSwipedRoutes: true };
  saveSettings(_settings);
}

export function setTheme(theme: ThemePreference) {
  _settings = { ..._settings, theme };
  saveSettings(_settings);
}

export function toggleTheme() {
  setTheme(_settings.theme === 'dark' ? 'light' : 'dark');
}

export function setLanguage(language: Settings['language']) {
  _settings = { ..._settings, language };
  saveSettings(_settings);
}

export function setDisruptionAlertsEnabled(enabled: boolean) {
  _settings = { ..._settings, disruptionAlertsEnabled: enabled };
  saveSettings(_settings);
}

export function setDisruptionSeverityThreshold(threshold: Settings['disruptionSeverityThreshold']) {
  _settings = { ..._settings, disruptionSeverityThreshold: threshold };
  saveSettings(_settings);
}

export function setDisruptionLanguage(language: Settings['disruptionLanguage']) {
  _settings = { ..._settings, disruptionLanguage: language };
  saveSettings(_settings);
}

export function setLocationServicesEnabled(enabled: boolean) {
  _settings = { ..._settings, locationServicesEnabled: enabled };
  saveSettings(_settings);
}

export function setWalkingEtaEnabled(enabled: boolean) {
  _settings = { ..._settings, walkingEtaEnabled: enabled };
  saveSettings(_settings);
}

export function setAfterworkVenuesEnabled(enabled: boolean) {
  _settings = { ..._settings, afterworkVenuesEnabled: enabled };
  saveSettings(_settings);
}

export function setAfterworkStartHour(hour: number) {
  _settings = { ..._settings, afterworkStartHour: Math.min(23, Math.max(0, hour)) };
  saveSettings(_settings);
}

export function setEventsEnabled(enabled: boolean) {
  _settings = { ..._settings, eventsEnabled: enabled };
  saveSettings(_settings);
}

export function setGroupDisruptedSegments(enabled: boolean) {
  _settings = { ..._settings, groupingMode: enabled ? 'disrupted' : 'none' };
  saveSettings(_settings);
}

export function setSortMode(mode: Settings['sortMode']) {
  _settings = { ..._settings, sortMode: mode };
  saveSettings(_settings);
}

export function setGroupingMode(mode: Settings['groupingMode']) {
  _settings = { ..._settings, groupingMode: mode };
  saveSettings(_settings);
}

export function setActiveTransportType(type: TransportType | null) {
  _settings = { ..._settings, activeTransportType: type };
  saveSettings(_settings);
}

export function setGroupSleeping(enabled: boolean) {
  _settings = { ..._settings, groupSleeping: enabled };
  saveSettings(_settings);
}
