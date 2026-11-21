import { opposite } from '../sim/grid';
import type { Dir } from '../sim/state';

export interface LineTile {
  x: number;
  y: number;
  rot: Dir;
}

interface Pt {
  x: number;
  y: number;
}

/** Whether a belt tile may go here (free ground, or a belt that is simply turned). */
export type FreeTile = (x: number, y: number) => boolean;

/**
 * How well a belt end at (x, y) facing `d` hands its items on: 0 = to nothing, more = a better target.
 * `straight` = `d` is the way the line came (the tile ahead), else the end would have to turn.
 */
export type Feeds = (x: number, y: number, d: Dir, straight: boolean) => number;

/** What a route knows about the ground it crosses; `routePath` takes a bare `FreeTile` too. */
export interface Terrain {
  free: FreeTile;
  /**
   * Interior tiles only: whether the line may run over (x, y) arriving heading `inDir` and leaving heading `outDir`.
   * `direct` = the player drags straight over it (a plain L), not a detour the search picked.
   */
  pass?: (x: number, y: number, inDir: Dir, outDir: Dir, direct: boolean) => boolean;
  /** How well a belt end hands its items on (see `Feeds`); without it the last tile keeps the way it came. */
  feeds?: Feeds;
  /**
   * The facing the first or last tile of a line may take when it lies on a belt that is already there: `rot`, or
   * the way that belt runs when turning it sideways would cut its line. Not asked for a single tile.
   */
  guard?: (x: number, y: number, rot: Dir) => Dir;
  /** True = the player picked the axis order (Ctrl): do not swap it to aim the last segment at a target. */
  keepAxis?: boolean;
}

function dirOf(dx: number, dy: number): Dir {
  if (dx > 0) return 0;
  if (dx < 0) return 2;
  return dy > 0 ? 1 : 3;
}

/** The tiles of an L: along one axis first, then the other (a straight line when they share a row or column). */
function lPoints(a: Pt, b: Pt, xFirst: boolean): Pt[] {
  const pts: Pt[] = [{ ...a }];
  const go = (axis: 'x' | 'y'): void => {
    const last = pts[pts.length - 1]!;
    const target = b[axis];
    const s = Math.sign(target - last[axis]);
    for (let v = last[axis] + s; s !== 0 && v !== target + s; v += s) pts.push(axis === 'x' ? { x: v, y: last.y } : { x: last.x, y: v });
  };
  go(xFirst ? 'x' : 'y');
  go(xFirst ? 'y' : 'x');
  return pts;
}

/** Every tile faces the next one (corners turn on their own), the last keeps the way it came; a single tile keeps `rot`. */
function facing(pts: Pt[], rot: Dir): LineTile[] {
  return pts.map((p, i) => {
    const next = pts[i + 1];
    const prev = pts[i - 1];
    if (next) return { ...p, rot: dirOf(next.x - p.x, next.y - p.y) };
    if (prev) return { ...p, rot: dirOf(p.x - prev.x, p.y - prev.y) };
    return { ...p, rot };
  });
}

/** Which axis a drag starts along: the first tile the pointer moved to decides (so a line does not flip while dragging). */
export function firstAxis(a: Pt, b: Pt): boolean {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
}

/**
 * The tiles of a dragged belt (or conduit) line from `a` to `b`: along the longer axis first (or the other one
 * with `xFirst`), then the other, each tile facing the next one (corners turn on their own). A single tile keeps `rot`.
 */
export function linePath(a: Pt, b: Pt, rot: Dir, xFirst: boolean = firstAxis(a, b)): LineTile[] {
  return facing(lPoints(a, b, xFirst), rot);
}

/* ---------- Routing around obstacles ---------- */

/** Extra cost of a bend, in tiles: prefers long straight runs. */
const TURN_COST = 2.5;
/** How far outside the two end points the search may wander. */
const MARGIN = 14;
const MAX_SIDE = 220;

/** A binary min-heap of [priority, value] pairs. */
class Heap {
  private readonly p: number[] = [];
  private readonly v: number[] = [];

