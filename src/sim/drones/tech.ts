import type { World } from '../world';
import type { DroneOps, DroneTech, DroneTrack } from './types';

/** Hard cap: at most 5 drones in total, the player's drone included. */
export const MAX_DRONES = 5;

export interface Price {
  item: string;
  n: number;
}

export interface TrackDef {
  id: DroneTrack;
  name: string;
  /** What a level does, per level, for the UI. */
  effect: string;
  /** Prices of level 1, 2, 3. */
  levels: Price[][];
}

/** Upgrade data (content ids are checked by drones.test.ts). Cheap early, parts-hungry later. */
export const TRACKS: TrackDef[] = [
  {
    id: 'speed',
    name: 'Rotors',
    effect: '+25% flight speed',
    levels: [
      [{ item: 'iron-bar', n: 20 }, { item: 'copper-wire', n: 10 }],
      [{ item: 'steel', n: 15 }, { item: 'circuit', n: 8 }],
      [{ item: 'titanium-plate', n: 20 }, { item: 'motor', n: 6 }],
    ],
  },
  {
    id: 'build',
    name: 'Servos',
    effect: '+50% build speed',
    levels: [
      [{ item: 'iron-bar', n: 25 }, { item: 'copper-wire', n: 15 }],
      [{ item: 'steel', n: 20 }, { item: 'circuit', n: 10 }],
      [{ item: 'motor', n: 10 }, { item: 'core-chip', n: 2 }],
    ],
  },
  {
    id: 'cargo',
    name: 'Cargo hold',
    effect: 'double the load',
    levels: [
      [{ item: 'iron-bar', n: 20 }, { item: 'glass', n: 10 }],
      [{ item: 'steel', n: 20 }, { item: 'plastic', n: 10 }],
      [{ item: 'frame', n: 10 }, { item: 'titanium-plate', n: 15 }],
    ],
  },
  {
    id: 'reach',
    name: 'Beam optics',
    effect: '+20% build range',
    levels: [
      [{ item: 'copper-wire', n: 20 }, { item: 'silicon', n: 10 }],
      [{ item: 'circuit', n: 12 }, { item: 'glass', n: 15 }],
      [{ item: 'core-chip', n: 3 }, { item: 'silicon', n: 20 }],
    ],
  },
];

export const MAX_LEVEL = 3;

/**
 * Prices of the 1st to 4th helper drone. The first comes with steel and circuits (mid game, no printer yet): in a
 * one-hour round one drone could not keep the drone-fed machines going; the rest stay a late goal.
 */
export const HELPER_PRICES: Price[][] = [
  [{ item: 'steel', n: 30 }, { item: 'circuit', n: 15 }, { item: 'iron-bar', n: 40 }],
  [{ item: 'steel', n: 50 }, { item: 'circuit', n: 25 }, { item: 'motor', n: 8 }, { item: 'frame', n: 6 }],
  [{ item: 'titanium-plate', n: 50 }, { item: 'circuit', n: 40 }, { item: 'motor', n: 24 }, { item: 'core-chip', n: 3 }],
  [{ item: 'titanium-plate', n: 80 }, { item: 'circuit', n: 60 }, { item: 'motor', n: 36 }, { item: 'core-chip', n: 6 }],
];

export function trackDef(id: DroneTrack): TrackDef {
  return TRACKS.find((t) => t.id === id)!;
}

export function techOf(w: World): DroneTech {
  return (w.state.droneTech ??= { speed: 0, build: 0, cargo: 0, reach: 0 });
}

export function opsOf(w: World): DroneOps {
  return (w.state.droneOps ??= { focus: null, supply: [], boulders: [], mine: -1 });
}

/** Price of the next level of a track, or null at the top. */
export function nextPrice(w: World, id: DroneTrack): Price[] | null {
  return trackDef(id).levels[techOf(w)[id]] ?? null;
}

/** Price of the next helper drone, or null at the cap. */
export function helperPrice(w: World): Price[] | null {
  return HELPER_PRICES[w.state.drones.length - 1] ?? null;
}

export function canAfford(w: World, price: Price[]): boolean {
  return price.every((p) => {
    const i = w.content.materials.indexOf(p.item);
    return i >= 0 && (w.state.stock[i] ?? 0) >= p.n;
  });
}

export function pay(w: World, price: Price[]): void {
  for (const p of price) w.state.stock[w.content.materials.indexOf(p.item)]! -= p.n;
}

/** What the whole fleet can do at the current upgrade levels. */
export interface FleetStats {
  /** Tiles per second. */
  speed: number;
  /** Build speed multiplier (before the core's and the meta bonus). */
  build: number;
  /** Build range in tiles. */
  range: number;
  /** Items per hold. */
  cargo: number;
  /** Items per second a drone mines. */
  mineRate: number;
  /** Hardest ore a drone can mine. */
  hardness: number;
}

export function fleetStats(w: World): FleetStats {
  const t = techOf(w);
  const base = w.content.rules.drone;
  return {
    speed: base.speed * (1 + 0.25 * t.speed),
    build: base.buildSpeed * (1 + 0.5 * t.build),
    range: base.range * (1 + 0.2 * t.reach),
    cargo: 8 * 2 ** t.cargo,
    mineRate: 0.8 * (1 + 0.35 * t.build),
    hardness: 1 + (t.cargo >= 2 ? 1 : 0) + (t.cargo >= 3 ? 1 : 0),
  };
}
