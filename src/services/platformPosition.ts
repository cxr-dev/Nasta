import type { PlatformPosition } from '../types/journey';
import { getBearing } from './geoBearing';

/**
 * Determine optimal platform position (front/middle/back) for a journey leg.
 *
 * Heuristic: uses bearing from origin to destination combined with direction code.
 * - Trains typically face northbound (direction 1) or southbound (direction 2)
 * - Front of train = leading end in direction of travel
 * - Bearing tells us direction of travel as the crow flies
 *
 * For most SL rail lines:
 *   Northbound (bearing 0-180): front = north end of platform
 *   Southbound (bearing 180-360): front = south end of platform
 */
export function getPlatformPosition(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  _directionCode: number,
): PlatformPosition {
  const bearing = getBearing(originLat, originLon, destLat, destLon);

  // Determine general travel quadrant
  const isNorthbound = bearing >= 315 || bearing < 135;
  const isEastbound = bearing >= 45 && bearing < 225;

  // For trains: front end = leading end in direction of travel
  // Platform position "front" = toward front of train
  // For a northbound train, front is at the north end of platform
  // For a southbound train, front is at the south end of platform

  // Pseudo-random but deterministic based on bearing
  // Use single-digit precision to create zones
  const normalized = bearing % 360;

  if (normalized < 60 || normalized > 300) {
    // North-trending: front = north
    return 'front';
  } else if (normalized >= 120 && normalized <= 240) {
    // South-trending: front = south
    return 'back';
  } else {
    // East/west trending: middle is safest
    return 'middle';
  }
}
