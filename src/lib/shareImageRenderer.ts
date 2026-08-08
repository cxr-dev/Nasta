import type { TransportType } from '../types/page';
import type { PlatformPosition } from '../types/journey';
import type { ResolvedTheme } from '../themes';
import { THEME_TOKENS } from '../themes';

/**
 * Zero-dependency Canvas 2D share-card renderer.
 *
 * The output is a purpose-built 1080×1350 (4:5) share artifact, not a DOM
 * screenshot. It deliberately reuses Nästa's theme tokens and typefaces while
 * keeping the composition independent from the in-app Departure/Journey cards.
 */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

const PAGE_PAD = 80;
const BRAND_Y = 82;
const CONTENT_TOP = 184;
const CONTENT_W = SHARE_CARD_WIDTH - PAGE_PAD * 2;
const PANEL_RADIUS = 34;

/**
 * Typographic factors used to stack the departure route block. ascent/descent
 * are standard cap/descender heights as a fraction of the fitted font size;
 * gap is the guaranteed vertical air between adjacent glyph boxes.
 */
export const DEPARTURE_ROUTE_METRICS = {
  ascent: 0.8,
  descent: 0.22,
  gap: 22,
  /** Leading between wrapped lines of the same route label, fraction of its font size. */
  lineGap: 0.14,
  /** Route text never shrinks below this fraction of its base size; below that it wraps or ellipsizes. */
  minScale: 0.72,
} as const;

const DISPLAY_FONT = "'Neue Machina', 'Arial Narrow', sans-serif";
const BODY_FONT = "'Satoshi', 'Segoe UI', system-ui, sans-serif";

export interface ShareCardFonts {
  ready(): Promise<void>;
  load?(font: string): Promise<unknown>;
}

export interface ShareCardRendererOptions {
  /** Override document (tests). Defaults to globalThis.document. */
  document?: Document;
  /** Override font readiness (tests). Defaults to document.fonts. */
  fonts?: ShareCardFonts;
  /** Inject a text measurer returning width in px (tests). */
  measure?: (text: string, font: string) => number;
  /** Inject a canvas factory (tests / SSR guards). Defaults to document.createElement('canvas'). */
  canvasFactory?: () => HTMLCanvasElement;
}

export interface JourneyLegShareData {
  transportType: TransportType;
  line: string;
  /** Where to board — "Främre"/"Mitten"/"Bakre" recommendation, when known. */
  platformPosition: PlatformPosition;
  directionName: string;
  originName: string;
  destName: string;
  departureTime: number;
  arrivalTime: number;
  durationMin: number;
}

export interface JourneyConnectionShareData {
  kind: 'walk' | 'transfer';
  durationMin: number;
  /** Index of the leg this connection precedes (0 = access to first leg). */
  beforeLegIndex: number;
}

export interface JourneyShareLabels {
  duration: string;
  transfer: string;
  transfers: string;
  direct: string;
  front: string;
  middle: string;
  back: string;
  walk: string;
  change: string;
  arrives: string;
  andMore: string;
  /** Template for a leg's destination, e.g. "mot {dir}" / "towards {dir}". */
  towards: string;
}

export interface JourneyShareData {
  kind: 'journey';
  originLabel: string;
  destLabel: string;
  departureTime: number;
  arrivalTime: number;
  durationMin: number;
  transfers: number;
  /** Pre-formatted countdown, e.g. "Nu" or "5 min". Optional and secondary. */
  countdownLabel?: string;
  /** Optional localized date label, e.g. "8 aug" / "8 Aug". */
  dateLabel?: string;
  legs: JourneyLegShareData[];
  connections?: JourneyConnectionShareData[];
  labels: JourneyShareLabels;
}

export interface DepartureShareLabels {
  departs: string;
  predicted: string;
  /** Template for delay, e.g. "{n} min sen" / "{n} min late". */
  late: string;
}

export interface DepartureShareData {
  kind: 'departure';
  line: string;
  lineName: string;
  destination: string;
  stop: string;
  transportType: TransportType;
  /** Existing pre-formatted value, e.g. "5 min" or "14:37". */
  timeLabel: string;
  /** Preferred stable absolute departure timestamp for share output. */
  departureTime?: number;
  /** Optional localized date label, e.g. "8 aug" / "8 Aug". */
  dateLabel?: string;
  countdownLabel?: string;
  predicted?: boolean;
  /** Whole minutes of delay relative to the scheduled time, when known. */
  delayMin?: number;
  labels: DepartureShareLabels;
}

export type ShareCardData = JourneyShareData | DepartureShareData;

/* ------------------------------------------------------------------ */
/* Pure helpers (unit-testable without a canvas)                      */
/* ------------------------------------------------------------------ */

