import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { SpriteArt, SpriteMeta } from './art/svg';
import { artUrl, mergeMeta, type ArtManifest } from './art-manifest';
import { packPages, planScale } from './pack';

/** A baked sprite: texture region plus the anchor it was drawn with. */
export interface Baked {
  texture: Texture;
  ax: number;
  ay: number;
  meta?: SpriteMeta;
}

/**
 * Alpha (0..255) of a baked sprite at a point given relative to where it is drawn (its anchor), in sprite px.
 * 0 outside its visible pixels; 255 when the pixels cannot be read (counts as a hit). For picking only: it reads
 * one pixel of the atlas canvas, so it is meant for a tap, not for every frame.
 */
export function alphaAt(baked: Baked, dx: number, dy: number): number {
  const t = baked.texture;
  const lx = dx + baked.ax * t.orig.width;
  const ly = dy + baked.ay * t.orig.height;
  const trim = t.trim ?? t.orig;
  if (lx < trim.x || ly < trim.y || lx >= trim.x + trim.width || ly >= trim.y + trim.height) return 0;
  const canvas = t.source.resource as HTMLCanvasElement | undefined;
  const ctx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return 255;
  const res = t.source.resolution;
  const px = Math.floor((t.frame.x + lx - trim.x) * res);
  const py = Math.floor((t.frame.y + ly - trim.y) * res);
  return ctx.getImageData(px, py, 1, 1).data[3] ?? 0;
}

/** Largest atlas page in device pixels; 4096 is safe on mid-range phones. */
const MAX_PAGE_PX = 4096;
/**
 * Texel budget of the sprites baked at start (about 96 MB of RGBA before mipmaps). When the wanted scale would
 * need more, the whole set is baked a little smaller instead (see `planScale`). Construction stages and scaffolds
 * bake on first use (`startSprites`): baked up front they were 57 % of the start set (87 M texels on a 2x screen).
 */
export const BAKE_BUDGET_PX = 24_000_000;

export interface BakeOptions {
  /** Texels per world px wanted (screen resolution at the closest zoom, `bakeScaleFor`). */
  scale: number;
  /** Pre-rendered 3D art: ids found here are drawn from their PNG instead of their SVG. */
  art?: ArtManifest;
  /** Texel budget; 0 = none. */
  budget?: number;
}

