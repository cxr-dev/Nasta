/**
 * Geo bearing and direction utilities.
 */

/**
 * Calculate initial bearing from point1 to point2.
 * Returns degrees (0-360): 0 = North, 90 = East, 180 = South, 270 = West.
 */
export function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.cos(dLon);
  const bearingRad = Math.atan2(y, x);
  const bearing = (bearingRad * (180 / Math.PI) + 360) % 360;
  return Math.round(bearing);
}

/**
 * Convert bearing to cardinal direction label.
 */
export function bearingToCardinal(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}
