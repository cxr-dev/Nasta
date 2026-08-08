import { describe, expect, it, vi } from 'vitest';
import {
  DEPARTURE_ROUTE_METRICS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  arcToCubic,
  commandsToPath,
  fitText,
  parseGlyphTransform,
  parseSvgPath,
  renderShareImage,
  resolveColor,
} from './shareImageRenderer';
import type { DepartureShareData, JourneyShareData } from './shareImageRenderer';

const widthOf = (text: string) => text.length * 10;
// Size-aware measurer so fitText can exercise its shrink loop.
const widthOfSized = (text: string, font: string) => text.length * (1 + Number(font.match(/(\d+)px/)![1]) / 40);

describe('resolveColor', () => {
  it('composites rgba over a base hex', () => {
    expect(resolveColor('rgba(23, 23, 23, 0.08)', '#ffffff')).toBe('#ececec');
  });

  it('passes through plain hex and transparent', () => {
    expect(resolveColor('#123456', '#ffffff')).toBe('#123456');
    expect(resolveColor('transparent', '#ffffff')).toBe('#ffffff');
  });

  it('handles rgb without alpha and 3-digit hex bases', () => {
    expect(resolveColor('rgb(255, 0, 0)', '#fff')).toBe('#ff0000');
  });
});

describe('fitText', () => {
  it('keeps the base size when text fits', () => {
    const result = fitText('Kista', 56, "'Satoshi'", 700, 200, widthOf);
    expect(result).toEqual({ text: 'Kista', size: 56 });
  });

  it('shrinks the font until the text fits', () => {
    const result = fitText('a'.repeat(20), 56, "'Satoshi'", 700, 40, widthOfSized);
    expect(result.size).toBe(40);
    expect(result.text).toBe('a'.repeat(20));
  });

  it('ellipsizes at the minimum size', () => {
    const result = fitText('a very long destination name indeed', 56, "'Satoshi'", 700, 30, widthOfSized);
    expect(result.size).toBe(16);
    expect(result.text.endsWith('…')).toBe(true);
  });
});

