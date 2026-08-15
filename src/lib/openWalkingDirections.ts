export type MapAppPreference = 'default' | 'google' | 'apple' | 'waze';
export type WalkingMapApp = 'google' | 'apple';

export const MAP_PREFERENCE_KEY = 'nasta_map_app_preference';

export function resolveWalkingMapApp(preference: MapAppPreference, userAgent: string): WalkingMapApp {
  if (preference === 'apple' || preference === 'google') return preference;
  return /iphone|ipad|ipod/i.test(userAgent) ? 'apple' : 'google';
}

export function getWalkingDirectionsUrl(preference: MapAppPreference, latitude: number, longitude: number, userAgent: string): string {
  const destination = `${latitude},${longitude}`;
  return resolveWalkingMapApp(preference, userAgent) === 'apple'
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;
}

export function loadMapPreference(): MapAppPreference {
  try {
    const stored = localStorage.getItem(MAP_PREFERENCE_KEY);
    if (stored === 'default' || stored === 'google' || stored === 'apple' || stored === 'waze') return stored;
  } catch { /* Storage is optional. */ }
  return 'default';
}

export function openWalkingDirections(latitude: number, longitude: number): void {
  if (typeof window === 'undefined') return;
  window.open(
    getWalkingDirectionsUrl(loadMapPreference(), latitude, longitude, navigator.userAgent),
    '_blank',
    'noopener,noreferrer',
  );
}
