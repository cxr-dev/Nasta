import { describe, expect, it } from 'vitest';
import { getSunPosition, hasSun, hasShade } from './sunPosition';

describe('sunPosition', () => {
  // Stockholm summer solstice (June 21): sun should be up at noon
  it('Stockholm summer noon has sun', () => {
    const date = new Date('2026-06-21T12:00:00+02:00'); // CEST
    const pos = getSunPosition(59.3293, 18.0686, date);
    expect(pos.isDaytime).toBe(true);
    expect(pos.elevation).toBeGreaterThan(40); // High sun in summer
    expect(pos.label).toBe('sun');
    expect(pos.azimuth).toBeGreaterThan(150); // South-ish
    expect(pos.azimuth).toBeLessThan(210);
  });

  // Stockholm summer midnight: sun below horizon
  it('Stockholm summer midnight is shade', () => {
    const date = new Date('2026-06-21T00:00:00+02:00'); // CEST
    const pos = getSunPosition(59.3293, 18.0686, date);
    // In Stockholm, midnight sun is still visible in northern areas
    // At 59.3°N, we get civil twilight
    expect(pos.isDaytime).toBe(false);
    expect(pos.elevation).toBeLessThan(0);
    expect(pos.label).toBe('shade');
  });

  // Stockholm winter solstice (Dec 21): sun low but above 5°
  it('Stockholm winter noon has low sun', () => {
    const date = new Date('2026-12-21T12:00:00+01:00'); // CET
    const pos = getSunPosition(59.3293, 18.0686, date);
    expect(pos.isDaytime).toBe(true);
    expect(pos.elevation).toBeGreaterThan(0);
    expect(pos.elevation).toBeLessThan(15); // Very low winter sun (~7°)
    expect(pos.label).toBe('sun'); // Still above 5° threshold
  });

  // Equator noon at equinox: sun directly overhead
  it('Equator equinox noon has high sun', () => {
    const date = new Date('2026-03-20T12:00:00Z');
    const pos = getSunPosition(0, 0, date);
    expect(pos.isDaytime).toBe(true);
    expect(pos.elevation).toBeGreaterThan(80);
    expect(pos.label).toBe('sun');
  });

  // Helper functions
  it('hasSun returns true when sun elevation > 5°', () => {
    const date = new Date('2026-06-21T12:00:00+02:00');
    expect(hasSun(59.3293, 18.0686, date)).toBe(true);
  });

  it('hasShade returns true when sun elevation <= 0°', () => {
    const date = new Date('2026-06-21T00:00:00+02:00');
    expect(hasShade(59.3293, 18.0686, date)).toBe(true);
  });

  // Equator night
  it('Equator midnight at equinox has shade', () => {
    const date = new Date('2026-03-20T00:00:00Z');
    const pos = getSunPosition(0, 0, date);
    expect(pos.isDaytime).toBe(false);
    expect(pos.label).toBe('shade');
  });
});
