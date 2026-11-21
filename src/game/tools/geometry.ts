import type { BuildingDef } from '../../content/types';
import type { TileBox } from '../../sim/commands';
import { topLeftFor } from '../../sim/placement';
import type { Region } from './region';

export interface Tile {
  x: number;
  y: number;
}

/** The box between two tiles with min/max corners (inclusive). */
export function normBox(a: Tile, b: Tile): TileBox {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function boxArea(r: TileBox): number {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

/** Most tiles one drag may cover (keeps the preview and the queue sane). */
export const MAX_TILES = 4000;

/**
 * Footprint top-lefts of copies of `def` that tile a dragged rectangle with no gaps (a field of drills, a
 * solar array). Copies that would stick out of the box are left out, so the box is never overshot.
 */
export function fillBox(def: BuildingDef, r: TileBox): Tile[] {
  const out: Tile[] = [];
  const s = def.size;
  for (let y = r.y0; y + s - 1 <= r.y1; y += s) for (let x = r.x0; x + s - 1 <= r.x1; x += s) out.push({ x, y });
  return out.length ? out : [topLeftFor(s, r.x0, r.y0)];
}

/**
 * Footprint top-lefts of copies of `def` that fill an area: a box of tiles like `fillBox`, or for a screen rectangle
 * (iso) the copies on a lattice that starts centred on the first covered tile, each one whose footprint centre the
 * rectangle holds. A rectangle too small for one copy takes one at its start.
 */
export function fillRegion(def: BuildingDef, area: Region): Tile[] {
  if (area.rect === null) return fillBox(def, area.box);
  const s = def.size;
  const b = area.box;
  const first = topLeftFor(s, b.x0, b.y0);
  const out: Tile[] = [];
  for (let y = first.y; y <= b.y1; y += s) for (let x = first.x; x <= b.x1; x += s) if (area.hasFootprint(x, y, s)) out.push({ x, y });
  return out.length ? out : [first];
}

/**
 * Copies of `def` in a straight row from `a` towards `b` along the longer axis, each one touching the next
 * (a row of 2x2 drills along an ore vein). The first copy is centred on `a`.
 */
export function copiesAlong(def: BuildingDef, a: Tile, b: Tile): Tile[] {
  const s = def.size;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const span = horizontal ? b.x - a.x : b.y - a.y;
  const sign = Math.sign(span) || 1;
  const n = Math.floor(Math.abs(span) / s) + 1;
  const first = topLeftFor(s, a.x, a.y);
  const out: Tile[] = [];
  for (let i = 0; i < n; i++) out.push(horizontal ? { x: first.x + sign * i * s, y: first.y } : { x: first.x, y: first.y + sign * i * s });
  return out;
}

/** A bridge spot along a run; `linked` = it lies within reach of the bridge before it (the first one always does). */
export interface SpacedNode extends Tile {
  linked: boolean;
}

/**
 * Where bridges go along a straight run (Mindustry's calculateNodes): the first and the last tile always, and in
 * between a node every `range` tiles at most, each as far from the last as it can be on a tile where one fits
 * (`valid`), so obstacles in the way are jumped. When no valid tile is in reach the next valid one is listed
 * anyway, but not `linked`: a gap wider than the range cannot be bridged, and the run ends there (nothing after
 * it would ever connect to the bridges before it).
 */
export function spacedNodes(run: Tile[], range: number, valid: (t: Tile) => boolean): SpacedNode[] {
  const last = run.length - 1;
  const base = run.filter((t, i) => i === 0 || i === last || valid(t));
  const reach = (a: Tile, b: Tile): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= range;
  const out: SpacedNode[] = [];
  let prev: Tile | undefined;
  for (let i = 0; i < base.length; ) {
    const here = base[i]!;
    out.push({ ...here, linked: !prev || reach(prev, here) });
    if (!out[out.length - 1]!.linked) break;
    let j = base.length - 1;
    while (j > i + 1 && !reach(here, base[j]!)) j--;
    prev = here;
    i = j > i ? j : base.length;
  }
  return out;
}
