import type { BuildingDef } from '../content/types';
import { drillInfoAt } from './blocks/production';
import { isUnlocked } from './progression/meta';
import type { Building } from './state';
import type { World } from './world';

/** Why a building cannot stand somewhere (UI shows it on the ghost), or null when it can. */
export type PlacementProblem = 'out-of-bounds' | 'no-land' | 'ridge' | 'deep-liquid' | 'occupied' | 'no-ore' | 'no-liquid' | 'locked';

function tileProblem(w: World, def: BuildingDef, x: number, y: number): PlacementProblem | null {
  if (!w.inBounds(x, y)) return 'out-of-bounds';
  const { map } = w.state;
  const i = y * map.w + x;
  if (map.ground[i] === 0) return 'no-land';
  if (map.ridge[i]) return 'ridge';
  const f = map.floor[i]!;
  if (f > 0 && w.content.floors.list[f - 1]?.deep && def.behaviour !== 'pump') return 'deep-liquid';
  return null;
}

function liquidUnder(w: World, x: number, y: number, size: number): boolean {
  const { map } = w.state;
  for (let ty = y; ty < y + size; ty++) {
    for (let tx = x; tx < x + size; tx++) {
      const f = map.floor[ty * map.w + tx] ?? 0;
      if (f > 0 && w.content.floors.list[f - 1]?.liquid) return true;
    }
  }
  return false;
}

/**
 * Belts and pipes give way: a plan may cover conveyors and conduits, which are
 * replaced when its site starts (construction.ts). Real buildings and the core block.
 */
export function replaceable(w: World, b: Building): boolean {
  if (b.id === w.state.core) return false;
  const beh = w.def(b).behaviour;
  return beh === 'conveyor' || beh === 'conduit';
}

/**
 * Whether `def` fits with its top-left at (x, y). `ignore` is a building that may be overlapped (the core
 * when it is upgraded in place). Boulders never block: building over them removes them.
 */
function footprintProblem(w: World, def: BuildingDef, x: number, y: number, ignore?: Building): PlacementProblem | null {
  for (let ty = y; ty < y + def.size; ty++) {
    for (let tx = x; tx < x + def.size; tx++) {
      const p = tileProblem(w, def, tx, ty);
      if (p) return p;
      const b = w.at(tx, ty);
      if (b && b !== ignore && !replaceable(w, b)) return 'occupied';
    }
  }
  return null;
}

export function placementProblem(w: World, def: BuildingDef, x: number, y: number, ignore?: Building): PlacementProblem | null {
  const p = footprintProblem(w, def, x, y, ignore);
  if (p) return p;
  if (!isUnlocked(w, def) || coreProblem(w, def)) return 'locked';
  return groundProblem(w, def, x, y);
}

/**
 * There is one core: a core stage is never a second building. Only the next stage of the core may be
 * placed, and placing it upgrades the core in place (tick.ts `queuePlan`); every other stage is locked.
 */
function coreProblem(w: World, def: BuildingDef): boolean {
  if (def.behaviour !== 'core') return false;
  const core = w.core;
  return !core || w.def(core).core?.next !== def.id;
}

/** Drills need ore under them, pumps a liquid (unless they draw from anywhere). */
function groundProblem(w: World, def: BuildingDef, x: number, y: number): PlacementProblem | null {
  if (def.behaviour === 'drill' && drillInfoAt(w, x, y, def.size, def.drill?.tier ?? 1).item < 0) return 'no-ore';
  if (def.behaviour === 'pump' && !def.pump?.anywhere && !liquidUnder(w, x, y, def.size)) return 'no-liquid';
  return null;
}

/** Top-left of a footprint of `size` centred on a tile (what the cursor points at). */
export function topLeftFor(size: number, cx: number, cy: number): { x: number; y: number } {
  const half = Math.floor((size - 1) / 2);
  return { x: cx - half, y: cy - half };
}