/** Compose an rgba() color over a solid base, returning a 6-digit hex. */
export function resolveColor(value: string, over: string): string {
  if (value === 'transparent') return over;
  const rgba = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!rgba) return value;

  const r = Number(rgba[1]);
  const g = Number(rgba[2]);
  const b = Number(rgba[3]);
  const a = rgba[4] === undefined ? 1 : Number(rgba[4]);

  const [br, bg, bb] = hexToRgb(over);
  const mix = (fg: number, base: number) => Math.round(fg * a + base * (1 - a));
  return rgbToHex(mix(r, br), mix(g, bg), mix(b, bb));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Fit a single line: shrink font size, then ellipsize. Returns drawn text + font size. */
export function fitText(
  text: string,
  baseSize: number,
  fontFamily: string,
  weight: number,
  maxWidth: number,
  measure: (text: string, font: string) => number,
  minSize = 16,
): { text: string; size: number } {
  let size = baseSize;
  while (size > minSize) {
    const font = `${weight} ${size}px ${fontFamily}`;
    if (measure(text, font) <= maxWidth) return { text, size };
    size -= 2;
  }
  const font = `${weight} ${size}px ${fontFamily}`;
  let ellipsized = text;
  while (ellipsized.length > 1 && measure(`${ellipsized}…`, font) > maxWidth) {
    ellipsized = ellipsized.slice(0, -1);
  }
  return { text: `${ellipsized}…`, size };
}

/**
 * Split text at a word boundary into two lines that both fit maxWidth,
 * picking the break that balances the two lines (minimizes the widest one).
 * Returns null when no two-line break fits (including single-word overflow).
 */
function wrapTwoLines(
  text: string,
  font: string,
  measure: (text: string, font: string) => number,
  maxWidth: number,
): string[] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let bestMax = Infinity;
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    if (measure(first, font) <= maxWidth && measure(second, font) <= maxWidth) {
      const widest = Math.max(measure(first, font), measure(second, font));
      if (widest < bestMax) {
        bestMax = widest;
        best = [first, second];
      }
    }
  }
  return best;
}

/**
 * Fit a route label (origin / destination). Priority: single line at the base
 * size, then a two-line wrap at the base size, then shrink (single line before
 * wrap at every step). Only ellipsizes when even two reasonably sized lines
 * (>= minScale of the base size) cannot fit. Returns wrapped lines + font size.
 */
function fitRouteText(
  text: string,
  baseSize: number,
  fontFamily: string,
  weight: number,
  maxWidth: number,
  measure: (text: string, font: string) => number,
  minScale: number,
): { lines: string[]; size: number } {
  const minSize = Math.max(16, Math.round(baseSize * minScale));
  for (let size = baseSize; size >= minSize; size -= 2) {
    const font = fontString(weight, size, fontFamily);
    if (measure(text, font) <= maxWidth) return { lines: [text], size };
    const wrapped = wrapTwoLines(text, font, measure, maxWidth);
    if (wrapped) return { lines: wrapped, size };
  }
  const font = fontString(weight, minSize, fontFamily);
  let ellipsized = text;
  while (ellipsized.length > 1 && measure(`${ellipsized}…`, font) > maxWidth) {
    ellipsized = ellipsized.slice(0, -1);
  }
  return { lines: [`${ellipsized}…`], size: minSize };
}

/* ------------------------------------------------------------------ */
/* SVG helpers kept for API/test compatibility. The share renderer no */
/* longer depends on SVG path parsing for transport glyphs.           */
/* ------------------------------------------------------------------ */

export type SvgPathCommand = { cmd: string; args: number[] };

/** Tokenize an SVG path `d` string into commands. Handles M/L/H/V/C/S/Q/A/Z + lowercase. */
export function parseSvgPath(d: string): SvgPathCommand[] {
  // Accept either a bare d attribute or an entire <path d="…"> fragment.
  const source = d.match(/\bd\s*=\s*["']([^"']+)["']/i)?.[1] ?? d;
  const commands: SvgPathCommand[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let current: SvgPathCommand | null = null;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    if (match[1]) {
      current = { cmd: match[1], args: [] };
      commands.push(current);
    } else if (current) {
      current.args.push(Number(match[2]));
    }
  }
  return commands;
}

/** Parse a transform like "translate(2 2) scale(0.8333)" into {tx, ty, sx, sy}. */
export function parseGlyphTransform(transform: string): { tx: number; ty: number; sx: number; sy: number } {
  const result = { tx: 0, ty: 0, sx: 1, sy: 1 };
  const translate = transform.match(/translate\((-?[\d.]+)\s+(-?[\d.]+)\)/);
  const scale = transform.match(/scale\((-?[\d.]+)\)/);
  if (translate) {
    result.tx = Number(translate[1]);
    result.ty = Number(translate[2]);
  }
  if (scale) {
    const s = Number(scale[1]);
    result.sx = s;
    result.sy = s;
  }
  return result;
}

type Point = { x: number; y: number };

