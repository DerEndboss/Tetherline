import type { Id } from '../../content/types';

/**
 * Extra drone state of the drones module (modules extend the state with optional fields, see docs/architecture.md).
 * Everything here is created lazily and saved with the run.
 */

/** What a drone is doing in detail; `DroneState.task` keeps only the coarse build / remove / idle. */
export type DroneAct = 'idle' | 'build' | 'remove' | 'clear' | 'fetch' | 'deliver' | 'mine' | 'return' | 'park';

/** The four upgrade tracks, shared by every drone (one drone type that can do everything). */
export type DroneTrack = 'speed' | 'build' | 'cargo' | 'reach';

export interface DroneTech {
  speed: number;
  build: number;
  cargo: number;
  reach: number;
}

/** Player-set drone orders and queues. */
export interface DroneOps {
  /** Where the player's drone waits when it has nothing to build (null = stay put). */
  focus: { x: number; y: number } | null;
  /** Machines (building ids) the idle drones keep supplied from the core. */
  supply: number[];
  /** Dust boulder tiles (y * w + x) waiting for a drone. */
  boulders: number[];
  /** Material index helpers mine: -1 = automatic (the scarcest), -2 = off. */
  mine: number;
}

declare module '../state' {
  interface DroneState {
    /** Detail of `task`. */
    act?: DroneAct;
    /** Tile the drone works on or flies to (clear, mine), when not a building. */
    tx?: number;
    ty?: number;
    /** The hold: one material (index) and how many. */
    carry?: { item: number; n: number };
    /** Work progress in seconds (boulder, mining). */
    hold?: number;
  }
  interface SimState {
    droneTech?: DroneTech;
    droneOps?: DroneOps;
  }
}

/**
 * The drone commands. They are NOT in CommandMap on purpose: tick.ts types its handler table as a full mapping of
 * CommandMap, so augmenting it breaks that file until the table is made partial. Until then send them
 * with `droneCommand` and register with `on` (commands.ts). Move them into CommandMap when tick.ts allows it.
 */
export interface DroneCommands {
  /** Buy the next level of an upgrade track. */
  'drone-upgrade': { track: DroneTrack };
  /** Build a helper drone at the core (up to 5 drones in total). */
  'drone-add': object;
  /** Send the player's drone to a spot and keep it there while idle (`on: false` releases it). */
  'drone-focus': { x: number; y: number; on: boolean };
  /** Toggle supply for a machine: idle drones bring it items from the core. `id: -1` clears all. */
  'drone-supply': { id: number };
  /** What helpers mine: a material id, 'auto' or 'off'. */
  'drone-mine': { item: Id | 'auto' | 'off' };
}

declare module '../commands' {
  interface EventMap {
    'boulder-cleared': { x: number; y: number };
    'drone-upgraded': { track: DroneTrack; level: number };
    'drone-added': { id: number };
  }
}
