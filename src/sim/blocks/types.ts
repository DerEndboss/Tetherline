import type { SimEvent } from '../commands';
import type { Building } from '../state';
import type { World } from '../world';

/** Per-tick context every block update gets. */
export interface TickContext {
  /** Seconds per tick. */
  dt: number;
  tick: number;
  events: SimEvent[];
  /** Share of its power demand a building gets this tick (1 for buildings that use none). */
  power: (b: Building) => number;
}

/**
 * The code of one behaviour (content `BuildingDef.behaviour`). All hooks are optional. Item hand-off follows
 * Mindustry: the giver asks `accept`, then calls `handle`; nothing else moves items between buildings.
 */
export interface BlockBehaviour {
  /** Whether `b` takes `item` (material index) from `source` right now. */
  accept?(w: World, b: Building, item: number, source: Building): boolean;
  /** Takes the item; only called right after `accept` returned true. */
  handle?(w: World, b: Building, item: number, source: Building): void;
  /** Once per tick while finished. */
  update?(w: World, b: Building, ctx: TickContext): void;
  /** Construction finished. */
  built?(w: World, b: Building): void;
  /** About to be removed (unlink partners, hand items back). */
  removed?(w: World, b: Building): void;
  /** A consumer that has nothing to do uses no power. Default: true. */
  wantsPower?(w: World, b: Building): boolean;
}
