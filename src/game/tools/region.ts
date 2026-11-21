import { gridToWorld, isTopDown, worldToGrid, type Rect } from '../../render/iso';
import type { TileBox } from '../../sim/commands';
import { boxArea, MAX_TILES, normBox, type Tile } from './geometry';

/** A point in world px (what the camera turns a screen point into: `camera.screenToWorld`, offset included). */
export interface WorldPt {
  x: number;
  y: number;
}

/** Something that says which footprints it covers (demolish, copy, fill). */
export interface FootprintArea {
  hasFootprint(x: number, y: number, size: number): boolean;
}

/**
 * The area a drag covers (X demolish, B / Ctrl+C copy, Shift fill, the right-drag sweep).
 *
 * - **iso**: the drag is a rectangle on the SCREEN, axis-aligned, left to right and top to bottom (not a diamond on the ground).
 *   Its two corners are world points; the camera only moves and scales,
 *   so a screen rectangle is a world rectangle (this is also why the camera offset needs no special care here: the
 *   renderer asks `camera.screenToWorld`, which includes it). A tile is in when its centre lies in the rectangle, a
 *   building when its footprint centre does. A drag so small that it holds no tile centre takes the tile it started on.
 * - **steep and top**: the grid is axis-aligned on the screen, so the rectangle IS the box of tiles between the first
 *   and the last tile (every tile it touches, as before).
 * - A drag with no world points (tests, tile-only callers) is a box of tiles in every view.
 */
export class Region {
  /** The screen rectangle in world px (iso); null for a box of tiles. */
  readonly rect: Rect | null;
  /** The tight box around the covered tiles (inclusive): what a blueprint, a hint or the old box API sees. */
  readonly box: TileBox;
  /** More tiles than one drag may cover (the preview and queue stay sane): nothing is built or cleared. */
  readonly tooBig: boolean;
  private readonly list: Tile[] | null;
  /** The tile the drag began on, when the rectangle holds no tile centre and so takes that one. */
  private readonly fallback: Tile | null;

  private constructor(rect: Rect | null, box: TileBox, tooBig: boolean, list: Tile[] | null, fallback: Tile | null) {
    this.rect = rect;
    this.box = box;
    this.tooBig = tooBig;
    this.list = list;
    this.fallback = fallback;
  }

  /** A box of tiles (inclusive corners). */
  static ofBox(box: TileBox): Region {
    return new Region(null, box, boxArea(box) > MAX_TILES, null, null);
  }

  /**
   * The area of a drag from tile `from` (at world point `fromAt`) to tile `to` (at `toAt`), on a map of mapW x mapH.
   * Without both world points, or in a top-down view, it is the box of tiles between the two.
   */
  static ofDrag(from: Tile, fromAt: WorldPt | null, to: Tile, toAt: WorldPt | null, mapW: number, mapH: number): Region {
    if (!fromAt || !toAt || isTopDown()) return Region.ofBox(normBox(from, to));
    const rect: Rect = { left: Math.min(fromAt.x, toAt.x), top: Math.min(fromAt.y, toAt.y), right: Math.max(fromAt.x, toAt.x), bottom: Math.max(fromAt.y, toAt.y) };
    const found = tilesInRect(rect, mapW, mapH);
    if (found === null) return new Region(rect, normBox(from, to), true, null, null);
    if (!found.length) return new Region(rect, normBox(from, from), false, [from], from);
    return new Region(rect, boxOf(found), false, found, null);
  }

  /** Whether a tile is covered. */
  has(x: number, y: number): boolean {
    if (!this.rect) return x >= this.box.x0 && x <= this.box.x1 && y >= this.box.y0 && y <= this.box.y1;
    if (this.fallback) return x === this.fallback.x && y === this.fallback.y;
    return inRect(this.rect, centreOf(x, y, 1));
  }

  /** Whether a building's footprint (top-left x, y, side `size`) is covered: its centre in the rectangle, or (a box) any overlap. */
  hasFootprint(x: number, y: number, size: number): boolean {
    if (!this.rect) return x <= this.box.x1 && y <= this.box.y1 && x + size > this.box.x0 && y + size > this.box.y0;
    if (this.fallback) return this.fallback.x >= x && this.fallback.y >= y && this.fallback.x < x + size && this.fallback.y < y + size;
    return inRect(this.rect, centreOf(x, y, size));
  }

  /** Every covered tile (rows top to bottom). Empty when `tooBig`. */
  tiles(): Tile[] {
    if (this.tooBig) return [];
    if (this.list) return this.list;
    const b = this.box;
    const out: Tile[] = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) out.push({ x, y });
    return out;
  }

  /** How many tiles are covered. */
  get count(): number {
    return this.list ? this.list.length : this.tooBig ? 0 : boxArea(this.box);
  }
}

/** The world point of a footprint's centre (the tile centre for size 1). */
function centreOf(x: number, y: number, size: number): WorldPt {
  return gridToWorld(x + size / 2, y + size / 2);
}

const inRect = (r: Rect, p: WorldPt): boolean => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

function boxOf(tiles: readonly Tile[]): TileBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tiles) {
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x);
    y1 = Math.max(y1, t.y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * The tiles of a map whose centre lies in a world rectangle: the grid box around the rectangle's four corners,
 * filtered. null when that box is far bigger than a drag may cover (nothing is enumerated then).
 */
export function tilesInRect(r: Rect, mapW: number, mapH: number): Tile[] | null {
  const corners = [worldToGrid(r.left, r.top), worldToGrid(r.right, r.top), worldToGrid(r.left, r.bottom), worldToGrid(r.right, r.bottom)];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
  const x1 = Math.min(mapW - 1, Math.ceil(Math.max(...corners.map((c) => c.x))));
  const y1 = Math.min(mapH - 1, Math.ceil(Math.max(...corners.map((c) => c.y))));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES * 2) return null;
  const out: Tile[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inRect(r, centreOf(x, y, 1))) out.push({ x, y });
  return out.length > MAX_TILES ? null : out;
}

/** The covered tiles of the sweep area as row runs (one box per run): few commands for a big area. */
export function rowRuns(tiles: readonly Tile[]): TileBox[] {
  const out: TileBox[] = [];
  let run: TileBox | null = null;
  for (const t of tiles) {
    if (run && run.y0 === t.y && run.x1 + 1 === t.x) run.x1 = t.x;
    else out.push((run = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }));
  }
  return out;
}
