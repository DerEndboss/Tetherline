import type { ContentRegistry } from '../content/registry';
import { createBeltStore } from './belts';
import { clearBoulders, finishSite } from './construction';
import { SAVE_VERSION } from './constants';
import { createRng } from './rng';
import type { Building, Dir, SimState } from './state';
import { newBuilding, World } from './world';

/**
 * Helpers for tests, the dev menu and stress scenes: a flat test map and instant building (no drone, no cost).
 * Not used by the game rules.
 */

/** A flat all-land map of w x h tiles with no floors; set floors with `paint`. */
export function testWorld(content: ContentRegistry, w = 40, h = 40, seed = 1): World {
  const zeros = () => content.materials.list.map(() => 0);
  const n = w * h;
  const state: SimState = {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed),
    tick: 0,
    map: { w, h, theme: content.rules.defaultTheme, size: content.rules.defaultSize, props: [], ground: new Uint8Array(n).fill(1), floor: new Uint8Array(n), ridge: new Uint8Array(n), boulder: new Uint8Array(n), wrecks: [] },
    buildings: [],
    nextId: 1,
    core: -1,
    stock: zeros(),
    belts: createBeltStore(4),
    plans: [],
    drones: [],
    stats: { delivered: zeros(), made: zeros(), built: content.buildings.list.map(() => 0) },
    progress: { done: [], active: [], unlocked: [], won: false },
    deco: { removed: [] },
    bonus: { build: 1, drill: 1, capacity: 1, belt: 1, power: 1 },
  };
  return new World(content, state);
}

/** Sets a rectangle of tiles to a floor id. */
export function paint(w: World, floor: string, x: number, y: number, width: number, height: number): void {
  const f = w.content.floors.indexOf(floor) + 1;
  const { map } = w.state;
  for (let ty = y; ty < y + height; ty++) for (let tx = x; tx < x + width; tx++) map.floor[ty * map.w + tx] = f;
}

/** Places a finished building at once (no cost). The first core placed becomes the run's core. */
export function placeNow(w: World, kind: string, x: number, y: number, rot: Dir = 0, config = -1): Building {
  const k = w.content.buildings.indexOf(kind);
  if (k < 0) throw new Error(`Unknown building "${kind}"`);
  clearBoulders(w, x, y, w.defs[k]!.size);
  const b = newBuilding(w, k, x, y, rot, config);
  w.add(b);
  if (w.defs[k]!.behaviour === 'core' && !w.core) w.state.core = b.id;
  finishSite(w, b, { dt: 0, tick: w.state.tick, events: [], power: () => 1 });
  return b;
}

/** Places a straight conveyor line from (x, y) going `dir` for `n` tiles. */
export function beltLine(w: World, x: number, y: number, dir: Dir, n: number, kind = 'conveyor'): Building[] {
  const dx = [1, 0, -1, 0][dir]!;
  const dy = [0, 1, 0, -1][dir]!;
  const out: Building[] = [];
  for (let i = 0; i < n; i++) out.push(placeNow(w, kind, x + dx * i, y + dy * i, dir));
  return out;
}
