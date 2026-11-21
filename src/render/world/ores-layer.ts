import { Container } from 'pixi.js';
import { terrainOf } from '../../content/themes';
import type { FloorDef } from '../../content/types';
import { hexToNumber, mix } from '../art/color';
import type { MapState } from '../../sim/state';
import type { World } from '../../sim/world';
import { hash2 } from '../art/rand';
import type { ArtCategory, ArtManifest, ArtSprite, CategoryManifest } from '../art-manifest';
import { bakeAtlas, type BakeOptions, type Baked } from '../bake';
import type { Camera } from '../camera';
import { isTopDown, tileInView, viewMode, visibleTileRange, worldX, worldY, type Rect, type TileRange } from '../iso';
import { depthKey, SpritePool } from '../sprite-pool';
import { CLIFF_EAST, CLIFF_SOUTH, ORE_OUTCROPS, ORE_SCATTER, ORE_VARIANTS, oreFieldId, RIDGE_TOPS, ridgeIds, ridgeRockId, ridgeTopId } from './ore-art';
import { fromManifest } from './sprites';

/**
 * Ore fields and rock ridges as 3D pieces (docs/art.md, category ores). The sprites lie flat on the painted
 * ground, under belts and the depth-sorted objects, drawn in depth order; everything is derived from tile
 * hashes and the seed (never from sim state; the renderer only reads).
 *  - Ore: every ore tile that no building covers gets up to three small clusters of its ore at hashed spots (more
 *    where the field is thick and rich, fewer and smaller at its rim, `oreSpots`), so they overlap across tile
 *    borders and the field has no tile grid in it.
 *  - Ridge: every rock tile gets its top sheet (which also carries the cliffs of its open east and south edges)
 *    and a few boulders that cross tile borders; neighbouring tops join, so a ridge is one massif, not a row of
 *    blocks. Boulders draw above every flat piece (`raised`).
 * Only the tiles around the view are drawn, from a pool, and the pool is refilled only when the view leaves the
 * covered area, the layout changes (a building comes or goes), a bake lands or the zoom crosses THIN_ZOOM: a still
 * camera costs nothing. Far out (LOD) the layer hides and the ground's ore tint carries the field.
 * The ores bake lazily: only the ores the map has, into their own small atlas (like the deco props).
 */

/** Below this zoom the chunks are a few px: the painted ore tint alone reads better and costs nothing. */
export const ORE_LOD_ZOOM = 0.22;
/** Below this zoom a tile gets one ore piece and a ridge a boulder at most: sprites, not detail, cost frame time, and tiles are small. */
const THIN_ZOOM = 0.55;
/** Extra tiles drawn around the view, so a pan does not refill the pool every frame. */
const MARGIN_TILES = 4;
/** Texels per world px of the ore sprites at most (ridges are rendered at 4, ore pieces at 3: ground detail). */
const ORE_BAKE_MAX = 4;

export class OresLayer {
  /** Under belts and objects; the view adds it right above the painted map. */
  readonly ground = new Container();
  /** Ore pieces and ridge tops (with their cliffs), in depth order. */
  private readonly flat = new Container();
  /** Boulders on the ridge tops: above every flat piece, in depth order among themselves. */
  private readonly raised = new Container();
  private readonly pool = new SpritePool(this.flat);
  private readonly rocks = new SpritePool(this.raised);
  private readonly baked = new Map<string, Baked>();
  private art: ArtManifest = new Map();
  private readonly asked = new Set<number>();
  private ready: Promise<void> | null = null;
  private ridgesAsked = false;
  private ridgeTint = 0xffffff;
  private world: World | null = null;
  /** Whether the pool was filled for far-out zoom (fewer, bigger ore pieces; fewer boulders). */
  private thin = false;
  /** Bumped when a bake lands, so the pool is refilled. */
  private bakes = 0;
  private filled = { layout: -1, bakes: -1, x0: 0, y0: 0, x1: -1, y1: -1 };
  private readonly rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

  constructor(private readonly bake: BakeOptions) {
    this.ground.addChild(this.flat, this.raised);
  }

