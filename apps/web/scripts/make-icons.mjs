// Generates the PWA PNG icons from simple geometry (no image tooling needed). Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FOREST = [0x14, 0x3e, 0x31];
const AMBER = [0xe8, 0xb5, 0x6b];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Distance from point p to segment ab.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size, maskable) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const s = size / 64;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / s;
      const v = y / s;
      let col = FOREST;
      // Leaf arc (approximated by segments) in amber, and a white stem.
      const leaf = [
        [18, 40, 24, 30],
        [24, 30, 34, 22],
        [34, 22, 46, 18],
        [46, 18, 44, 28],
        [44, 28, 36, 38],
        [36, 38, 24, 46],
      ];
      const scale = maskable ? 0.8 : 1;
      const cu = 32 + (u - 32) / scale;
      const cv = 32 + (v - 32) / scale;
      if (leaf.some(([ax, ay, bx, by]) => segDist(cu, cv, ax, ay, bx, by) < 2.6)) col = AMBER;
      if (segDist(cu, cv, 20, 46, 28, 38) < 2.6) col = WHITE;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = col[0];
      raw[i + 1] = col[1];
      raw[i + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(new URL('../public/icons/icon-192.png', import.meta.url), render(192, false));
writeFileSync(new URL('../public/icons/icon-512.png', import.meta.url), render(512, false));
writeFileSync(new URL('../public/icons/maskable-512.png', import.meta.url), render(512, true));
console.log('icons written');
