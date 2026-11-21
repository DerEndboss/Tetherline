/* global process, Buffer, console */
/**
 * Draws generated maps as PNG overviews (one pixel block per tile) without a browser:
 *   npx tsx src/sim/mapgen/preview.mjs <outDir> [seed:size:theme ...]
 * Handy to judge shapes, ore spread, ridges and wrecks at a glance. Not part of the game.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { content } from '../../content/index.ts';
import { hexToRgb } from '../../render/art/color.ts';
import { generateMap } from './index.ts';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function draw(seed, size, theme, scale) {
  const { map, core } = generateMap(content, { seed, size, theme });
  const palette = content.themes.get(theme).palette;
  const ground = palette.ground.map(hexToRgb);
  const floors = content.floors.list.map((f) => hexToRgb(f.color));
  const w = map.w * scale;
  const rgb = new Uint8Array(w * map.h * scale * 3);
  const put = (x, y, c) => {
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) rgb.set(c, ((y * scale + dy) * w + x * scale + dx) * 3);
  };
  const colour = (i) => {
    if (map.ridge[i]) return [30, 24, 28];
    const base = map.floor[i] ? floors[map.floor[i] - 1] : map.ground[i] ? ground[map.ground[i] - 1] : hexToRgb(palette.void);
    return map.boulder[i] ? base.map((v) => v * 0.7) : base;
  };
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) put(x, y, colour(y * map.w + x));
  for (const wr of map.wrecks) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(wr.x + dx, wr.y + dy, [255, 255, 255]);
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) put(core.x + dx, core.y + dy, [0, 255, 220]);
  return png(w, map.h * scale, rgb);
}

const [out = '.', ...jobs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const job of jobs.length ? jobs : ['7:medium:rust-desert']) {
  const [seed, size, theme] = job.split(':');
  const file = join(out, `map-${seed}-${size}-${theme}.png`);
  writeFileSync(file, draw(Number(seed), size, theme, size === 'large' ? 3 : 4));
  console.log(file);
}
