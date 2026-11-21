import { Container, Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { Dir } from '../../sim/state';
import { gridToWorld } from '../iso';
import { BACK, dirX, dirY, LEFT, RIGHT, SHAPES } from './belt-shape';

/**
 * The flat ground art of belts, drawn once with Pixi graphics into an atlas (so a belt is one sprite and the treads
 * still run): every belt shape x heading x tread phase. Tile-local grid maths, projected with `gridToWorld`, so every
 * camera view gets its own correct drawing. Colours are neutral: the layer tints belts per tier. Conduits are drawn
 * the same way by pipe-art.ts, which uses the helpers exported here.
 */

/** Tread steps per tread period (a third of a tile). */
export const PHASES = 6;
/** Treads per tile along a belt. */
export const TREADS = 3;

const COL = { base: 0x1c2234, rail: 0x7c88a8, railHi: 0xb4bfdc, tread: 0xffffff };
const MAX_ATLAS_PX = 4096;

export type Pt = readonly [number, number];

/** Tile-local grid point to cell-local world px (the tile centre is the origin). */
export function proj(x: number, y: number): Pt {
  const o = gridToWorld(0, 0);
  const p = gridToWorld(x, y);
  return [p.x - o.x, p.y - o.y];
}

/** The polygon of a band `half` tiles either side of a path (grid points), as flat world px. */
export function bandPoly(path: readonly Pt[], half: number, extend = 0.015): number[] {
  const n = path.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    const ex = i === 0 ? -tx * extend : i === n - 1 ? tx * extend : 0;
    const ey = i === 0 ? -ty * extend : i === n - 1 ? ty * extend : 0;
    const p = path[i]!;
    left.push([p[0] + ex - ty * half, p[1] + ey + tx * half]);
    right.push([p[0] + ex + ty * half, p[1] + ey - tx * half]);
  }
  return [...left, ...right.reverse()].flatMap(([x, y]) => proj(x, y));
}

function pathLength(path: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return len;
}

/**
 * Half widths of a belt in tiles: the rails nearly fill the tile (like Mindustry), so belts meet each other and
 * the square base plates of buildings beside them without a strip of bare ground (gaps showed at 0.31).
 */
const RAIL = 0.44;
const BED = 0.37;

/** One lane of a belt cell: the band's centre line and where along it treads run. */
interface Lane {
  pts: Pt[];
  /** Distance of `pts[0]` from the tile's back edge, so treads stay in step from tile to tile. */
  offset: number;
  /** Treads run in [from, to) on the tile's lattice (to < 0: no treads, a side inlet). */
  from: number;
  to: number;
  /** Lattice to distance along `pts`: 1 for straight lanes, the arc length for a bend (3 treads per tile there too). */
  scale: number;
}

/** A quarter circle around the inner corner, from the middle of the side edge to the middle of the front edge. */
function arc(side: Dir, rot: Dir): Pt[] {
  const sx = dirX(side) * 0.5;
  const sy = dirY(side) * 0.5;
  const fx = dirX(rot) * 0.5;
  const fy = dirY(rot) * 0.5;
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push([sx + fx - fx * Math.cos(a) - sx * Math.sin(a), sy + fy - fy * Math.cos(a) - sy * Math.sin(a)]);
  }
  return pts;
}

/**
 * The lanes of a belt shape. A single side feed bends (an arc); otherwise the main lane runs to the front (from
 * the back, or from the middle when nothing feeds the back: a T) and every side feed is a short inlet into it.
 */
function lanes(mask: number, rot: Dir): Lane[] {
  const sides: [number, Dir][] = [[LEFT, ((rot + 3) & 3) as Dir], [RIGHT, ((rot + 1) & 3) as Dir]];
  const feeds = sides.filter(([bit]) => mask & bit).map(([, d]) => d);
  const front: Pt = [dirX(rot) * 0.5, dirY(rot) * 0.5];
  if (!(mask & BACK) && feeds.length === 1) {
    const pts = arc(feeds[0]!, rot);
    return [{ pts, offset: 0, from: 0, to: 1, scale: pathLength(pts) }];
  }
  const back: Pt = [-dirX(rot) * 0.5, -dirY(rot) * 0.5];
  const main: Lane = mask & BACK ? { pts: [back, front], offset: 0, from: 0, to: 1, scale: 1 } : { pts: [[0, 0], front], offset: 0.5, from: 0, to: 0.5, scale: 1 };
  return [main, ...feeds.map((d): Lane => ({ pts: [[dirX(d) * 0.5, dirY(d) * 0.5], [0, 0]], offset: 0, from: 0, to: -1, scale: 1 }))];
}

