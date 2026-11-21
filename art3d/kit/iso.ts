import { OrthographicCamera, Vector3 } from 'three';
import { STEEP_ELEVATION, STEEP_HEIGHT_PX, STEEP_TILE_H, TILE_H, TILE_W, TOP_ELEVATION, TOP_HEIGHT_PX, TOP_TILE, TOP_TILE_H, type ViewMode } from '../../src/render/iso';

/**
 * The game's projections as real orthographic cameras, derived from `src/render/iso.ts` so a rendered sprite
 * sits on its tiles exactly. Three views (docs/art.md, "Three camera angles"):
 * - `iso` (default): the 2:1 isometric camera, looking from +X+Z, 30 degrees down.
 * - `steep`: a camera looking north (from +Z) 50 degrees above the horizon; grid x runs right.
 * - `top`: the same camera straight down (90 degrees): plan view, a height adds no screen offset.
 * `npm run art` renders every world sprite in all three; models never build their own camera.
 *
 * Model space (tile units, three.js is Y-up): +X is grid x, +Z is grid y, +Y is up. One unit is one tile edge.
 * The origin is the sprite's anchor: a tile centre for 1x1 things, the footprint centre for buildings.
 *
 * World px of a model point relative to the anchor (what the game calls sprite px):
 *   iso: sx = (X - Z) * TILE_W / 2,  sy = (X + Z) * TILE_H / 2 - Y * HEIGHT_PX
 *   steep/top: sx = X * TOP_TILE,    sy = Z * tileH - Y * heightPx   (steep: tileH 73.5, heightPx 61.7; top: 96, 0)
 */

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Camera elevation: 2:1 diamonds mean sin(elevation) = TILE_H / TILE_W, i.e. 30 degrees. */
export const ELEVATION = Math.asin(TILE_H / TILE_W);
/** World px per model unit along the screen axes (one tile's diagonal half is 64 px on screen). */
export const UNIT_PX = HALF_W * Math.SQRT2;
/** World px per model unit of height in the iso view (78.38; the SVG art used 78.4 as Z_PX_PER_TILE). Models use it via `px`. */
export const HEIGHT_PX = UNIT_PX * Math.cos(ELEVATION);

/** Converts a height in world px (as the old SVG art and `meta.top` measure it) to model units. */
export const px = (worldPx: number): number => worldPx / HEIGHT_PX;

let view: ViewMode = 'iso';

/** The view the renderer draws (set by page.ts per render; models never need it). */
export function setArtView(v: ViewMode): void {
  view = v;
}

export function artView(): ViewMode {
  return view;
}

/** Per-view numbers of the two top-down projections. */
const FLAT = {
  steep: { tileH: STEEP_TILE_H, height: STEEP_HEIGHT_PX, elevation: STEEP_ELEVATION },
  top: { tileH: TOP_TILE_H, height: TOP_HEIGHT_PX, elevation: TOP_ELEVATION },
} as const;

const isFlat = (): boolean => view !== 'iso';

/** World px per model unit of height in the current view (zero in the straight-down view). */
export function heightPx(): number {
  return view === 'iso' ? HEIGHT_PX : FLAT[view].height;
}

/**
 * World px that one model unit of height is worth for things the game stacks on a sprite (the `top` meta: bars,
 * menu anchors): the straight-down view has no real height offset, so it uses a small stand-in lift.
 */
export function topPx(): number {
  return view === 'top' ? TOP_TILE * 0.22 : heightPx();
}

/** World px per model unit across the screen in the current view. */
function unitPx(): number {
  return isFlat() ? TOP_TILE : UNIT_PX;
}

/**
 * Turn (radians about +Y) of the light rig in the current view, so the key light keeps coming from the screen's
 * left and a little in front, and the rim from behind, whichever way the camera looks.
 */
export function viewYaw(): number {
  return isFlat() ? -Math.PI / 4 : 0;
}

export interface ScreenPt {
  x: number;
  y: number;
}

/** A model point in world px relative to the anchor (y grows downwards, like the game). */
export function project(x: number, y: number, z: number): ScreenPt {
  if (view !== 'iso') return { x: x * TOP_TILE, y: z * FLAT[view].tileH - y * FLAT[view].height };
  return { x: (x - z) * HALF_W, y: (x + z) * HALF_H - y * HEIGHT_PX };
}

/** Model-space step that moves a point one world px to the right on screen without moving it vertically. */
export function screenRight(): Vector3 {
  return isFlat() ? new Vector3(1 / TOP_TILE, 0, 0) : new Vector3(1 / TILE_W, 0, -1 / TILE_W);
}

/** A box in world px relative to the anchor: left/top are negative for most sprites. */
export interface PxBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Unit vector from the scene towards the iso camera. */
export const VIEW_DIR = new Vector3(Math.cos(ELEVATION) * Math.SQRT1_2, Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.SQRT1_2);
/** Unit vectors from the scene towards the steep and the straight-down camera (north is -Z, so they look from +Z). */
export const STEEP_VIEW_DIR = new Vector3(0, Math.sin(STEEP_ELEVATION), Math.cos(STEEP_ELEVATION));
export const TOP_VIEW_DIR = new Vector3(0, 1, 0);

/**
 * The orthographic camera of the current view that sees `box` (world px around the anchor). `jx, jy` shift the
 * view by a fraction of an output pixel (`scale` output px per world px) for anti-aliasing by accumulation.
 */
export function isoCamera(box: PxBox, scale: number, jx = 0, jy = 0): OrthographicCamera {
  const sx = jx / scale;
  const sy = jy / scale;
  const u = unitPx();
  const cam = new OrthographicCamera((box.left + sx) / u, (box.right + sx) / u, -(box.top + sy) / u, -(box.bottom + sy) / u, 0.1, 400);
  cam.position.copy(view === 'top' ? TOP_VIEW_DIR : view === 'steep' ? STEEP_VIEW_DIR : VIEW_DIR).multiplyScalar(200);
  // straight down the world's up axis is degenerate: north (-Z) is screen-up there
  if (view === 'top') cam.up.set(0, 0, -1);
  else cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}
