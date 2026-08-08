// Regenerates share-card review fixtures into scripts/.share-cards-gate/.
// Boots a throwaway Vite dev server, renders the real shareImageRenderer
// headlessly via Playwright Chromium, and writes deterministic PNGs.
//
// Usage: node scripts/generate-share-cards.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'scripts/.share-cards-gate');
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;

const ts = (iso) => new Date(iso).getTime();

const labels = {
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
};

const departureLabels = { departs: 'Från', predicted: 'Beräknad', late: '{n} min sen' };

// Normal future departure: this is the base departure composition fixture.
const departureData = {
  kind: 'departure',
  line: '17',
  lineName: 'Tunnelbana',
  destination: 'Skarpnäck',
  stop: 'Odenplan',
  transportType: 'metro',
  departureTime: ts('2026-08-08T18:42:00+02:00'),
  timeLabel: '12 min',
  countdownLabel: '12 min',
  dateLabel: '8 aug',
  predicted: false,
  labels: departureLabels,
};

const imminentDeparture = {
  ...departureData,
  departureTime: ts('2026-08-08T18:31:00+02:00'),
  timeLabel: 'Nu',
  countdownLabel: 'Nu',
};

const delayedDeparture = {
  ...departureData,
  departureTime: ts('2026-08-08T18:46:00+02:00'),
  timeLabel: '18:46',
  delayMin: 4,
  predicted: true,
};

// Long-name departure: forces the destination (and stop) through the fitting
// shrink path so route-line spacing is exercised at reduced font sizes.
const longDeparture = {
  ...departureData,
  departureTime: ts('2026-08-08T18:50:00+02:00'),
  stop: 'Karolinska Universitetssjukhuset Solna',
  destination: 'Stockholms Södra station pendeltåg perrong 2',
};

const journeyLeg = (transportType, line, platformPosition, directionName, originName, destName, depIso, arrIso) => ({
  transportType,
  line,
  platformPosition,
  directionName,
  originName,
  destName,
  departureTime: ts(depIso),
  arrivalTime: ts(arrIso),
  durationMin: Math.round((ts(arrIso) - ts(depIso)) / 60_000),
});

// A coherent one-transfer example: Odenplan → Tekniska högskolan via T-Centralen.
const journeyLight = {
  kind: 'journey',
  originLabel: 'Odenplan',
  destLabel: 'Tekniska högskolan',
  departureTime: ts('2026-08-08T08:30:00+02:00'),
  arrivalTime: ts('2026-08-08T08:46:00+02:00'),
  durationMin: 16,
  transfers: 1,
  countdownLabel: 'Nu',
  dateLabel: '8 aug',
  legs: [
    journeyLeg('metro', '17', 'middle', 'Skarpnäck', 'Odenplan', 'T-Centralen', '2026-08-08T08:30:00+02:00', '2026-08-08T08:35:00+02:00'),
    journeyLeg('metro', '14', 'front', 'Mörby centrum', 'T-Centralen', 'Tekniska högskolan', '2026-08-08T08:38:00+02:00', '2026-08-08T08:46:00+02:00'),
  ],
  connections: [{ kind: 'transfer', durationMin: 3, beforeLegIndex: 1 }],
  labels,
};

const journeyDark = {
  ...journeyLight,
  countdownLabel: 'Om 4 min',
  legs: [
    journeyLeg('metro', '17', 'front', 'Skarpnäck', 'Odenplan', 'T-Centralen', '2026-08-08T08:30:00+02:00', '2026-08-08T08:35:00+02:00'),
    journeyLeg('metro', '14', 'back', 'Mörby centrum', 'T-Centralen', 'Tekniska högskolan', '2026-08-08T08:38:00+02:00', '2026-08-08T08:46:00+02:00'),
  ],
};

