export interface ThemePalette {
  id: string;
  name: string;
  colorA: string;
  colorB: string;
  variants: {
    A: { isLight: boolean; surface: string; accent: string };
    B: { isLight: boolean; surface: string; accent: string };
  };
}

const _rawPalettes = [
  { id: 'default',        name: 'Default',       colorA: '#FAFAF9', colorB: '#171717' },
  { id: 'electric-pulse', name: 'Electric Pulse', colorA: '#635BFF', colorB: '#00E5E5' },
  { id: 'acid-forest',    name: 'Acid Forest',    colorA: '#DFFF00', colorB: '#1A4D2E' },
  { id: 'cyber-rose',     name: 'Cyber Rose',     colorA: '#EF5777', colorB: '#575BB8' },
  { id: 'carbon-mint',    name: 'Carbon Mint',    colorA: '#00FFC2', colorB: '#2D3436' },
  { id: 'digital-peach',  name: 'Digital Peach',  colorA: '#FF7E5F', colorB: '#3B3B98' },
  { id: 'solar-violet',   name: 'Solar Violet',   colorA: '#706FD3', colorB: '#F7F1E3' },
  { id: 'lava-core',      name: 'Lava Core',      colorA: '#FC3C55', colorB: '#4B6584' },
  { id: 'night-moss',     name: 'Night Moss',     colorA: '#26DE81', colorB: '#3B3B98' },
  { id: 'synth-wave',     name: 'Synth Wave',     colorA: '#FF2079', colorB: '#080808' },
  { id: 'sky-pulse',      name: 'Sky Pulse',      colorA: '#00D2FF', colorB: '#3A0CA3' },
  { id: 'iron-lemon',     name: 'Iron Lemon',     colorA: '#FEE12B', colorB: '#3E3E3E' },
  { id: 'wild-orchid',    name: 'Wild Orchid',    colorA: '#E056FD', colorB: '#6864E0' },
  { id: 'deep-space',     name: 'Deep Space',     colorA: '#2F3640', colorB: '#8C7AE6' },
  { id: 'oceanic-grit',   name: 'Oceanic Grit',   colorA: '#2BCBBA', colorB: '#2D3436' },
  { id: 'toxic-sun',             name: 'Toxic Sun',           colorA: '#F7B731', colorB: '#EB3B5A' },
  { id: 'lavender-haze',         name: 'Lavender Haze',         colorA: '#6260FF', colorB: '#E4E4FF' },
  { id: 'sulu-forest',           name: 'Sulu Forest',           colorA: '#9FE870', colorB: '#163300' },
  { id: 'arctic-deep',           name: 'Arctic Deep',           colorA: '#BDD9D7', colorB: '#03363D' },
  { id: 'royal-blush',           name: 'Royal Blush',           colorA: '#3447AA', colorB: '#FBEAEB' },
  { id: 'solar-storm',           name: 'Solar Storm',           colorA: '#FCDB32', colorB: '#141D38' },
  { id: 'abyssal-teal',          name: 'Abyssal Teal',          colorA: '#34E0A1', colorB: '#000000' },
];

export function needsLightText(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function lightenHex(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function computeVariant(bg: string, accent: string) {
  const isLight = !needsLightText(bg);
  const surface = isLight ? '#FFFFFF' : lightenHex(bg, 18);
  return { isLight, surface, accent };
}

export const THEMES: ThemePalette[] = _rawPalettes.map(t => ({
  ...t,
  variants: {
    A: computeVariant(t.colorA, t.colorB),
    B: computeVariant(t.colorB, t.colorA),
  },
}));

export function applyTheme(themeId: string, variant: 'A' | 'B') {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const bg = variant === 'A' ? theme.colorA : theme.colorB;
  const accent = variant === 'A' ? theme.colorB : theme.colorA;
  const dark = needsLightText(bg); // bg is dark → needs light text

  const textOnBg      = dark ? '#FFFFFF'                  : '#171717';
  const textSecondary = dark ? 'rgba(255,255,255,0.65)'   : 'rgba(0,0,0,0.55)';
  const textMuted     = dark ? 'rgba(255,255,255,0.40)'   : 'rgba(0,0,0,0.35)';
  const textGhost     = dark ? 'rgba(255,255,255,0.18)'   : 'rgba(0,0,0,0.13)';
  const border        = dark ? 'rgba(255,255,255,0.12)'   : 'rgba(0,0,0,0.08)';
  const borderSubtle  = dark ? 'rgba(255,255,255,0.20)'   : 'rgba(0,0,0,0.14)';
  const surface       = dark ? lightenHex(bg, 18)         : '#FFFFFF';

  const accentR = parseInt(accent.slice(1, 3), 16);
  const accentG = parseInt(accent.slice(3, 5), 16);
  const accentB = parseInt(accent.slice(5, 7), 16);
  const accentSubtle = `rgba(${accentR},${accentG},${accentB},0.15)`;

  const accentLuminance = (0.299 * accentR + 0.587 * accentG + 0.114 * accentB) / 255;
  const textOnAccent = accentLuminance < 0.5 ? '#FFFFFF' : '#171717';

  const root = document.documentElement;
  root.style.setProperty('--bg',             bg);
  root.style.setProperty('--surface',        surface);
  root.style.setProperty('--accent',         accent);
  root.style.setProperty('--accent-subtle',  accentSubtle);
  root.style.setProperty('--text-on-accent', textOnAccent);
  root.style.setProperty('--text',           textOnBg);
  root.style.setProperty('--text-secondary', textSecondary);
  root.style.setProperty('--text-muted',     textMuted);
  root.style.setProperty('--text-ghost',     textGhost);
  root.style.setProperty('--border',         border);
  root.style.setProperty('--border-subtle',  borderSubtle);

  const surfaceEmphasis = dark ? lightenHex(surface, 12) : 'rgba(0,0,0,0.03)';
  root.style.setProperty('--surface-emphasis', surfaceEmphasis);

  // Status colors — light to dark mode
  root.style.setProperty('--color-success', dark ? '#4cbf8a' : '#2B8C5E');
  root.style.setProperty('--color-error',   dark ? '#e8687a' : '#C43A4E');

  // Disruption status colors — theme-aware
  root.style.setProperty('--color-critical', dark ? '#E74C3C' : '#C0392B');
  root.style.setProperty('--color-critical-subtle', dark ? 'rgba(231, 76, 60, 0.20)' : 'rgba(192, 57, 43, 0.12)');
  root.style.setProperty('--color-critical-bg', dark ? 'rgba(231, 76, 60, 0.08)' : 'rgba(192, 57, 43, 0.05)');
  root.style.setProperty('--color-warning', dark ? '#F39C12' : '#D68910');
  root.style.setProperty('--color-warning-subtle', dark ? 'rgba(243, 156, 18, 0.20)' : 'rgba(214, 137, 16, 0.12)');
  root.style.setProperty('--color-warning-bg', dark ? 'rgba(243, 156, 18, 0.08)' : 'rgba(214, 137, 16, 0.04)');
  root.style.setProperty('--color-info', dark ? '#3498DB' : '#2980B9');
  root.style.setProperty('--color-info-subtle', dark ? 'rgba(52, 152, 219, 0.20)' : 'rgba(41, 128, 185, 0.12)');

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.content = bg;
}