  /** A new world: forget what was drawn; its ores bake on the next update. */
  reset(): void {
    this.world = null;
    this.filled.layout = -1;
    this.pool.begin();
    this.pool.end();
    this.rocks.begin();
    this.rocks.end();
  }

  update(w: World, camera: Camera): void {
    if (w !== this.world) this.adopt(w);
    const show = camera.zoom >= ORE_LOD_ZOOM;
    this.ground.visible = show;
    if (!show) return;
    const thin = camera.zoom < THIN_ZOOM;
    if (thin !== this.thin) {
      this.thin = thin;
      this.filled.layout = -1;
    }
    const range = visibleTileRange(viewOf(camera, this.rect), w.state.map.w, w.state.map.h, 1);
    if (!this.stale(w, range)) return;
    this.fill(w, range);
  }

  /* ---------- baking ---------- */

  private adopt(w: World): void {
    this.world = w;
    this.filled.layout = -1;
    // ridge rock is rendered light grey: the theme's ridge colour, lifted, tints it
    this.ridgeTint = hexToNumber(mix(terrainOf(w.content.themes.get(w.state.map.theme)).ridgeLit, '#ffffff', 0.38));
    if (!this.ridgesAsked && w.state.map.ridge.some((r) => r === 1)) void this.bakeRidges();
    const present = new Set<number>();
    for (const f of w.state.map.floor) if (f) present.add(f - 1);
    const floors = w.content.floors.list;
    const wanted = [...present].filter((i) => floors[i]?.ore && !this.asked.has(i));
    if (wanted.length) void this.bakeFloors(wanted, floors);
  }

  private async bakeFloors(indices: number[], floors: readonly FloorDef[]): Promise<void> {
    for (const i of indices) this.asked.add(i);
    this.ready ??= loadOreArt().then((art) => void (this.art = art));
    await this.ready;
    const sprites = indices.flatMap((i) => Array.from({ length: ORE_VARIANTS }, (_, v) => fromManifest(oreFieldId(floors[i]!.id, v), this.art))).filter((s) => s !== null);
    if (!sprites.length || typeof document === 'undefined') return;
    const scale = Math.min(this.bake.scale, ORE_BAKE_MAX);
    const { baked } = await bakeAtlas(sprites, { scale, art: this.art, budget: 0 });
    for (const [id, b] of baked) this.baked.set(id, b);
    this.bakes++;
  }

  private async bakeRidges(): Promise<void> {
    this.ridgesAsked = true;
    this.ready ??= loadOreArt().then((art) => void (this.art = art));
    await this.ready;
    const sprites = ridgeIds().map((id) => fromManifest(id, this.art)).filter((s) => s !== null);
    if (!sprites.length || typeof document === 'undefined') return;
    const { baked } = await bakeAtlas(sprites, { scale: Math.min(this.bake.scale, ORE_BAKE_MAX), art: this.art, budget: 0 });
    for (const [id, b] of baked) this.baked.set(id, b);
    this.bakes++;
  }

  /* ---------- drawing ---------- */

  /** Whether the pool must be refilled: the view left the covered tiles, or layout or bakes changed. */
  private stale(w: World, r: TileRange): boolean {
    const f = this.filled;
    if (f.layout !== w.layout || f.bakes !== this.bakes) return true;
    return r.x0 < f.x0 || r.y0 < f.y0 || r.x1 > f.x1 || r.y1 > f.y1;
  }

  private fill(w: World, r: TileRange): void {
    const { map } = w.state;
    const f = this.filled;
    f.layout = w.layout;
    f.bakes = this.bakes;
    f.x0 = Math.max(0, r.x0 - MARGIN_TILES);
    f.y0 = Math.max(0, r.y0 - MARGIN_TILES);
    f.x1 = Math.min(map.w - 1, r.x1 + MARGIN_TILES);
    f.y1 = Math.min(map.h - 1, r.y1 + MARGIN_TILES);
    this.pool.begin();
    this.rocks.begin();
    if (isTopDown()) this.fillRows(w);
    else this.fillDiagonals(w);
    this.pool.end();
    this.rocks.end();
  }

