import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const images = [
  ['beer-bottles', 'https://images.unsplash.com/photo-1651980909099-ddb028d72855'], ['beer-table', 'https://images.unsplash.com/photo-1691419775322-1864f752dbac'], ['beer-pendants', 'https://images.unsplash.com/photo-1759055903710-e0b3f14d72c4'], ['beer-menu', 'https://images.unsplash.com/photo-1776775092499-a072a92decb2'], ['beer-taps-orange', 'https://images.unsplash.com/photo-1776775389484-115a6d27ba53'], ['beer-bar-room', 'https://images.unsplash.com/photo-1672224214616-67a443fe1bee'], ['beer-food', 'https://images.unsplash.com/photo-1732765224736-9620df5ac97c'], ['beer-glasses', 'https://images.unsplash.com/photo-1776775358821-d1dd3ef7aa2a'],
  ['wine-cellar', 'https://images.unsplash.com/photo-1758827926633-621fb8694e6e'], ['wine-display', 'https://images.unsplash.com/photo-1752659012040-fd07ce7715ed'], ['wine-shelves', 'https://images.unsplash.com/photo-1634842598627-43dcf2e9e2a7'], ['wine-glasses', 'https://images.unsplash.com/photo-1568750478003-363de8288453'], ['wine-counter', 'https://images.unsplash.com/photo-1759756191826-2321f509d98e'], ['wine-dining', 'https://images.unsplash.com/photo-1781181727460-ccd6962647d4'], ['wine-stools', 'https://images.unsplash.com/photo-1739799120521-c5f44a9335a3'], ['wine-racks', 'https://images.unsplash.com/photo-1778731660415-b540b845f344'],
  ['cocktail-martini', 'https://images.unsplash.com/photo-1597075687490-8f673c6c17f6'], ['cocktail-bottles', 'https://images.unsplash.com/photo-1696062985889-de626efe0148'], ['cocktail-lounge', 'https://images.unsplash.com/photo-1682071607969-697c6c8a17a1'], ['cocktail-plants', 'https://images.unsplash.com/photo-1696062985865-d74848842eae'], ['cocktail-glass', 'https://images.unsplash.com/photo-1613577813903-e9e9bc994cdb'], ['cocktail-glasses', 'https://images.unsplash.com/photo-1696062985868-716971f4c3f0'], ['cocktail-red', 'https://images.unsplash.com/photo-1617524455434-e17cd2ab930f'], ['cocktail-table', 'https://images.unsplash.com/photo-1671741967944-cb60915f5823'],
];
const output = path.resolve('public/venue-mood');
await mkdir(output, { recursive: true });
for (const [id, source] of images) {
  const response = await fetch(`${source}?auto=format&fit=crop&w=1920&q=82`);
  if (!response.ok) throw new Error(`${id}: ${response.status}`);
  const image = sharp(Buffer.from(await response.arrayBuffer())).resize(960, 360, { fit: 'cover', position: 'attention' });
  await Promise.all([
    image.clone().avif({ quality: 52 }).toFile(path.join(output, `${id}.avif`)),
    image.clone().webp({ quality: 72 }).toFile(path.join(output, `${id}.webp`)),
  ]);
  console.log(`Wrote ${id}`);
}
