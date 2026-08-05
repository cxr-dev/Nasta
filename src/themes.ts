export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

type ThemeTokens = Record<string, string>;

/** WCAG 2.1 relative luminance for six-digit sRGB hex colors. */
export function wcagLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function wcagContrast(a: string, b: string): number {
  const first = wcagLuminance(a);
  const second = wcagLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function needsLightText(hex: string): boolean {
  return wcagLuminance(hex) < 0.179;
}

const LIGHT_TOKENS: ThemeTokens = {
  '--bg': '#F7F7F5',
  '--surface': '#FFFFFF',
  '--surface-emphasis': '#F0F0ED',
  '--surface-elevated': '#FFFFFF',
  '--surface-hover': '#F3F3F0',
  '--surface-pressed': '#EDEDE9',
  '--accent': '#171717',
  '--accent-subtle': 'rgba(23,23,23,0.08)',
  '--text': '#171717',
  '--text-secondary': '#4F4F4B',
  '--text-muted': '#6B6B66',
  '--text-ghost': '#8A8A84',
  '--text-decorative': '#8A8A84',
  '--text-on-accent': '#FFFFFF',
  '--text-bg': '#171717',
  '--text-secondary-bg': '#4F4F4B',
  '--text-muted-bg': '#6B6B66',
  '--border': '#D8D8D3',
  '--border-strong': '#B9B9B2',
  '--border-subtle': '#D8D8D3',
  '--shadow-tint': 'rgba(23,23,23,0.10)',
  '--status-on-time': '#171717',
  '--status-on-time-bg': 'transparent',
  '--status-delayed': '#956B12',
  '--status-delayed-bg': '#FFF7E2',
  '--status-cancelled': '#A94848',
  '--status-cancelled-bg': '#FFF0EF',
  '--status-info': '#356A86',
  '--status-info-bg': '#EEF7FA',
};

const DARK_TOKENS: ThemeTokens = {
  '--bg': '#111211',
  '--surface': '#1B1C1A',
  '--surface-emphasis': '#252622',
  '--surface-elevated': '#2A2B27',
  '--surface-hover': '#242521',
  '--surface-pressed': '#2B2C28',
  '--accent': '#F5F5F0',
  '--accent-subtle': 'rgba(245,245,240,0.12)',
  '--text': '#F5F5F0',
  '--text-secondary': '#C2C3BB',
  '--text-muted': '#A7A89F',
  '--text-ghost': '#82837C',
  '--text-decorative': '#82837C',
  '--text-on-accent': '#111211',
  '--text-bg': '#F5F5F0',
  '--text-secondary-bg': '#C2C3BB',
  '--text-muted-bg': '#A7A89F',
  '--border': '#3A3B36',
  '--border-strong': '#565850',
  '--border-subtle': '#3A3B36',
  '--shadow-tint': 'rgba(0,0,0,0.35)',
  '--status-on-time': '#F5F5F0',
  '--status-on-time-bg': 'transparent',
  '--status-delayed': '#D5AD55',
  '--status-delayed-bg': '#302817',
  '--status-cancelled': '#D47A76',
  '--status-cancelled-bg': '#321F1E',
  '--status-info': '#8DB8CC',
  '--status-info-bg': '#1E2B30',
};

const TOKENS: Record<ResolvedTheme, ThemeTokens> = {
  light: LIGHT_TOKENS,
  dark: DARK_TOKENS,
};

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}

export function getSystemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Apply the small, hand-authored semantic palette to the document root. */
export function applyTheme(theme: ResolvedTheme): void {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = resolved;

  for (const [name, value] of Object.entries(TOKENS[resolved])) {
    root.style.setProperty(name, value);
  }

  // Existing components use these names for domain states. Keep them as
  // explicit aliases while the domain model remains info/warning/critical.
  root.style.setProperty('--color-success', TOKENS[resolved]['--status-on-time']);
  root.style.setProperty('--color-success-subtle', TOKENS[resolved]['--status-on-time-bg']);
  root.style.setProperty('--color-success-bg', TOKENS[resolved]['--status-on-time-bg']);
  root.style.setProperty('--color-warning', TOKENS[resolved]['--status-delayed']);
  root.style.setProperty('--color-warning-subtle', TOKENS[resolved]['--status-delayed-bg']);
  root.style.setProperty('--color-warning-bg', TOKENS[resolved]['--status-delayed-bg']);
  root.style.setProperty('--color-critical', TOKENS[resolved]['--status-cancelled']);
  root.style.setProperty('--color-critical-subtle', TOKENS[resolved]['--status-cancelled-bg']);
  root.style.setProperty('--color-critical-bg', TOKENS[resolved]['--status-cancelled-bg']);
  root.style.setProperty('--color-error', TOKENS[resolved]['--status-cancelled']);
  root.style.setProperty('--color-error-subtle', TOKENS[resolved]['--status-cancelled-bg']);
  root.style.setProperty('--color-error-bg', TOKENS[resolved]['--status-cancelled-bg']);
  root.style.setProperty('--color-info', TOKENS[resolved]['--status-info']);
  root.style.setProperty('--color-info-subtle', TOKENS[resolved]['--status-info-bg']);
  root.style.setProperty('--color-info-bg', TOKENS[resolved]['--status-info-bg']);

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = TOKENS[resolved]['--bg'];
}

export function previewStyle(theme: ResolvedTheme): string {
  const tokens = TOKENS[theme];
  return [
    `--preview-bg:${tokens['--bg']}`,
    `--preview-surface:${tokens['--surface']}`,
    `--preview-accent:${tokens['--accent']}`,
    `--preview-accent-subtle:${tokens['--accent-subtle']}`,
    `--preview-text:${tokens['--text']}`,
    `--preview-text-secondary:${tokens['--text-secondary']}`,
    `--preview-text-muted:${tokens['--text-muted']}`,
    `--preview-border:${tokens['--border']}`,
  ].join(';') + ';';
}

export const THEMES: Array<{ id: ResolvedTheme; name: string }> = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export const THEME_TOKENS = TOKENS;
