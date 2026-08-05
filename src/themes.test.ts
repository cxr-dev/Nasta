import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  previewStyle,
  resolveTheme,
  THEMES,
  wcagContrast,
} from './themes';

describe('theme preferences', () => {
  it('exposes exactly the two handcrafted palettes', () => {
    expect(THEMES.map(theme => theme.id)).toEqual(['light', 'dark']);
  });

  it('resolves system preference without changing explicit choices', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('static theme tokens', () => {
  it.each(['light', 'dark'] as const)('%s has readable semantic pairs', theme => {
    applyTheme(theme);
    const element = document.documentElement;
    const root = element.style;
    const bg = root.getPropertyValue('--bg').trim();
    const surface = root.getPropertyValue('--surface').trim();
    const text = root.getPropertyValue('--text').trim();
    const secondary = root.getPropertyValue('--text-secondary').trim();
    const accent = root.getPropertyValue('--accent').trim();
    const onAccent = root.getPropertyValue('--text-on-accent').trim();

    expect(element.dataset.theme).toBe(theme);
    expect(wcagContrast(bg, text)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(surface, text)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(surface, secondary)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(accent, onAccent)).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(bg, surface)).toBeGreaterThanOrEqual(1.05);
  });

  it('sets the browser theme color to the active background', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);

    applyTheme('dark');

    expect(meta.content).toBe(document.documentElement.style.getPropertyValue('--bg').trim());
    meta.remove();
  });

  it('creates a compact preview style for the picker', () => {
    expect(previewStyle('light')).toContain('--preview-bg:#F7F7F5');
    expect(previewStyle('dark')).toContain('--preview-bg:#111211');
  });
});