  /** Top-down and steep: rows from the back (low y) to the front. */
  private fillRows(w: World): void {
    const f = this.filled;
    for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) this.tile(w, x, y);
  }

  /** Iso: diagonals of equal x + y from the back to the front. */
  private fillDiagonals(w: World): void {
    const f = this.filled;
    for (let s = f.x0 + f.y0; s <= f.x1 + f.y1; s++) {
      const from = Math.max(f.x0, s - f.y1);
      const to = Math.min(f.x1, s - f.y0);
      for (let x = from; x <= to; x++) this.tile(w, x, s - x);
    }
  }

  /** One ore tile: up to three pieces of its ore at hashed spots (see `oreSpots`), unless a building stands there. */
  private tile(w: World, x: number, y: number): void {
    const { map } = w.state;
    const i = y * map.w + x;
    if (map.ridge[i]) return this.ridge(w, x, y);
    const floor = map.floor[i]!;
    if (!floor || w.occ[i]) return;
    const def = w.content.floors.list[floor - 1];
    if (!def?.ore) return;
    const n = oreSpots(map, x, y, floor, w.state.seed, this.thin);
    for (let k = 0; k < n; k++) {
      const spot = SPOTS[k]!;
      const baked = this.baked.get(oreFieldId(def.id, spot.v));
      if (!baked) continue;
      const gx = x + 0.5 + spot.ox;
      const gy = y + 0.5 + spot.oy;
      const s = this.pool.next(baked, worldX(gx, gy), worldY(gx, gy));
      if (spot.scale !== 1) s.scale.set(spot.scale);
    }
  }

  /** A ridge tile: its top (with the cliffs of its open east and south edges), then the boulders on it. */
  private ridge(w: World, x: number, y: number): void {
    const seed = w.state.seed + 1;
    const h = tileHash(x, y, seed);
    const { map } = w.state;
    const open = openSides(map, x, y);
    const tint = multiply(this.ridgeTint, grey(toneAt(seed, x + 0.5, y + 0.5)));
    const mask = (open & EAST ? CLIFF_EAST : 0) | (open & SOUTH ? CLIFF_SOUTH : 0);
    this.piece(this.pool, ridgeTopId(mask, variantAt(x, y, h, seed, RIDGE_TOPS)), x + 0.5, y + 0.5, tint);
    const n = scatter(x, y, h, open, solidAround(map, x, y), this.thin);
    for (let k = 0; k < n; k++) {
      const s = STONES[k]!;
      this.piece(this.rocks, ridgeRockId(s.v), x + 0.5 + s.ox, y + 0.5 + s.oy, tint);
    }
  }

  /** One ridge piece at grid point (gx, gy) in the given tint; skipped until its art has baked. */
  private piece(pool: SpritePool, id: string, gx: number, gy: number, tint: number): void {
    const baked = this.baked.get(id);
    if (!baked) return;
    const s = pool.next(baked, worldX(gx, gy), worldY(gx, gy));
    s.tint = tint;
  }
}

/** Sides of a ridge tile that face open ground (bits). East and south are the cliffs the cameras see. */
const EAST = 1;
const SOUTH = 2;
const WEST = 4;
const NORTH = 8;
/** [bit, dx, dy] of the four sides. */
const SIDES = [
  [EAST, 1, 0],
  [SOUTH, 0, 1],
  [WEST, -1, 0],
  [NORTH, 0, -1],
] as const;
/** Radius of each boulder variant (art3d/ores/ridges.ts ROCKS), for keeping them on the top. 8 and 9 are the mounds. */
const ROCK_RADIUS = [0.07, 0.09, 0.15, 0.18, 0.26, 0.3, 0.34, 0.13, 0.62, 0.5] as const;
const MOUND = 8;

function rockAt(map: MapState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.w && y < map.h && map.ridge[y * map.w + x] === 1;
}

function openSides(map: MapState, x: number, y: number): number {
  let bits = 0;
  for (let k = 0; k < SIDES.length; k++) {
    const side = SIDES[k]!;
    if (!rockAt(map, x + side[1], y + side[2])) bits |= side[0];
  }
  return bits;
}

/** Whether all eight neighbours are rock too (room for a mound that spreads over the borders). */
function solidAround(map: MapState, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!rockAt(map, x + dx, y + dy)) return false;
  return true;
}

