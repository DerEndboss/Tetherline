import { Container, Matrix, Sprite, Texture } from 'pixi.js';
import type { ContentRegistry } from '../../content/registry';
import type { FloorDef, ThemePalette } from '../../content/types';
import type { MapState } from '../../sim/state';
import { hexToRgb } from '../art/color';
import { hash2 } from '../art/rand';
import type { Camera } from '../camera';
import { gridToWorld, worldX, worldY, type Rect } from '../iso';
import { SpritePool } from '../sprite-pool';
import { viewOf } from './ores-layer';

/**
 * Liquids (water, oil, slag) as their own layer over the painted ground, at a higher resolution than the ground
 * (WATER_TEXELS per tile instead of 12) and only in the chunks that hold liquid. The shore is a signed distance
 * field (tile centres, bilinear, with a little smooth noise), so the outline is round and organic instead of tile
 * steps, and anti-aliased over one texel. From land to lake: a darker wet band on the land, a soft bright surf
 * line, light shallow water, darker deep water further in (depth = distance to the shore). Oil is dark and glossy
 * with a rainbow film at its rim; slag is a dark crust split by glowing cracks. Painted once per round; a few
 * additive glints drift over open water in the view (none when still / reduced motion).
 */

export const WATER_TEXELS = 20;
/** Tiles per chunk canvas (one sprite each). */
const CHUNK = 16;
/** How far the distance search looks, tiles (deeper water than this is simply deep). */
const REACH = 5;
/** Width of the wet band on the land, tiles. */
const WET = 0.55;
/** Depth (tiles from the shore) at which water is fully deep. */
const DEEP_AT = 2.6;
/** Glints only when zoomed in at least this far, and at most this many at once. */
const GLINT_ZOOM = 0.35;
const MAX_GLINTS = 90;

type Rgb = [number, number, number];
type Kind = 'water' | 'oil' | 'slag';

/** Per tile: signed distance of its centre to the shore (+ in liquid), and the liquid it belongs to. */
interface Field {
  map: MapState;
  sdf: Float32Array;
  /** 1 for liquid tiles. */
  wet: Uint8Array;
  /** Floor index + 1 of the tile's liquid (land tiles: the nearest liquid), 0 = far from any. */
  liquid: Uint8Array;
  /** 1 for deep floors, 0 for shallow, bilinear in the paint. */
  deep: Float32Array;
}

interface Look {
  kind: Kind;
  color: Rgb;
  shore: Rgb;
}

interface Painter {
  field: Field;
  looks: (Look | null)[];
  seed: number;
  /** Output colour + alpha (0..1) of the texel being painted. */
  out: [number, number, number, number];
}

const isLiquid = (floors: readonly FloorDef[], f: number): boolean => f > 0 && !!floors[f - 1]?.liquid;

/* ---------- the distance field ---------- */

/** Nearest tile (by centre distance) within REACH whose wetness differs from tile (x, y); its distance and index. */
function nearestOther(field: Field, x: number, y: number, wet: boolean): [number, number] {
  const { map } = field;
  let best = REACH + 0.5;
  let at = -1;
  for (let dy = -REACH; dy <= REACH; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= map.h) continue;
    for (let dx = -REACH; dx <= REACH; dx++) {
      const nx = x + dx;
      const d = Math.hypot(dx, dy);
      if (nx < 0 || nx >= map.w || d >= best) continue;
      const j = ny * map.w + nx;
      if (field.wet[j] !== (wet ? 1 : 0)) [best, at] = [d, j];
    }
  }
  return [best, at];
}

function buildField(map: MapState, floors: readonly FloorDef[]): Field {
  const n = map.w * map.h;
  const field: Field = { map, sdf: new Float32Array(n).fill(-REACH), wet: new Uint8Array(n), liquid: new Uint8Array(n), deep: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const f = map.floor[i]!;
    if (!isLiquid(floors, f)) continue;
    field.wet[i] = 1;
    field.liquid[i] = f;
    field.deep[i] = floors[f - 1]!.deep ? 1 : 0;
  }
  const near = wetSums(field);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (field.wet[y * map.w + x] || wetAround(near, map, x, y)) settle(field, x, y);
  field.sdf = blurred(field.sdf, map.w, map.h);
  return field;
}

