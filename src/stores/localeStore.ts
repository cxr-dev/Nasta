import { writable, derived } from 'svelte/store';
import { translations, detectLocale, type Locale } from '../lib/i18n';

export function resolveLocale(preference: 'auto' | Locale = 'auto'): Locale {
  return preference === 'auto' ? detectLocale() : preference;
}

export const locale = writable<Locale>(resolveLocale());

export const t = derived(locale, $locale => translations[$locale]);