interface Stone {
  v: number;
  ox: number;
  oy: number;
}

/** Scratch for `scatter` (three boulders, two rim stones and a mound at most): a refill touches thousands of tiles and must not allocate. */
const STONES: Stone[] = Array.from({ length: 6 }, () => ({ v: 0, ox: 0, oy: 0 }));

function setStone(i: number, v: number, ox: number, oy: number): void {
  const s = STONES[i]!;
  s.v = v;
  s.ox = ox;
  s.oy = oy;
}

/** Which boulder: mostly small and medium, now and then a big one, a slab or a spire. */
function rockVariant(u: number): number {
  if (u < 0.3) return Math.floor(u * 6.6) % 2;
  if (u < 0.58) return 2 + (Math.floor(u * 25) % 2);
  if (u < 0.78) return 4 + (Math.floor(u * 25) % 2);
  return u < 0.9 ? 6 : 7;
}

/** A boulder's offset on its tile (-0.5..0.5), pulled in so a boulder of radius r does not hang over an open edge. */
function keepOnTop(o: number, r: number, high: number, low: number): number {
  const limit = 0.5 - r * 0.7;
  return Math.max(low ? -limit : -0.5, Math.min(high ? limit : 0.5, o * 0.9));
}

/** Adds a small stone on the rim of each open west or north edge (the east and south rims carry theirs in the art) after `n`; returns the new count. */
function lipStones(h: number, open: number, n: number): number {
  let count = n;
  for (let k = 2; k < SIDES.length; k++) {
    const side = SIDES[k]!;
    const g = hash2(h + 13 * k, 5 + k);
    if (!(open & side[0]) || (g & 3) === 0) continue;
    const v = (g >>> 4) % 4;
    const edge = 0.5 - ROCK_RADIUS[v]! * 0.5;
    const along = (((g >>> 8) & 255) / 255 - 0.5) * 0.8;
    setStone(count++, v, side[1] ? side[1] * edge : along, side[2] ? side[2] * edge : along);
  }
  return count;
}

/** Orders STONES[0..n) back to front (insertion sort) and puts a mound first when the tile has one: it is the ground the others stand on. */
function arrange(n: number, mound: boolean, h: number): number {
  for (let a = 1; a < n; a++) {
    for (let b = a; b > 0 && STONES[b]!.ox + STONES[b]!.oy < STONES[b - 1]!.ox + STONES[b - 1]!.oy; b--) {
      const t = STONES[b]!;
      STONES[b] = STONES[b - 1]!;
      STONES[b - 1] = t;
    }
  }
  if (!mound) return n;
  const spare = STONES[n]!;
  for (let i = n; i > 0; i--) STONES[i] = STONES[i - 1]!;
  STONES[0] = spare;
  setStone(0, MOUND + ((h >>> 26) & 1), (((h >>> 27) & 7) / 7 - 0.5) * 0.5, (((h >>> 6) & 7) / 7 - 0.5) * 0.5);
  return n + 1;
}

/** The boulders of one ridge tile into STONES, back to front: a few on the top, stones on the rim, and now and then a mound. Far out (`thin`): one at most, on every other tile. Returns how many. */
function scatter(x: number, y: number, h: number, open: number, solid: boolean, thin: boolean): number {
  const boulders = thin ? (h >>> 20) & 1 : 1 + ((h >>> 20) & 1) + (open ? 0 : (h >>> 21) & 1);
  for (let k = 0; k < boulders; k++) {
    const g = hash2(h + k * 977, x * 31 + y * 17 + k);
    const v = rockVariant((g & 255) / 255);
    const r = ROCK_RADIUS[v]!;
    setStone(k, v, keepOnTop(((g >>> 8) & 255) / 255 - 0.5, r, open & EAST, open & WEST), keepOnTop(((g >>> 16) & 255) / 255 - 0.5, r, open & SOUTH, open & NORTH));
  }
  if (thin) return boulders;
  const n = lipStones(h, open, boulders);
  return arrange(n, solid && ((h >>> 23) & 15) < 3, h);
}