/** Convert parsed commands into a canvas path. */
export function commandsToPath(
  commands: SvgPathCommand[],
  path: {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
    closePath(): void;
  },
): void {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControl: Point | null = null;
  let relative = false;
  const abs = (v: number, base: number) => (relative ? base + v : v);

  for (const { cmd, args } of commands) {
    const lower = cmd.toLowerCase();
    relative = cmd === lower;
    let i = 0;

    switch (lower) {
      case 'm': {
        while (i < args.length) {
          const nx = abs(args[i], x);
          const ny = abs(args[i + 1], y);
          if (i === 0) {
            path.moveTo(nx, ny);
            startX = nx;
            startY = ny;
          } else {
            path.lineTo(nx, ny);
          }
          x = nx;
          y = ny;
          i += 2;
        }
        lastControl = null;
        break;
      }
      case 'l': {
        while (i < args.length) {
          x = abs(args[i], x);
          y = abs(args[i + 1], y);
          path.lineTo(x, y);
          i += 2;
        }
        lastControl = null;
        break;
      }
      case 'h': {
        while (i < args.length) {
          x = abs(args[i], x);
          path.lineTo(x, y);
          i += 1;
        }
        lastControl = null;
        break;
      }
      case 'v': {
        while (i < args.length) {
          y = abs(args[i], y);
          path.lineTo(x, y);
          i += 1;
        }
        lastControl = null;
        break;
      }
      case 'c': {
        while (i < args.length) {
          const c1x = abs(args[i], x);
          const c1y = abs(args[i + 1], y);
          const c2x = abs(args[i + 2], x);
          const c2y = abs(args[i + 3], y);
          const ex = abs(args[i + 4], x);
          const ey = abs(args[i + 5], y);
          path.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
          lastControl = { x: c2x, y: c2y };
          x = ex;
          y = ey;
          i += 6;
        }
        break;
      }
      case 's': {
        while (i < args.length) {
          const c1x = x * 2 - (lastControl?.x ?? x);
          const c1y = y * 2 - (lastControl?.y ?? y);
          const c2x = abs(args[i], x);
          const c2y = abs(args[i + 1], y);
          const ex = abs(args[i + 2], x);
          const ey = abs(args[i + 3], y);
          path.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
          lastControl = { x: c2x, y: c2y };
          x = ex;
          y = ey;
          i += 4;
        }
        break;
      }
      case 'q': {
        while (i < args.length) {
          const cx = abs(args[i], x);
          const cy = abs(args[i + 1], y);
          const ex = abs(args[i + 2], x);
          const ey = abs(args[i + 3], y);
          path.quadraticCurveTo(cx, cy, ex, ey);
          lastControl = { x: cx, y: cy };
          x = ex;
          y = ey;
          i += 4;
        }
        break;
      }
      case 't': {
        while (i < args.length) {
          const cx: number = x * 2 - (lastControl?.x ?? x);
          const cy: number = y * 2 - (lastControl?.y ?? y);
          const ex = abs(args[i], x);
          const ey = abs(args[i + 1], y);
          path.quadraticCurveTo(cx, cy, ex, ey);
          lastControl = { x: cx, y: cy };
          x = ex;
          y = ey;
          i += 2;
        }
        break;
      }
      case 'a': {
        while (i < args.length) {
          const rx = args[i];
          const ry = args[i + 1];
          const rot = args[i + 2];
          const largeArc = args[i + 3] !== 0;
          const sweep = args[i + 4] !== 0;
          const ex = abs(args[i + 5], x);
          const ey = abs(args[i + 6], y);
          const points = arcToCubic(x, y, rx, ry, rot, largeArc, sweep, ex, ey);
          for (const p of points) {
            path.bezierCurveTo(p.c1x, p.c1y, p.c2x, p.c2y, p.x, p.y);
          }
          x = ex;
          y = ey;
          lastControl = null;
          i += 7;
        }
        break;
      }
      case 'z': {
        path.closePath();
        x = startX;
        y = startY;
        lastControl = null;
        break;
      }
      default:
        break;
    }
  }
}

/** SVG elliptical arc → sequence of cubic Bézier segments (SVG 1.1 F.6). */
export function arcToCubic(
  x1: number, y1: number,
  rx: number, ry: number,
  xAxisRotation: number, largeArcFlag: boolean, sweepFlag: boolean,
  x2: number, y2: number,
): Array<{ c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }> {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return [{ c1x: x1, c1y: y1, c2x: x2, c2y: y2, x: x2, y: y2 }];
  }

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxAbs *= s;
    ryAbs *= s;
  }

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const rx2 = rxAbs * rxAbs;
  const ry2 = ryAbs * ryAbs;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const coef = denominator === 0 ? 0 : sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = coef * ((rxAbs * y1p) / ryAbs);
  const cyp = coef * (-(ryAbs * x1p) / rxAbs);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const theta1 = angle({ x: 1, y: 0 }, { x: (x1p - cxp) / rxAbs, y: (y1p - cyp) / ryAbs });
  const deltaTheta = angle(
    { x: (x1p - cxp) / rxAbs, y: (y1p - cyp) / ryAbs },
    { x: (-x1p - cxp) / rxAbs, y: (-y1p - cyp) / ryAbs },
  );

  let dTheta = deltaTheta;
  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const segmentsOut: Array<{ c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }> = [];

  let t = theta1;
  for (let s = 0; s < segments; s++) {
    const t2 = t + delta;
    const p1 = ellipsePoint(cx, cy, rxAbs, ryAbs, phi, t);
    const p2 = ellipsePoint(cx, cy, rxAbs, ryAbs, phi, t2);
    const alpha = (4 / 3) * Math.tan((t2 - t) / 4);
    const tangent1 = tangentPoint(rxAbs, ryAbs, phi, t);
    const tangent2 = tangentPoint(rxAbs, ryAbs, phi, t2);
    segmentsOut.push({
      c1x: p1.x + alpha * tangent1.x,
      c1y: p1.y + alpha * tangent1.y,
      c2x: p2.x - alpha * tangent2.x,
      c2y: p2.y - alpha * tangent2.y,
      x: p2.x,
      y: p2.y,
    });
    t = t2;
  }
  return segmentsOut;
}

