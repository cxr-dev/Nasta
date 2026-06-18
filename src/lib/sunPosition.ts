/**
 * Solar position calculation for sun/shade detection.
 * Uses NOAA Solar Position Algorithm (simplified).
 * No API calls — pure math, works offline.
 *
 * Accuracy: ±1° for elevation, sufficient for sun/shade heuristics.
 * Reference: https://gml.noaa.gov/grad/solcalc/
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type SunPosition = {
  /** Solar elevation in degrees above horizon (-90 to 90) */
  elevation: number;
  /** Solar azimuth in degrees from north (0–360) */
  azimuth: number;
  /** True if sun is above horizon (elevation > 0) */
  isDaytime: boolean;
  /** Sun quality label for UI display */
  label: 'sun' | 'low-sun' | 'shade';
};

/**
 * Calculate sun position at a given location and time.
 */
export function getSunPosition(
  lat: number,
  lon: number,
  date: Date = new Date(),
): SunPosition {
  const jd = julianDay(date);
  const jc = julianCentury(jd);

  // Geometric mean longitude of the sun (degrees)
  const L0 = (280.46646 + 36000.76983 * jc + 0.0003032 * jc * jc) % 360;

  // Mean anomaly of the sun (degrees)
  const M = 357.52911 + 35999.05029 * jc - 0.0001537 * jc * jc;

  // Eccentricity of Earth's orbit
  const e = 0.016708634 - 0.000042037 * jc - 0.0000001267 * jc * jc;

  // Equation of center
  const C =
    (1.914602 - 0.004817 * jc - 0.000014 * jc * jc) * Math.sin(M * DEG) +
    (0.019993 - 0.000101 * jc) * Math.sin(2 * M * DEG) +
    0.000289 * Math.sin(3 * M * DEG);

  // True longitude
  const trueLon = L0 + C;

  // Apparent longitude (corrected for nutation)
  const omega = 125.04 - 1934.136 * jc;
  const apparentLon = trueLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // Obliquity of ecliptic
  const meanObliquity =
    23 +
    (26 + (21.448 - 46.815 * jc - 0.00059 * jc * jc + 0.001813 * jc * jc * jc) / 60) / 60;
  const correction = 0.00256 * Math.cos(omega * DEG);
  const obliquity = meanObliquity + correction;

  // Solar declination
  const declination = Math.asin(
    Math.sin(obliquity * DEG) * Math.sin(apparentLon * DEG),
  );

  // Equation of time (minutes)
  const y = Math.tan(obliquity / 2 * DEG) ** 2;
  const eot =
    4 *
    (y * Math.sin(2 * L0 * DEG) -
      2 * e * Math.sin(M * DEG) +
      4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG) -
      0.5 * y * y * Math.sin(4 * L0 * DEG) -
      1.25 * e * e * Math.sin(2 * M * DEG));

  // Time correction factor
  const timeOffset = eot + 4 * lon; // minutes
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const solarTimeMinutes = utcMinutes + timeOffset;

  // Hour angle (degrees)
  let hourAngle = solarTimeMinutes / 4 - 180;
  hourAngle = ((hourAngle % 360) + 360) % 360;
  if (hourAngle > 180) hourAngle -= 360;

  // Solar elevation
  const latRad = lat * DEG;
  const decRad = declination;
  const haRad = hourAngle * DEG;

  const elevation = Math.asin(
    Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad),
  );

  // Solar azimuth
  const azRad = Math.atan2(
    -Math.sin(haRad),
    Math.tan(decRad) * Math.cos(latRad) -
      Math.sin(latRad) * Math.cos(haRad),
  );
  const azimuth = ((azRad * RAD) + 360) % 360;

  const elevDeg = elevation * RAD;

  return {
    elevation: elevDeg,
    azimuth,
    isDaytime: elevDeg > 0,
    label: elevDeg > 5 ? 'sun' : elevDeg > 0 ? 'low-sun' : 'shade',
  };
}

/**
 * Quick check if outdoor seating likely has sun right now.
 * Elevation threshold of 5° to account for horizon obstacles.
 */
export function hasSun(lat: number, lon: number, date?: Date): boolean {
  const pos = getSunPosition(lat, lon, date);
  return pos.label === 'sun';
}

/**
 * Quick check if outdoor seating is in shade right now.
 * Sun is below effective horizon or very low.
 */
export function hasShade(lat: number, lon: number, date?: Date): boolean {
  const pos = getSunPosition(lat, lon, date);
  return pos.label === 'shade';
}

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function julianCentury(jd: number): number {
  return (jd - 2451545) / 36525;
}
