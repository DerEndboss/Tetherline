import { Matrix, Sprite, Texture } from 'pixi.js';
import type { ContentRegistry } from '../../content/registry';
import { terrainOf, type TerrainStyle } from '../../content/themes';
import type { ThemePalette } from '../../content/types';
import type { MapState } from '../../sim/state';
import { hexToRgb } from '../art/color';
import { hash2 } from '../art/rand';
import { gridToWorld } from '../iso';

/** Texels per tile of the painted ground (the map is painted once per run). */
const TEXELS = 12;

type Rgb = [number, number, number];

/** Side bits of the per-tile neighbour flags: the neighbour on that side differs. */
const LEFT = 1;
const RIGHT = 2;
const UP = 4;
const DOWN = 8;
const SIDES: readonly (readonly [number, number, number])[] = [
  [-1, 0, LEFT],
  [1, 0, RIGHT],
  [0, -1, UP],
  [0, 1, DOWN],
];

/** Everything one paint run reads; `out` is the colour being built (no allocation per texel). */
interface Paint {
  map: MapState;
  content: ContentRegistry;
  seed: number;
  style: TerrainStyle;
  ground: Rgb[];
  floors: Rgb[];
  speckle: Rgb[];
  accent: Rgb[];
  ridgeLit: Rgb;
  ridgeShade: Rgb;
  edge: Rgb;
  /** Smooth ground tone per tile (void = 0), for bilinear blending between tile centres. */
  tone: Float32Array;
  /** Per tile: which sides border void (coast). */
  coast: Uint8Array;
  /** Per tile: which sides border ridge rock (shadow falls from them). */
  rock: Uint8Array;
  /** Per tile: for ridge tiles, which sides border no ridge (rock faces). */
  face: Uint8Array;
  /** Per tile: 1 + index of the wreck painted there, else 0. */
  wreck: Int16Array;
  /** Per tile: the ore floor (index + 1) or 0. */
  ore: Uint8Array;
  /** Per tile: the tile or a neighbour is ore (the tint bleeds half a tile out). */
  oreNear: Uint8Array;
  /** Out value of `oreShare`: the ore floor with the largest share. */
  oreFloor: number;
  out: Rgb;
}

function floorColors(content: ContentRegistry, palette: ThemePalette): Rgb[] {
  return content.floors.list.map((f) => hexToRgb((f.liquid && palette.liquids?.[f.liquid]) || f.color));
}

/** Neighbour flag byte of tile i: a bit per side where `differs(neighbour index)` holds (off-map counts as differing). */
function sideFlags(map: MapState, x: number, y: number, differs: (j: number) => boolean): number {
  let bits = 0;
  for (const [dx, dy, bit] of SIDES) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || differs(ny * map.w + nx)) bits |= bit;
  }
  return bits;
}

function prepare(map: MapState, content: ContentRegistry, palette: ThemePalette, seed: number): Paint {
  const style = terrainOf(content.themes.get(map.theme));
  const n = map.w * map.h;
  const paint: Paint = {
    map,
    content,
    seed,
    style,
    ground: palette.ground.map(hexToRgb),
    floors: floorColors(content, palette),
    speckle: style.speckle.colors.map(hexToRgb),
    accent: (style.accent?.colors ?? []).map(hexToRgb),
    ridgeLit: hexToRgb(style.ridgeLit),
    ridgeShade: hexToRgb(style.ridgeShade),
    edge: hexToRgb(palette.groundEdge),
    tone: new Float32Array(n),
    coast: new Uint8Array(n),
    rock: new Uint8Array(n),
    face: new Uint8Array(n),
    wreck: new Int16Array(n),
    ore: new Uint8Array(n),
    oreNear: new Uint8Array(n),
    oreFloor: 0,
    out: [0, 0, 0],
  };
  markOres(paint);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!map.ground[i]) continue;
      paint.tone[i] = map.ground[i]! - 1;
      paint.coast[i] = sideFlags(map, x, y, (j) => !map.ground[j]);
      paint.rock[i] = sideFlags(map, x, y, (j) => map.ridge[j] === 1);
      if (map.ridge[i]) paint.face[i] = sideFlags(map, x, y, (j) => !map.ridge[j]);
    }
  }
  map.wrecks.forEach((w, k) => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = w.x + dx;
        const y = w.y + dy;
        if (x >= 0 && y >= 0 && x < map.w && y < map.h) paint.wreck[y * map.w + x] = k + 1;
      }
    }
  });
  return paint;
}

