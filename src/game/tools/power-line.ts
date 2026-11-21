import type { BuildingDef } from '../../content/types';
import { gapBetween } from '../../sim/grid';
import { placementProblem, topLeftFor } from '../../sim/placement';
import type { World } from '../../sim/world';
import type { Tile } from './geometry';

/** Most nodes one drag lays. */
const MAX_NODES = 120;
/** How far a node may slide off the straight line to find a free tile. */
const SLIDE = 3;

/** Tiles of the straight line a..b (Bresenham), both ends included. */
export function linePoints(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 4096; i++) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/**
 * Power poles along a dragged line: the poles sit as far apart as one laser
 * reaches, each on a free tile (a pole slides a little off the line to get around rock, water or buildings),
 * and a finished pole links to the one before it on its own (`autoLink`). Returns footprint top-lefts, first to
 * last; it stops early when no free tile is in reach (the rest of the line cannot be crossed).
 */
export function nodeLine(w: World, def: BuildingDef, a: Tile, b: Tile): Tile[] {
  const range = def.power?.laserRange ?? 1;
  const size = def.size;
  const line = linePoints(a, b).map((t) => topLeftFor(size, t.x, t.y));
  const taken: Tile[] = [];
  const free = (t: Tile): boolean => placementProblem(w, def, t.x, t.y) === null && !w.at(t.x, t.y) && !taken.some((o) => o.x === t.x && o.y === t.y);
  const reach = (from: Tile, t: Tile): number => gapBetween({ ...from, size }, { ...t, size });
  const near = (c: Tile, from: Tile | null): Tile | undefined => slideTiles(c).find((t) => free(t) && (!from || reach(from, t) <= range - 0.01));
  const first = near(line[0]!, null);
  if (!first) return [];
  const nodes: Tile[] = [first];
  taken.push(first);
  let at = 0;
  while (nodes.length < MAX_NODES && at < line.length - 1) {
    const last = nodes[nodes.length - 1]!;
    const next = farthest(line, at, Math.ceil(range * 1.5) + SLIDE + 2, (t) => reach(last, t) <= range + SLIDE, (t) => near(t, last));
    if (!next) break;
    at = next.index;
    nodes.push(next.tile);
    taken.push(next.tile);
  }
  return nodes;
}

/** The tile itself first, then its neighbours by distance, within SLIDE. */
function slideTiles(c: Tile): Tile[] {
  const out: Tile[] = [];
  for (let dy = -SLIDE; dy <= SLIDE; dy++) for (let dx = -SLIDE; dx <= SLIDE; dx++) out.push({ x: c.x + dx, y: c.y + dy });
  return out.sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y));
}

/** The farthest line index after `from` (within `window`) where `pick` offers a new tile; null when no progress is possible. */
function farthest(line: Tile[], from: number, window: number, close: (t: Tile) => boolean, pick: (t: Tile) => Tile | undefined): { index: number; tile: Tile } | null {
  for (let i = Math.min(line.length - 1, from + window); i > from; i--) {
    if (!close(line[i]!)) continue;
    const tile = pick(line[i]!);
    if (tile) return { index: i, tile };
  }
  return null;
}