// Stress fixture is intentionally dense, but internally coherent enough to assess
// wrapping, mixed modes, recommendations, transfer rows and +N summarisation.
const stressCard = {
  kind: 'journey',
  originLabel: 'Karolinska sjukhuset',
  destLabel: 'Stockholms sjukhem',
  departureTime: ts('2026-08-08T08:15:00+02:00'),
  arrivalTime: ts('2026-08-08T09:05:00+02:00'),
  durationMin: 50,
  transfers: 3,
  countdownLabel: 'Om 2 min',
  dateLabel: '8 aug',
  legs: [
    journeyLeg('bus', '4', 'middle', 'Radiohuset', 'Karolinska sjukhuset', 'Odenplan', '2026-08-08T08:15:00+02:00', '2026-08-08T08:22:00+02:00'),
    journeyLeg('metro', '17', 'back', 'Skarpnäck', 'Odenplan', 'T-Centralen', '2026-08-08T08:25:00+02:00', '2026-08-08T08:30:00+02:00'),
    journeyLeg('metro', '14', 'front', 'Mörby centrum', 'T-Centralen', 'Östermalmstorg', '2026-08-08T08:32:00+02:00', '2026-08-08T08:35:00+02:00'),
    journeyLeg('tram', '7', 'middle', 'Waldemarsudde', 'Östermalmstorg', 'Djurgården', '2026-08-08T08:36:00+02:00', '2026-08-08T08:41:00+02:00'),
    journeyLeg('tram', '7', 'middle', 'T-Centralen', 'Djurgården', 'T-Centralen', '2026-08-08T08:42:00+02:00', '2026-08-08T08:47:00+02:00'),
    journeyLeg('bus', '3', 'back', 'Karolinska sjukhuset', 'T-Centralen', 'Stockholms sjukhem', '2026-08-08T08:52:00+02:00', '2026-08-08T09:05:00+02:00'),
  ],
  connections: [
    { kind: 'transfer', durationMin: 3, beforeLegIndex: 1 },
    { kind: 'walk', durationMin: 1, beforeLegIndex: 3 }, // intentionally sub-threshold
    { kind: 'transfer', durationMin: 5, beforeLegIndex: 5 },
  ],
  labels,
};

const fixtures = [
  { name: 'departureLight', theme: 'light', data: departureData },
  { name: 'departureDark', theme: 'dark', data: departureData },
  { name: 'journeyLight', theme: 'light', data: journeyLight },
  { name: 'journeyDark', theme: 'dark', data: journeyDark },
  { name: 'stressCard', theme: 'light', data: stressCard },
  { name: 'departureImminent', theme: 'dark', data: imminentDeparture },
  { name: 'departureDelayed', theme: 'light', data: delayedDeparture },
  { name: 'departureLong', theme: 'light', data: longDeparture },
];

// Optional CLI filter: `node scripts/generate-share-cards.mjs departure`
// regenerates only fixtures whose name starts with the given prefix.
const filter = process.argv[2];
const selected = filter ? fixtures.filter((f) => f.name.startsWith(filter)) : fixtures;
if (selected.length === 0) throw new Error(`No fixtures match filter "${filter}"`);

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite never became ready at ${BASE}`);
}

const server = await createServer({
  root: ROOT,
  logLevel: 'warn',
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
});
await server.listen();

try {
  await waitForServer();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const rendered = await page.evaluate(async (spec) => {
      const m = await import('/src/lib/shareImageRenderer.ts');

      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('700 100px "Neue Machina"'),
        document.fonts.load('800 104px "Neue Machina"'),
        document.fonts.load('700 64px "Neue Machina"'),
        document.fonts.load('400 40px "Satoshi"'),
        document.fonts.load('500 40px "Satoshi"'),
        document.fonts.load('600 40px "Satoshi"'),
        document.fonts.load('700 40px "Satoshi"'),
      ]);

      const measurer = document.createElement('canvas').getContext('2d');
      const measure = (text, font) => {
        measurer.font = font;
        return measurer.measureText(text).width;
      };

      const out = {};
      for (const { name, theme, data } of spec.fixtures) {
        const blob = await m.renderShareImage(data, theme, {
          measure,
          fonts: { ready: () => Promise.resolve() },
          canvasFactory: () => {
            const c = document.createElement('canvas');
            c.width = m.SHARE_CARD_WIDTH;
            c.height = m.SHARE_CARD_HEIGHT;
            return c;
          },
        });
        if (!blob) throw new Error(`renderShareImage returned null for ${name}`);
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          bin += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        out[name] = btoa(bin);
      }
      return out;
    }, { fixtures: selected });

    mkdirSync(OUT, { recursive: true });
    for (const { name } of selected) {
      const file = resolve(OUT, `${name}.png`);
      writeFileSync(file, Buffer.from(rendered[name], 'base64'));
      console.log(`wrote ${file} (${(rendered[name].length * 0.75 / 1024).toFixed(1)} KiB)`);
    }
    console.log(`done. ${selected.length} fixtures in ${OUT}`);
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
