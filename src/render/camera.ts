import { STEEP_TILE_H, TILE_H, TILE_W, TOP_TILE, TOP_TILE_H, viewMode, type Point, type Rect } from './iso';

/**
 * 2D camera over the world: `x, y` is the world point at the screen centre. Pure math, no DOM, so it is
 * testable. `version` increases on every change; the renderer uses it to skip culling work.
 */
/** The usual farthest zoom; a bigger map may go further (fitMinZoom). */
const FAR_ZOOM = 0.1;

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  /** Far enough out to see most of a large map. */
  minZoom = FAR_ZOOM;
  maxZoom = MAX_ZOOM;
  version = 0;
  /**
   * Screen-px shift of the view centre: a panel covering part of the screen moves the centre into the
   * part that is still visible. Picking and culling use it too, so taps stay exact.
   */
  offsetX = 0;
  offsetY = 0;
  /** Centre stays inside these world bounds. */
  bounds: Rect | null = null;

  resize(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.fitMinZoom();
    this.changed();
  }

  /** The farthest zoom: 0.1, or further out until the whole map (bounds) fits the screen, never below 0.05. */
  fitMinZoom(): void {
    const b = this.bounds;
    const fit = b ? Math.min(this.viewW / Math.max(1, b.right - b.left), this.viewH / Math.max(1, b.bottom - b.top)) : FAR_ZOOM;
    this.minZoom = Math.max(0.05, Math.min(FAR_ZOOM, fit));
    if (this.zoom < this.minZoom) this.zoom = this.minZoom;
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: this.x + (sx - this.viewW / 2 - this.offsetX) / this.zoom,
      y: this.y + (sy - this.viewH / 2 - this.offsetY) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2 + this.offsetX,
      y: (wy - this.y) * this.zoom + this.viewH / 2 + this.offsetY,
    };
  }

  /** Sets the view-centre shift in screen px (see offsetX); bumps `version` only on a visible change. */
  setOffset(x: number, y: number): void {
    if (Math.abs(x - this.offsetX) < 0.25 && Math.abs(y - this.offsetY) < 0.25) return;
    this.offsetX = x;
    this.offsetY = y;
    this.changed();
  }

  lookAt(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.changed();
  }

  /** Moves the view by a screen-space drag delta (content follows the finger). */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.changed();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    this.changed();
  }

  /** Zooms by `factor`, keeping the world point under the screen point (sx, sy) in place. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.changed();
  }

  /** The world rectangle currently on screen. */
  viewRect(): Rect {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    const cx = this.x - this.offsetX / this.zoom;
    const cy = this.y - this.offsetY / this.zoom;
    return { left: cx - halfW, top: cy - halfH, right: cx + halfW, bottom: cy + halfH };
  }

  private changed(): void {
    if (this.bounds) {
      this.x = Math.min(this.bounds.right, Math.max(this.bounds.left, this.x));
      this.y = Math.min(this.bounds.bottom, Math.max(this.bounds.top, this.y));
    }
    this.version += 1;
  }
}

/** The closest the camera may zoom in. */
export const MAX_ZOOM = 2.5;
/** Texels per world px of the pre-rendered 3D art (public/art): crisp at MAX_ZOOM on a 2x screen. */
export const ART_SCALE = 5;

/**
 * Sprites are baked at screen resolution for the closest zoom (device px per world px at MAX_ZOOM), so a sprite
 * is never upscaled, however far the player zooms in on a HiDPI screen. Capped at the 3D art's own scale.
 * The bake may still go a little lower when the texel budget is tight (`planScale` in bake.ts).
 */
export function bakeScaleFor(resolution: number): number {
  return Math.min(ART_SCALE, Math.max(1, resolution * MAX_ZOOM));
}

/**
 * Start zoom: the base and the first rings of rubble fill a phone. Larger screens get closer too (up to 1.3),
 * so the base stays the hero on a desktop, but never so close that the baked sprites (`bakeScale` texels per
 * world px) are upscaled.
 */
export function startZoom(viewW: number, viewH: number, resolution = 1, bakeScale = bakeScaleFor(resolution)): number {
  // the steep and top-down views' tiles cover more world px: show the same ground area as the iso view
  const view = viewMode();
  const area = view === 'iso' ? (TILE_W * TILE_H) / 2 : TOP_TILE * (view === 'top' ? TOP_TILE_H : STEEP_TILE_H);
  const k = Math.sqrt(area / ((TILE_W * TILE_H) / 2));
  const fit = Math.min(viewW / (TILE_W * 4.9 * k), viewH / (TILE_H * 9 * k));
  const sharp = Math.max(1, Math.min(1.3, bakeScale / resolution));
  return Math.min(sharp, Math.max(0.45, fit));
}
