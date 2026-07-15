export interface ThemePalette {
  id: string;
  name: string;
  colorA: string;
  colorB: string;
  surfaceHue?: number;
  variants: {
    A: { isLight: boolean; surface: string; accent: string };
    B: { isLight: boolean; surface: string; accent: string };
  };
}

interface RawPalette {
  id: string;
  name: string;
  colorA: string;
  colorB: string;
  surfaceHue?: number; // override OKLCH hue (0-360) for surface tint
}

const _rawPalettes: RawPalette[] = [
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
  // OKLCH perceptual lightness: L < 0.5 = dark bg (needs light text)
  // Replaces WCAG luminance which misclassifies saturated mid-tones
  // (e.g., #EF5777 pink has WCAG lum=0.265 → "dark" but OKLCH L=0.666 → visually light)
  return hexToOklch(hex)[0] < 0.5;
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

/** Derive text color — searches both light & dark directions exhaustively, returns best-contrast candidate */
export function deriveTextColor(bgHex: string, otherHex: string): string {
  const [ol, oc, oh] = hexToOklch(otherHex);

  // Start with the obvious candidates, tracking best
  let best = { color: '#FFFFFF', contrast: wcagContrast(bgHex, '#FFFFFF') };
  const darkC = wcagContrast(bgHex, '#171717');
  if (darkC > best.contrast) best = { color: '#171717', contrast: darkC };
  const otherC = wcagContrast(bgHex, otherHex);
  if (otherC > best.contrast) best = { color: otherHex, contrast: otherC };

  if (best.contrast >= MIN_CONTRAST) return best.color;

  // Exhaustive search in both lightness directions with multiple chroma levels
  const chromaLevels = [1.0, 0.8, 0.5, 0.2, 0.0];
  const step = 0.01;

  // Light direction
  for (let tl = 0.65; tl <= 0.99; tl += step) {
    for (const cm of chromaLevels) {
      const c = oklchToHex(tl, oc * cm, oh);
      const contrast = wcagContrast(bgHex, c);
      if (contrast >= MIN_CONTRAST) return c;
      if (contrast > best.contrast) best = { color: c, contrast };
    }
  }

  // Dark direction
  for (let tl = 0.35; tl >= 0.01; tl -= step) {
    for (const cm of chromaLevels) {
      const c = oklchToHex(tl, oc * cm, oh);
      const contrast = wcagContrast(bgHex, c);
      if (contrast >= MIN_CONTRAST) return c;
      if (contrast > best.contrast) best = { color: c, contrast };
    }
  }

  // Final fallback: try pure extremes
  for (const ext of ['#000000', '#FFFFFF', '#0A0A0A', '#FAFAF9']) {
    const c = wcagContrast(bgHex, ext);
    if (c > best.contrast) best = { color: ext, contrast: c };
  }

  return best.color;
}

/** Derive text-on-accent color */
function deriveTextOnAccent(accentHex: string): string {
  const accL = wcagLuminance(accentHex);
  if (accL < 0.18) return '#FFFFFF';
  if (accL > 0.5) return '#0A0A0A';

  // Try neutral extremes first
  if (wcagContrast(accentHex, '#FFFFFF') >= MIN_CONTRAST) return '#FFFFFF';
  if (wcagContrast(accentHex, '#0A0A0A') >= MIN_CONTRAST) return '#0A0A0A';

  // Neither passes — derive from OKLCH with best-contrast fallback
  const [ol, oc, oh] = hexToOklch(accentHex);
  let best = { color: accL < 0.3 ? '#FFFFFF' : '#0A0A0A', contrast: 0 };

  if (accL < 0.3) {
    for (let tl = 0.85; tl <= 0.99; tl += 0.02) {
      const c = oklchToHex(tl, oc * 0.6, oh);
      const contrast = wcagContrast(accentHex, c);
      if (contrast >= MIN_CONTRAST) return c;
      if (contrast > best.contrast) best = { color: c, contrast };
    }
  }

  // Validate fallback: return whichever extreme has better contrast
  const whiteContrast = wcagContrast(accentHex, '#FFFFFF');
  const darkContrast = wcagContrast(accentHex, '#0A0A0A');
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#0A0A0A';
}

// ——— Contrast-solved text color ———
export type SolvedTextColor = { color: string; usedFallback: boolean };

/** Find lightness that hits target contrast against bg, tinted toward theme hue. */
export function solveTextColor(bgHex: string, themeHue: number, targetContrast: number, chromaScale: number, dark: boolean): SolvedTextColor {
  const [bgL] = hexToOklch(bgHex);
  const step = 0.005;
  const clampedHue = ((themeHue % 360) + 360) % 360;

  // Bidirectional search with chroma fallback: find the closest OKLCH lightness
  // to bgL that meets contrast. If chromatic search fails, halve chromaScale
  // and retry — gracefully degrades toward achromatic rather than falling back
  // to pure black/white. Handles saturated mid-tone bgs where WCAG luminance
  // disagrees with perceptual (OKLCH) lightness.
  let currentChroma = chromaScale;
  for (let attempt = 0; attempt < 4; attempt++) {
    let upResult: string | null = null;
    let downResult: string | null = null;

    for (let l = bgL + step; l <= 0.995; l += step) {
      const hex = oklchToHex(l, currentChroma, clampedHue);
      if (wcagContrast(bgHex, hex) >= targetContrast) { upResult = hex; break; }
    }
    for (let l = bgL - step; l >= 0.01; l -= step) {
      const hex = oklchToHex(l, currentChroma, clampedHue);
      if (wcagContrast(bgHex, hex) >= targetContrast) { downResult = hex; break; }
    }

    if (upResult || downResult) {
      if (upResult && downResult) {
        const [upL] = hexToOklch(upResult);
        const [downL] = hexToOklch(downResult);
        return { color: (upL - bgL) <= (bgL - downL) ? upResult : downResult, usedFallback: false };
      }
      return { color: (upResult ?? downResult)!, usedFallback: false };
    }
    currentChroma *= 0.5; // halve chroma each attempt
  }

  return { color: dark ? '#FFFFFF' : '#0A0A0A', usedFallback: true };
}

// ——— Accent generation (hover, active, secondary, tertiary) ———
export interface AccentTokens {
  primaryHover: string;
  primaryActive: string;
  secondaryAccent: string;
  tertiaryAccent: string;
}

export function computeAccents(primaryHex: string, dark: boolean): AccentTokens {
  const [pL, pC, pH] = hexToOklch(primaryHex);
  const safeC = Math.max(pC, 0.005);

  // Hover: move away from bg lightness (lighter on dark, darker on light)
  const hoverL = dark ? Math.min(0.95, pL + 0.05) : Math.max(0.05, pL - 0.05);
  // Active: move toward bg lightness (opposite direction, smaller magnitude)
  const activeL = dark ? Math.max(0.05, pL - 0.03) : Math.min(0.95, pL + 0.03);

  return {
    primaryHover: oklchToHex(hoverL, pC, pH),
    primaryActive: oklchToHex(activeL, pC, pH),
    secondaryAccent: oklchToHex(pL, safeC * 0.70, (pH + 35) % 360),
    tertiaryAccent: oklchToHex(pL, safeC * 0.50, (pH + 310) % 360),
  };
}

// ——— Surface generation (elevated, hover, pressed) ———
export interface SurfaceTokens {
  surfaceElevated: string;
  surfaceHover: string;
  surfacePressed: string;
}

export function computeSurfaces(bgHex: string, dark: boolean): SurfaceTokens {
  const [bgL, bgC, bgH] = hexToOklch(bgHex);
  const safeC = Math.max(bgC, 0.005);
  const clampedHue = ((bgH % 360) + 360) % 360;
  const MIN_SEP = 0.02;

  // Both modes: surfaces go lighter than bg (lift semantics).
  // Use fixed MIN_SEP spacing — no cap, since surfaces above 0.95 are valid
  // (near-white is fine for elevated cards). Hex rounding at extreme dark end
  // (bgL < 0.03) may collapse values — unavoidable 8-bit sRGB limitation.
  const pressedL = bgL + MIN_SEP;
  const hoverL = pressedL + MIN_SEP;
  const elevatedL = hoverL + MIN_SEP;

  // Chroma: uniform across all three tokens. Using different multipliers at high
  // chroma causes sRGB gamut distortion that can invert lightness order (e.g.,
  // sky-pulse[B] where prC=1.4 made pressed land above elevated in hex).
  const chromaScale = dark ? 1.0 : 0.85;

  return {
    surfaceElevated: oklchToHex(elevatedL, safeC * chromaScale, clampedHue),
    surfaceHover: oklchToHex(hoverL, safeC * chromaScale, clampedHue),
    surfacePressed: oklchToHex(pressedL, safeC * chromaScale, clampedHue),
  };
}

// ——— Shadow tint (near-black with theme hue) ———
export function computeShadowTint(accentHex: string, dark: boolean): string {
  const [, , accentH] = hexToOklch(accentHex);
  // Both modes: near-black with hue tint. Alpha handles fading.
  // Dark mode: stronger alpha (darker bg needs more shadow). Light mode: subtler.
  return dark
    ? oklchRgba(0.08, 0.015, accentH, 0.25)
    : oklchRgba(0.05, 0.01, accentH, 0.10);
}

function deriveSurfaceColor(bgHex: string, isDark: boolean, hueOverride?: number, accentHue?: number): string {
  const [l, c, h] = hexToOklch(bgHex);
  if (isDark) {
    // Dark mode: surface sits just above bg, below computeSurfaces pressed (bgL+0.02)
    const surfaceL = Math.max(0, Math.min(1, l + 0.01));
    return oklchToHex(surfaceL, c * 0.55, h);
  }
  // Light mode: tint surface toward accent hue for achromatic bgs, bg hue otherwise
  const hue = hueOverride ?? (c < 0.005 ? (accentHue ?? h) : h);
  return oklchToHex(0.94, c < 0.005 ? 0.006 : 0.018, hue);
}

function deriveSurfaceEmphasis(bgHex: string, isDark: boolean, hueOverride?: number): string {
  const [l, c, h] = hexToOklch(bgHex);
  if (isDark) {
    const emphL = Math.max(0, Math.min(1, l + 0.08));
    return oklchToHex(emphL, c * 0.65, h);
  }
  const hue = hueOverride ?? (c < 0.005 ? 85 : h);
  return oklchToHex(0.88, 0.022, hue);
}

/** Derive status colors from theme accent in OKLCH */
function computeStatusColors(accentHex: string, bgHex: string, dark: boolean) {
  const [, ac, ah] = hexToOklch(accentHex);
  const isDarkBg = dark;

  // Minimum chroma floor + hue fallback for achromatic accents (e.g. default #171717)
  const safeC = Math.max(ac, 0.10);
  const safeH = ac < 0.01 ? 0 : ah;

  // Base lightness for status colors depends on bg darkness
  const statusL = isDarkBg ? 0.72 : 0.35;
  const subtleL = isDarkBg ? 0.25 : 0.88;
  const bgL = isDarkBg ? 0.15 : 0.94;

  // Error: warm/red shift from accent hue
  const errH = (safeH + 15) % 360;
  // Success: green shift
  const sucH = (safeH + 130) % 360;
  // Warning: amber shift
  const warnH = (safeH + 40) % 360;
  // Info: blue shift
  const infoH = (safeH + 220) % 360;
  // Critical: near accent hue but stronger
  const critH = (safeH + 5) % 360;

  return {
    success:       oklchToHex(isDarkBg ? 0.68 : 0.38, safeC * 0.6, sucH),
    'success-subtle': oklchRgba(isDarkBg ? 0.28 : 0.87, safeC * 0.2, sucH, isDarkBg ? 0.20 : 0.12),
    'success-bg':  oklchRgba(isDarkBg ? 0.16 : 0.94, safeC * 0.12, sucH, isDarkBg ? 0.09 : 0.04),
    error:         oklchToHex(isDarkBg ? 0.65 : 0.40, safeC * 0.7, errH),
    'error-subtle': oklchRgba(isDarkBg ? 0.30 : 0.86, safeC * 0.25, errH, isDarkBg ? 0.22 : 0.12),
    'error-bg':    oklchToHex(isDarkBg ? 0.16 : 0.94, safeC * 0.15, errH),
    critical:      oklchToHex(isDarkBg ? 0.60 : 0.42, safeC * 0.8, critH),
    'critical-subtle': oklchRgba(isDarkBg ? 0.35 : 0.85, safeC * 0.3, critH, isDarkBg ? 0.25 : 0.12),
    'critical-bg': oklchRgba(isDarkBg ? 0.18 : 0.88, safeC * 0.15, critH, isDarkBg ? 0.10 : 0.12),
    warning:       oklchToHex(isDarkBg ? 0.70 : 0.40, safeC * 0.6, warnH),
    'warning-subtle': oklchRgba(isDarkBg ? 0.30 : 0.86, safeC * 0.25, warnH, isDarkBg ? 0.22 : 0.12),
    'warning-bg':  oklchRgba(isDarkBg ? 0.16 : 0.90, safeC * 0.12, warnH, isDarkBg ? 0.09 : 0.10),
    info:          oklchToHex(isDarkBg ? 0.72 : 0.38, safeC * 0.5, infoH),
    'info-subtle': oklchRgba(isDarkBg ? 0.28 : 0.87, safeC * 0.2, infoH, isDarkBg ? 0.20 : 0.12),
  };
}

// ——— Accent contrast enforcement ———
const MIN_UI_CONTRAST = 3.0; // WCAG 1.4.11 non-text contrast minimum

/** Derive accent color with at least 3:1 contrast against bg, preserving hue */
function ensureAccentContrast(accentHex: string, bgHex: string): string {
  if (wcagContrast(bgHex, accentHex) >= MIN_UI_CONTRAST) return accentHex;

  const [, ac, ah] = hexToOklch(accentHex);
  let best = { color: accentHex, contrast: wcagContrast(bgHex, accentHex) };
  const step = 0.01;

  // Light direction
  for (let tl = 0.45; tl <= 0.98; tl += step) {
    for (const cm of [0.9, 0.6, 0.3]) {
      const c = oklchToHex(tl, ac * cm, ah);
      const contrast = wcagContrast(bgHex, c);
      if (contrast >= MIN_UI_CONTRAST) return c;
      if (contrast > best.contrast) best = { color: c, contrast };
    }
  }

  // Dark direction
  for (let tl = 0.55; tl >= 0.03; tl -= step) {
    for (const cm of [0.9, 0.6, 0.3]) {
      const c = oklchToHex(tl, ac * cm, ah);
      const contrast = wcagContrast(bgHex, c);
      if (contrast >= MIN_UI_CONTRAST) return c;
      if (contrast > best.contrast) best = { color: c, contrast };
    }
  }

  return best.color;
}

// ——— Variant computation ———
function computeVariant(bg: string, accent: string, surfaceHue?: number) {
  const isLight = !needsLightText(bg);
  const [, , accentH] = hexToOklch(accent);
  const surface = deriveSurfaceColor(bg, !isLight, surfaceHue, accentH);
  return { isLight, surface, accent };
}

export const THEMES: ThemePalette[] = _rawPalettes.map(({ surfaceHue, ...t }) => ({
  ...t,
  surfaceHue,
  variants: {
    A: computeVariant(t.colorA, t.colorB, surfaceHue),
    B: computeVariant(t.colorB, t.colorA, surfaceHue),
  },
}));

// ——— Preview style for theme picker ———
export function previewStyle(palette: ThemePalette, variant: 'A' | 'B'): string {
  const bg = variant === 'A' ? palette.colorA : palette.colorB;
  const rawAccent = variant === 'A' ? palette.colorB : palette.colorA;
  const accent = ensureAccentContrast(rawAccent, bg);
  const dark = !palette.variants[variant].isLight;
  const [, accentC, accentH] = hexToOklch(accent);

  const textHex = deriveTextColor(bg, accent);

  // Use same OKLCH contrast-solver as applyTheme() (not rgba opacity)
  const secChroma = accentC * 0.40;
  const mutChroma = accentC * 0.15;
  const textSecondary = solveTextColor(bg, accentH, 3.5, secChroma, dark).color;
  const textMuted = solveTextColor(bg, accentH, 2.5, mutChroma, dark).color;
  const border = solveBorderColor(bg, accentH, dark).color;

  const ar = parseInt(accent.slice(1, 3), 16);
  const ag = parseInt(accent.slice(3, 5), 16);
  const ab = parseInt(accent.slice(5, 7), 16);

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
  const la = hexToOklch(theme.colorA)[0];
  const lb = hexToOklch(theme.colorB)[0];
  return la < lb ? 'A' : 'B';
}

/** Return human-readable name for a theme variant */
export function getVariantName(themeId: string, variant: 'A' | 'B'): string {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const isLight = theme.variants[variant].isLight;
  // Only append suffix when variant's lightness differs from theme's "natural" mode
  // This keeps names clean for most themes while disambiguating light/dark variants
  const suffix = isLight ? '' : ' Dark';
  return `${theme.name}${suffix}`;
}

// ——— Border color derivation ———
export function solveBorderColor(bgHex: string, themeHue: number, dark: boolean, strong = false): SolvedTextColor {
  const contrastTarget = strong ? 1.35 : 1.20;
  const chroma = strong ? 0.015 : 0.008;
  return solveTextColor(bgHex, themeHue, contrastTarget, chroma, dark);
}

export function applyTheme(themeId: string, variant: 'A' | 'B') {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  const bg = variant === 'A' ? theme.colorA : theme.colorB;
  const rawAccent = variant === 'A' ? theme.colorB : theme.colorA;
  const accent = ensureAccentContrast(rawAccent, bg);
  const dark = needsLightText(bg);
  const [, accentC, accentH] = hexToOklch(accent);

  // Core derivations
  const textHex = deriveTextColor(bg, accent);
  const surface = deriveSurfaceColor(bg, dark, theme.surfaceHue, accentH);
  const surfaceEmphasis = deriveSurfaceEmphasis(bg, dark, theme.surfaceHue);
  const textOnAccent = deriveTextOnAccent(accent);

  // Contrast-solved text hierarchy (OKLCH-tinted, not rgba opacity)
  const secChroma = accentC * 0.40;
  const mutChroma = accentC * 0.15;
  const ghostChroma = accentC * 0.08;
  const textSecondary = solveTextColor(bg, accentH, 3.5, secChroma, dark);
  const textMuted = solveTextColor(bg, accentH, 2.5, mutChroma, dark);
  const textGhost = solveTextColor(bg, accentH, 1.5, ghostChroma, dark);

  // Border: OKLCH-derived, near-neutral, low contrast against bg
  const border = solveBorderColor(bg, accentH, dark);
  const borderStrong = solveBorderColor(bg, accentH, dark, true);

  // Accent generation
  const accents = computeAccents(accent, dark);

  // Surface generation
  const surfaces = computeSurfaces(bg, dark);

  // Shadow tint
  const shadowTint = computeShadowTint(accent, dark);

  // Accent subtle
  const ar = parseInt(accent.slice(1, 3), 16);
  const ag = parseInt(accent.slice(3, 5), 16);
  const ab = parseInt(accent.slice(5, 7), 16);
  const accentSubtle = `rgba(${ar},${ag},${ab},0.15)`;

  // Status colors
  const status = computeStatusColors(accent, bg, dark);

  const root = document.documentElement;

  // Core tokens
  root.style.setProperty('--bg', bg);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--surface-emphasis', surfaceEmphasis);
  root.style.setProperty('--surface-elevated', surfaces.surfaceElevated);
  root.style.setProperty('--surface-hover', surfaces.surfaceHover);
  root.style.setProperty('--surface-pressed', surfaces.surfacePressed);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-subtle', accentSubtle);
  root.style.setProperty('--primary-hover', accents.primaryHover);
  root.style.setProperty('--primary-active', accents.primaryActive);
  root.style.setProperty('--secondary-accent', accents.secondaryAccent);
  root.style.setProperty('--tertiary-accent', accents.tertiaryAccent);
  root.style.setProperty('--text-on-accent', textOnAccent);
  root.style.setProperty('--text', textHex);
  root.style.setProperty('--text-secondary', textSecondary.color);
  root.style.setProperty('--text-muted', textMuted.color);
  root.style.setProperty('--text-ghost', textGhost.color);
  root.style.setProperty('--border', border.color);
  root.style.setProperty('--border-strong', borderStrong.color);
  root.style.setProperty('--border-subtle', border.color);
  root.style.setProperty('--shadow-tint', shadowTint);

  // Status tokens
  for (const [key, value] of Object.entries(status)) {
    root.style.setProperty(`--color-${key}`, value);
  }

  // Meta theme-color
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.content = bg;
}