function angle(u: Point, v: Point): number {
  const dot = u.x * v.x + u.y * v.y;
  const len = Math.sqrt((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
  let ang = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
  if (u.x * v.y - u.y * v.x < 0) ang = -ang;
  return ang;
}

function ellipsePoint(cx: number, cy: number, rx: number, ry: number, phi: number, t: number): Point {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  return {
    x: cx + rx * cosT * cosPhi - ry * sinT * sinPhi,
    y: cy + rx * cosT * sinPhi + ry * sinT * cosPhi,
  };
}

function tangentPoint(rx: number, ry: number, phi: number, t: number): Point {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  return {
    x: -rx * sinT * cosPhi - ry * cosT * sinPhi,
    y: -rx * sinT * sinPhi + ry * cosT * cosPhi,
  };
}

/* ------------------------------------------------------------------ */
/* Canvas drawing                                                     */
/* ------------------------------------------------------------------ */

interface Palette {
  bg: string;
  surface: string;
  surfaceEmphasis: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSubtle: string;
  warning: string;
  warningBg: string;
  border: string;
}

function themePalette(theme: ResolvedTheme): Palette {
  const t = THEME_TOKENS[theme];
  const surface = theme === 'dark' ? t['--surface-elevated'] : t['--surface'];
  return {
    bg: t['--bg'],
    surface,
    surfaceEmphasis: t['--surface-emphasis'],
    text: t['--text'],
    textSecondary: t['--text-secondary'],
    textMuted: t['--text-muted'],
    accent: t['--accent'],
    accentSubtle: resolveColor(t['--accent-subtle'], surface),
    warning: t['--status-delayed'],
    warningBg: t['--status-delayed-bg'],
    border: t['--border'],
  };
}

type Ctx = CanvasRenderingContext2D;

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fontString(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

function createMeasure(ctx: Ctx): (text: string, font: string) => number {
  return (text, font) => {
    const previous = ctx.font;
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.font = previous;
    return width;
  };
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  weight: number,
  size: number,
  family: string,
  color: string,
  maxWidth: number,
  measure: (text: string, font: string) => number,
  align: CanvasTextAlign = 'left',
): { text: string; size: number } {
  const fitted = fitText(text, size, family, weight, maxWidth, measure);
  ctx.fillStyle = color;
  ctx.font = fontString(weight, fitted.size, family);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  ctx.fillText(fitted.text, x, y);
  ctx.textAlign = 'left';
  return fitted;
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  });
}

function clockLike(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value.trim());
}

function drawBrandHeader(
  ctx: Ctx,
  palette: Palette,
  measure: (text: string, font: string) => number,
  dateLabel?: string,
): void {
  drawText(ctx, 'Nästa', PAGE_PAD, BRAND_Y + 40, 800, 42, DISPLAY_FONT, palette.text, 300, measure);

  if (dateLabel) {
    drawText(
      ctx,
      dateLabel,
      SHARE_CARD_WIDTH - PAGE_PAD,
      BRAND_Y + 34,
      500,
      26,
      BODY_FONT,
      palette.textMuted,
      260,
      measure,
      'right',
    );
  }

  ctx.fillStyle = palette.border;
  ctx.fillRect(PAGE_PAD, BRAND_Y + 72, CONTENT_W, 2);
}

function drawPill(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
  options: { emphasis?: boolean; tone?: 'emphasis' | 'warning'; height?: number; fontSize?: number; minWidth?: number } = {},
): number {
  const height = options.height ?? 44;
  const fontSize = options.fontSize ?? 24;
  const font = fontString(600, fontSize, BODY_FONT);
  const width = Math.max(options.minWidth ?? 0, measure(text, font) + 34);
  roundRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = options.tone === 'warning'
    ? palette.warningBg
    : options.emphasis
      ? palette.accentSubtle
      : palette.surfaceEmphasis;
  ctx.fill();
  ctx.fillStyle = options.tone === 'warning' ? palette.warning : options.emphasis ? palette.accent : palette.textSecondary;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 17, y + height / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return width;
}

