import type { JourneyMeta, JourneyTimeMode } from '../types/journey';
import type { TransportType, Segment } from '../types/page';

/**
 * Share link model — v1.
 *
 * Payloads are small, versioned query strings inside the URL hash:
 *   #share?v=1&type=journey&o=...&d=...&tm=now...
 *   #share?v=1&type=departure&s=...&n=...&l=...&dir=...&t=metro
 *
 * Deliberately NOT base64/JSON: stays readable, survives paste-truncation,
 * and unknown fields are tolerated by consumers (forward compatible).
 */

export const SHARE_VERSION = 1;

export const SHARE_HASH_PREFIX = 'share';

export interface ShareJourneyIntent {
  kind: 'journey';
  /** User-provided origin label. */
  origin: string;
  /** User-provided destination label. */
  dest: string;
  timeMode: JourneyTimeMode;
  /** Local Stockholm date YYYY-MM-DD when timeMode is departure/arrival. */
  date?: string;
  /** Local Stockholm time HH:mm when timeMode is departure/arrival. */
  time?: string;
  /** Light first-leg discriminator so the receiver can pre-fill context. */
  firstLegTransport?: TransportType;
  firstLegLine?: string;
  originCoord?: [number, number];
  destCoord?: [number, number];
}

export interface ShareDepartureIntent {
  kind: 'departure';
  siteId: string;
  stop: string;
  line: string;
  direction: string;
  transportType: TransportType;
}

export type ShareIntent = ShareJourneyIntent | ShareDepartureIntent;

const MAX_TEXT_LENGTH = 120;
const MAX_LINE_LENGTH = 12;
const MAX_SITE_ID_LENGTH = 64;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const COORD_RE = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

function clampText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function parseCoord(value: string | null): [number, number] | undefined {
  if (!value || !COORD_RE.test(value)) return undefined;
  const [lat, lon] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  return [lat, lon];
}

/** Build a journey intent from a saved journey's metadata + search query. */
export function intentFromJourney(meta: JourneyMeta): ShareJourneyIntent | null {
  const query = meta.query;
  if (!query?.origin || !query.destination) return null;
  const firstLeg = meta.legs[0];
  const intent: ShareJourneyIntent = {
    kind: 'journey',
    origin: clampText(query.origin, MAX_TEXT_LENGTH),
    dest: clampText(query.destination, MAX_TEXT_LENGTH),
    timeMode: query.timeMode ?? 'now',
    firstLegTransport: firstLeg?.transportType,
    firstLegLine: firstLeg?.line ? clampText(firstLeg.line, MAX_LINE_LENGTH) : undefined,
    originCoord: query.originCoord,
    destCoord: query.destinationCoord,
  };
  if (query.date && DATE_RE.test(query.date)) intent.date = query.date;
  if (query.time && TIME_RE.test(query.time)) intent.time = query.time;
  return intent;
}

/** Build a departure intent from a saved departure segment. */
export function intentFromSegment(segment: Segment): ShareDepartureIntent | null {
  const siteId = segment.fromStop.siteId;
  if (!siteId) return null;
  return {
    kind: 'departure',
    siteId: clampText(siteId, MAX_SITE_ID_LENGTH),
    stop: clampText(segment.fromStop.name, MAX_TEXT_LENGTH),
    line: clampText(segment.line, MAX_LINE_LENGTH),
    direction: clampText(segment.direction.destination, MAX_TEXT_LENGTH),
    transportType: segment.transportType,
  };
}

/** Encode an intent as a `#share?...` hash string. */
export function encodeShareIntent(intent: ShareIntent): string {
  const p = new URLSearchParams();
  p.set('v', String(SHARE_VERSION));
  p.set('type', intent.kind);

  if (intent.kind === 'journey') {
    p.set('o', intent.origin);
    p.set('d', intent.dest);
    p.set('tm', intent.timeMode);
    if (intent.date) p.set('dt', intent.date);
    if (intent.time) p.set('tt', intent.time);
    if (intent.firstLegTransport) p.set('t', intent.firstLegTransport);
    if (intent.firstLegLine) p.set('l', intent.firstLegLine);
    if (intent.originCoord) p.set('oc', intent.originCoord.join(','));
    if (intent.destCoord) p.set('dc', intent.destCoord.join(','));
  } else {
    p.set('s', intent.siteId);
    p.set('n', intent.stop);
    p.set('l', intent.line);
    p.set('dir', intent.direction);
    p.set('t', intent.transportType);
  }

  return `#${SHARE_HASH_PREFIX}?${p.toString()}`;
}

/**
 * Parse a location hash into a validated share intent.
 * Returns null for malformed, unknown-version, or unsupported payloads —
 * the caller must then fall back to normal app behavior.
 */
export function parseShareHash(hash: string): ShareIntent | null {
  const normalized = hash.replace(/^#/, '');
  if (!normalized.startsWith(SHARE_HASH_PREFIX)) return null;

  const queryStart = normalized.indexOf('?');
  if (queryStart < 0) return null;
  const params = new URLSearchParams(normalized.slice(queryStart + 1));

  if (params.get('v') !== String(SHARE_VERSION)) return null;

  const type = params.get('type');
  if (type === 'journey') {
    const origin = params.get('o');
    const dest = params.get('d');
    const timeMode = params.get('tm');
    if (!origin || !dest) return null;
    if (timeMode !== 'now' && timeMode !== 'departure' && timeMode !== 'arrival') return null;

    const intent: ShareJourneyIntent = {
      kind: 'journey',
      origin: clampText(origin, MAX_TEXT_LENGTH),
      dest: clampText(dest, MAX_TEXT_LENGTH),
      timeMode,
      originCoord: parseCoord(params.get('oc')),
      destCoord: parseCoord(params.get('dc')),
    };

    const date = params.get('dt');
    const time = params.get('tt');
    if (date && DATE_RE.test(date)) intent.date = date;
    if (time && TIME_RE.test(time)) intent.time = time;

    const transport = params.get('t');
    const line = params.get('l');
    if (isTransportType(transport)) intent.firstLegTransport = transport;
    if (line) intent.firstLegLine = clampText(line, MAX_LINE_LENGTH);

    return intent;
  }

  if (type === 'departure') {
    const siteId = params.get('s');
    const stop = params.get('n');
    const line = params.get('l');
    const direction = params.get('dir');
    const transportType = params.get('t');
    if (!siteId || !stop || !line || !direction || !isTransportType(transportType)) {
      return null;
    }
    return {
      kind: 'departure',
      siteId: clampText(siteId, MAX_SITE_ID_LENGTH),
      stop: clampText(stop, MAX_TEXT_LENGTH),
      line: clampText(line, MAX_LINE_LENGTH),
      direction: clampText(direction, MAX_TEXT_LENGTH),
      transportType,
    };
  }

  return null;
}

/** Full URL for sharing. `base` must already include the app base path. */
export function buildShareUrl(base: string, intent: ShareIntent): string {
  return `${base}${encodeShareIntent(intent)}`;
}

const TRANSPORT_TYPES: readonly TransportType[] = ['bus', 'train', 'metro', 'boat', 'tram'];

function isTransportType(value: string | null): value is TransportType {
  return value !== null && (TRANSPORT_TYPES as readonly string[]).includes(value);
}
