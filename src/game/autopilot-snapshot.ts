import type { ContentRegistry } from '../content/registry';
import { createBeltStore } from '../sim/belts';
import type { Command } from '../sim/commands';
import { createRng } from '../sim/rng';
import type { Building, Dir, MapState, SimState } from '../sim/state';
import { World } from '../sim/world';

/**
 * What the autopilot worker needs to think, kept small so the main thread copies it in well under a millisecond:
 * the buildings packed into one Float64Array (transferred, not copied), the ghosts, the stock, the run's counters
 * the orders and the drones. Items on belts and in machines, radio lines and decoration stay behind: the bot reads
 * none of them. The map goes once per world (land, floors and ridges never change).
 */
export interface BotState {
  version: number;
  seed: number;
  tick: number;
  nextId: number;
  core: number;
  stock: number[];
  plans: SimState['plans'];
  buildings: Float64Array<ArrayBuffer>;
  /** Power links of the buildings that have any (the bot plans power from the live networks). */
  links: [number, number[]][];
  stats: SimState['stats'];
  progress: Pick<SimState['progress'], 'done' | 'active' | 'unlocked' | 'won'>;
  bonus: SimState['bonus'];
  supply: number[];
  drones: SimState['drones'];
  droneTech?: SimState['droneTech'];
}

/** Main thread -> worker: one look at the run. `gen` changes with every new world (a new run or a loaded slot). */
export interface ThinkRequest {
  gen: number;
  state: BotState;
  map?: MapState;
}

/** Worker -> main thread: the commands of that look and the worker's time for it. */
export interface ThinkReply {
  gen: number;
  tick: number;
  commands: Command[];
  ms: number;
  note: string;
}

/** Numbers per packed building: id, kind, x, y, rot, build, config, link, removing, upgrade, liquid, liquidId, spent x SPENT. */
const SPENT = 6;
const STRIDE = 12 + SPENT;

function packOne(out: Float64Array, o: number, b: Building): void {
  out[o] = b.id;
  out[o + 1] = b.kind;
  out[o + 2] = b.x;
  out[o + 3] = b.y;
  out[o + 4] = b.rot;
  out[o + 5] = b.build;
  out[o + 6] = b.config;
  out[o + 7] = b.link;
  out[o + 8] = b.removing ? 1 : 0;
  out[o + 9] = b.upgrade ? b.upgrade.kind : -1;
  out[o + 10] = b.liquid;
  out[o + 11] = b.liquidId;
  for (let i = 0; i < SPENT; i++) out[o + 12 + i] = b.spent[i] ?? 0;
}

export function packBuildings(list: readonly Building[]): Float64Array<ArrayBuffer> {
  const out = new Float64Array(list.length * STRIDE);
  list.forEach((b, i) => packOne(out, i * STRIDE, b));
  return out;
}

function unpackOne(a: Float64Array, o: number): Building {
  const upgrade = a[o + 9]!;
  return {
    id: a[o]!,
    kind: a[o + 1]!,
    x: a[o + 2]!,
    y: a[o + 3]!,
    rot: a[o + 4]! as Dir,
    build: a[o + 5]!,
    spent: Array.from(a.subarray(o + 12, o + 12 + SPENT)),
    items: [],
    liquid: a[o + 10]!,
    liquidId: a[o + 11]!,
    work: 0,
    charge: 0,
    config: a[o + 6]!,
    link: a[o + 7]!,
    links: [],
    rr: 0,
    queue: [],
    slot: -1,
    removing: a[o + 8] === 1,
    upgrade: upgrade >= 0 ? { kind: upgrade, build: 0, spent: [] } : null,
  };
}

export function unpackBuildings(a: Float64Array): Building[] {
  const out: Building[] = [];
  for (let o = 0; o + STRIDE <= a.length; o += STRIDE) out.push(unpackOne(a, o));
  return out;
}

/** The request for one look. Send it with `[state.buildings.buffer]` as the transfer list. */
export function thinkRequest(world: World, gen: number, withMap: boolean): ThinkRequest {
  const s = world.state;
  const p = s.progress;
  const state: BotState = {
    version: s.version,
    seed: s.seed,
    tick: s.tick,
    nextId: s.nextId,
    core: s.core,
    stock: s.stock,
    plans: s.plans,
    buildings: packBuildings(s.buildings),
    links: s.buildings.filter((b) => b.links.length).map((b) => [b.id, b.links]),
    stats: s.stats,
    progress: { done: p.done, active: p.active, unlocked: p.unlocked, won: p.won },
    bonus: s.bonus,
    supply: s.droneOps?.supply ?? [],
    drones: s.drones,
    droneTech: s.droneTech,
  };
  return withMap ? { gen, state, map: s.map } : { gen, state };
}

function withLinks(list: Building[], links: readonly [number, number[]][]): Building[] {
  const byId = new Map(list.map((b) => [b.id, b]));
  for (const [id, to] of links) {
    const b = byId.get(id);
    if (b) b.links = [...to];
  }
  return list;
}

/** Rebuilds a World from a request (in the worker): the kept map, an empty belt store. */
export function worldOf(content: ContentRegistry, s: BotState, map: MapState): World {
  const full: SimState = {
    version: s.version,
    seed: s.seed,
    rng: createRng(s.seed),
    tick: s.tick,
    map,
    buildings: withLinks(unpackBuildings(s.buildings), s.links),
    nextId: s.nextId,
    core: s.core,
    stock: s.stock,
    belts: createBeltStore(1),
    plans: s.plans,
    drones: s.drones,
    stats: s.stats,
    progress: { ...s.progress },
    deco: { removed: [] },
    bonus: s.bonus,
  };
  if (s.droneTech) full.droneTech = s.droneTech;
  if (s.supply.length) full.droneOps = { focus: null, supply: s.supply, boulders: [], mine: -1 };
  return new World(content, full);
}