  get size(): number {
    return this.p.length;
  }

  push(priority: number, value: number): void {
    let i = this.p.length;
    this.p.push(priority);
    this.v.push(value);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.p[up]! <= priority) break;
      this.swap(i, up);
      i = up;
    }
  }

  pop(): number {
    const top = this.v[0]!;
    const lastP = this.p.pop()!;
    const lastV = this.v.pop()!;
    if (this.p.length) {
      this.p[0] = lastP;
      this.v[0] = lastV;
      this.down();
    }
    return top;
  }

  private down(): void {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.p.length && this.p[l]! < this.p[m]!) m = l;
      if (r < this.p.length && this.p[r]! < this.p[m]!) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }

  private swap(i: number, j: number): void {
    [this.p[i], this.p[j]] = [this.p[j]!, this.p[i]!];
    [this.v[i], this.v[j]] = [this.v[j]!, this.v[i]!];
  }
}

const STEPS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

interface Grid {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Cheapest route with few turns from `a` to `b` through free tiles inside a box around them; null when none. */
function search(a: Pt, b: Pt, t: Terrain): Pt[] | null {
  const g: Grid = {
    x0: Math.min(a.x, b.x) - MARGIN,
    y0: Math.min(a.y, b.y) - MARGIN,
    w: Math.min(MAX_SIDE, Math.abs(a.x - b.x) + 2 * MARGIN + 1),
    h: Math.min(MAX_SIDE, Math.abs(a.y - b.y) + 2 * MARGIN + 1),
  };
  const state = (x: number, y: number, d: number): number => (((y - g.y0) * g.w + (x - g.x0)) << 2) | d;
  const inside = (x: number, y: number): boolean => x >= g.x0 && y >= g.y0 && x < g.x0 + g.w && y < g.y0 + g.h;
  /** Whether the move (x, y) -> d' may be taken: the next tile is free and (x, y) can be left that way. */
  const allowed = (x: number, y: number, d: number, nd: number): boolean => {
    const nx = x + STEPS[nd]![0];
    const ny = y + STEPS[nd]![1];
    if (!inside(nx, ny) || !t.free(nx, ny)) return false;
    return (x === a.x && y === a.y) || !t.pass || t.pass(x, y, d as Dir, nd as Dir, false);
  };
  const cost = new Float32Array(g.w * g.h * 4).fill(Infinity);
  const from = new Int32Array(g.w * g.h * 4).fill(-1);
  const heap = new Heap();
  for (let d = 0; d < 4; d++) {
    cost[state(a.x, a.y, d)] = 0;
    heap.push(0, state(a.x, a.y, d));
  }
  while (heap.size) {
    const s = heap.pop();
    const d = s & 3;
    const cell = s >> 2;
    const x = g.x0 + (cell % g.w);
    const y = g.y0 + Math.floor(cell / g.w);
    if (x === b.x && y === b.y) return unwind(from, s, g);
    for (let nd = 0; nd < 4; nd++) {
      if (!allowed(x, y, d, nd)) continue;
      const nx = x + STEPS[nd]![0];
      const ny = y + STEPS[nd]![1];
      const ns = state(nx, ny, nd);
      const c = cost[s]! + 1 + (nd === d ? 0 : TURN_COST);
      if (c >= cost[ns]!) continue;
      cost[ns] = c;
      from[ns] = s;
      heap.push(c + Math.abs(nx - b.x) + Math.abs(ny - b.y), ns);
    }
  }
  return null;
}

function unwind(from: Int32Array, end: number, g: Grid): Pt[] {
  const out: Pt[] = [];
  for (let s = end; s >= 0; s = from[s]!) {
    const cell = s >> 2;
    out.push({ x: g.x0 + (cell % g.w), y: g.y0 + Math.floor(cell / g.w) });
  }
  return out.reverse();
}

/** Whether a plain L may be laid: its tiles are free and no belt it crosses would be cut. */
function legal(pts: Pt[], t: Terrain): boolean {
  return pts.every((p, i) => {
    if (!t.free(p.x, p.y)) return false;
    const prev = pts[i - 1];
    const next = pts[i + 1];
    if (!prev || !next || !t.pass) return true;
    return t.pass(p.x, p.y, dirOf(p.x - prev.x, p.y - prev.y), dirOf(next.x - p.x, next.y - p.y), true);
  });
}

/** Whether the last segment of an L points straight at something that takes the items. */
function pointsAtTarget(pts: Pt[], t: Terrain): boolean {
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return !!last && !!prev && !!t.feeds && t.feeds(last.x, last.y, dirOf(last.x - prev.x, last.y - prev.y), true) > 0;
}

/** Both plain L's are free: the one the player's axis gives, unless only the other one ends pointing at a target. */
function betterL(first: Pt[], second: Pt[], t: Terrain): Pt[] {
  return !t.keepAxis && !pointsAtTarget(first, t) && pointsAtTarget(second, t) ? second : first;
}

/** The tiles a drag lays, before they are given their facing. */
function pickPoints(a: Pt, b: Pt, t: Terrain, xFirst: boolean): Pt[] {
  const first = lPoints(a, b, xFirst);
  const second = lPoints(a, b, !xFirst);
  const ok1 = legal(first, t);
  const ok2 = legal(second, t);
  if (ok1 && ok2) return betterL(first, second, t);
  if (ok1 || ok2) return ok1 ? first : second;
  const around = t.free(a.x, a.y) && t.free(b.x, b.y) ? search(a, b, t) : null;
  return around ?? first;
}

/**
 * The facing of a belt end at (x, y) that hands its items on best. It keeps `rot` (the way the end runs, with
 * `straight` = the way the line came, so what lies ahead is in line and the tile behind is never a target) unless
 * a neighbour beside it is a strictly better target: a line that points into a factory still turns into the core
 * next to it, but a belt joined head-on stays joined.
 */
export function aimFacing(feeds: Feeds, x: number, y: number, rot: Dir, straight: boolean): Dir {
  let best = rot;
  let top = feeds(x, y, rot, straight);
  for (let d = 0; d < 4; d++) {
    if (d === rot || (straight && d === opposite(rot))) continue;
    const score = feeds(x, y, d as Dir, false);
    if (score > top) {
      top = score;
      best = d as Dir;
    }
  }
  return best;
}

/** The last tile of a line hands its items to the best thing it touches (see `aimFacing`). */
function aimEnd(tiles: LineTile[], t: Terrain): LineTile[] {
  const last = tiles[tiles.length - 1];
  if (!last || !t.feeds) return tiles;
  const rot = aimFacing(t.feeds, last.x, last.y, last.rot, tiles.length > 1);
  return rot === last.rot ? tiles : [...tiles.slice(0, -1), { ...last, rot }];
}

/** The first and last tile of a line never turn a belt of another line sideways (see `Terrain.guard`). */
function guardEnds(tiles: LineTile[], t: Terrain): LineTile[] {
  const guard = t.guard;
  if (!guard || tiles.length < 2) return tiles;
  const end = tiles.length - 1;
  return tiles.map((p, i) => (i === 0 || i === end ? { ...p, rot: guard(p.x, p.y, p.rot) } : p));
}

/**
 * The belt route from `a` to `b` (what a drag lays): the straight-then-turn L when its tiles are free, the
 * other L when only that one is (or when only that one ends pointing at a target), else the cheapest route around
 * obstacles (ridges, water, buildings) with the fewest turns. A route never cuts a belt it should not (see
 * `Terrain.pass`; its two ends see `Terrain.guard`). When nothing gets through, the plain L (its blocked ghosts
 * show red). With `Terrain.feeds` the last tile turns into the best building that takes items.
 */
export function routePath(a: Pt, b: Pt, rot: Dir, terrain: FreeTile | Terrain, xFirst: boolean = firstAxis(a, b)): LineTile[] {
  const t: Terrain = typeof terrain === 'function' ? { free: terrain } : terrain;
  return guardEnds(aimEnd(facing(pickPoints(a, b, t, xFirst), rot), t), t);
}
