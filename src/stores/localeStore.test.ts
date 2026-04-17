import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectLocale } from '../lib/i18n';
import { resolveLocale } from './localeStore';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('locale selection', () => {
  it('defaults to Swedish for Swedish browser locales', () => {
    vi.stubGlobal('navigator', { language: 'sv-SE' });
    expect(detectLocale()).toBe('sv');
  });

  it('defaults to English for non-Swedish browser locales', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectLocale()).toBe('en');
  });

  it('respects manual override', () => {
    expect(resolveLocale('sv')).toBe('sv');
    expect(resolveLocale('en')).toBe('en');
  });
});