/** Fills `ore` (ore floor per tile) and `oreNear` (the tile or one of its 8 neighbours is ore). */
function markOres(p: Paint): void {
  const { map, content } = p;
  for (let i = 0; i < map.w * map.h; i++) {
    const f = map.floor[i]!;
    if (f && content.floors.list[f - 1]?.ore) p.ore[i] = f;
  }
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (p.ore[y * map.w + x]) markAround(p, x, y);
}

function markAround(p: Paint, x: number, y: number): void {
  const { w, h } = p.map;
  for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) p.oreNear[ny * w + nx] = 1;
}

/* ---------- colour helpers: all write into `p.out` ---------- */

function setRgb(p: Paint, c: Rgb, k = 1): void {
  p.out[0] = c[0] * k;
  p.out[1] = c[1] * k;
  p.out[2] = c[2] * k;
}

/** Mixes `c` into the current colour: t = 0 keeps it, 1 replaces it. */
function blend(p: Paint, c: Rgb, t: number): void {
  const o = p.out;
  o[0] += (c[0] - o[0]) * t;
  o[1] += (c[1] - o[1]) * t;
  o[2] += (c[2] - o[2]) * t;
}

function scale(p: Paint, k: number): void {
  p.out[0] *= k;
  p.out[1] *= k;
  p.out[2] *= k;
}