/** One sprite to bake, from an SVG or a manifest PNG. Sizes in world px. */
interface Source {
  id: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  meta?: SpriteMeta;
  image: HTMLImageElement;
  /** Already trimmed to its visible pixels (rendered 3D art is). */
  trimmed: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

const svgUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The 3D render of a sprite when the manifest has one (and it loads), else its SVG. `scale`: texels wanted. */
async function sourceOf(s: SpriteArt, scale: number, art?: ArtManifest): Promise<Source> {
  const a = art?.get(s.id);
  if (a) {
    try {
      return { id: s.id, w: a.w, h: a.h, ax: a.ax, ay: a.ay, meta: mergeMeta(s.meta, a.meta), image: await loadImage(artUrl(a, scale)), trimmed: true };
    } catch {
      console.warn(`3D art for ${s.id} did not load; using its SVG`);
    }
  }
  return { id: s.id, w: s.w, h: s.h, ax: s.ax, ay: s.ay, meta: s.meta, image: await loadImage(svgUrl(s.svg)), trimmed: false };
}

/** Manifest sprites that come with a sprite but are not asked for by name (a model's `-glow`). */
function extrasOf(sprites: readonly SpriteArt[], art?: ArtManifest): SpriteArt[] {
  if (!art) return [];
  const have = new Set(sprites.map((s) => s.id));
  return sprites
    .map((s) => art.get(`${s.id}-glow`))
    .filter((a): a is NonNullable<typeof a> => a !== undefined && !have.has(a.id))
    .map((a) => ({ id: a.id, w: a.w, h: a.h, ax: a.ax, ay: a.ay, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
}

/** Visible bounds of a canvas (alpha > 2), in device px; null when fully transparent. */
function alphaBounds(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number, number, number] | null {
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3]! <= 2) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** A 2D canvas; `read` makes it software backed (cheap pixel reads: trimming, picking). */
function canvas2d(w: number, h: number, read = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: read });
  if (!ctx) throw new Error('2D canvas unavailable for texture baking');
  return [canvas, smooth(ctx)];
}

/**
 * The box (whole world px of the sprite) that holds its visible pixels, found on a 1 texel per px draft so
 * the real bake never allocates the full (mostly empty) sprite box at a high scale.
 */
function trimOf(src: Source): Rectangle {
  const w = Math.ceil(src.w);
  const h = Math.ceil(src.h);
  if (src.trimmed) return new Rectangle(0, 0, w, h);
  const [draft, ctx] = canvas2d(w, h, true);
  ctx.drawImage(src.image, 0, 0, w, h);
  const b = alphaBounds(ctx, w, h);
  release(draft);
  if (!b) return new Rectangle(0, 0, 1, 1);
  const x = Math.max(0, b[0] - 1);
  const y = Math.max(0, b[1] - 1);
  return new Rectangle(x, y, Math.min(w, b[2] + 2) - x, Math.min(h, b[3] + 2) - y);
}

/** Frees a temporary canvas's backing store now instead of at the next garbage collection. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * An empty atlas page as a Pixi source. The page is drawn only after the source exists: Pixi derives the pixel
 * size as (canvas px / resolution) x resolution, which for a fractional bake scale can come out a hair below the
 * canvas size, and it then resizes the canvas, which wipes it (whole pages were blank on 2x screens).
 */
function pageSource(width: number, height: number, scale: number): CanvasSource {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  return new CanvasSource({ resource: canvas, resolution: scale, autoGenerateMipmaps: true, scaleMode: 'linear' });
}

function smooth(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** The trimmed part of a sprite rasterised at `scale` (texels per world px). */
function rasterise(src: Source, trim: Rectangle, scale: number): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(Math.ceil(trim.width * scale), Math.ceil(trim.height * scale));
  ctx.drawImage(src.image, -trim.x * scale, -trim.y * scale, src.w * scale, src.h * scale);
  return canvas;
}

/**
 * Bakes sprites into as few atlas textures as possible: each comes from its pre-rendered 3D PNG when the
 * art manifest has one, else from its SVG; it is trimmed to its visible pixels (less overdraw and texture
 * memory; the texture keeps the full box as `orig`, so anchors stay exact), rasterised at the bake scale
 * (screen resolution at the closest zoom, so nothing is upscaled) and packed into shared canvases, which
 * become GPU textures with mipmaps (clean when zoomed out). Returns the sprites and the scale used.
 */
export async function bakeAtlas(sprites: readonly SpriteArt[], opts: BakeOptions): Promise<{ baked: Map<string, Baked>; scale: number }> {
  const all = [...sprites, ...extrasOf(sprites, opts.art)];
  const sources = await Promise.all(all.map((s) => sourceOf(s, opts.scale, opts.art)));
  const trims = new Map(sources.map((s) => [s.id, trimOf(s)]));
  const area = [...trims.values()].reduce((sum, t) => sum + t.width * t.height, 0);
  const scale = planScale(area, opts.scale, opts.budget ?? 0);
  const limit = Math.floor(MAX_PAGE_PX / scale);
  const items = sources.map((s) => ({ id: s.id, w: trims.get(s.id)!.width, h: trims.get(s.id)!.height }));
  const byId = new Map(sources.map((s) => [s.id, s]));
  const baked = new Map<string, Baked>();
  for (const page of packPages(items, limit, limit, 2)) {
    const source = pageSource(page.width, page.height, scale);
    const ctx = smooth((source.resource as HTMLCanvasElement).getContext('2d', { willReadFrequently: true })!);
    for (const [id, r] of page.rects) {
      const raster = rasterise(byId.get(id)!, trims.get(id)!, scale);
      ctx.drawImage(raster, r.x * scale, r.y * scale);
      release(raster);
    }
    source.update();
    for (const [id, r] of page.rects) {
      const s = byId.get(id)!;
      const texture = new Texture({ source, frame: new Rectangle(r.x, r.y, r.w, r.h), orig: new Rectangle(0, 0, Math.ceil(s.w), Math.ceil(s.h)), trim: trims.get(id)! });
      baked.set(id, { texture, ax: s.ax, ay: s.ay, meta: s.meta });
    }
  }
  return { baked, scale };
}

/**
 * Sprites baked on first use (building levels 2 to 10, print stages): `get` returns the sprite once it is baked
 * and starts baking it the first time it is asked for. Until then the caller draws a fallback. Bakes at the
 * scale the world was baked at, from the same art manifest.
 */
export class LazySprites {
  private readonly pending = new Set<string>();

  constructor(
    private readonly map: Map<string, Baked>,
    private readonly opts: BakeOptions,
  ) {}

  get(id: string, make: () => SpriteArt): Baked | undefined {
    const hit = this.map.get(id);
    if (hit || this.pending.has(id)) return hit;
    this.bake([id], () => [make()]);
    return undefined;
  }

  /**
   * Whether every sprite of a group is baked; the first call bakes them all together, into as few atlas pages
   * as possible (a work loop's frames then share one texture: buildings keep batching while they play).
   */
  ready(ids: readonly string[], make: (id: string) => SpriteArt): boolean {
    let missing = false;
    for (const id of ids) if (!this.map.has(id)) missing = true;
    if (!missing) return true;
    const todo = ids.filter((id) => !this.map.has(id) && !this.pending.has(id));
    if (todo.length) this.bake(todo, () => todo.map(make));
    return false;
  }

  private bake(ids: readonly string[], make: () => SpriteArt[]): void {
    for (const id of ids) this.pending.add(id);
    void bakeAtlas(make(), { ...this.opts, budget: 0 })
      .then(({ baked }) => {
        for (const [key, value] of baked) this.map.set(key, value);
      })
      .catch((error: unknown) => console.warn(`Could not bake ${ids.join(', ')}`, error));
  }
}