/** A [1 2 1] blur of the distance field: rounds the corners that tile steps leave in it. */
function blurred(a: Float32Array, w: number, h: number): Float32Array {
  const pass = (src: Float32Array, dx: number, dy: number): Float32Array => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = (k: number): number => src[Math.min(h - 1, Math.max(0, y + dy * k)) * w + Math.min(w - 1, Math.max(0, x + dx * k))]!;
        out[y * w + x] = (at(-1) + 2 * at(0) + at(1)) / 4;
      }
    }
    return out;
  };
  return pass(pass(a, 1, 0), 0, 1);
}

/** Summed-area table of the wet tiles ((w + 1) x (h + 1)), for "any liquid near?" in O(1). */
function wetSums(field: Field): Int32Array {
  const { map } = field;
  const W = map.w + 1;
  const sum = new Int32Array(W * (map.h + 1));
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) sum[(y + 1) * W + x + 1] = field.wet[y * map.w + x]! + sum[y * W + x + 1]! + sum[(y + 1) * W + x]! - sum[y * W + x]!;
  return sum;
}

function wetAround(sum: Int32Array, map: MapState, x: number, y: number): boolean {
  const W = map.w + 1;
  const x0 = Math.max(0, x - REACH);
  const y0 = Math.max(0, y - REACH);
  const x1 = Math.min(map.w, x + REACH + 1);
  const y1 = Math.min(map.h, y + REACH + 1);
  return sum[y1 * W + x1]! - sum[y0 * W + x1]! - sum[y1 * W + x0]! + sum[y0 * W + x0]! > 0;
}

/** The signed distance of one tile; a land tile near liquid also takes that liquid's kind. */
function settle(field: Field, x: number, y: number): void {
  const i = y * field.map.w + x;
  const wet = field.wet[i] === 1;
  const [d, j] = nearestOther(field, x, y, wet);
  field.sdf[i] = wet ? d - 0.5 : -(d - 0.5);
  if (!wet && j >= 0) field.liquid[i] = field.liquid[j]!;
}

