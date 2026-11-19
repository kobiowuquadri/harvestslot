// Generate browser and install icons from the approved HarvestSlot artwork.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next/package.json')] }));
const output = (name) => fileURLToPath(new URL('../public/' + name, import.meta.url));
const artwork = await sharp(output('brand/harvestslot-mark.png')).trim().png().toBuffer();
for (const size of [16, 32, 48, 192, 512]) {
  await sharp(artwork)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(output('icons/icon-' + size + '.png'));
}
const apple = await sharp(artwork)
  .resize(140, 140, { fit: 'contain', background: '#ffffff' })
  .png()
  .toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
  .composite([{ input: apple, gravity: 'centre' }])
  .png()
  .toFile(output('apple-touch-icon.png'));
const inset = await sharp(artwork)
  .resize(320, 320, { fit: 'contain', background: '#ffffff' })
  .png()
  .toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } })
  .composite([{ input: inset, gravity: 'centre' }])
  .png()
  .toFile(output('icons/maskable-512.png'));
// ICO supports PNG frames; include sizes used by browser tabs and desktop shortcuts.
const frames = await Promise.all(
  [16, 32, 48].map((size) => sharp(output('icons/icon-' + size + '.png')).toBuffer()),
);
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = [16, 32, 48][index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
writeFileSync(output('favicon.ico'), Buffer.concat([header, ...frames]));
console.log('HarvestSlot favicon, Apple touch icon and PWA icons generated.');