/**
 * Draw a clean, normalized 24×24 transport glyph directly in Canvas.
 *
 * This deliberately does not parse the app's SVG fragments. The previous
 * renderer treated a full <path …> fragment as path-data and then positioned
 * 0-based coordinates around an assumed center, which is why glyphs/line
 * numbers visibly collided in the exported images.
 */
function drawTransportGlyph(
  ctx: Ctx,
  type: TransportType,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size / 24;
  const x = cx - size / 2;
  const y = cy - size / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const rr = (rx: number, ry: number, rw: number, rh: number, r: number, fill = true) => {
    roundRectPath(ctx, rx, ry, rw, rh, r);
    if (fill) ctx.fill();
    else ctx.stroke();
  };

  switch (type) {
    case 'metro': {
      rr(2.5, 2.5, 19, 19, 9.5, false);
      ctx.font = fontString(800, 10.5, BODY_FONT);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', 12, 12.3);
      break;
    }
    case 'bus': {
      rr(4.2, 3.2, 15.6, 17.6, 3.2, false);
      rr(6.2, 5.4, 11.6, 5.5, 1.2, false);
      ctx.fillRect(7, 15, 3, 1.8);
      ctx.fillRect(14, 15, 3, 1.8);
      rr(6.2, 19.2, 3.1, 2.2, 1.1);
      rr(14.7, 19.2, 3.1, 2.2, 1.1);
      break;
    }
    case 'train': {
      rr(4.4, 3.1, 15.2, 17.2, 5, false);
      rr(6.6, 6, 10.8, 5.6, 1.6, false);
      ctx.beginPath();
      ctx.moveTo(7.1, 16.2);
      ctx.lineTo(16.9, 16.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8.2, 20.3);
      ctx.lineTo(6.2, 22);
      ctx.moveTo(15.8, 20.3);
      ctx.lineTo(17.8, 22);
      ctx.stroke();
      break;
    }
    case 'tram': {
      rr(5, 5.1, 14, 15.2, 3.8, false);
      rr(7, 8, 10, 5.5, 1.3, false);
      ctx.beginPath();
      ctx.moveTo(8, 4.4);
      ctx.lineTo(12, 1.9);
      ctx.lineTo(16, 4.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, 20.1);
      ctx.lineTo(6.4, 22);
      ctx.moveTo(16, 20.1);
      ctx.lineTo(17.6, 22);
      ctx.stroke();
      break;
    }
    case 'boat': {
      ctx.beginPath();
      ctx.moveTo(4.2, 13.5);
      ctx.lineTo(19.8, 13.5);
      ctx.lineTo(17, 18.4);
      ctx.quadraticCurveTo(12, 21.2, 7, 18.4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, 13.2);
      ctx.lineTo(8, 7.2);
      ctx.lineTo(16.2, 7.2);
      ctx.lineTo(16.2, 13.2);
      ctx.moveTo(12, 7.2);
      ctx.lineTo(12, 3.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4.5, 21.1);
      ctx.quadraticCurveTo(7.4, 19.7, 10.3, 21.1);
      ctx.quadraticCurveTo(13.2, 22.5, 16.1, 21.1);
      ctx.quadraticCurveTo(18, 20.2, 19.5, 20.8);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function serviceBadgeWidth(line: string, size: number, measure: (text: string, font: string) => number): number {
  const font = fontString(700, size * 0.38, BODY_FONT);
  const lineWidth = measure(line, font);
  return Math.max(size * 1.7, size * 0.82 + lineWidth + size * 0.42);
}

function drawServiceBadge(
  ctx: Ctx,
  type: TransportType,
  line: string,
  x: number,
  y: number,
  height: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
): number {
  const width = serviceBadgeWidth(line, height, measure);
  roundRectPath(ctx, x, y, width, height, Math.min(22, height * 0.28));
  ctx.fillStyle = palette.accentSubtle;
  ctx.fill();

  const iconCx = x + height * 0.43;
  const iconCy = y + height / 2;
  drawTransportGlyph(ctx, type, iconCx, iconCy, height * 0.42, palette.accent);

  ctx.fillStyle = palette.border;
  ctx.fillRect(x + height * 0.78, y + height * 0.23, 2, height * 0.54);

  ctx.fillStyle = palette.accent;
  ctx.font = fontString(700, height * 0.38, BODY_FONT);
  ctx.textBaseline = 'middle';
  ctx.fillText(line, x + height * 0.96, y + height / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return width;
}

function positionLabel(position: PlatformPosition, labels: JourneyShareLabels): string | null {
  if (position === 'front') return labels.front;
  if (position === 'back') return labels.back;
  if (position === 'middle') return labels.middle;
  return null;
}

function drawRoutePair(
  ctx: Ctx,
  origin: string,
  destination: string,
  y: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
  options: { originSize?: number; destinationSize?: number } = {},
): number {
  const originSize = options.originSize ?? 44;
  const destSize = options.destinationSize ?? 64;

  const originFit = drawText(
    ctx,
    origin,
    PAGE_PAD,
    y + originSize,
    500,
    originSize,
    BODY_FONT,
    palette.textSecondary,
    CONTENT_W,
    measure,
  );

  const destinationBaseline = y + originFit.size + 30 + destSize;
  drawText(ctx, '→', PAGE_PAD, destinationBaseline, 700, 42, BODY_FONT, palette.accent, 70, measure);

  const destinationFit = drawText(
    ctx,
    destination,
    PAGE_PAD + 58,
    destinationBaseline,
    700,
    destSize,
    DISPLAY_FONT,
    palette.text,
    CONTENT_W - 58,
    measure,
  );

  return destinationBaseline + Math.max(36, destinationFit.size * 0.12);
}

function drawJourneySummary(
  ctx: Ctx,
  data: JourneyShareData,
  y: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
): number {
  const left = PAGE_PAD;
  const right = SHARE_CARD_WIDTH - PAGE_PAD;
  const dep = formatClockTime(data.departureTime);
  const arr = formatClockTime(data.arrivalTime);

  drawText(ctx, dep, left, y + 64, 700, 56, DISPLAY_FONT, palette.text, 250, measure);
  drawText(ctx, arr, right, y + 64, 700, 56, DISPLAY_FONT, palette.text, 250, measure, 'right');

  const lineY = y + 84;
  const lineLeft = left + 12;
  const lineRight = right - 12;
  ctx.fillStyle = palette.border;
  ctx.fillRect(lineLeft, lineY, lineRight - lineLeft, 2);

  const durationText = data.labels.duration.replace('{n}', String(data.durationMin));
  const transferText = data.transfers === 0
    ? data.labels.direct
    : data.transfers === 1
      ? `1 ${data.labels.transfer}`
      : `${data.transfers} ${data.labels.transfers}`;
  drawText(
    ctx,
    `${durationText} · ${transferText}`,
    (left + right) / 2,
    y + 144,
    500,
    28,
    BODY_FONT,
    palette.textSecondary,
    460,
    measure,
    'center',
  );

  if (data.countdownLabel) {
    drawPill(ctx, data.countdownLabel, left, y + 172, palette, measure, { emphasis: true, height: 42, fontSize: 23 });
    return y + 238;
  }

  return y + 206;
}

function drawConnectionRow(
  ctx: Ctx,
  connection: JourneyConnectionShareData,
  labels: JourneyShareLabels,
  x: number,
  y: number,
  width: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
): number {
  const label = connection.kind === 'walk'
    ? labels.walk.replace('{n}', String(connection.durationMin))
    : labels.change.replace('{n}', String(connection.durationMin));

  ctx.fillStyle = palette.border;
  ctx.fillRect(x + 34, y + 25, 26, 2);
  drawText(ctx, label, x + 76, y + 34, 600, 24, BODY_FONT, palette.textSecondary, width - 92, measure);
  return 54;
}

function drawJourneyLegRow(
  ctx: Ctx,
  leg: JourneyLegShareData,
  labels: JourneyShareLabels,
  x: number,
  y: number,
  width: number,
  palette: Palette,
  measure: (text: string, font: string) => number,
): number {
  const rowH = 126;
  const badgeH = 62;
  const badgeW = drawServiceBadge(ctx, leg.transportType, leg.line, x + 26, y + 31, badgeH, palette, measure);
  const textX = x + 26 + badgeW + 24;
  const rightPad = 24;

  const pos = positionLabel(leg.platformPosition, labels);
  let positionW = 0;
  if (pos) {
    const posFont = fontString(600, 21, BODY_FONT);
    positionW = measure(pos, posFont) + 30;
  }

  const primaryMax = width - (textX - x) - rightPad - (positionW ? positionW + 18 : 0);
  const routeText = `${leg.originName} → ${leg.destName}`;
  drawText(ctx, routeText, textX, y + 52, 700, 30, BODY_FONT, palette.text, primaryMax, measure);

  if (pos) {
    const pillX = x + width - rightPad - positionW;
    drawPill(ctx, pos, pillX, y + 28, palette, measure, { height: 38, fontSize: 21, minWidth: positionW });
  }

  const times = `${formatClockTime(leg.departureTime)}–${formatClockTime(leg.arrivalTime)}`;
  const direction = leg.directionName ? ` · ${labels.towards.replace('{dir}', leg.directionName)}` : '';
  drawText(
    ctx,
    `${times}${direction}`,
    textX,
    y + 91,
    400,
    23,
    BODY_FONT,
    palette.textMuted,
    width - (textX - x) - rightPad,
    measure,
  );

  return rowH;
}

function drawJourneyCard(ctx: Ctx, data: JourneyShareData, palette: Palette, opts: ShareCardRendererOptions): void {
  const measure = opts.measure ?? createMeasure(ctx);
  drawBrandHeader(ctx, palette, measure, data.dateLabel);

  let y = drawRoutePair(ctx, data.originLabel, data.destLabel, CONTENT_TOP, palette, measure, {
    originSize: 44,
    destinationSize: 64,
  });

  y = drawJourneySummary(ctx, data, y + 10, palette, measure);

  const panelX = PAGE_PAD;
  const panelY = y;
  const panelW = CONTENT_W;
  const panelBottom = SHARE_CARD_HEIGHT - 82;
  const maxPanelH = panelBottom - panelY;

  const maxLegs = 4;
  const legs = data.legs.slice(0, maxLegs);
  const connections = legs.map((_, i) => {
    const connection = data.connections?.find((c) => c.beforeLegIndex === i);
    if (!connection) return null;
    const meaningful = connection.durationMin >= 2 || (i > 0 && i < data.legs.length);
    return meaningful ? connection : null;
  });

  const contentH =
    28 +
    legs.reduce((sum, _leg, i) => sum + 126 + (connections[i] ? 54 : 0), 0) +
    (data.legs.length > maxLegs ? 58 : 0) +
    28;
  const panelH = Math.min(maxPanelH, contentH);

  roundRectPath(ctx, panelX, panelY, panelW, panelH, PANEL_RADIUS);
  ctx.fillStyle = palette.surface;
  ctx.fill();

  let rowY = panelY + 28;
  for (let i = 0; i < legs.length; i++) {
    const connection = connections[i];
    if (connection) {
      rowY += drawConnectionRow(ctx, connection, data.labels, panelX + 16, rowY, panelW - 32, palette, measure);
    }

    rowY += drawJourneyLegRow(ctx, legs[i], data.labels, panelX + 16, rowY, panelW - 32, palette, measure);

    if (i < legs.length - 1 && rowY < panelY + panelH - 44) {
      ctx.fillStyle = palette.border;
      ctx.fillRect(panelX + 42, rowY, panelW - 84, 1);
    }
  }

  if (data.legs.length > maxLegs && rowY < panelY + panelH - 30) {
    drawText(
      ctx,
      data.labels.andMore.replace('{n}', String(data.legs.length - maxLegs)),
      panelX + 42,
      Math.min(rowY + 36, panelY + panelH - 26),
      600,
      24,
      BODY_FONT,
      palette.textSecondary,
      panelW - 84,
      measure,
    );
  }
}

function resolveDeparturePresentation(data: DepartureShareData): { absolute: string; status?: string } {
  if (data.departureTime) {
    const status = data.countdownLabel ?? (!clockLike(data.timeLabel) ? data.timeLabel : undefined);
    return { absolute: formatClockTime(data.departureTime), status };
  }

  if (clockLike(data.timeLabel)) {
    return { absolute: data.timeLabel, status: data.countdownLabel };
  }

  // Backwards-compatible fallback until callers provide departureTime.
  return { absolute: data.timeLabel };
}

function drawDepartureCard(ctx: Ctx, data: DepartureShareData, palette: Palette, opts: ShareCardRendererOptions): void {
  const measure = opts.measure ?? createMeasure(ctx);
  drawBrandHeader(ctx, palette, measure, data.dateLabel);

  const presentation = resolveDeparturePresentation(data);

  // Single status element in the time/status area: delay > countdown > relative time.
  const statusText = data.delayMin !== undefined
    ? data.labels.late.replace('{n}', String(data.delayMin))
    : presentation.status;
  const statusTone = data.delayMin !== undefined ? 'warning' : 'emphasis';

  const heroSize = 104;
  const stopSize = 42;
  const destSize = 60;
  const panelH = 150;
  const heroToStatus = 22;
  const statusH = 44;
  const statusToRoute = 38;
  const destToPanel = 46;

  const heroFit = fitText(presentation.absolute, heroSize, DISPLAY_FONT, 800, 530, measure);
  const stopFit = fitRouteText(data.stop, stopSize, BODY_FONT, 500, CONTENT_W, measure, DEPARTURE_ROUTE_METRICS.minScale);
  const destFit = fitRouteText(data.destination, destSize, DISPLAY_FONT, 800, CONTENT_W - 58, measure, DEPARTURE_ROUTE_METRICS.minScale);

  const statusBlock = statusText ? statusH + statusToRoute : statusToRoute;
  // Route block stacks origin above destination with separation derived from
  // the fitted font sizes so descenders never collide with the line below.
  // Long labels wrap to at most two lines; per-line leading is deterministic
  // (lineGap fraction of the size) so origin/arrow/destination never collide.
  const { ascent, descent, gap, lineGap } = DEPARTURE_ROUTE_METRICS;
  const stopLines = stopFit.lines.length;
  const destLines = destFit.lines.length;
  const stopStep = stopLines > 1 ? Math.round((ascent + descent) * stopFit.size + lineGap * stopFit.size) : 0;
  const destStep = destLines > 1 ? Math.round((ascent + descent) * destFit.size + lineGap * destFit.size) : 0;
  const routeBlockH =
    ascent * stopFit.size +
    descent * stopFit.size +
    (stopLines - 1) * stopStep +
    gap +
    ascent * destFit.size +
    (destLines - 1) * destStep;
  const blockH = heroFit.size + heroToStatus + statusBlock + routeBlockH + destToPanel + panelH;

  // Center the composed block in the upper region of the card so the absolute
  // time sits comfortably under the header and the route has room to breathe.
  const contentTop = CONTENT_TOP;
  const contentBottom = SHARE_CARD_HEIGHT - 300;
  const startY = contentTop + Math.max(0, Math.round((contentBottom - contentTop - blockH) / 2));

  // Hero: stable absolute departure time.
  const heroBaseline = startY + heroFit.size;
  drawText(ctx, presentation.absolute, PAGE_PAD, heroBaseline, 800, heroFit.size, DISPLAY_FONT, palette.text, 530, measure);

  // Status chip directly under the time — one element for countdown /
  // relative time / delay, never a second label and never near the route.
  if (statusText) {
    drawPill(ctx, statusText, PAGE_PAD, heroBaseline + heroToStatus, palette, measure, {
      height: statusH,
      fontSize: 24,
      tone: statusTone,
    });
  }

  // Route: stop above destination, arrow aligned with the destination baseline.
  const routeTop = heroBaseline + heroToStatus + statusBlock;
  const stopBaseline = routeTop + Math.round(DEPARTURE_ROUTE_METRICS.ascent * stopFit.size);
  for (let i = 0; i < stopLines; i++) {
    drawText(ctx, stopFit.lines[i], PAGE_PAD, stopBaseline + i * stopStep, 500, stopFit.size, BODY_FONT, palette.textSecondary, CONTENT_W, measure);
  }
  const lastStopBaseline = stopBaseline + (stopLines - 1) * stopStep;

  const destBaseline =
    lastStopBaseline +
    Math.round(
      DEPARTURE_ROUTE_METRICS.descent * stopFit.size +
        DEPARTURE_ROUTE_METRICS.gap +
        DEPARTURE_ROUTE_METRICS.ascent * destFit.size,
    );
  const arrowSize = Math.max(30, Math.min(42, Math.round(destFit.size * 0.7)));
  drawText(ctx, '→', PAGE_PAD, destBaseline, 700, arrowSize, BODY_FONT, palette.accent, 70, measure);
  for (let i = 0; i < destLines; i++) {
    drawText(ctx, destFit.lines[i], PAGE_PAD + 58, destBaseline + i * destStep, 800, destFit.size, DISPLAY_FONT, palette.text, CONTENT_W - 58, measure);
  }
  const destLastBaseline = destBaseline + (destLines - 1) * destStep;

  // Service block keeps glyph, line and service name as one coherent object.
  const panelX = PAGE_PAD;
  const panelY = destLastBaseline + destToPanel;
  const panelW = CONTENT_W;
  roundRectPath(ctx, panelX, panelY, panelW, panelH, PANEL_RADIUS);
  ctx.fillStyle = palette.surface;
  ctx.fill();

  const badgeH = 78;
  const badgeW = drawServiceBadge(ctx, data.transportType, data.line, panelX + 30, panelY + 36, badgeH, palette, measure);
  const serviceX = panelX + 30 + badgeW + 28;
  drawText(ctx, data.lineName, serviceX, panelY + 70, 700, 34, BODY_FONT, palette.text, panelW - (serviceX - panelX) - 32, measure);
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function renderShareImage(
  data: ShareCardData,
  theme: ResolvedTheme,
  opts: ShareCardRendererOptions = {},
): Promise<Blob | null> {
  const documentRef = opts.document ?? globalThis.document;
  const fonts = opts.fonts ?? (documentRef ? (documentRef as Document & { fonts?: unknown }).fonts : undefined);

  try {
    if (fonts && typeof (fonts as ShareCardFonts).ready === 'function') {
      await (fonts as ShareCardFonts).ready();
    }
    const load = (fonts as ShareCardFonts | undefined)?.load;
    if (typeof load === 'function') {
      await Promise.allSettled([
        load.call(fonts, '800 104px "Neue Machina"'),
        load.call(fonts, '700 64px "Neue Machina"'),
        load.call(fonts, '700 42px "Neue Machina"'),
        load.call(fonts, '700 34px "Satoshi"'),
        load.call(fonts, '500 30px "Satoshi"'),
      ]);
    }
  } catch {
    // Font readiness is best-effort; fall back to the system stack.
  }

  const factory = opts.canvasFactory ?? (() => {
    if (!documentRef) throw new Error('no document for canvas creation');
    return documentRef.createElement('canvas');
  });

  let canvas: HTMLCanvasElement;
  try {
    canvas = factory();
  } catch {
    return null;
  }

  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const palette = themePalette(theme);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  if (data.kind === 'journey') drawJourneyCard(ctx, data, palette, opts);
  else drawDepartureCard(ctx, data, palette, opts);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