/** Slow brightness drift of the rock over the map (0.9 .. 1.0), so a massif has darker and lighter regions. */
const toneAt = (seed: number, gx: number, gy: number): number => 0.9 + 0.1 * smoothNoise(seed, gx, gy, 10);

/** A grey tint of brightness k (0..1). */
const grey = (k: number): number => {
  const v = Math.round(Math.min(1, Math.max(0, k)) * 255);
  return (v << 16) | (v << 8) | v;
};

const tileHash = (x: number, y: number, seed: number): number => hash2(x * 92821 + seed, y * 68917 + 7);

const ease = (t: number): number => t * t * (3 - 2 * t);
const lattice = (seed: number, i: number, j: number): number => (hash2(i * 7919 + seed, j * 104729 + 3) & 1023) / 1023;

/** Slow value noise over the map (0..1), `cell` tiles per lattice step: richness of a field, tone of a rock. */
function smoothNoise(seed: number, gx: number, gy: number, cell: number): number {
  const fx = gx / cell;
  const fy = gy / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = ease(fx - x0);
  const ty = ease(fy - y0);
  const top = lattice(seed, x0, y0) * (1 - tx) + lattice(seed, x0 + 1, y0) * tx;
  const bottom = lattice(seed, x0, y0 + 1) * (1 - tx) + lattice(seed, x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** One piece of an ore tile: which variant, where (tiles off the tile centre) and how big. */
interface Spot {
  v: number;
  ox: number;
  oy: number;
  scale: number;
}

/** Scratch for `oreSpots` (a tile has three pieces at most): the fill touches thousands of tiles and must not allocate. */
const SPOTS: Spot[] = [0, 1, 2].map(() => ({ v: 0, ox: 0, oy: 0, scale: 1 }));
/** The ore tile's neighbourhood: how many of its 8 neighbours are the same ore, and which way the open ground lies. */
const AROUND = { near: 0, ux: 0, uy: 0 };

const AROUND_8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function sameOre(map: MapState, x: number, y: number, floor: number): boolean {
  return x >= 0 && y >= 0 && x < map.w && y < map.h && map.floor[y * map.w + x] === floor && !map.ridge[y * map.w + x];
}

function surround(map: MapState, x: number, y: number, floor: number): void {
  AROUND.near = 0;
  AROUND.ux = 0;
  AROUND.uy = 0;
  for (const [dx, dy] of AROUND_8) {
    if (sameOre(map, x + dx, y + dy, floor)) AROUND.near++;
    else {
      AROUND.ux += dx / 8;
      AROUND.uy += dy / 8;
    }
  }
}

/** How many pieces a tile gets: more where the field is thick and rich, at least one always. */
function pieceCount(near: number, rich: number, h: number): number {
  const want = 1.2 + (near / 8) * (1.1 + 1.4 * rich);
  const n = Math.min(3, Math.floor(want) + ((h & 255) / 255 < want - Math.floor(want) ? 1 : 0));
  // a thin rim loses a piece now and then, but a lone tile of ore always shows
  return near > 2 && near < 6 && ((h >>> 8) & 255) / 255 < (6 - near) * 0.07 ? Math.max(1, n - 1) : n;
}

/** The variant of piece k: an everyday cluster (never the one before it), or an outcrop in a rich, thick middle. */
function pieceVariant(g: number, prev: number, outcrop: boolean): number {
  if (outcrop && ((g >>> 8) & 7) === 0) return ORE_SCATTER + ((g >>> 12) % ORE_OUTCROPS);
  const v = (g & 255) % ORE_SCATTER;
  return v === prev ? (v + 1) % ORE_SCATTER : v;
}

/**
 * The pieces of one ore tile, back to front, into SPOTS; returns how many. Two or three where the field is thick
 * and rich (a slow noise makes a dense core, thin patches and now and then a big outcrop), one or two at its edge,
 * where the pieces are smaller and lean out over the border: a soft ragged rim instead of the tile diamond.
 * Pieces reach over tile borders; from hashes only, never from sim state.
 */
function oreSpots(map: MapState, x: number, y: number, floor: number, seed: number, thin: boolean): number {
  surround(map, x, y, floor);
  const { near, ux, uy } = AROUND;
  const h = tileHash(x, y, seed);
  const thick = near / 8;
  const rich = smoothNoise(seed + 5, x + 0.5, y + 0.5, 5);
  const n = thin ? 1 : pieceCount(near, rich, h);
  const size = (0.72 + 0.28 * thick) * (thin ? 1.35 : 1);
  const lean = (1 - thick) * 0.22;
  let prev = -1;
  for (let k = 0; k < n; k++) {
    const g = hash2(h + k * 40503, k + 3);
    const spot = SPOTS[k]!;
    spot.v = prev = pieceVariant(g, prev, near === 8 && rich > 0.6);
    spot.ox = (((g >>> 14) & 255) / 255 - 0.5) * 0.95 + ux * lean;
    spot.oy = (((g >>> 22) & 255) / 255 - 0.5) * 0.95 + uy * lean;
    spot.scale = (0.86 + (((g >>> 4) & 15) / 15) * 0.3) * size;
  }
  // insertion sort, back to front
  for (let a = 1; a < n; a++) for (let b = a; b > 0 && SPOTS[b]!.ox + SPOTS[b]!.oy < SPOTS[b - 1]!.ox + SPOTS[b - 1]!.oy; b--) swap(b);
  return n;
}

function swap(b: number): void {
  const t = SPOTS[b]!;
  SPOTS[b] = SPOTS[b - 1]!;
  SPOTS[b - 1] = t;
}


/** The tile's variant, never the same as its left or upper neighbour's own pick (no two equal stamps in a row). */
function variantAt(x: number, y: number, h: number, seed: number, n: number): number {
  let v = h % n;
  const left = tileHash(x - 1, y, seed) % n;
  const up = tileHash(x, y - 1, seed) % n;
  for (let k = 0; k < 2 && (v === left || v === up); k++) v = (v + 1) % n;
  return v;
}

/** The ores manifest of the view (iso set, the view's own set over it); empty when missing. */
async function loadOreArt(): Promise<ArtManifest> {
  if (typeof fetch !== 'function') return new Map();
  const view = viewMode();
  const sets = await Promise.all([manifestOf('art/ores/'), view === 'iso' ? Promise.resolve([]) : manifestOf(`art/ores/${view}/`)]);
  return new Map(sets.flat().map((s) => [s.id, s]));
}

async function manifestOf(dir: string): Promise<ArtSprite[]> {
  try {
    const res = await fetch(`${dir}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const m = (await res.json()) as Omit<CategoryManifest, 'category'>;
    if (m.version !== 1 || !m.sprites) return [];
    return Object.entries(m.sprites).map(([id, e]) => ({ ...e, id, category: 'ores' as ArtCategory, url: `${dir}${e.file}?v=${e.hash}` }));
  } catch {
    return [];
  }
}

/* ---------- wrecks ---------- */

/** The wreck models of the nature category (4 variants, each with a `-glow`). */
const WRECK_VARIANTS = 4;
const wreckId = (v: number): string => `obstacle-wreck-${v}`;
/** The hull is 7x7 tiles in the sim (salvage reach 3): the main wreck is drawn about two tiles across. */
const WRECK_SCALE = 2.1;
/** Two smaller pieces of debris thrown off to the sides: [dx, dy] in tiles, scale. */
const DEBRIS: readonly (readonly [number, number, number])[] = [
  [2, -1, 0.85],
  [-1, 2, 0.7],
];
/** A salvaged wreck: emptied and darker, its blueprint light gone. */
const TAKEN_TINT = 0x6c6676;

type Wreck = World['state']['map']['wrecks'][number];

/**
 * Wrecks (map.wrecks) as the nature category's 3D wreck, scaled to the crash site, with two pieces of debris
 * and its `-glow` breathing additively while the blueprint is still inside (`taken` false). Variants and
 * debris from the wreck's tile, never mirrored. Sprites go into the depth-sorted objects, so buildings,
 * boulders and drones sort with them. Picking stays the sim's (`wreckAt`, a 7x7 box), not the sprite's.
 */
export class WreckSprites {
  private readonly bodies: SpritePool;
  private readonly glows: SpritePool;
  private readonly baked = new Map<string, Baked>();
  private asked = false;
  private still = false;
  private tint = 0xffffff;
  private readonly rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

  constructor(
    objects: Container,
    private readonly art: ArtManifest,
    private readonly bake: BakeOptions,
  ) {
    this.bodies = new SpritePool(objects);
    this.glows = new SpritePool(objects);
  }

  setStill(still: boolean): void {
    this.still = still;
  }

  /** `tint` is the map's light tint (light.ts `mapTint`): wrecks are ground, not lit buildings. */
  update(w: World, camera: Camera, nowMs: number, tint: number): void {
    this.tint = tint;
    this.bodies.begin();
    this.glows.begin();
    const wrecks = w.state.map.wrecks;
    if (wrecks.length && !this.asked) this.load();
    if (this.baked.size) {
      const view = viewOf(camera, this.rect);
      for (const wreck of wrecks) if (tileInView(wreck.x, wreck.y, view, 420)) this.drawWreck(wreck, nowMs);
    }
    this.bodies.end();
    this.glows.end();
  }

  private load(): void {
    this.asked = true;
    const sprites = Array.from({ length: WRECK_VARIANTS }, (_, v) => fromManifest(wreckId(v), this.art)).filter((s) => s !== null);
    if (!sprites.length || typeof document === 'undefined') return;
    // drawn bigger than their model: bake with more texels (at most the 5 the images have)
    const scale = Math.min(5, this.bake.scale * WRECK_SCALE);
    void bakeAtlas(sprites, { scale, art: this.art, budget: 0 })
      .then(({ baked }) => {
        for (const [id, b] of baked) this.baked.set(id, b);
      })
      .catch((error: unknown) => console.warn('Could not bake the wrecks', error));
  }

  private drawWreck(wreck: Wreck, nowMs: number): void {
    const h = hash2(wreck.x * 7151 + 3, wreck.y * 3319 + 11);
    const main = h % WRECK_VARIANTS;
    this.piece(wreck, main, 0, 0, WRECK_SCALE, nowMs);
    DEBRIS.forEach(([dx, dy, s], i) => this.piece(wreck, (main + 1 + i + ((h >>> 4) & 1)) % WRECK_VARIANTS, dx, dy, s, nowMs));
  }

  /** One wreck sprite on tile (wreck + dx, wreck + dy), its glow on top while the blueprint is inside. */
  private piece(wreck: Wreck, variant: number, dx: number, dy: number, scale: number, nowMs: number): void {
    const body = this.baked.get(wreckId(variant));
    if (!body) return;
    const gx = wreck.x + dx + 0.5;
    const gy = wreck.y + dy + 0.5;
    const s = this.bodies.next(body, worldX(gx, gy), worldY(gx, gy));
    s.scale.set(scale);
    // the scaled model reaches about a tile towards the camera: sort it with the tile in front of its anchor
    const reach = scale > 1.5 ? 1 : 0;
    s.zIndex = depthKey(wreck.x + dx + reach, wreck.y + dy + reach);
    s.tint = wreck.taken ? multiply(this.tint, TAKEN_TINT) : this.tint;
    const glow = this.baked.get(`${wreckId(variant)}-glow`);
    if (wreck.taken || !glow) return;
    const g = this.glows.next(glow, s.x, s.y);
    g.scale.set(scale);
    g.blendMode = 'add';
    g.zIndex = s.zIndex + 1;
    g.alpha = this.still ? 0.75 : 0.5 + 0.4 * Math.sin(nowMs / 520 + variant * 1.7) ** 2;
  }
}

/** Two 0xRRGGBB tints multiplied channel by channel. */
function multiply(a: number, b: number): number {
  const ch = (shift: number): number => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** The camera's view in world px into `r` (no allocation; Camera.viewRect makes a new object). */
export function viewOf(camera: Camera, r: Rect): Rect {
  const halfW = camera.viewW / 2 / camera.zoom;
  const halfH = camera.viewH / 2 / camera.zoom;
  const cx = camera.x - camera.offsetX / camera.zoom;
  const cy = camera.y - camera.offsetY / camera.zoom;
  r.left = cx - halfW;
  r.right = cx + halfW;
  r.top = cy - halfH;
  r.bottom = cy + halfH;
  return r;
}
