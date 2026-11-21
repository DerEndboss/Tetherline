import type { Spot } from './spots';

/**
 * What the guide needs of the world view (main.tsx passes the WorldView, which has both): the screen position of a
 * tile and the camera to move. A structural type so the guide never imports Pixi.
 */
export interface TutorialView {
  screenOfTile(x: number, y: number): { x: number; y: number };
  camera: {
    screenToWorld(sx: number, sy: number): { x: number; y: number };
    lookAt(wx: number, wy: number): void;
  };
}

/** The screen rectangle of a spot's ground footprint (centre and size in px). */
export interface ScreenBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Projects the four ground corners of a spot, in any camera angle. */
export function boxOf(view: TutorialView, s: Spot): ScreenBox {
  // screenOfTile points at a tile's middle, so a grid corner is half a tile before it
  const corners = [
    [0, 0],
    [s.w, 0],
    [0, s.h],
    [s.w, s.h],
  ].map(([dx, dy]) => view.screenOfTile(s.x + (dx ?? 0) - 0.5, s.y + (dy ?? 0) - 0.5));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/** Distance from a point to a cover (0 when inside). */
function distanceTo(x: number, y: number, c: Cover): number {
  return Math.hypot(Math.max(c.left - x, 0, x - c.right), Math.max(c.top - y, 0, y - c.bottom));
}

const CLEAR_FULL = 140;
const CLEAR_MIN = 40;

/**
 * The screen point where something that is looked at is best put: the middle of the screen when nothing covers it,
 * else the free point nearest to the middle that has some room around it (a card across the middle of a phone on
 * its side leaves a strip beside it). Null when the screen is all covered.
 */
export function freePoint(vw: number, vh: number, covers: readonly Cover[]): { x: number; y: number } | null {
  const step = 24;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let y = step; y < vh; y += step) {
    for (let x = step; x < vw; x += step) {
      const clear = Math.min(CLEAR_FULL, ...covers.map((c) => distanceTo(x, y, c)));
      if (clear < CLEAR_MIN) continue;
      const score = Math.hypot(x - vw / 2, y - vh / 2) - clear * 0.8;
      if (score < bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Moves the camera so the spot is in the middle of the free part of the screen (see `freePoint`). */
export function focusOn(view: TutorialView, s: Spot, covers: readonly Cover[] = hudCovers(performance.now(), true)): void {
  const at = (): { x: number; y: number } => view.screenOfTile(s.x + s.w / 2 - 0.5, s.y + s.h / 2 - 0.5);
  const p = at();
  const w = view.camera.screenToWorld(p.x, p.y);
  view.camera.lookAt(w.x, w.y); // the spot is in the middle of the screen now
  const to = freePoint(window.innerWidth, window.innerHeight, covers);
  if (!to) return;
  const mid = at();
  if (Math.abs(mid.x - to.x) < 1 && Math.abs(mid.y - to.y) < 1) return;
  // moving the view centre by d moves the spot by -d: put the centre where the spot would land opposite the target
  const q = view.camera.screenToWorld(2 * mid.x - to.x, 2 * mid.y - to.y);
  view.camera.lookAt(q.x, q.y);
}

/** Where a marker sits on screen: its own place, or (when that is off screen) the nearest free point of the screen edge. */
export interface Placement {
  x: number;
  y: number;
  off: boolean;
  /** Direction to the target in degrees (0 = right), for the edge arrow. */
  angle: number;
}

export interface Inset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A screen rectangle of a HUD piece that hides the map under it. */
export interface Cover {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inside = (x: number, y: number, c: Cover, gap: number): boolean => x > c.left - gap && x < c.right + gap && y > c.top - gap && y < c.bottom + gap;

/** The four points just outside a cover, in the order a marker would rather slide: the nearest first is chosen by the caller. */
function exits(c: Cover, gap: number): { x: number; y: number }[] {
  return [
    { x: c.left - gap, y: NaN },
    { x: c.right + gap, y: NaN },
    { x: NaN, y: c.top - gap },
    { x: NaN, y: c.bottom + gap },
  ];
}

/**
 * Moves a point that lies under a HUD piece to the nearest spot beside it (sliding along one axis only, so an edge
 * marker stays on its edge), within the screen and not under another piece. Gives the point back when nothing fits.
 */
export function clearOf(at: { x: number; y: number }, covers: readonly Cover[], vw: number, vh: number, gap = 10): { x: number; y: number } {
  let cur = at;
  for (let round = 0; round <= covers.length; round++) {
    const hit = covers.find((c) => inside(cur.x, cur.y, c, gap));
    if (!hit) return cur;
    const free = exits(hit, gap)
      .map((e) => ({ x: Number.isNaN(e.x) ? cur.x : e.x, y: Number.isNaN(e.y) ? cur.y : e.y }))
      .filter((e) => e.x >= gap && e.x <= vw - gap && e.y >= gap && e.y <= vh - gap)
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
    const next = free.find((e) => !covers.some((c) => c !== hit && inside(e.x, e.y, c, gap)));
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

export function place(box: ScreenBox, vw: number, vh: number, inset: Inset, covers: readonly Cover[] = []): Placement {
  const x = Math.min(vw - inset.right, Math.max(inset.left, box.cx));
  const y = Math.min(vh - inset.bottom, Math.max(inset.top, box.cy));
  const off = x !== box.cx || y !== box.cy;
  const at = off ? clearOf({ x, y }, covers, vw, vh) : { x, y };
  return { x: at.x, y: at.y, off, angle: off ? (Math.atan2(box.cy - at.y, box.cx - at.x) * 180) / Math.PI : 90 };
}

/** HUD pieces that hide the map under them (the palette, the orders, the core card, the drone chip, the tutorial card, the tool bar). */
const COVERS = ['.dock-palette', '.dock-orders', '.resources', '.dock-drones', '.tut-card', '.dock-tools'];

const MEASURE_EVERY_MS = 500;
let measured: { at: number; rects: Cover[] } = { at: -Infinity, rects: [] };

/**
 * The screen rectangles of the HUD pieces that cover the map. Layout is read only when asked (an off-screen marker
 * needs it to find free ground) and at most twice a second; a steady view asks for nothing.
 */
export function hudCovers(now = performance.now(), fresh = false): readonly Cover[] {
  if (!fresh && now - measured.at < MEASURE_EVERY_MS) return measured.rects;
  const rects: Cover[] = [];
  for (const sel of COVERS) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  measured = { at: now, rects };
  return rects;
}

/** Whether a screen point is on the map and not under a HUD panel. */
export function isOpenGround(x: number, y: number, vw: number, vh: number): boolean {
  if (x < 110 || y < 110 || x > vw - 110 || y > vh - 110) return false;
  return !COVERS.some((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r !== undefined && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

/** Whether a spot can be seen: its middle and the middles of its four edges are on screen and under no panel. */
export function canSee(view: TutorialView, s: Spot): boolean {
  const b = boxOf(view, s);
  const pts = [
    [b.cx, b.cy],
    [b.cx, b.cy - b.h / 2],
    [b.cx, b.cy + b.h / 2],
    [b.cx - b.w / 2, b.cy],
    [b.cx + b.w / 2, b.cy],
  ];
  return pts.every(([x, y]) => isOpenGround(x!, y!, window.innerWidth, window.innerHeight));
}
