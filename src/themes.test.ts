import { describe, it, expect } from 'vitest';
import { needsLightText, THEMES, applyTheme, wcagContrast, wcagLuminance, deriveTextColor, getVariantName, hexToOklch } from './themes';

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
  it('has 22 entries including default', () => {
    expect(THEMES).toHaveLength(22);
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

describe('getVariantName', () => {
  it('appends " Dark" suffix for dark-mode variants', () => {
    // Default variant B (bg=#171717) is dark
    expect(getVariantName('default', 'B')).toBe('Default Dark');
  });

  it('returns plain name for light-mode variants', () => {
    expect(getVariantName('default', 'A')).toBe('Default');
    // Wild Orchid variant A (bg=#E056FD, L≈0.299) is classified dark by needsLightText
    // Use a definitively light variant instead
    expect(getVariantName('solar-violet', 'B')).toBe('Solar Violet');
  });

  it('works for all 22 themes × 2 variants', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        const name = getVariantName(theme.id, variant);
        expect(name).toBeTruthy();
        // Dark variants must end with " Dark", light variants must not
        if (theme.variants[variant].isLight) {
          expect(name).not.toMatch(/ Dark$/);
        } else {
          expect(name).toMatch(/ Dark$/);
        }
      }
    }
  });
});

describe('surface color (OKLCH derivation)', () => {
  it('light-mode surfaces have perceptible luminance (L ≥ 0.90)', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        if (!theme.variants[variant].isLight) continue;
        applyTheme(theme.id, variant);
        const raw = document.documentElement.style.getPropertyValue('--surface').trim();
        const surfaceHex = raw.startsWith('#') ? raw : `#${raw}`;
        const [sl] = hexToOklch(surfaceHex);
        expect(sl, `${theme.id}[${variant}] surface L=${sl.toFixed(2)} < 0.90`).toBeGreaterThanOrEqual(0.90);
      }
    }
  });

  it('light-mode surfaces never fall back to pure white (#FFFFFF)', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        if (!theme.variants[variant].isLight) continue;
        applyTheme(theme.id, variant);
        const surface = document.documentElement.style.getPropertyValue('--surface').trim();
        expect(surface.toUpperCase(), `${theme.id}[${variant}] surface is #FFFFFF`).not.toBe('#FFFFFF');
      }
    }
  });

  it('light-mode surface color is never identical to raw colorA or colorB', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        if (!theme.variants[variant].isLight) continue;
        applyTheme(theme.id, variant);
        const surface = document.documentElement.style.getPropertyValue('--surface').trim().toUpperCase();
        expect(surface, `${theme.id}[${variant}] surface matches colorA`).not.toBe(theme.colorA.toUpperCase());
        expect(surface, `${theme.id}[${variant}] surface matches colorB`).not.toBe(theme.colorB.toUpperCase());
      }
    }
  });
});

describe('contrast validation', () => {
  const MIN_TEXT_CONTRAST = 4.5;
  const MIN_UI_CONTRAST = 3.0;

  it('all theme text-on-bg meets 4.5:1 WCAG AA', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        const bg = variant === 'A' ? theme.colorA : theme.colorB;
        const rawAccent = variant === 'A' ? theme.colorB : theme.colorA;
        const text = deriveTextColor(bg, rawAccent);
        const contrast = wcagContrast(bg, text);
        expect(contrast,
          `${theme.id} [${variant}] text-on-bg contrast ${contrast.toFixed(2)} < ${MIN_TEXT_CONTRAST}`
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('all theme accent-on-bg meets 3:1 WCAG 1.4.11 non-text', () => {
    // applyTheme uses ensureAccentContrast internally — verify via CSS custom property
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        const bg = variant === 'A' ? theme.colorA : theme.colorB;
        // Simulate applyTheme's accent logic: ensureAccentContrast(rawAccent, bg)
        // Cannot call ensureAccentContrast directly (not exported), so verify
        // by applying theme and reading the computed --accent property
        applyTheme(theme.id, variant);
        const accent = document.documentElement.style.getPropertyValue('--accent').trim();
        // applyTheme sets hex values without quotes, but getPropertyValue may vary
        const accentHex = accent.startsWith('#') ? accent : `#${accent}`;
        const contrast = wcagContrast(bg, accentHex);
        expect(contrast,
          `${theme.id} [${variant}] accent-on-bg contrast ${contrast.toFixed(2)} < ${MIN_UI_CONTRAST}`
        ).toBeGreaterThanOrEqual(MIN_UI_CONTRAST);
      }
    }
  });

  it('all theme text-on-accent meets 4.5:1 WCAG AA', () => {
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        applyTheme(theme.id, variant);
        const accent = document.documentElement.style.getPropertyValue('--accent').trim();
        const textOnAccent = document.documentElement.style.getPropertyValue('--text-on-accent').trim();
        const accentHex = accent.startsWith('#') ? accent : `#${accent}`;
        const textHex = textOnAccent.startsWith('#') ? textOnAccent : `#${textOnAccent}`;
        const contrast = wcagContrast(accentHex, textHex);
        expect(contrast,
          `${theme.id} [${variant}] text-on-accent contrast ${contrast.toFixed(2)} < ${MIN_TEXT_CONTRAST}`
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('deriveTextColor never returns unchecked pure white/black fallback', () => {
    // Regression: previously fell through to unchecked '#FFFFFF' for mid-luminance bgs
    for (const theme of THEMES) {
      for (const variant of ['A', 'B'] as const) {
        const bg = variant === 'A' ? theme.colorA : theme.colorB;
        const rawAccent = variant === 'A' ? theme.colorB : theme.colorA;
        const text = deriveTextColor(bg, rawAccent);
        const contrast = wcagContrast(bg, text);
        // The returned color must actually beat both pure white and pure black
        const whiteC = wcagContrast(bg, '#FFFFFF');
        const blackC = wcagContrast(bg, '#171717');
        const bestPure = Math.max(whiteC, blackC);
        expect(contrast,
          `${theme.id} [${variant}] contrast ${contrast.toFixed(2)} worse than best pure ${bestPure.toFixed(2)}`
        ).toBeGreaterThanOrEqual(bestPure - 0.001); // floating point tolerance
      }
    }
  });
});
