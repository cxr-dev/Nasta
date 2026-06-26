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
  { id: 'toxic-sun',      name: 'Toxic Sun',      colorA: '#F7B731', colorB: '#EB3B5A' },
  { id: 'lavender-haze',  name: 'Lavender Haze',  colorA: '#6260FF', colorB: '#E4E4FF' },
  { id: 'sulu-forest',    name: 'Sulu Forest',    colorA: '#9FE870', colorB: '#163300' },
  { id: 'arctic-deep',    name: 'Arctic Deep',    colorA: '#BDD9D7', colorB: '#03363D' },
  { id: 'royal-blush',    name: 'Royal Blush',    colorA: '#3447AA', colorB: '#FBEAEB' },
  { id: 'solar-storm',    name: 'Solar Storm',    colorA: '#FCDB32', colorB: '#141D38' },
  { id: 'abyssal-teal',   name: 'Abyssal Teal',   colorA: '#34E0A1', colorB: '#000000' },
];

// ——— OKLCH type ———
type Oklch = [l: number, c: number, h: number]; // l: 0-1, c: 0-0.4, h: 0-360

// ——— sRGB gamma helpers ———
function srgbToLinear(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * (c ** (1 / 2.4)) - 0.055;
}

// ——— WCAG 2.1 relative luminance (D65 reference white) ———
export function wcagLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function wcagContrast(a: string, b: string): number {
  const l1 = wcagLuminance(a);
  const l2 = wcagLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ——— Hex → OKLCH (via linear-sRGB → XYZ-D65 → OKLab → OKLCH) ———
export function hexToOklch(hex: string): Oklch {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  // linear sRGB → XYZ (D65)
  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
  const z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;

  // XYZ → OKLab
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z);

  const okL = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(okA * okA + okB * okB);
  let H = Math.atan2(okB, okA) * (180 / Math.PI);
  if (H < 0) H += 360;

  return [okL, C, H];
}

export function oklchToHex(l: number, c: number, h: number): string {
  // OKLCH → OKLab
  const hRad = h * (Math.PI / 180);
  const okA = c * Math.cos(hRad);
  const okB = c * Math.sin(hRad);

  // OKLab → LMS'
  const l_ = l + 0.3963377774 * okA + 0.2158037573 * okB;
  const m_ = l - 0.1055613458 * okA - 0.0638541728 * okB;
  const s_ = l - 0.0894841775 * okA - 1.2914855480 * okB;

  // LMS' → LMS (cube)
  const lmsL = l_ * l_ * l_;
  const lmsM = m_ * m_ * m_;
  const lmsS = s_ * s_ * s_;

  // LMS → XYZ (D65)
  const x = 1.2270138511 * lmsL - 0.5577999807 * lmsM + 0.2812561487 * lmsS;
  const y = -0.0405801784 * lmsL + 1.1122568696 * lmsM - 0.0716766787 * lmsS;
  const z = -0.0763812845 * lmsL - 0.4214819784 * lmsM + 1.5861632204 * lmsS;

  // XYZ → linear sRGB
  const rl = 3.2404541621 * x - 1.5371385125 * y - 0.4985314096 * z;
  const gl = -0.9692660305 * x + 1.8760108454 * y + 0.0415560175 * z;
  const bl = 0.0556434310 * x - 0.2040259132 * y + 1.0572251882 * z;

  // linear → sRGB → hex
  const toHex = (v: number): string => {
    const clamped = Math.max(0, Math.min(1, linearToSrgb(v)));
    return Math.round(clamped * 255).toString(16).padStart(2, '0');
  };

  return `#${toHex(rl)}${toHex(gl)}${toHex(bl)}`;
}

// ——— Mode detection ———
export function needsLightText(hex: string): boolean {
  // WCAG luminance threshold: 0.4 separates visibly-dark from visibly-light backgrounds
  return wcagLuminance(hex) < 0.4;
}

// ——— Theme color derivation in OKLCH ———
const MIN_CONTRAST = 4.5;

