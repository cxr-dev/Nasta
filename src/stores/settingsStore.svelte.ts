import type { Settings } from '../services/storage';
import type { TransportType } from '../types/page';
import { loadSettings, saveSettings } from '../services/storage';

let _settings = $state<Settings>(loadSettings());

export function getSettings(): Settings {
  return _settings;
}

export function setDarkMode(darkMode: boolean) {
  _settings = { ..._settings, darkMode };
  saveSettings(_settings);
}

export function toggleDarkMode() {
  _settings = { ..._settings, darkMode: !_settings.darkMode };
  saveSettings(_settings);
}

export function setRefreshInterval(interval: number) {
  _settings = { ..._settings, refreshInterval: interval };
  saveSettings(_settings);
}

export function toggleFunMode() {
  _settings = { ..._settings, funMode: !_settings.funMode };
  saveSettings(_settings);
}

export function markSwiped() {
  _settings = { ..._settings, hasSwipedRoutes: true };
  saveSettings(_settings);
}

export function toggleNotifications() {
  _settings = { ..._settings, showNotifications: !_settings.showNotifications };
  saveSettings(_settings);
}

export function setTheme(theme: string, themeVariant: 'A' | 'B') {
  _settings = { ..._settings, theme, themeVariant };
  saveSettings(_settings);
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

export function setActiveTransportType(type: TransportType | null) {
  _settings = { ..._settings, activeTransportType: type };
  saveSettings(_settings);
}
