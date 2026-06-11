import { translations, detectLocale, type Locale } from '../lib/i18n';

export function resolveLocale(preference: 'auto' | Locale = 'auto'): Locale {
  return preference === 'auto' ? detectLocale() : preference;
}

let _locale = $state<Locale>(resolveLocale());

export function setLocale(value: Locale) {
  _locale = value;
}

export function getLocale(): Locale {
  return _locale;
}

export function getT() {
  return translations[_locale];
}
