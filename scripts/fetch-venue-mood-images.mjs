import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const venueImages = [
  ['beer-bottles', 'https://images.unsplash.com/photo-1651980909099-ddb028d72855'], ['beer-table', 'https://images.unsplash.com/photo-1691419775322-1864f752dbac'], ['beer-pendants', 'https://images.unsplash.com/photo-1759055903710-e0b3f14d72c4'], ['beer-menu', 'https://images.unsplash.com/photo-1776775092499-a072a92decb2'], ['beer-taps-orange', 'https://images.unsplash.com/photo-1776775389484-115a6d27ba53'], ['beer-bar-room', 'https://images.unsplash.com/photo-1672224214616-67a443fe1bee'], ['beer-food', 'https://images.unsplash.com/photo-1732765224736-9620df5ac97c'], ['beer-glasses', 'https://images.unsplash.com/photo-1776775358821-d1dd3ef7aa2a'],
  ['wine-cellar', 'https://images.unsplash.com/photo-1758827926633-621fb8694e6e'], ['wine-display', 'https://images.unsplash.com/photo-1752659012040-fd07ce7715ed'], ['wine-shelves', 'https://images.unsplash.com/photo-1634842598627-43dcf2e9e2a7'], ['wine-glasses', 'https://images.unsplash.com/photo-1568750478003-363de8288453'], ['wine-counter', 'https://images.unsplash.com/photo-1759756191826-2321f509d98e'], ['wine-dining', 'https://images.unsplash.com/photo-1781181727460-ccd6962647d4'], ['wine-stools', 'https://images.unsplash.com/photo-1739799120521-c5f44a9335a3'], ['wine-racks', 'https://images.unsplash.com/photo-1778731660415-b540b845f344'],
  ['cocktail-martini', 'https://images.unsplash.com/photo-1597075687490-8f673c6c17f6'], ['cocktail-bottles', 'https://images.unsplash.com/photo-1696062985889-de626efe0148'], ['cocktail-lounge', 'https://images.unsplash.com/photo-1682071607969-697c6c8a17a1'], ['cocktail-plants', 'https://images.unsplash.com/photo-1696062985865-d74848842eae'], ['cocktail-glass', 'https://images.unsplash.com/photo-1613577813903-e9e9bc994cdb'], ['cocktail-glasses', 'https://images.unsplash.com/photo-1696062985868-716971f4c3f0'], ['cocktail-red', 'https://images.unsplash.com/photo-1617524455434-e17cd2ab930f'], ['cocktail-table', 'https://images.unsplash.com/photo-1671741967944-cb60915f5823'],
];
const eventImages = [
  ['event-concert-1', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea'], ['event-concert-2', 'https://images.unsplash.com/photo-1563841930606-67e2bce48b78'], ['event-concert-3', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3'], ['event-concert-4', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3'],
  ['event-theatre-1', 'https://images.unsplash.com/photo-1514306191717-452ec28c7814'], ['event-theatre-2', 'https://images.unsplash.com/photo-1503095396549-807759245b35'], ['event-theatre-3', 'https://images.unsplash.com/photo-1562329265-95a6d7a83440'], ['event-theatre-4', 'https://images.unsplash.com/photo-1578337834535-357ad7dccdfd'],
  ['event-exhibition-1', 'https://images.unsplash.com/photo-1606819717115-9159c900370b'], ['event-exhibition-2', 'https://images.unsplash.com/photo-1569783721854-33a99b4c0bae'], ['event-exhibition-3', 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3'], ['event-exhibition-4', 'https://images.unsplash.com/photo-1578855019520-af8101c056e2'],
  ['event-food-1', 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2'], ['event-food-2', 'https://images.unsplash.com/photo-1604200657090-ae45994b2451'], ['event-food-3', 'https://images.unsplash.com/photo-1542838132-92c53300491e'], ['event-food-4', 'https://images.unsplash.com/photo-1488459716781-31db52582fe9'],
  ['event-nightlife-1', 'https://images.unsplash.com/photo-1513061379709-ef0cd1695189'], ['event-nightlife-2', 'https://images.unsplash.com/photo-1506606401543-2e73709cebb4'], ['event-nightlife-3', 'https://images.unsplash.com/photo-1611416457332-946853cc75d6'], ['event-nightlife-4', 'https://images.unsplash.com/photo-1588312744377-2adfb7b8578a'],
  ['event-sport-1', 'https://images.unsplash.com/photo-1705593973313-75de7bf95b56'], ['event-sport-2', 'https://images.unsplash.com/photo-1565483276060-e6730c0cc6a1'], ['event-sport-3', 'https://images.unsplash.com/photo-1569863959165-56dae551d4fc'], ['event-sport-4', 'https://images.unsplash.com/photo-1556764420-e37ef4cdfa5c'],
  ['event-festival-1', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea'], ['event-festival-2', 'https://images.unsplash.com/photo-1563841930606-67e2bce48b78'], ['event-festival-3', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3'], ['event-festival-4', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3'],
];
const images = [
  ...venueImages.map(([id, source]) => ({ id, source, width: 960, height: 360 })),
  ...eventImages.map(([id, source]) => ({ id, source, width: 320, height: 320 })),
];
const output = path.resolve('public/venue-mood');
await mkdir(output, { recursive: true });
for (const { id, source, width, height } of images) {
  const response = await fetch(`${source}?auto=format&fit=crop&w=${width * 3}&h=${height * 3}&q=82`);
  if (!response.ok) throw new Error(`${id}: ${response.status}`);
  const image = sharp(Buffer.from(await response.arrayBuffer())).resize(width, height, { fit: 'cover', position: 'attention' });
  await Promise.all([
    image.clone().avif({ quality: 52 }).toFile(path.join(output, `${id}.avif`)),
    image.clone().webp({ quality: 72 }).toFile(path.join(output, `${id}.webp`)),
  ]);
  console.log(`Wrote ${id}`);
}
