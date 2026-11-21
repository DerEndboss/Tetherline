import { drillInfoAt } from '../sim/blocks/production';
import type { Command } from '../sim/commands';
import { placementProblem } from '../sim/placement';
import type { Dir } from '../sim/state';
import type { World } from '../sim/world';
import { linePath } from './line';

/**
 * A small demo as commands (dev hook `groundbreak.demo()`, screenshots): a mechanical drill on
 * the nearest copper with a belt into the core, and a drill on iron handing ore straight to a smelter whose
 * bars ride a belt into the core. Everything goes through ghosts and the drone like a player's clicks.
 */

interface Spot {
  x: number;
  y: number;
}

/** The side of a 2x2 footprint at `p` that faces the core. */
function towardCore(w: World, p: Spot): Dir {
  const core = w.core!;
  const c = w.def(core).size / 2;
  const dx = core.x + c - (p.x + 1);
  const dy = core.y + c - (p.y + 1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy > 0 ? 1 : 3;
}

const STEP: Record<Dir, Spot> = { 0: { x: 2, y: 0 }, 1: { x: 0, y: 2 }, 2: { x: -2, y: 0 }, 3: { x: 0, y: -2 } };
/** The tile just outside a 2x2 footprint on side `d` (its first edge tile). */
const EXIT: Record<Dir, Spot> = { 0: { x: 2, y: 0 }, 1: { x: 0, y: 2 }, 2: { x: -1, y: 0 }, 3: { x: 0, y: -1 } };

/** Top-lefts where a 2x2 drill covers 4 tiles of `ore` (with room for a smelter towards the core), nearest first. */
function oreSpots(w: World, ore: string, smelter: boolean): Spot[] {
  const core = w.core!;
  const item = w.content.materials.indexOf(ore);
  const drill = w.content.buildings.get('mechanical-drill');
  const out: (Spot & { d: number })[] = [];
  for (let y = core.y - 30; y < core.y + 30; y++) {
    for (let x = core.x - 30; x < core.x + 30; x++) {
      const info = drillInfoAt(w, x, y, 2, 1);
      if (info.item !== item || info.count < 4 || placementProblem(w, drill, x, y)) continue;
      const d = Math.hypot(x - core.x, y - core.y);
      const step = STEP[towardCore(w, { x, y })];
      if (d < 6 || (smelter && placementProblem(w, w.content.buildings.get('smelter'), x + step.x, y + step.y))) continue;
      out.push({ x, y, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/** A belt from `start` to the tile beside the core, the last tile turned into the core. */
function beltToCore(w: World, start: Spot): Command {
  const core = w.core!;
  const size = w.def(core).size;
  const cy = Math.min(core.y + size - 1, Math.max(core.y, start.y));
  const cx = Math.min(core.x + size - 1, Math.max(core.x, start.x));
  const end: Spot & { rot: Dir } = start.x < core.x ? { x: core.x - 1, y: cy, rot: 0 } : start.x >= core.x + size ? { x: core.x + size, y: cy, rot: 2 } : start.y < core.y ? { x: cx, y: core.y - 1, rot: 1 } : { x: cx, y: core.y + size, rot: 3 };
  const path = linePath(start, end, end.rot);
  path[path.length - 1]!.rot = end.rot;
  return { type: 'place-many', plans: path.map((t) => ({ kind: 'conveyor', x: t.x, y: t.y, rot: t.rot })) };
}

/** Tiles a command list covers (to keep two chains apart). */
function tilesOf(w: World, cmds: readonly Command[]): Set<string> {
  const out = new Set<string>();
  const add = (kind: string, x: number, y: number) => {
    const size = w.content.buildings.get(kind).size;
    for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) out.add(`${tx},${ty}`);
  };
  for (const c of cmds) {
    if (c.type === 'place') add(c.kind, c.x, c.y);
    if (c.type === 'place-many') for (const p of c.plans) add(p.kind, p.x, p.y);
  }
  return out;
}

/** A drill (and maybe a smelter after it) with a belt from the last one to the core, clear of `taken` tiles. */
function chain(w: World, ore: string, smelter: boolean, taken: Set<string>): Command[] {
  for (const at of oreSpots(w, ore, smelter)) {
    const d = towardCore(w, at);
    const out: Command[] = [{ type: 'place', kind: 'mechanical-drill', x: at.x, y: at.y, rot: 0 }];
    let last = at;
    if (smelter) {
      last = { x: at.x + STEP[d].x, y: at.y + STEP[d].y };
      out.push({ type: 'place', kind: 'smelter', x: last.x, y: last.y, rot: 0 });
    }
    out.push(beltToCore(w, { x: last.x + EXIT[d].x, y: last.y + EXIT[d].y }));
    if ([...tilesOf(w, out)].every((t) => !taken.has(t))) return out;
  }
  return [];
}

export function demoCommands(w: World): Command[] {
  const copper = chain(w, 'copper-ore', false, new Set());
  return [...copper, ...chain(w, 'iron-ore', true, tilesOf(w, copper))];
}
