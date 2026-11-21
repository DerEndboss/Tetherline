import type { BuildingDef, Id } from '../content/types';
import { drillInfoAt } from '../sim/blocks/production';
import { touches, type Rect } from '../sim/grid';
import { placementProblem } from '../sim/placement';
import type { Building } from '../sim/state';
import type { World } from '../sim/world';

/** A place on the map the tutorial points at: a rectangle of tiles, with a short caption. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/** How far from the core the guide looks for a patch to recommend. */
const SEARCH = 42;
/** One more ore tile under a drill is worth this many tiles of walking. */
const TILE_VALUE = 12;

export const spotOf = (r: Rect, label?: string): Spot => ({ x: r.x, y: r.y, w: r.size, h: r.size, ...(label ? { label } : {}) });

export function coreRect(w: World): Rect | null {
  const core = w.core;
  return core ? w.rect(core) : null;
}

/** Tiles that ghosts already claim (a plan must not be recommended twice). */
function plannedTiles(w: World): Set<number> {
  const out = new Set<number>();
  for (const p of w.state.plans) {
    const size = w.defs[p.kind]?.size ?? 1;
    for (let y = p.y; y < p.y + size; y++) for (let x = p.x; x < p.x + size; x++) out.add(y * w.state.map.w + x);
  }
  return out;
}

/** Nothing stands, and no ghost lies, on any tile of the footprint (belts count: a recommendation never builds over them). */
function isClear(w: World, size: number, x: number, y: number, planned: Set<number>): boolean {
  for (let ty = y; ty < y + size; ty++) {
    for (let tx = x; tx < x + size; tx++) {
      if (!w.inBounds(tx, ty) || w.at(tx, ty) || planned.has(ty * w.state.map.w + tx)) return false;
    }
  }
  return true;
}

function centreOf(w: World): { x: number; y: number } {
  const c = coreRect(w);
  return c ? { x: c.x + c.size / 2, y: c.y + c.size / 2 } : { x: w.state.map.w / 2, y: w.state.map.h / 2 };
}

/**
 * The best place for a drill on an ore: as many ore tiles as possible under it (all of the footprint is best), then
 * the one closest to the core. Null when the map has no free ore in reach.
 */
export function oreSpot(w: World, def: BuildingDef, ore: Id): Spot | null {
  const item = w.content.materials.indexOf(ore);
  const c = centreOf(w);
  const planned = plannedTiles(w);
  let best: { score: number; x: number; y: number } | null = null;
  const x0 = Math.max(0, Math.floor(c.x - SEARCH));
  const y0 = Math.max(0, Math.floor(c.y - SEARCH));
  for (let y = y0; y <= Math.min(w.state.map.h - def.size, c.y + SEARCH); y++) {
    for (let x = x0; x <= Math.min(w.state.map.w - def.size, c.x + SEARCH); x++) {
      const score = drillScore(w, def, item, x, y, c);
      if (score === null || (best && score <= best.score)) continue;
      if (isClear(w, def.size, x, y, planned) && !placementProblem(w, def, x, y)) best = { score, x, y };
    }
  }
  return best ? { x: best.x, y: best.y, w: def.size, h: def.size } : null;
}

/** How good a drill at (x, y) is for an ore (more ore tiles, nearer the core), or null when the ore is not what it would mine. */
function drillScore(w: World, def: BuildingDef, item: number, x: number, y: number, c: { x: number; y: number }): number | null {
  const info = drillInfoAt(w, x, y, def.size, def.drill?.tier ?? 1);
  if (info.item !== item) return null;
  return info.count * TILE_VALUE - Math.hypot(x + def.size / 2 - c.x, y + def.size / 2 - c.y);
}

/** Whether a 2x2 (or any) building would sit on ore: such spots are kept for drills when there is a choice. */
function oreUnder(w: World, size: number, x: number, y: number): number {
  let n = 0;
  for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) if (w.content.floors.list[(w.state.map.floor[ty * w.state.map.w + tx] ?? 0) - 1]?.ore) n++;
  return n;
}

/**
 * Every free place for `def` that touches `anchor`, best first: on no ore if possible, and closest to `toward`
 * (tile coordinates). Empty when every side is taken.
 */
export function nextToAll(w: World, def: BuildingDef, anchor: Rect, toward: { x: number; y: number }): Spot[] {
  const planned = plannedTiles(w);
  const found: { score: number; x: number; y: number }[] = [];
  for (let y = anchor.y - def.size; y <= anchor.y + anchor.size; y++) {
    for (let x = anchor.x - def.size; x <= anchor.x + anchor.size; x++) {
      if (!touches({ x, y, size: def.size }, anchor)) continue;
      if (!isClear(w, def.size, x, y, planned) || placementProblem(w, def, x, y)) continue;
      found.push({ score: oreUnder(w, def.size, x, y) * 8 + Math.hypot(x + def.size / 2 - toward.x, y + def.size / 2 - toward.y), x, y });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => ({ x: f.x, y: f.y, w: def.size, h: def.size }));
}

/** The best free place for `def` that touches `anchor` (see `nextToAll`), or null when every side is taken. */
export function nextTo(w: World, def: BuildingDef, anchor: Rect, toward: { x: number; y: number }): Spot | null {
  return nextToAll(w, def, anchor, toward)[0] ?? null;
}

/** A free place for `def` that touches both `a` and `b` (an unloader between the core and a mill), or null. */
export function between(w: World, def: BuildingDef, a: Rect, b: Rect): Spot | null {
  const planned = plannedTiles(w);
  for (let y = a.y - def.size; y <= a.y + a.size; y++) {
    for (let x = a.x - def.size; x <= a.x + a.size; x++) {
      const r = { x, y, size: def.size };
      if (!touches(r, a) || !touches(r, b)) continue;
      if (isClear(w, def.size, x, y, planned) && !placementProblem(w, def, x, y)) return { x, y, w: def.size, h: def.size };
    }
  }
  return null;
}

/** The smallest rectangle around finished buildings, as a spot (the area to copy as a blueprint). */
export function around(w: World, list: readonly Building[], label?: string): Spot | null {
  if (!list.length) return null;
  const x0 = Math.min(...list.map((b) => b.x));
  const y0 = Math.min(...list.map((b) => b.y));
  const x1 = Math.max(...list.map((b) => b.x + w.def(b).size));
  const y1 = Math.max(...list.map((b) => b.y + w.def(b).size));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, ...(label ? { label } : {}) };
}

/** The smallest spot that holds all of them. */
export function union(spots: readonly Spot[]): Spot | null {
  if (!spots.length) return null;
  const x0 = Math.min(...spots.map((s) => s.x));
  const y0 = Math.min(...spots.map((s) => s.y));
  const x1 = Math.max(...spots.map((s) => s.x + s.w));
  const y1 = Math.max(...spots.map((s) => s.y + s.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