function hexFromOklch(oklch: Oklch): string {
  const [l, c, h] = oklch;
  return oklchToHex(l, Math.min(c, 0.38), h);
}

function oklchRgba(l: number, c: number, h: number, alpha: number): string {
  // Convert single OKLCH point to sRGB, then wrap in rgba
  const hex = oklchToHex(l, Math.min(c, 0.38), h);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Derive text color — prefers neutral white/black, uses palette color only when needed for contrast */
function deriveTextColor(bgHex: string, otherHex: string): string {
  const bgL = wcagLuminance(bgHex);

  // Preferred: neutral white on dark bg, dark on light bg (classic look)
  if (bgL < 0.4) {
    if (wcagContrast(bgHex, '#FFFFFF') >= MIN_CONTRAST) return '#FFFFFF';
  } else {
    if (wcagContrast(bgHex, '#171717') >= MIN_CONTRAST) return '#171717';
  }

  // Neutral fails — try the other palette color directly
  if (wcagContrast(bgHex, otherHex) >= MIN_CONTRAST) return otherHex;

  // Derive from other palette color in OKLCH, keeping hue and full chroma
  const [ol, oc, oh] = hexToOklch(otherHex);
  const step = 0.02;

  if (bgL < 0.4) {
    // Dark bg — lighten text, keep full chroma
    for (let tl = Math.max(ol + 0.05, 0.65); tl <= 0.98; tl += step) {
      const c = oklchToHex(tl, oc * 0.8, oh);
      if (wcagContrast(bgHex, c) >= MIN_CONTRAST) return c;
    }
    return '#FFFFFF';
  } else {
    // Light bg — darken text, keep full chroma
    for (let tl = Math.min(ol - 0.05, 0.30); tl >= 0.03; tl -= step) {
      const c = oklchToHex(tl, oc * 0.8, oh);
      if (wcagContrast(bgHex, c) >= MIN_CONTRAST) return c;
    }
    return '#171717';
  }
}

/** Derive text-on-accent color */
function deriveTextOnAccent(accentHex: string): string {
  const accL = wcagLuminance(accentHex);
  if (accL < 0.18) return '#FFFFFF';
  if (accL > 0.5) return '#0A0A0A';

  // Mid-luminance accent: try white first
  if (wcagContrast(accentHex, '#FFFFFF') >= 4.5) return '#FFFFFF';
  if (wcagContrast(accentHex, '#0A0A0A') >= 4.5) return '#0A0A0A';

  // Neither passes — derive from OKLCH
  const [ol, oc, oh] = hexToOklch(accentHex);
  if (accL < 0.3) {
    // Accent is dark-ish → use light text
    for (let tl = 0.85; tl <= 0.98; tl += 0.02) {
      const c = oklchToHex(tl, oc * 0.6, oh);
      if (wcagContrast(accentHex, c) >= 4.5) return c;
    }
  }
  return accL < 0.3 ? '#FFFFFF' : '#0A0A0A';
}

function computeSurfaceOkLch(bgHex: string, dark: boolean): string {
  const [l, c, h] = hexToOklch(bgHex);
  // Surface is subtly shifted from bg: lighten dark themes, darken light themes
  const shift = dark ? 0.04 : -0.03;
  const surfaceL = Math.max(0, Math.min(1, l + shift));
  // Reduce chroma slightly for a subdued surface
  return oklchToHex(surfaceL, c * 0.55, h);
}

function computeSurfaceEmphasis(bgHex: string, dark: boolean): string {
  const [l, c, h] = hexToOklch(bgHex);
  const shift = dark ? 0.08 : -0.06;
  const emphL = Math.max(0, Math.min(1, l + shift));
  return oklchToHex(emphL, c * 0.65, h);
}

/** Derive status colors from theme accent in OKLCH */
function computeStatusColors(accentHex: string, bgHex: string, dark: boolean) {
  const [, ac, ah] = hexToOklch(accentHex);
  const isDarkBg = dark;

  // Base lightness for status colors depends on bg darkness
  const statusL = isDarkBg ? 0.72 : 0.35;
  const subtleL = isDarkBg ? 0.25 : 0.88;
  const bgL = isDarkBg ? 0.15 : 0.94;

  // Error: warm/red shift from accent hue
  const errH = (ah + 15) % 360;
  // Success: green shift
  const sucH = (ah + 130) % 360;
  // Warning: amber shift
  const warnH = (ah + 40) % 360;
  // Info: blue shift
  const infoH = (ah + 220) % 360;
  // Critical: near accent hue but stronger
  const critH = (ah + 5) % 360;

  return {
    success:       oklchToHex(isDarkBg ? 0.68 : 0.38, ac * 0.6, sucH),
    'success-subtle': oklchRgba(isDarkBg ? 0.28 : 0.87, ac * 0.2, sucH, isDarkBg ? 0.20 : 0.12),
    'success-bg':  oklchRgba(isDarkBg ? 0.16 : 0.94, ac * 0.12, sucH, isDarkBg ? 0.09 : 0.04),
    error:         oklchToHex(isDarkBg ? 0.65 : 0.40, ac * 0.7, errH),
    'error-subtle': oklchRgba(isDarkBg ? 0.30 : 0.86, ac * 0.25, errH, isDarkBg ? 0.22 : 0.12),
    'error-bg':    oklchToHex(isDarkBg ? 0.16 : 0.94, ac * 0.15, errH),
    critical:      oklchToHex(isDarkBg ? 0.60 : 0.42, ac * 0.8, critH),
    'critical-subtle': oklchRgba(isDarkBg ? 0.35 : 0.85, ac * 0.3, critH, isDarkBg ? 0.25 : 0.12),
    'critical-bg': oklchRgba(isDarkBg ? 0.18 : 0.94, ac * 0.15, critH, isDarkBg ? 0.10 : 0.05),
    warning:       oklchToHex(isDarkBg ? 0.70 : 0.40, ac * 0.6, warnH),
    'warning-subtle': oklchRgba(isDarkBg ? 0.30 : 0.86, ac * 0.25, warnH, isDarkBg ? 0.22 : 0.12),
    'warning-bg':  oklchRgba(isDarkBg ? 0.16 : 0.94, ac * 0.12, warnH, isDarkBg ? 0.09 : 0.04),
    info:          oklchToHex(isDarkBg ? 0.72 : 0.38, ac * 0.5, infoH),
    'info-subtle': oklchRgba(isDarkBg ? 0.28 : 0.87, ac * 0.2, infoH, isDarkBg ? 0.20 : 0.12),
  };
}

// ——— Variant computation ———
function computeVariant(bg: string, accent: string) {
  const isLight = !needsLightText(bg);
  const surface = computeSurfaceOkLch(bg, !isLight);
  return { isLight, surface, accent };
}

export const THEMES: ThemePalette[] = _rawPalettes.map(t => ({
  ...t,
  variants: {
    A: computeVariant(t.colorA, t.colorB),
    B: computeVariant(t.colorB, t.colorA),
  },
}));

// ——— Preview style for theme picker ———
export function previewStyle(palette: ThemePalette, variant: 'A' | 'B'): string {
  const bg = variant === 'A' ? palette.colorA : palette.colorB;
  const accent = palette.variants[variant].accent;
  const isLight = palette.variants[variant].isLight;

  const text = deriveTextColor(bg, accent);
  const textHex = text; // may not be pure white/black

  // Parse text color for rgba opacity variants
  const tr = parseInt(textHex.slice(1, 3), 16);
  const tg = parseInt(textHex.slice(3, 5), 16);
  const tb = parseInt(textHex.slice(5, 7), 16);

  const textSecondary = isLight
    ? `rgba(${tr},${tg},${tb},0.55)`
    : `rgba(${tr},${tg},${tb},0.65)`;
  const textMuted = isLight
    ? `rgba(${tr},${tg},${tb},0.35)`
    : `rgba(${tr},${tg},${tb},0.40)`;

  const ar = parseInt(accent.slice(1, 3), 16);
  const ag = parseInt(accent.slice(3, 5), 16);
  const ab = parseInt(accent.slice(5, 7), 16);

  const border = isLight
    ? `rgba(${tr},${tg},${tb},0.08)`
    : `rgba(${tr},${tg},${tb},0.12)`;

  return [
    `--preview-bg:${bg}`,
    `--preview-surface:${palette.variants[variant].surface}`,
    `--preview-accent:${accent}`,
    `--preview-accent-subtle:rgba(${ar},${ag},${ab},0.15)`,
    `--preview-text:${textHex}`,
    `--preview-text-secondary:${textSecondary}`,
    `--preview-text-muted:${textMuted}`,
    `--preview-border:${border}`,
  ].join(';') + ';';
}

// ——— Main theme application ———
/** Return variant ('A'|'B') with the darker background for a theme */
export function getDarkVariant(themeId: string): 'A' | 'B' {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const la = wcagLuminance(theme.colorA);
  const lb = wcagLuminance(theme.colorB);
  return la < lb ? 'A' : 'B';
}

export function applyTheme(themeId: string, variant: 'A' | 'B') {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const bg = variant === 'A' ? theme.colorA : theme.colorB;
  const accent = variant === 'A' ? theme.colorB : theme.colorA;
  const dark = needsLightText(bg); // bg is visually dark → dark mode

  // Derive colors in OKLCH
  const textHex = deriveTextColor(bg, accent);
  const surface = computeSurfaceOkLch(bg, dark);
  const surfaceEmphasis = computeSurfaceEmphasis(bg, dark);
  const textOnAccent = deriveTextOnAccent(accent);

  // Parse derived text color for rgba opacity variants (borders, secondary text)
  const tr = parseInt(textHex.slice(1, 3), 16);
  const tg = parseInt(textHex.slice(3, 5), 16);
  const tb = parseInt(textHex.slice(5, 7), 16);

  const textSecondary = dark
    ? `rgba(${tr},${tg},${tb},0.65)`
    : `rgba(${tr},${tg},${tb},0.55)`;
  const textMuted = dark
    ? `rgba(${tr},${tg},${tb},0.40)`
    : `rgba(${tr},${tg},${tb},0.35)`;
  const textGhost = dark
    ? `rgba(${tr},${tg},${tb},0.18)`
    : `rgba(${tr},${tg},${tb},0.13)`;
  const border = dark
    ? `rgba(${tr},${tg},${tb},0.12)`
    : `rgba(${tr},${tg},${tb},0.08)`;
  const borderSubtle = dark
    ? `rgba(${tr},${tg},${tb},0.20)`
    : `rgba(${tr},${tg},${tb},0.14)`;

  // Accent subtle (for hover states, etc.)
  const ar = parseInt(accent.slice(1, 3), 16);
  const ag = parseInt(accent.slice(3, 5), 16);
  const ab = parseInt(accent.slice(5, 7), 16);
  const accentSubtle = `rgba(${ar},${ag},${ab},0.15)`;

  // Status colors derived from theme accent
  const status = computeStatusColors(accent, bg, dark);

  const root = document.documentElement;

  // Core tokens
  root.style.setProperty('--bg', bg);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--surface-emphasis', surfaceEmphasis);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-subtle', accentSubtle);
  root.style.setProperty('--text-on-accent', textOnAccent);
  root.style.setProperty('--text', textHex);
  root.style.setProperty('--text-secondary', textSecondary);
  root.style.setProperty('--text-muted', textMuted);
  root.style.setProperty('--text-ghost', textGhost);
  root.style.setProperty('--border', border);
  root.style.setProperty('--border-subtle', borderSubtle);

  // Status tokens
  for (const [key, value] of Object.entries(status)) {
    root.style.setProperty(`--color-${key}`, value);
  }

  // Meta theme-color
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.content = bg;
}