/** Bilinear sample of a per-tile array at a grid point (tile centres at +0.5). */
function sample(field: Field, arr: Float32Array, gx: number, gy: number): number {
  const { map } = field;
  const x = Math.min(map.w - 1, Math.max(0, gx - 0.5));
  const y = Math.min(map.h - 1, Math.max(0, gy - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.w - 1, x0 + 1);
  const y1 = Math.min(map.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = arr[y0 * map.w + x0]! * (1 - fx) + arr[y0 * map.w + x1]! * fx;
  const bottom = arr[y1 * map.w + x0]! * (1 - fx) + arr[y1 * map.w + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Smooth value noise (-0.5..0.5) on a lattice of `cell` tiles. */
function noise(seed: number, gx: number, gy: number, cell: number): number {
  const x = gx / cell;
  const y = gy / cell;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number): number => (hash2(a * 7919 + seed, b * 104729 + 13) & 1023) / 1023;
  const top = h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx;
  const bottom = h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy - 0.5;
}

/* ---------- colours ---------- */

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function set(p: Painter, c: Rgb, a: number, k = 1): void {
  p.out[0] = c[0] * k;
  p.out[1] = c[1] * k;
  p.out[2] = c[2] * k;
  p.out[3] = a;
}

function mixIn(p: Painter, c: Rgb, t: number): void {
  const o = p.out;
  o[0] += (c[0] - o[0]) * t;
  o[1] += (c[1] - o[1]) * t;
  o[2] += (c[2] - o[2]) * t;
}

/** The rim: one anti-aliasing width in tiles (about 1.3 texels). */
const AA = 1.3 / WATER_TEXELS;

/** The wet band each liquid leaves on the land: colour and strength. */
const WET_BAND: Record<Kind, { dark: Rgb; strength: number }> = {
  water: { dark: [24, 16, 26], strength: 0.36 },
  oil: { dark: [16, 12, 20], strength: 0.5 },
  slag: { dark: [30, 14, 14], strength: 0.45 },
};

/**
 * Lays the liquid colour (in `p.out`, its share `w` of the texel) over the wet band of the land, one continuous
 * ramp across the shore: no dip or seam where the band ends and the liquid begins.
 */
function overWetBand(p: Painter, kind: Kind, s: number, w: number): void {
  const band = WET_BAND[kind];
  const k = 1 - smoothstep(0, WET, -s);
  const wet = band.strength * k * k;
  const a = wet + (1 - wet) * w;
  const o = p.out;
  o[3] = a;
  if (a <= 0) return;
  const d = wet * (1 - w);
  for (let c = 0; c < 3; c++) o[c] = (band.dark[c]! * d + o[c]! * w) / a;
}
const FOAM_AT = 0.09;

function waterTexel(p: Painter, look: Look, s: number, gx: number, gy: number): void {
  const deep = Math.max(sample(p.field, p.field.deep, gx, gy) * 0.55, smoothstep(0.2, DEEP_AT, s));
  set(p, look.color, 1, 1.16 - deep * 0.5);
  mixIn(p, look.shore, (1 - smoothstep(0, 0.7, s)) * 0.32);
  // the surf: a soft bright line just inside the shore, and a fainter wave further out
  const surf = 1 - Math.min(1, Math.abs(s - FOAM_AT) / 0.065);
  mixIn(p, look.shore, 0.78 * surf * surf);
  const wave = 1 - Math.min(1, Math.abs(s - 0.42 - noise(p.seed + 3, gx, gy, 1.3) * 0.2) / 0.05);
  mixIn(p, look.shore, 0.16 * wave * (1 - deep));
  const ripple = Math.sin(gx * 5.1 + gy * 2.3 + noise(p.seed + 9, gx, gy, 0.8) * 9) * 0.025;
  p.out[0] *= 1 + ripple;
  p.out[1] *= 1 + ripple;
  p.out[2] *= 1 + ripple;
}

/** Thin-film rainbow at the rim of an oil pool (hue from the distance and noise). */
const RAINBOW: Rgb[] = [
  [255, 96, 150],
  [255, 200, 90],
  [110, 240, 160],
  [90, 190, 255],
  [170, 120, 255],
];

function rainbowAt(t: number): Rgb {
  const x = (((t % 1) + 1) % 1) * RAINBOW.length;
  const i = Math.floor(x);
  const a = RAINBOW[i]!;
  const b = RAINBOW[(i + 1) % RAINBOW.length]!;
  const k = x - i;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const OIL: Rgb = [26, 21, 34];
const OIL_SHEEN: Rgb = [92, 88, 120];

function oilTexel(p: Painter, s: number, gx: number, gy: number): void {
  set(p, OIL, 1);
  const n = noise(p.seed + 21, gx, gy, 0.9);
  const rim = 1 - smoothstep(0.03, 0.5, s);
  mixIn(p, rainbowAt(s * 1.6 + n * 1.4), 0.34 * rim);
  // glossy streaks: the oil mirrors the sky in long soft bands
  const streak = Math.max(0, Math.sin(gx * 1.7 - gy * 0.9 + n * 6)) ** 8;
  mixIn(p, OIL_SHEEN, 0.35 * streak * (1 - rim));
}

const CRUST: Rgb = [62, 30, 30];
const GLOW: Rgb = [255, 136, 58];
const HOT: Rgb = [255, 214, 140];

function slagTexel(p: Painter, s: number, gx: number, gy: number): void {
  set(p, CRUST, 1, 0.9 + noise(p.seed + 5, gx, gy, 0.5) * 0.3);
  // cracks: where a noise crosses its middle; wider and hotter further in, cooled at the rim
  const heat = smoothstep(0.1, 1.2, s);
  const c = Math.abs(noise(p.seed + 31, gx, gy, 0.7) + noise(p.seed + 37, gx, gy, 0.33) * 0.5);
  const crack = 1 - smoothstep(0.012, 0.03 + heat * 0.035, c);
  mixIn(p, GLOW, crack * (0.5 + heat * 0.5));
  mixIn(p, HOT, crack * heat * 0.5);
}

/** The colour of the texel at grid point (gx, gy) into `p.out`; alpha 0 where there is nothing. */
function texel(p: Painter, gx: number, gy: number): void {
  const { field } = p;
  const tx = Math.min(field.map.w - 1, Math.floor(gx));
  const ty = Math.min(field.map.h - 1, Math.floor(gy));
  const look = p.looks[field.liquid[ty * field.map.w + tx]!];
  p.out[3] = 0;
  if (!look) return;
  const s = sample(field, field.sdf, gx, gy) + noise(p.seed + 2, gx, gy, 2.6) * 0.4 + noise(p.seed, gx, gy, 1.1) * 0.24 + noise(p.seed + 1, gx, gy, 0.45) * 0.06;
  if (s < -WET) return;
  const w = smoothstep(-AA, AA, s);
  const inner = Math.max(0, s);
  if (look.kind === 'oil') oilTexel(p, inner, gx, gy);
  else if (look.kind === 'slag') slagTexel(p, inner, gx, gy);
  else waterTexel(p, look, inner, gx, gy);
  overWetBand(p, look.kind, s, w);
}

/* ---------- canvases ---------- */

/** Whether a chunk holds any texel of liquid or wet band. */
function chunkUsed(field: Field, cx: number, cy: number): boolean {
  const { map } = field;
  for (let y = cy * CHUNK; y < Math.min(map.h, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(map.w, (cx + 1) * CHUNK); x++) if (field.sdf[y * map.w + x]! > -WET - 0.8) return true;
  return false;
}

/** Below this distance field value a tile's texels cannot reach the wet band (noise and blending included). */
const FAR = -(WET + 1.5);

function paintChunk(p: Painter, cx: number, cy: number): HTMLCanvasElement {
  const { map } = p.field;
  const tw = Math.min(CHUNK, map.w - cx * CHUNK);
  const th = Math.min(CHUNK, map.h - cy * CHUNK);
  const canvas = document.createElement('canvas');
  canvas.width = tw * WATER_TEXELS;
  canvas.height = th * WATER_TEXELS;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      // whole tiles far from any liquid stay transparent: most of a chunk is land
      if (p.field.sdf[(cy * CHUNK + ty) * map.w + cx * CHUNK + tx]! > FAR) paintTile(p, px, canvas.width, cx * CHUNK, cy * CHUNK, tx, ty);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The texels of tile (tx, ty) of a chunk whose first tile is (ox, oy). */
function paintTile(p: Painter, px: Uint32Array, width: number, ox: number, oy: number, tx: number, ty: number): void {
  const o = p.out;
  for (let v = ty * WATER_TEXELS; v < (ty + 1) * WATER_TEXELS; v++) {
    for (let u = tx * WATER_TEXELS; u < (tx + 1) * WATER_TEXELS; u++) {
      texel(p, ox + (u + 0.5) / WATER_TEXELS, oy + (v + 0.5) / WATER_TEXELS);
      if (o[3] <= 0) continue;
      px[v * width + u] = (Math.round(Math.min(1, o[3]) * 255) << 24) | (clamp(o[2]) << 16) | (clamp(o[1]) << 8) | clamp(o[0]);
    }
  }
}

const clamp = (c: number): number => Math.min(255, Math.max(0, Math.round(c)));

function looksOf(content: ContentRegistry, palette: ThemePalette, shore: string): (Look | null)[] {
  const floors = content.floors.list;
  return [null, ...floors.map((f) => (f.liquid ? { kind: kindOf(f.liquid), color: hexToRgb((f.liquid && palette.liquids?.[f.liquid]) || f.color), shore: hexToRgb(shore) } : null))];
}

const kindOf = (liquid: string): Kind => (liquid === 'oil' ? 'oil' : liquid === 'slag' ? 'slag' : 'water');

/* ---------- the layer ---------- */

/**
 * The liquid layer: one sprite per used chunk (painted at `paint`), plus drifting glints over open water.
 * The view puts it right above the painted ground.
 */
export class WaterLayer {
  readonly layer = new Container();
  private readonly chunks = new Container();
  private readonly glints = new Container();
  private readonly pool = new SpritePool(this.glints);
  private glint: { texture: Texture; ax: number; ay: number } | null = null;
  /** Glint spots over open water: world x, y and a phase per spot. */
  private spots: Float32Array = new Float32Array(0);
  private still = false;
  private readonly rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  /** Texels painted at the last `paint` (memory check). */
  texels = 0;

  constructor() {
    this.glints.blendMode = 'add';
    this.layer.addChild(this.chunks, this.glints);
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  /** Paints every chunk that holds liquid (once per round). */
  paint(map: MapState, content: ContentRegistry, palette: ThemePalette, shore: string, seed: number): void {
    for (const c of this.chunks.removeChildren()) c.destroy({ texture: true, textureSource: true });
    this.texels = 0;
    if (typeof document === 'undefined') return;
    const field = buildField(map, content.floors.list);
    const p: Painter = { field, looks: looksOf(content, palette, shore), seed, out: [0, 0, 0, 0] };
    for (let cy = 0; cy * CHUNK < map.h; cy++) for (let cx = 0; cx * CHUNK < map.w; cx++) if (chunkUsed(field, cx, cy)) this.addChunk(paintChunk(p, cx, cy), cx, cy);
    this.spots = glintSpots(field, content.floors.list, seed);
  }

  private addChunk(canvas: HTMLCanvasElement, cx: number, cy: number): void {
    this.texels += canvas.width * canvas.height;
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'linear';
    const sprite = new Sprite(texture);
    const o = gridToWorld(cx * CHUNK, cy * CHUNK);
    const ex = gridToWorld(1, 0);
    const ey = gridToWorld(0, 1);
    sprite.setFromMatrix(new Matrix(ex.x / WATER_TEXELS, ex.y / WATER_TEXELS, ey.x / WATER_TEXELS, ey.y / WATER_TEXELS, o.x, o.y));
    this.chunks.addChild(sprite);
  }

  /** The glints: soft additive streaks that swell and fade, drifting a little, only those in the view. */
  update(camera: Camera, nowMs: number): void {
    this.pool.begin();
    if (!this.still && camera.zoom >= GLINT_ZOOM) this.drawGlints(viewOf(camera, this.rect), nowMs);
    this.pool.end();
  }

  private drawGlints(view: Rect, nowMs: number): void {
    const baked = (this.glint ??= { texture: glintTexture(), ax: 0.5, ay: 0.5 });
    const s = this.spots;
    let n = 0;
    for (let i = 0; i < s.length && n < MAX_GLINTS; i += 3) {
      const x = s[i]!;
      const y = s[i + 1]!;
      if (x < view.left - 40 || x > view.right + 40 || y < view.top - 20 || y > view.bottom + 20) continue;
      const t = nowMs / 1000 + s[i + 2]!;
      const a = Math.max(0, Math.sin(t * 0.9)) ** 4;
      if (a < 0.02) continue;
      const g = this.pool.next(baked, x + Math.sin(t * 0.4) * 10, y);
      g.alpha = a * 0.55;
      g.scale.set(0.8 + a * 0.5, 0.8);
      n++;
    }
  }
}

/** One glint spot per few tiles of open water (a tile away from the shore), from the seed. */
function glintSpots(field: Field, floors: readonly FloorDef[], seed: number): Float32Array {
  const out: number[] = [];
  const { map } = field;
  for (let i = 0; i < map.w * map.h; i++) {
    const f = field.liquid[i]!;
    if (field.sdf[i]! < 0.9 || floors[f - 1]?.liquid !== 'water') continue;
    const h = hash2(i * 31 + seed, 77);
    if ((h & 7) > 1) continue;
    const gx = (i % map.w) + 0.2 + ((h >>> 8) & 255) / 400;
    const gy = Math.floor(i / map.w) + 0.2 + ((h >>> 16) & 255) / 400;
    out.push(worldX(gx, gy), worldY(gx, gy), ((h >>> 3) & 1023) / 100);
  }
  return new Float32Array(out);
}

/** A soft horizontal light streak (white, tinted by nothing: water takes it as sky light). */
function glintTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 12;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(24, 6, 0, 24, 6, 24);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(220,240,255,0.35)');
  g.addColorStop(1, 'rgba(220,240,255,0)');
  ctx.setTransform(1, 0, 0, 0.25, 0, 4.5);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  return Texture.from(c);
}
