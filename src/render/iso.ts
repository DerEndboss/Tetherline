/**
 * The world projection. Three views share one API, so every caller works in both:
 * - `iso` (default): 2:1 isometric diamonds. Grid points (gx, gy) map to world pixels; tile (tx, ty) spans grid
 *   points tx..tx+1 / ty..ty+1. World y grows downwards, so tiles with a larger tx + ty are nearer the viewer.
 * - `steep`: a top-down camera looking north from `STEEP_ELEVATION` (50 degrees above the horizon): grid x runs
 *   right, grid y runs down, tiles are foreshortened rectangles and the south facades of tall things still show.
 * - `top`: the same camera straight down (90 degrees, like Mindustry): square tiles, heights add no screen offset.
 * The steep and top views share the screen geometry (`isTopDown()`); each reads its own pre-rendered sprite set
 * (public/art/<category>/steep/ and /top/, docs/art.md). The view is chosen once at boot (`setViewMode`, from
 * the settings); switching reloads the world.
 */
export const TILE_W = 128;
export const TILE_H = 64;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Top-down views: world px per tile edge across the screen. */
export const TOP_TILE = 96;
/** Camera elevation (radians above the horizon) of the steep view and the straight-down view. */
export const STEEP_ELEVATION = (50 * Math.PI) / 180;
export const TOP_ELEVATION = Math.PI / 2;
/** World px per tile edge down the screen: the ground is foreshortened by sin(elevation). */
export const STEEP_TILE_H = TOP_TILE * Math.sin(STEEP_ELEVATION);
export const TOP_TILE_H = TOP_TILE;
/** World px per tile unit of height in the iso view (78.38, `HEIGHT_PX` of the 3D kit). */
export const ISO_HEIGHT_PX = HALF_W * Math.SQRT2 * Math.cos(Math.asin(TILE_H / TILE_W));
/** World px per tile unit of height in the steep view and the straight-down view (zero: a height adds no offset). */
export const STEEP_HEIGHT_PX = TOP_TILE * Math.cos(STEEP_ELEVATION);
export const TOP_HEIGHT_PX = 0;

export type ViewMode = 'iso' | 'steep' | 'top';
export const VIEW_MODES: readonly ViewMode[] = ['iso', 'steep', 'top'];

let mode: ViewMode = 'iso';
/** World px per tile down the screen in a top-down view (steep or top). */
let rowH = TOP_TILE_H;

/** Chooses the projection. Call before the renderer is created; everything built later uses it. */
export function setViewMode(next: ViewMode): void {
  mode = next;
  rowH = next === 'steep' ? STEEP_TILE_H : TOP_TILE_H;
}

/** True in the steep and the straight-down view (square-ish tiles, grid x runs right); false in the iso view. */
export function isTopDown(): boolean {
  return mode !== 'iso';
}

/** True when `v` is a valid view name. */
export function isViewMode(v: unknown): v is ViewMode {
  return v === 'iso' || v === 'steep' || v === 'top';
}

export function viewMode(): ViewMode {
  return mode;
}

/**
 * Screen px of a height in the current view per iso world px: 1 in the iso view, about 0.34 top-down. Code that
 * lifts something by a height in iso px (a vat surface, a print head) multiplies by this.
 */
export function heightScale(): number {
  if (mode === 'iso') return 1;
  return (mode === 'steep' ? STEEP_HEIGHT_PX : TOP_HEIGHT_PX) / ISO_HEIGHT_PX;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function gridToWorld(gx: number, gy: number): Point {
  if (mode !== 'iso') return { x: gx * TOP_TILE, y: gy * rowH };
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H };
}

/** World x of a grid point without allocating (hot loops: belt items, lanes). */
export function worldX(gx: number, gy: number): number {
  return mode !== 'iso' ? gx * TOP_TILE : (gx - gy) * HALF_W;
}

/** World y of a grid point without allocating. */
export function worldY(gx: number, gy: number): number {
  return mode !== 'iso' ? gy * rowH : (gx + gy) * HALF_H;
}

export function worldToGrid(wx: number, wy: number): Point {
  if (mode !== 'iso') return { x: wx / TOP_TILE, y: wy / rowH };
  return { x: (wx / HALF_W + wy / HALF_H) / 2, y: (wy / HALF_H - wx / HALF_W) / 2 };
}

/** Centre of a tile's top face in world pixels. */
export function tileCenter(tx: number, ty: number): Point {
  return gridToWorld(tx + 0.5, ty + 0.5);
}

/** The tile whose top face contains a world point. */
export function worldToTile(wx: number, wy: number): Point {
  const g = worldToGrid(wx, wy);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/** Depth for sorting: larger is drawn later (in front). */
export function depthOf(tx: number, ty: number): number {
  return mode !== 'iso' ? ty * 2 : tx + ty;
}

/** Half the screen width of a footprint of w x h tiles and how far it reaches below its centre (world px). */
export function footprintExtent(w: number, h: number): { halfW: number; below: number } {
  if (mode !== 'iso') return { halfW: (w * TOP_TILE) / 2, below: (h * rowH) / 2 };
  return { halfW: (w + h) * (HALF_W / 2), below: (w + h) * (HALF_H / 2) };
}

/** A circle of radius `r` tiles on the ground as a screen ellipse (radii in world px). */
export function groundEllipse(r: number): { rx: number; ry: number } {
  if (mode !== 'iso') return { rx: r * TOP_TILE, ry: r * rowH };
  return { rx: r * HALF_W * Math.SQRT2, ry: r * HALF_H * Math.SQRT2 };
}

/**
 * Tiles that may be visible in a world rectangle, clamped to the map. `pad` extends the range so tall
 * sprites standing on tiles just below the view edge are kept.
 */
export function visibleTileRange(view: Rect, mapW: number, mapH: number, pad = 2): TileRange {
  const corners = [
    worldToGrid(view.left, view.top),
    worldToGrid(view.right, view.top),
    worldToGrid(view.left, view.bottom),
    worldToGrid(view.right, view.bottom),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs)) - pad),
    y0: Math.max(0, Math.floor(Math.min(...ys)) - pad),
    x1: Math.min(mapW - 1, Math.ceil(Math.max(...xs)) + pad),
    y1: Math.min(mapH - 1, Math.ceil(Math.max(...ys)) + pad),
  };
}

/** Whether a tile's face (grown by `margin` px for tall sprites) overlaps the view. */
export function tileInView(tx: number, ty: number, view: Rect, margin: number): boolean {
  const c = tileCenter(tx, ty);
  const hw = mode !== 'iso' ? TOP_TILE / 2 : HALF_W;
  const hh = mode !== 'iso' ? rowH / 2 : HALF_H;
  return c.x + hw + margin >= view.left && c.x - hw - margin <= view.right && c.y + hh + margin >= view.top && c.y - hh - margin * 2 <= view.bottom;
}

/** World-pixel bounds of the whole map's top faces. */
export function mapBounds(mapW: number, mapH: number): Rect {
  if (mode !== 'iso') return { left: 0, top: 0, right: mapW * TOP_TILE, bottom: mapH * rowH };
  return { left: -mapH * HALF_W, top: 0, right: mapW * HALF_W, bottom: (mapW + mapH) * HALF_H };
}
