import { Container } from 'pixi.js';
import { terrainOf } from '../../content/themes';
import type { FloorDef } from '../../content/types';
import { hexToNumber, mix } from '../art/color';
import type { World } from '../../sim/world';
import { hash2 } from '../art/rand';
import type { ArtCategory, ArtManifest, ArtSprite, CategoryManifest } from '../art-manifest';
import { bakeAtlas, type BakeOptions, type Baked } from '../bake';
import type { Camera } from '../camera';
import { isTopDown, tileInView, viewMode, visibleTileRange, worldX, worldY, type Rect, type TileRange } from '../iso';
import { depthKey, SpritePool } from '../sprite-pool';
import { ORE_VARIANTS, oreFieldId, RIDGE_VARIANTS, ridgeId, ridgeIds } from './ore-art';
import { fromManifest } from './sprites';

/**
 * Ore fields as 3D chunks (docs/art.md, category ores): every ore tile that no building covers gets one of
 * its ore's pre-rendered tile sprites, picked and nudged per tile from the seed (never from sim state; the
 * renderer only reads). The sprites lie flat on the painted ground, under belts and the depth-sorted objects,
 * drawn in depth order among themselves. Only the tiles around the view are drawn, from a pool, and the pool is
 * refilled only when the view leaves the covered area, the layout changes (a building comes or goes) or a bake
 * lands: a still camera costs nothing. Far out (LOD) the layer hides and the ground's ore tint carries the field.
 * The ores bake lazily: only the ores the map has, into their own small atlas (like the deco props).
 */

/** Below this zoom the chunks are a few px: the painted ore tint alone reads better and costs nothing. */
export const ORE_LOD_ZOOM = 0.22;
/** Extra tiles drawn around the view, so a pan does not refill the pool every frame. */
const MARGIN_TILES = 4;
/** Largest nudge of a tile's sprite off the tile centre (tiles): breaks the grid without leaving the tile. */
const NUDGE = 0.07;
/** Texels per world px of the ore sprites at most (they are rendered at 4: ground detail). */
const ORE_BAKE_MAX = 4;

export class OresLayer {
  /** Under belts and objects; the view adds it right above the painted map. */
  readonly ground = new Container();
  private readonly pool = new SpritePool(this.ground);
  private readonly baked = new Map<string, Baked>();
  private art: ArtManifest = new Map();
  private readonly asked = new Set<number>();
  private ready: Promise<void> | null = null;
  private ridgesAsked = false;
  private ridgeTint = 0xffffff;
  private world: World | null = null;
  /** Bumped when a bake lands, so the pool is refilled. */
  private bakes = 0;
  private filled = { layout: -1, bakes: -1, x0: 0, y0: 0, x1: -1, y1: -1 };
  private readonly rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

  constructor(private readonly bake: BakeOptions) {}

  /** A new world: forget what was drawn; its ores bake on the next update. */
  reset(): void {
    this.world = null;
    this.filled.layout = -1;
    this.pool.begin();
    this.pool.end();
  }

  update(w: World, camera: Camera): void {
    if (w !== this.world) this.adopt(w);
    const show = camera.zoom >= ORE_LOD_ZOOM;
    this.ground.visible = show;
    if (!show) return;
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
    if (isTopDown()) this.fillRows(w);
    else this.fillDiagonals(w);
    this.pool.end();
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

  /** One ore tile's sprite, unless a building stands there or its ore has not baked yet. */
  private tile(w: World, x: number, y: number): void {
    const { map } = w.state;
    const i = y * map.w + x;
    if (map.ridge[i]) return this.ridge(w, x, y);
    const floor = map.floor[i]!;
    if (!floor || w.occ[i]) return;
    const def = w.content.floors.list[floor - 1];
    if (!def?.ore) return;
    const h = tileHash(x, y, w.state.seed);
    const baked = this.baked.get(oreFieldId(def.id, variantAt(x, y, h, w.state.seed)));
    if (!baked) return;
    const gx = x + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 2 * NUDGE;
    const gy = y + 0.5 + (((h >>> 16) & 255) / 255 - 0.5) * 2 * NUDGE;
    this.pool.next(baked, worldX(gx, gy), worldY(gx, gy));
  }
  /** A ridge tile's rock block, tinted with the theme's rock colour; not nudged, so the blocks join up. */
  private ridge(w: World, x: number, y: number): void {
    const v = variantAt(x, y, tileHash(x, y, w.state.seed + 1), w.state.seed + 1) % RIDGE_VARIANTS;
    const baked = this.baked.get(ridgeId(v));
    if (!baked) return;
    const s = this.pool.next(baked, worldX(x + 0.5, y + 0.5), worldY(x + 0.5, y + 0.5));
    s.tint = this.ridgeTint;
  }

}

const tileHash = (x: number, y: number, seed: number): number => hash2(x * 92821 + seed, y * 68917 + 7);

/** The tile's variant, never the same as its left or upper neighbour's own pick (no two equal stamps in a row). */
function variantAt(x: number, y: number, h: number, seed: number): number {
  let v = h % ORE_VARIANTS;
  const left = tileHash(x - 1, y, seed) % ORE_VARIANTS;
  const up = tileHash(x, y - 1, seed) % ORE_VARIANTS;
  for (let k = 0; k < 2 && (v === left || v === up); k++) v = (v + 1) % ORE_VARIANTS;
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
