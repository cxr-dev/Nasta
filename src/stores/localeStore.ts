import { writable, derived } from 'svelte/store';
import { translations, detectLocale, type Locale } from '../lib/i18n';

export const locale = writable<Locale>(detectLocale());

export const t = derived(locale, $locale => translations[$locale]);