/** Point and unit tangent at distance `s` along a polyline (grid points), into `o` and `d`. */
export function sample(pts: readonly Pt[], s: number, o: { x: number; y: number }, d: { x: number; y: number }): void {
  let rest = s;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    if (rest > len && i < pts.length - 1) {
      rest -= len;
      continue;
    }
    const t = Math.min(1, Math.max(0, rest / len));
    o.x = a[0] + (b[0] - a[0]) * t;
    o.y = a[1] + (b[1] - a[1]) * t;
    d.x = (b[0] - a[0]) / len;
    d.y = (b[1] - a[1]) / len;
    return;
  }
}

/** A chevron (">" along the lane) at distance `at` along `pts`. */
function chevron(g: Graphics, pts: readonly Pt[], at: number): void {
  const o = { x: 0, y: 0 };
  const d = { x: 0, y: 0 };
  sample(pts, at, o, d);
  const nx = -d.y;
  const ny = d.x;
  const w = 0.21;
  const l = 0.1;
  const v = [proj(o.x - d.x * l + nx * w, o.y - d.y * l + ny * w), proj(o.x + d.x * l, o.y + d.y * l), proj(o.x - d.x * l - nx * w, o.y - d.y * l - ny * w)];
  g.poly(v.flat(), false).stroke({ width: 4.2, color: COL.tread, alpha: 0.5, cap: 'round', join: 'round' });
}

/** The treads of a lane at `phase`, on the tile-to-tile lattice (a third of a tile apart). */
function treads(g: Graphics, lane: Lane, phase: number): void {
  for (let d = phase / PHASES / TREADS - lane.offset; d < lane.to; d += 1 / TREADS) {
    if (d >= lane.from) chevron(g, lane.pts, d * lane.scale);
  }
}

/**
 * One belt cell: rails, the lit rail edge, base, treads shifted by `phase` of `PHASES`. All rails go down before
 * any base, so where lanes meet (bends, inlets, T) the bases join into one bed instead of crossing.
 */
function drawBelt(g: Graphics, mask: number, rot: Dir, phase: number): void {
  const paths = lanes(mask, rot);
  for (const l of paths) g.poly(bandPoly(l.pts, RAIL)).fill(COL.rail);
  for (const l of paths) g.poly(bandPoly(l.pts, RAIL).slice(0, l.pts.length * 2), false).stroke({ width: 1.4, color: COL.railHi, alpha: 0.55 });
  for (const l of paths) g.poly(bandPoly(l.pts, BED)).fill(COL.base);
  for (const l of paths) treads(g, l, phase);
}

/** Packs `count` cells (drawn by `draw(g, index)`) into one atlas texture, returning each cell's sub-texture. */
export function atlas(renderer: Renderer, count: number, cw: number, ch: number, scale: number, draw: (g: Graphics, i: number) => void): Texture[] {
  const cols = Math.max(1, Math.floor(MAX_ATLAS_PX / scale / cw));
  const rows = Math.ceil(count / cols);
  const root = new Container();
  for (let i = 0; i < count; i++) {
    const g = new Graphics();
    g.position.set((i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2);
    draw(g, i);
    root.addChild(g);
  }
  const whole = renderer.generateTexture({ target: root, frame: new Rectangle(0, 0, cols * cw, rows * ch), resolution: scale, antialias: true });
  const out: Texture[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Texture({ source: whole.source, frame: new Rectangle((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch) }));
  }
  root.destroy({ children: true });
  return out;
}

/** The cell size in world px: a tile's screen box plus a margin for stroke widths. */
export function cellSize(): { cw: number; ch: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
    const [px, py] = proj(x, y);
    xs.push(px);
    ys.push(py);
  }
  return { cw: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 8, ch: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 8 };
}

/** Index helpers shared with the layer. */
export const beltCell = (mask: number, rot: number, phase: number): number => (((mask & 7) || BACK) * 4 + rot) * PHASES + phase;

export class BeltArt {
  /** Belt cells by `beltCell`. */
  readonly belts: Texture[];
  readonly cw: number;
  readonly ch: number;

  constructor(renderer: Renderer, scale: number) {
    const { cw, ch } = cellSize();
    this.cw = cw;
    this.ch = ch;
    const s = Math.min(2, Math.max(1, scale * 0.6));
    this.belts = atlas(renderer, SHAPES * 4 * PHASES, cw, ch, s, (g, i) => {
      const phase = i % PHASES;
      const rot = Math.floor(i / PHASES) % 4;
      const mask = Math.floor(i / PHASES / 4);
      if (mask > 0) drawBelt(g, mask, rot as Dir, phase);
    });
  }

  destroy(): void {
    for (const t of this.belts) t.destroy(false);
  }
}
