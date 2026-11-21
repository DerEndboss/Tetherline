import type { Behaviour, BuildingDef } from '../../content/types';
import { DX, DY, opposite } from '../../sim/grid';
import { placementProblem } from '../../sim/placement';
import type { Dir } from '../../sim/state';
import type { World } from '../../sim/world';
import type { Terrain } from '../line';

/** A building or a queued ghost standing on a tile. */
export interface Thing {
  def: BuildingDef;
  rot: Dir;
}

function thingAt(w: World, x: number, y: number): Thing | undefined {
  const b = w.at(x, y);
  if (b) return b.removing ? undefined : { def: w.def(b), rot: b.rot };
  for (const p of w.state.plans) {
    const def = w.defs[p.kind];
    if (def && x >= p.x && y >= p.y && x < p.x + def.size && y < p.y + def.size) return { def, rot: p.rot };
  }
  return undefined;
}

/** Buildings a belt end turns into from the side, and how well they suit (they take items from every side). */
const TARGETS: Partial<Record<Behaviour, number>> = { core: 4, storage: 4, crafter: 3, generator: 3, bridge: 2, 'mass-driver': 2, router: 2 };
/** Blocks that pass items straight on: a belt that points at one is fine, but one beside it does not turn into it. */
const PASSING = new Set<Behaviour>(['junction', 'sorter', 'overflow']);

/** A belt (or junction) right ahead of a line is a join the player aimed at: it outranks every target beside the end. */
const JOIN = 5;

/**
 * How well a belt end facing `d` hands its items to `thing`: 0 = it takes none (or only head-on), more = a better
 * target. `straight` = the thing lies ahead of the line; side ends only turn into real targets.
 */
export function feedScore(thing: Thing, d: Dir, straight: boolean): number {
  const beh = thing.def.behaviour;
  // a belt is entered from behind, or from the side when it lies ahead; one that runs alongside is never joined
  if (beh === 'conveyor') {
    if (thing.rot === opposite(d)) return 0;
    return straight ? JOIN : thing.rot === d ? 1 : 0;
  }
  return TARGETS[beh] ?? (straight && PASSING.has(beh) ? JOIN : 0);
}

/** What a belt end at (x, y) facing `d` feeds (see feedScore). */
export function feedsAt(w: World, x: number, y: number, d: Dir, straight: boolean): number {
  const thing = thingAt(w, x + DX[d]!, y + DY[d]!);
  return thing ? feedScore(thing, d, straight) : 0;
}

/** The junction family a line of this kind crosses other lines with (belts: junction, pipes: conduit junction). */
export function crossBehaviour(def: BuildingDef): 'junction' | 'liquid-junction' | undefined {
  if (def.behaviour === 'conveyor') return 'junction';
  return def.behaviour === 'conduit' ? 'liquid-junction' : undefined;
}

/** Whether the building at a tile is the junction a line of `def` runs straight through. */
export function isThrough(w: World, def: BuildingDef, x: number, y: number): boolean {
  const cross = crossBehaviour(def);
  const b = w.at(x, y);
  return !!cross && !!b && !b.removing && w.def(b).behaviour === cross;
}

/** Whether the belt (or pipe) `b` hands its items on: something takes them straight ahead of it. */
function handsOn(w: World, def: BuildingDef, b: { x: number; y: number; rot: Dir }): boolean {
  const ahead = thingAt(w, b.x + DX[b.rot]!, b.y + DY[b.rot]!);
  if (!ahead) return false;
  return def.behaviour === 'conveyor' ? feedScore(ahead, b.rot, true) > 0 : true;
}

/**
 * The rules a line drag follows on its way (Mindustry-like):
 * - a belt that already runs the line's way is left alone, one running the other way is turned only when the
 *   player drags right over it, and a belt across it becomes a junction (the line goes on straight at both sides);
 * - an existing junction is crossed straight, never turned or routed around (and gets no ghost);
 * - so a line never cuts another line at a corner or turns a part of it sideways: the first and the last tile of
 *   a line keep the way a belt of another line already runs when that belt hands its items on (a line that
 *   starts on one, or ends on one, joins it from the side); a loose end of a line is simply turned (extended);
 * With `aim` (the player has not turned the tool by hand) the last tile turns into what it touches.
 */
export function routeTerrain(w: World, def: BuildingDef, kind: number, aim: boolean, keepAxis: boolean): Terrain {
  const free = (x: number, y: number): boolean => {
    const b = w.at(x, y);
    if (b && b.kind === kind) return !b.removing;
    if (isThrough(w, def, x, y)) return true;
    return placementProblem(w, def, x, y) === null;
  };
  const pass = (x: number, y: number, inDir: Dir, outDir: Dir, direct: boolean): boolean => {
    const b = w.at(x, y);
    if (!b || b.removing) return true;
    const beh = w.def(b).behaviour;
    if (isThrough(w, def, x, y)) return inDir === outDir;
    if (beh !== def.behaviour || b.rot === outDir) return true;
    if (inDir === outDir && ((b.rot - outDir) & 1) === 1) return crossBehaviour(def) !== undefined;
    return direct && b.rot === opposite(outDir);
  };
  const guard = (x: number, y: number, rot: Dir): Dir => {
    const b = w.at(x, y);
    if (!b || b.removing || w.def(b).behaviour !== def.behaviour || ((b.rot - rot) & 1) === 0) return rot;
    return handsOn(w, def, b) ? b.rot : rot;
  };
  return { free, pass, guard, feeds: aim && def.behaviour === 'conveyor' ? (x, y, d, straight) => feedsAt(w, x, y, d, straight) : undefined, keepAxis };
}