describe('parseSvgPath', () => {
  it('tokenizes mixed commands and numbers', () => {
    const commands = parseSvgPath('M1 2 L3 4 h5 v6 c1 2 3 4 5 6 z');
    expect(commands.map((c) => c.cmd)).toEqual(['M', 'L', 'h', 'v', 'c', 'z']);
    expect(commands[0].args).toEqual([1, 2]);
    expect(commands[4].args).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('parses exponents in numbers', () => {
    const commands = parseSvgPath('M1e-3 2E2');
    expect(commands[0].args).toEqual([0.001, 200]);
  });


  it('extracts d path data from an SVG path fragment before tokenizing', () => {
    const commands = parseSvgPath('<path d="M1 2 L3 4"/>');
    expect(commands.map((c) => c.cmd)).toEqual(['M', 'L']);
    expect(commands[0].args).toEqual([1, 2]);
    expect(commands[1].args).toEqual([3, 4]);
  });
});

describe('parseGlyphTransform', () => {
  it('parses translate and scale', () => {
    expect(parseGlyphTransform('translate(2 2) scale(0.8333)')).toEqual({ tx: 2, ty: 2, sx: 0.8333, sy: 0.8333 });
  });

  it('defaults when missing', () => {
    expect(parseGlyphTransform('')).toEqual({ tx: 0, ty: 0, sx: 1, sy: 1 });
  });
});

describe('commandsToPath', () => {
  type Recorder = {
    calls: string[];
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    bezierCurveTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => void;
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => void;
    closePath: () => void;
  };

  const recorder = (): Recorder => {
    const calls: string[] = [];
    return {
      calls,
      moveTo: (x, y) => calls.push(`M${x},${y}`),
      lineTo: (x, y) => calls.push(`L${x},${y}`),
      bezierCurveTo: (c1x, c1y, c2x, c2y, x, y) => calls.push(`C${c1x},${c1y},${c2x},${c2y},${x},${y}`),
      quadraticCurveTo: (cx, cy, x, y) => calls.push(`Q${cx},${cy},${x},${y}`),
      closePath: () => calls.push('Z'),
    };
  };

  it('handles absolute and relative line commands', () => {
    const r = recorder();
    commandsToPath(parseSvgPath('M10 20 L30 40 h5 v6 Z'), r);
    expect(r.calls).toEqual(['M10,20', 'L30,40', 'L35,40', 'L35,46', 'Z']);
  });

  it('mirrors control points for S and T after a curve', () => {
    const r = recorder();
    commandsToPath(parseSvgPath('M0 0 C0 10 10 10 10 0 S20 -10 20 0'), r);
    const calls = r.calls.filter((c) => c.startsWith('C'));
    expect(calls).toHaveLength(2);
    // First control of the S command is the mirror of the previous c2 (10,10) about the current point (10,0).
    expect(calls[1]).toMatch(/^C10,-10,/);
  });

  it('flattens arcs into cubic segments', () => {
    const r = recorder();
    commandsToPath(parseSvgPath('M0 0 A10 10 0 0 1 20 0'), r);
    const calls = r.calls.filter((c) => c.startsWith('C'));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const end = calls[calls.length - 1].match(/C[^,]+,[^,]+,[^,]+,[^,]+,(-?[\d.e+-]+),(-?[\d.e+-]+)$/);
    expect(Number(end![1])).toBeCloseTo(20, 5);
    expect(Number(end![2])).toBeCloseTo(0, 5);
  });
});

describe('arcToCubic', () => {
  it('sweeps a half circle with two segments and lands on the end point', () => {
    const segments = arcToCubic(0, 0, 10, 10, 0, false, true, 20, 0);
    expect(segments).toHaveLength(2);
    const end = segments[segments.length - 1];
    expect(end.x).toBeCloseTo(20, 5);
    expect(end.y).toBeCloseTo(0, 5);
  });
});

describe('renderShareImage', () => {
  it('renders a journey card to a blob via an injected canvas', async () => {
    const calls: string[] = [];
    const ctxStub = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: '',
      fillText: () => calls.push('fillText'),
      fillRect: () => calls.push('fillRect'),
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      bezierCurveTo: () => calls.push('bezierCurveTo'),
      quadraticCurveTo: () => calls.push('quadraticCurveTo'),
      arcTo: () => calls.push('arcTo'),
      closePath: () => calls.push('closePath'),
      stroke: () => calls.push('stroke'),
      fill: () => calls.push('fill'),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      translate: () => calls.push('translate'),
      scale: () => calls.push('scale'),
      measureText: () => ({ width: 10 }),
    };
    let blob: Blob | null = null;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctxStub,
      toBlob: (cb: (b: Blob | null) => void) => {
        blob = new Blob(['png'], { type: 'image/png' });
        cb(blob);
      },
    };
    const fontsReady = vi.fn().mockResolvedValue(undefined);

    const data: JourneyShareData = {
      kind: 'journey',
      originLabel: 'Slussen',
      destLabel: 'Kista centrum',
      departureTime: 1_720_000_000_000,
      arrivalTime: 1_720_001_000_000,
      durationMin: 10,
      transfers: 0,
      countdownLabel: 'Nu',
      legs: [
        {
          transportType: 'metro',
          line: '14',
          platformPosition: 'middle',
          directionName: 'Mörby centrum',
          originName: 'Slussen',
          destName: 'Kista centrum',
          departureTime: 1_720_000_000_000,
          arrivalTime: 1_720_001_000_000,
          durationMin: 10,
        },
      ],
      labels: {
        duration: '{n} min',
        transfer: 'byte',
        transfers: 'byten',
        direct: 'Direkt',
        front: 'Främre',
        middle: 'Mitten',
        back: 'Bakre',
        walk: 'Gå {n} min',
        change: 'Byt {n} min',
        arrives: 'Framme',
        andMore: '+{n} till',
        towards: 'mot {dir}',
      },
    };

    const result = await renderShareImage(data, 'light', {
      fonts: { ready: fontsReady },
      measure: widthOf,
      canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    });

    expect(fontsReady).toHaveBeenCalled();
    expect(canvas.width).toBe(SHARE_CARD_WIDTH);
    expect(canvas.height).toBe(SHARE_CARD_HEIGHT);
    expect(result).toBe(blob);
    expect(calls).toContain('fillText');
    expect(calls).toContain('arcTo');
  });

  it('returns null when canvas creation fails', async () => {
    const result = await renderShareImage(
      {
        kind: 'departure',
        line: '76',
        lineName: '76',
        destination: 'Kaknästornet',
        stop: 'Lindarängsvägen',
        transportType: 'bus',
        timeLabel: '5 min',
        departureTime: 1_720_000_000_000,
        labels: { departs: 'Avgår', predicted: 'Beräknad', late: '{n} min sen' },
      },
      'dark',
      { canvasFactory: () => { throw new Error('no canvas'); } },
    );
    expect(result).toBeNull();
  });
});

