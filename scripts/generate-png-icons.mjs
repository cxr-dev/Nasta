import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const svgPath = join(root, 'public', 'logosvg.svg');
const svg = await readFile(svgPath);

await sharp(svg).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-512.png'));
await sharp(svg).resize(192, 192).png().toFile(join(root, 'public', 'icons', 'icon-192.png'));
await sharp(svg).resize(180, 180).png().toFile(join(root, 'public', 'apple-touch-icon.png'));

console.log('PNG icons generated.');
