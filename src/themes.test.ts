import { describe, it, expect } from 'vitest';
import { needsLightText, THEMES, applyTheme } from './themes';

describe('needsLightText', () => {
  it('returns true for dark colors', () => {
    expect(needsLightText('#000000')).toBe(true);
    expect(needsLightText('#1A4D2E')).toBe(true);
    expect(needsLightText('#635BFF')).toBe(true);
    expect(needsLightText('#080808')).toBe(true);
  });

  it('returns false for light colors', () => {
    expect(needsLightText('#FFFFFF')).toBe(false);
    expect(needsLightText('#FAFAF9')).toBe(false);
    expect(needsLightText('#DFFF00')).toBe(false);
    expect(needsLightText('#FEE12B')).toBe(false);
  });
});

describe('THEMES', () => {
  it('has 16 entries including default', () => {
    expect(THEMES).toHaveLength(16);
  });

  it('each theme has id, name, colorA, colorB', () => {
    for (const theme of THEMES) {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(theme.colorA).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.colorB).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('default theme uses white/black palette', () => {
    const def = THEMES.find(t => t.id === 'default');
    expect(def?.colorA).toBe('#FAFAF9');
    expect(def?.colorB).toBe('#171717');
  });
});

describe('notificationDuration (inline)', () => {
  function notificationDuration(text: string): number {
    return Math.max(2000, Math.min(6000, text.length * 60));
  }

  it('short text gets minimum 2000ms', () => {
    expect(notificationDuration('Hi')).toBe(2000);
    expect(notificationDuration('God morgon!')).toBe(2000); // 11 * 60 = 660 → clamped to 2000
  });

  it('medium text scales with length', () => {
    const text = 'A'.repeat(50); // 50 * 60 = 3000
    expect(notificationDuration(text)).toBe(3000);
  });

  it('very long text capped at 6000ms', () => {
    const text = 'A'.repeat(200); // 200 * 60 = 12000 → clamped to 6000
    expect(notificationDuration(text)).toBe(6000);
  });
});
