import { clearLocationSession } from './geo';
import { clearFeatureDiscoveryCache } from './featureDiscoverySession';
import { persistentCache } from './persistentCache';
import { clearRouteStopsCache } from './routeStops';
import { clearAllCache } from './scheduleCache';
import { clearTimetableCache } from './timetableCache';
import { clearVenueCache } from './venueService';
import { clearWeatherCache } from './weatherCache';

const EXACT_LOCAL_KEYS = new Set([
  'nasta_routes',
  'nasta_settings',
  'nasta_recent_stops',
  'nasta_map_app_preference',
  'nasta-dismissed-deviations',
  'nasta_stop_area_mapping',
  'nasta_location_prompted',
  'nasta_deviations_cache_v1',
  'nasta_schedule_cache_v1',
]);

export async function clearAppOwnedData(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    const keysToRemove = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key !== null && (EXACT_LOCAL_KEYS.has(key) || key.startsWith('nasta_venues_v2:')));
    for (const key of keysToRemove) localStorage.removeItem(key);
  }

  clearLocationSession();
  clearFeatureDiscoveryCache();
  clearRouteStopsCache();
  clearTimetableCache();
  clearVenueCache();
  clearWeatherCache();
  await clearAllCache();
  await persistentCache.clearAll();
}
