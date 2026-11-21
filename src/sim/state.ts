import type { Id } from '../content/types';
import type { RngState } from './rng';

/** Directions: 0 = +x (east), 1 = +y (south), 2 = -x (west), 3 = -y (north). Building rotation uses the same. */
export type Dir = 0 | 1 | 2 | 3;

/**
 * The map as typed arrays, one byte per tile, row by row (index = y * w + x). Saved as is (IndexedDB keeps typed
 * arrays; files encode them, save/serialize.ts).
 */
export interface MapState {
  w: number;
  h: number;
  theme: Id;
  size: Id;
  /** Map property ids rolled for this run (Dusty, Windy ...). */
  props: Id[];
  /** 0 = no land (void, off the landmass); n = ground tone n - 1 of the theme palette. */
  ground: Uint8Array;
  /** 0 = plain ground; n = content.floors index n - 1 (ore, water, oil, slag). */
  floor: Uint8Array;
  /** 1 = rock ridge (nothing may be built). */
  ridge: Uint8Array;
  /** 0 = none; n = dust boulder variant n - 1 (decoration only, removed by building over it or clearing). */
  boulder: Uint8Array;
  /** Wreck blueprint markers: building ids a wreck at a tile unlocks for this run (mapgen fills it). */
  wrecks: { x: number; y: number; building: Id; taken: boolean }[];
}

/**
 * A placed building (finished or under construction). Plain JSON-safe data except nothing: typed data lives in
 * the map and the belt store. Fields not used by a behaviour keep their defaults.
 */
export interface Building {
  /** Unique, never reused within a run. */
  id: number;
  /** content.buildings index. */
  kind: number;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  rot: Dir;
  /** Construction progress 0..1; 1 = working. Deconstruction runs it back to 0. */
  build: number;
  /** Items used for construction so far, per entry of the def's cost (refunded when removed). */
  spent: number[];
  /** Items held, per material index; [] for buildings without an inventory. */
  items: number[];
  /** Liquid held (units) and which (content.liquids index, -1 = empty). */
  liquid: number;
  liquidId: number;
  /** Work progress 0..1 (crafting, mining, a bridge or unloader's transfer accumulator, a generator's burn seconds). */
  work: number;
  /** Battery charge in power units. */
  charge: number;
  /** Player setting: sorter/unloader item, crafter recipe index; -1 = none/default. */
  config: number;
  /** Bridge / mass driver partner (building id), -1 = none. */
  link: number;
  /** Power node laser links (building ids). */
  links: number[];
  /** Round-robin pointer for handing items to neighbours. */
  rr: number;
  /** Small item queues: junction (one per direction), router (one), bridge. Flat [item, readyTick] pairs. */
  queue: number[][];
  /** Belt store slot (conveyors), -1 = none. */
  slot: number;
  /** Being removed by the drone. */
  removing: boolean;
  /** A core being upgraded in place: the next core's kind and its progress, else null. */
  upgrade: { kind: number; build: number; spent: number[] } | null;
}

/**
 * Items on conveyors, structure of arrays: slot s holds up to BELT_SLOTS items at [s * BELT_SLOTS + i], sorted
 * front first (largest position). `pos` is 0..BELT_LEN along the tile in the conveyor's direction.
 */
export interface BeltStore {
  cap: number;
  item: Int16Array;
  pos: Int16Array;
  count: Uint8Array;
  /**
   * Where each item came on: 0 from behind (or around a bend), 1 from the left, 2 from the right. A side item
   * enters mid-belt at that side's edge and slides to the middle by the front edge (Mindustry). Saves from before
   * this field get zeros (`refreeSlots`).
   */
  from: Uint8Array;
  free: number[];
}

/** A ghost: a planned building (or removal) the drone works through in order. */
export interface Plan {
  /** content.buildings index. */
  kind: number;
  x: number;
  y: number;
  rot: Dir;
  config: number;
}

export type DroneTask = 'idle' | 'build' | 'remove';

export interface DroneState {
  id: number;
  /** Position in tiles (float). */
  x: number;
  y: number;
  task: DroneTask;
  /** Building id being built or removed, -1 = none. */
  target: number;
  /** Why the drone waits ('' = not waiting): a missing material id, 'blocked', 'unreachable'. */
  waiting: string;
}

/** Run statistics the orders read (per material index). */
export interface RunStats {
  /** Items that entered the core. */
  delivered: number[];
  /** Items crafted or mined. */
  made: number[];
  /** Finished buildings per kind index (ever built this run). */
  built: number[];
}

/** Owned by the progression module (src/sim/progression/): order chain progress. */
export interface ProgressState {
  done: Id[];
  /** Started order ids and the tick they started (rate goals measure from there). */
  active: { id: Id; since: number; count: number }[];
  /** Buildings unlocked this run by orders or wrecks. */
  unlocked: Id[];
  won: boolean;
}

export interface SimState {
  version: number;
  seed: number;
  rng: RngState;
  tick: number;
  map: MapState;
  buildings: Building[];
  nextId: number;
  /** Id of the core building. */
  core: number;
  /** Core stock per material index (containers docked to the core add room, not a second stock). */
  stock: number[];
  belts: BeltStore;
  /** The ghost queue in build order. Removals are buildings with `removing`. */
  plans: Plan[];
  drones: DroneState[];
  stats: RunStats;
  progress: ProgressState;
  /** Decoration the player removed (tile indices y * w + x): the deco planner leaves these tiles empty. */
  deco: { removed: number[] };
  /** Bonuses from the meta tree for this run (multipliers; 1 = none). */
  bonus: { build: number; drill: number; capacity: number; belt: number; power: number };
}