describe('departure route separation', () => {
  const metrics = DEPARTURE_ROUTE_METRICS;

  type TextRecord = { text: string; x: number; y: number; font: string };

  const recordingCtx = () => {
    const text: TextRecord[] = [];
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: '',
      textAlign: 'left',
      fillText: (t: string, x: number, y: number) => {
        text.push({ text: t, x, y, font: ctx.font });
      },
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      arcTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      measureText: () => ({ width: 10 }),
    };
    return { ctx, text };
  };

  const renderDeparture = async (overrides: Record<string, unknown>, measure: (text: string, font: string) => number) => {
    const rec = recordingCtx();
    let blob: Blob | null = null;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => rec.ctx,
      toBlob: (cb: (b: Blob | null) => void) => {
        blob = new Blob(['png'], { type: 'image/png' });
        cb(blob);
      },
    };
    const stop = (overrides.stop as string | undefined) ?? 'Odenplan';
    const destination = (overrides.destination as string | undefined) ?? 'Skarpnäck';
    const data = {
      kind: 'departure',
      line: '17',
      lineName: 'Tunnelbana',
      destination,
      stop,
      transportType: 'metro',
      departureTime: 1_780_000_000_000,
      timeLabel: '12 min',
      countdownLabel: '12 min',
      dateLabel: '8 aug',
      predicted: false,
      labels: { departs: 'Avgår', predicted: 'Beräknad', late: '{n} min sen' },
      ...overrides,
    } as unknown as DepartureShareData;
    await renderShareImage(data, 'light', {
      fonts: { ready: () => Promise.resolve() },
      measure,
      canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    });
    return { records: rec.text, stop, destination };
  };

  const sizeOf = (font: string) => Number(font.match(/(\d+)px/)![1]);

  // A rendered line belongs to a route label when it is a contiguous slice of
  // it (an ellipsized line keeps its prefix, minus the trailing ellipsis).
  const isPartOf = (record: TextRecord, label: string) => {
    const body = record.text.replace(/…$/, '').trim();
    return body.length > 0 && label.includes(body);
  };
  const byY = (a: TextRecord, b: TextRecord) => a.y - b.y;

  const assertSeparation = (records: TextRecord[], stop: string, destination: string) => {
    const stopLines = records.filter((r) => isPartOf(r, stop)).sort(byY);
    const destLines = records.filter((r) => isPartOf(r, destination)).sort(byY);
    const arrow = records.find((r) => r.text === '→');
    expect(stopLines.length).toBeGreaterThan(0);
    expect(destLines.length).toBeGreaterThan(0);
    expect(arrow).toBeDefined();
    const stopSize = sizeOf(stopLines[0].font);
    const destSize = sizeOf(destLines[0].font);
    // Separation is measured from the last origin line to the first destination line.
    const originBottom = stopLines[stopLines.length - 1].y + metrics.descent * stopSize;
    const destTop = destLines[0].y - metrics.ascent * destSize;
    // Destination caps must clear the origin descenders by at least the gap.
    expect(destTop - originBottom).toBeGreaterThanOrEqual(metrics.gap - 1);
    // Arrow shares the destination baseline and never intersects the origin.
    expect(arrow!.y).toBe(destLines[0].y);
    const arrowTop = arrow!.y - metrics.ascent * sizeOf(arrow!.font);
    expect(arrowTop - originBottom).toBeGreaterThan(4);
  };

  it('keeps origin and destination vertically separated at full fitting size', async () => {
    const { records, stop, destination } = await renderDeparture({}, widthOfSized);
    assertSeparation(records, stop, destination);
  });

  it('wraps a long destination to two lines instead of shrinking it to metadata size', async () => {
    const stop = 'Karolinska Universitetssjukhuset Solna';
    const destination = 'Stockholms Södra station pendeltåg perrong 2';
    const { records } = await renderDeparture(
      { stop, destination },
      (t, f) => t.length * Number(f.match(/(\d+)px/)![1]) * 0.55,
    );
    assertSeparation(records, stop, destination);
    const stopLines = records.filter((r) => isPartOf(r, stop)).sort(byY);
    const destLines = records.filter((r) => isPartOf(r, destination)).sort(byY);
    // Destination wraps to exactly two lines and is never ellipsized.
    expect(destLines.length).toBe(2);
    expect(destLines.every((r) => !r.text.includes('…'))).toBe(true);
    // Destination stays the stronger route element, above its shrink floor.
    const destSize = sizeOf(destLines[0].font);
    const stopSize = sizeOf(stopLines[0].font);
    expect(destSize).toBeGreaterThanOrEqual(Math.round(60 * metrics.minScale));
    expect(destSize).toBeGreaterThan(stopSize);
  });

  it('ellipsizes only when even two reasonably sized lines cannot fit', async () => {
    const destination = `${'Stockholms Södra station pendeltåg '.repeat(4)}perrong 2`;
    const { records, stop } = await renderDeparture(
      { destination },
      (t, f) => t.length * Number(f.match(/(\d+)px/)![1]) * 0.7,
    );
    const destLines = records.filter((r) => isPartOf(r, destination)).sort(byY);
    expect(destLines.length).toBe(1);
    expect(destLines[0].text.endsWith('…')).toBe(true);
    expect(sizeOf(destLines[0].font)).toBe(Math.round(60 * metrics.minScale));
    assertSeparation(records, stop, destination);
  });
});