/** Ground tone at a grid point, bilinear between tile centres (0..tones-1). */
function toneAt(p: Paint, gx: number, gy: number): number {
  const { map, tone } = p;
  const x = Math.min(map.w - 1, Math.max(0, gx - 0.5));
  const y = Math.min(map.h - 1, Math.max(0, gy - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.w - 1, x0 + 1);
  const y1 = Math.min(map.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = tone[y0 * map.w + x0]! * (1 - fx) + tone[y0 * map.w + x1]! * fx;
  const bottom = tone[y1 * map.w + x0]! * (1 - fx) + tone[y1 * map.w + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

function rampInto(p: Paint, t: number): void {
  const stops = p.ground;
  const x = Math.min(stops.length - 1, Math.max(0, t));
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = stops[i]!;
  const b = stops[i + 1] ?? a;
  const k = x - i;
  p.out[0] = a[0] + (b[0] - a[0]) * k;
  p.out[1] = a[1] + (b[1] - a[1]) * k;
  p.out[2] = a[2] + (b[2] - a[2]) * k;
}

/** Distance in texels from the texel (lx, ly) of a tile to its side(s) set in `bits` (99 when none). */
function sideDistance(bits: number, lx: number, ly: number): number {
  let d = 99;
  if (bits & LEFT) d = Math.min(d, lx);
  if (bits & RIGHT) d = Math.min(d, TEXELS - 1 - lx);
  if (bits & UP) d = Math.min(d, ly);
  if (bits & DOWN) d = Math.min(d, TEXELS - 1 - ly);
  return d;
}

/* ---------- the kinds of ground ---------- */

/** A round dot of radius `r` texels around (cx, cy) in texel space: 0 outside, 1 in the middle, soft rim. */
function dot(u: number, v: number, cx: number, cy: number, r: number): number {
  const d = Math.hypot(u + 0.5 - cx, v + 0.5 - cy) / r;
  return d >= 1 ? 0 : 1 - d * d;
}

/** Fleck dots: pebbles, grass blades, snow glints (round and soft: hard 2x2 texel squares read as pixel blocks). */
function speckle(p: Paint, u: number, v: number): void {
  const cell = 6;
  const cx = Math.floor(u / cell);
  const cy = Math.floor(v / cell);
  const h = hash2(cx * 131 + p.seed, cy * 7 + 1);
  if ((h & 1023) / 1024 >= p.style.speckle.amount) return;
  const k = dot(u, v, cx * cell + 1.5 + ((h >>> 10) % 4), cy * cell + 1.5 + ((h >>> 14) % 4), 1.6);
  if (k > 0) blend(p, p.speckle[(h >>> 18) % p.speckle.length]!, 0.5 * k);
}

/** The odd bright accent (a flower, an ice sparkle): at most one per tile, a small soft dot. */
function accent(p: Paint, u: number, v: number): void {
  const amount = p.style.accent?.amount ?? 0;
  const ax = Math.floor(u / TEXELS);
  const ay = Math.floor(v / TEXELS);
  const g = hash2(ax * 37 + p.seed + 9, ay * 11);
  if ((g & 1023) / 1024 >= amount) return;
  const k = dot(u, v, ax * TEXELS + 5 + ((g >>> 8) % 4), ay * TEXELS + 5 + ((g >>> 12) % 4), 1.5);
  if (k > 0) blend(p, p.accent[(g >>> 16) % p.accent.length]!, 0.75 * k);
}

/** Soft ripples (dunes, drifts), fleck dots and the odd accent on plain ground. */
function groundDetail(p: Paint, u: number, v: number, tone: number): void {
  if (p.style.ripple > 0) scale(p, 1 + p.style.ripple * Math.sin((u * 0.8 + v * 0.5) / 15 + tone * 1.7));
  speckle(p, u, v);
  if (p.accent.length) accent(p, u, v);
}

/** Rock ridge: a raised block (the far-out look; the 3D rock of ores-layer.ts covers it up close): lit rim top-left, dark cliff bottom-right, chunky facets. */
function ridgeTexel(p: Paint, u: number, v: number, i: number, lx: number, ly: number): void {
  const facet = 0.86 + ((hash2(Math.floor(u / 4) * 13 + p.seed, Math.floor(v / 4)) & 255) / 255) * 0.28;
  const slope = (lx + ly) / (2 * (TEXELS - 1));
  setRgb(p, p.ridgeLit, 1.12);
  blend(p, p.ridgeShade, 0.12 + slope * 0.3);
  scale(p, facet);
  const f = p.face[i]!;
  if (f & (LEFT | UP) && sideDistance(f & (LEFT | UP), lx, ly) < 2) blend(p, [255, 246, 236], 0.32);
  if (f & (RIGHT | DOWN) && sideDistance(f & (RIGHT | DOWN), lx, ly) < 3) blend(p, p.ridgeShade, 0.75);
}

/** How strongly an ore field tints the ground (the 3D chunks of ores-layer.ts lie on top; far out they hide). */
const ORE_TINT = 0.32;

/** Share of ore around a grid point (bilinear between tile centres, 0..1) and the ore floor that has most of it. */
function oreShare(p: Paint, gx: number, gy: number): number {
  const { map, ore } = p;
  const x = Math.min(map.w - 1, Math.max(0, gx - 0.5));
  const y = Math.min(map.h - 1, Math.max(0, gy - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let sum = 0;
  let best = 0;
  p.oreFloor = 0;
  for (let k = 0; k < 4; k++) {
    const tx = Math.min(map.w - 1, x0 + (k & 1));
    const ty = Math.min(map.h - 1, y0 + (k >> 1));
    const f = ore[ty * map.w + tx]!;
    const wgt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
    if (!f) continue;
    sum += wgt;
    if (wgt > best) [best, p.oreFloor] = [wgt, f];
  }
  return sum;
}

/** Ore fields: a soft tint of the ore colour with darker gravel flecks, edges blended over half a tile. */
function oreTexel(p: Paint, u: number, v: number): void {
  const share = oreShare(p, u / TEXELS, v / TEXELS);
  if (share <= 0) return;
  const k = share * share * (3 - 2 * share);
  blend(p, p.floors[p.oreFloor - 1]!, ORE_TINT * k);
  const h = hash2(Math.floor(u / 2) * 29 + p.seed + 5, Math.floor(v / 2) * 3 + 1);
  if ((h & 7) === 0) scale(p, 1 - 0.18 * k);
  else if ((h & 7) === 1) blend(p, p.floors[p.oreFloor - 1]!, 0.35 * k);
}

/** Under the liquid layer (water.ts paints the liquid, its soft rim and the wet band): plain ground, no tile steps. */
function liquidTexel(p: Paint, u: number, v: number, tone: number): void {
  groundDetail(p, u, v, tone);
}

/** Scorch radius around a wreck, tiles (the 3D wreck sprite of ores-layer.ts lies on it). */
const SCORCH = 2.6;

/** A wreck's burn mark: a soft round darkening, strongest under the hull, no hard texels. */
function wreckTexel(p: Paint, w: { x: number; y: number }, u: number, v: number): void {
  const dx = u + 0.5 - (w.x + 0.5) * TEXELS;
  const dy = v + 0.5 - (w.y + 0.5) * TEXELS;
  const d = Math.sqrt(dx * dx + dy * dy) / TEXELS / SCORCH;
  if (d >= 1) return;
  const k = 1 - d * d * (3 - 2 * d);
  blend(p, [34, 24, 30], 0.42 * k);
}

/** Plain ground (ripples, flecks), the ore tint, a wreck's scorch, and the shadow of rock to the top-left. */
function landTexel(p: Paint, i: number, u: number, v: number, tone: number): void {
  groundDetail(p, u, v, tone);
  if (p.oreNear[i]) oreTexel(p, u, v);
  if (p.wreck[i]) wreckTexel(p, p.map.wrecks[p.wreck[i]! - 1]!, u, v);
  const lx = u % TEXELS;
  const ly = v % TEXELS;
  const shade = sideDistance(p.rock[i]! & (LEFT | UP), lx, ly);
  if (shade < 4) scale(p, 0.62 + shade * 0.08);
}

/** The colour of one texel into `p.out`; false for void. */
function texel(p: Paint, u: number, v: number): boolean {
  const tx = Math.floor(u / TEXELS);
  const ty = Math.floor(v / TEXELS);
  const i = ty * p.map.w + tx;
  const { map } = p;
  if (!map.ground[i]) return false;
  const lx = u - tx * TEXELS;
  const ly = v - ty * TEXELS;
  const tone = toneAt(p, u / TEXELS, v / TEXELS);
  rampInto(p, tone);
  const f = map.floor[i]!;
  const liquid = f > 0 && p.content.floors.list[f - 1]?.liquid;
  if (map.ridge[i]) ridgeTexel(p, u, v, i, lx, ly);
  else if (liquid) liquidTexel(p, u, v, tone);
  else landTexel(p, i, u, v, tone);
  const lip = sideDistance(p.coast[i]!, lx, ly);
  if (lip < 2) blend(p, p.edge, 0.3 - lip * 0.1);
  else if (lip < 4) scale(p, 0.94);
  scale(p, 1 + ((hash2(u, v + p.seed) & 255) / 255 - 0.5) * 0.05);
  return true;
}

/** Paints texel rows [from, to) into the image. */
function paintRows(p: Paint, px: Uint32Array, w: number, from: number, to: number): void {
  const o = p.out;
  for (let v = from; v < to; v++) {
    for (let u = 0; u < w; u++) {
      if (!texel(p, u, v)) continue;
      const r = Math.min(255, Math.max(0, o[0]));
      const g = Math.min(255, Math.max(0, o[1]));
      const b = Math.min(255, Math.max(0, o[2]));
      px[v * w + u] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }
}

function canvasFor(map: MapState): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } {
  const canvas = document.createElement('canvas');
  canvas.width = map.w * TEXELS;
  canvas.height = map.h * TEXELS;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, img: ctx.createImageData(canvas.width, canvas.height) };
}

/** Paints the whole map into a canvas in grid space (TEXELS per tile); off-land texels stay transparent. */
export function paintMap(map: MapState, content: ContentRegistry, palette: ThemePalette, seed: number): HTMLCanvasElement {
  const p = prepare(map, content, palette, seed);
  const { canvas, ctx, img } = canvasFor(map);
  paintRows(p, new Uint32Array(img.data.buffer), canvas.width, 0, canvas.height);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The same picture painted in bands of rows with a pause between them, so a loading animation keeps running.
 * `onProgress` gets 0..1 after each band. Result is identical to `paintMap`.
 */
export async function paintMapAsync(map: MapState, content: ContentRegistry, palette: ThemePalette, seed: number, onProgress?: (done: number) => void): Promise<HTMLCanvasElement> {
  const p = prepare(map, content, palette, seed);
  const { canvas, ctx, img } = canvasFor(map);
  const px = new Uint32Array(img.data.buffer);
  const band = TEXELS * 8;
  for (let from = 0; from < canvas.height; from += band) {
    paintRows(p, px, canvas.width, from, Math.min(canvas.height, from + band));
    onProgress?.(Math.min(1, (from + band) / canvas.height));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The painted map as one sprite under the view's matrix (grid space -> world px, iso or top-down). */
export function mapSprite(canvas: HTMLCanvasElement): Sprite {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'linear';
  const sprite = new Sprite(texture);
  const ex = gridToWorld(1, 0);
  const ey = gridToWorld(0, 1);
  sprite.setFromMatrix(new Matrix(ex.x / TEXELS, ex.y / TEXELS, ey.x / TEXELS, ey.y / TEXELS, 0, 0));
  return sprite;
}
