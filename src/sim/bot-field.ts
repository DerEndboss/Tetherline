import { drillInfoAt } from './blocks/production';
import { Space, type BeltStep, type Patch, type Tile } from './bot-space';
import type { PlanSpec } from './commands';
import { DX, DY, edgeTiles } from './grid';
import type { Dir } from './state';

/**
 * Mining layouts. A comb is a straight trunk belt through an ore patch with a drill on each side of it: the drills
 * hand their ore to the trunk, the trunk carries it out of the patch. Ore tiles under the trunk are lost, so the
 * search picks the line and the window of drills that cover the most ore.
 */

export interface CombOptions {
  drill: string;
  size: number;
  tier: number;
  /** Most drills on the trunk. */
  maxDrills: number;
  /** Fewest ore tiles a drill needs under it to be worth placing. */
  minOre: number;
  /** Where the ore should go: the exit nearer to it wins. */
  near: Tile;
}

export interface Comb {
  drills: PlanSpec[];
  /** The trunk, from the far end to the exit; the last step is the exit belt. */
  trunk: BeltStep[];
  /** Direction the exit belt faces; the tile in front of it is where the line goes on. */
  exitDir: Dir;
  ore: number;
  score: number;
}

interface Slot {
  tile: Tile;
  value: number;
}

/** The drill slot `u..u+size` along the trunk and `v0..v0+size` across it, in map coordinates. */
function slotAt(space: Space, patch: Patch, o: CombOptions, horizontal: boolean, u: number, v0: number): Slot | null {
  const tile = horizontal ? { x: u, y: v0 } : { x: v0, y: u };
  if (!space.freeRect(tile.x, tile.y, o.size) || besideBelt(space, tile, o.size)) return null;
  const info = drillInfoAt(space.world, tile.x, tile.y, o.size, o.tier);
  return info.item === patch.item && info.count >= o.minOre ? { tile, value: info.count } : null;
}

/**
 * Whether a drill here would touch a belt that stands already: drills hand ore to any conveyor beside them, so it
 * would pour ore into someone else's line (copper ore clogged a product belt and kept a kiln's glass out of it).
 */
function besideBelt(space: Space, t: Tile, size: number): boolean {
  for (const [x, y] of edgeTiles({ x: t.x, y: t.y, size })) if (space.isBelt(x, y)) return true;
  return false;
}

interface Column {
  u: number;
  slots: Slot[];
  /** Trunk tiles of this column are all free. */
  open: boolean;
}

function columnAt(space: Space, patch: Patch, o: CombOptions, horizontal: boolean, u: number, v: number): Column {
  const slots: Slot[] = [];
  let open = true;
  for (let k = 0; k < o.size; k++) {
    const t = horizontal ? { x: u + k, y: v } : { x: v, y: u + k };
    if (!space.free(t.x, t.y) || space.nearEmitter(t.x, t.y)) open = false;
  }
  if (open) {
    for (const v0 of [v - o.size, v + 1]) {
      const s = slotAt(space, patch, o, horizontal, u, v0);
      if (s) slots.push(s);
    }
  }
  return { u, slots, open };
}

function windows(cols: Column[], max: number): Column[][] {
  const out: Column[][] = [];
  for (let a = 0; a < cols.length; a++) {
    let n = 0;
    for (let b = a; b < cols.length && cols[b]!.open; b++) {
      n += cols[b]!.slots.length;
      if (n > max) break;
      if (n > 0 && cols[a]!.slots.length > 0 && cols[b]!.slots.length > 0) out.push(cols.slice(a, b + 1));
    }
  }
  return out;
}

function exitOf(horizontal: boolean, u: number, v: number, positive: boolean, size: number): { tile: Tile; dir: Dir } {
  const end = positive ? u + size - 1 : u;
  const dir = (horizontal ? (positive ? 0 : 2) : positive ? 1 : 3) as Dir;
  return { tile: horizontal ? { x: end, y: v } : { x: v, y: end }, dir };
}

function toComb(space: Space, o: CombOptions, horizontal: boolean, v: number, win: Column[], positive: boolean): Comb | null {
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const exit = exitOf(horizontal, positive ? last.u : first.u, v, positive, o.size);
  const next = { x: exit.tile.x + DX[exit.dir]!, y: exit.tile.y + DY[exit.dir]! };
  if (!space.free(next.x, next.y)) return null;
  const tiles: Tile[] = [];
  for (let u = first.u; u < last.u + o.size; u++) tiles.push(horizontal ? { x: u, y: v } : { x: v, y: u });
  if (!positive) tiles.reverse();
  const slots = win.flatMap((c) => c.slots);
  const ore = slots.reduce((n, s) => n + s.value, 0);
  const trunk: BeltStep[] = tiles.map((t) => ({ ...t, rot: exit.dir }));
  const dist = Math.abs(next.x - o.near.x) + Math.abs(next.y - o.near.y);
  const drills: PlanSpec[] = slots.map((s) => ({ kind: o.drill, x: s.tile.x, y: s.tile.y, rot: 0 }));
  return { drills, trunk, exitDir: exit.dir, ore, score: ore * 4 - dist * 0.6 - tiles.length * 0.3 };
}

/** Every comb along one trunk line (all phases of the drill grid, both exits) that fits. */
function combsOnLine(space: Space, patch: Patch, o: CombOptions, horizontal: boolean, v: number, u0: number, u1: number): Comb[] {
  const out: Comb[] = [];
  for (let phase = 0; phase < o.size; phase++) {
    const cols: Column[] = [];
    for (let u = u0 + phase; u + o.size <= u1 + 1; u += o.size) cols.push(columnAt(space, patch, o, horizontal, u, v));
    for (const win of windows(cols, o.maxDrills)) {
      for (const positive of [true, false]) {
        const c = toComb(space, o, horizontal, v, win, positive);
        if (c) out.push(c);
      }
    }
  }
  return out;
}

/** The best comb on a patch for these options, or null when nothing fits. */
export function planComb(space: Space, patch: Patch, o: CombOptions): Comb | null {
  let best: Comb | null = null;
  for (const horizontal of [true, false]) {
    const [u0, u1, v0, v1] = horizontal ? [patch.x0 - 1, patch.x1 + 1, patch.y0 - o.size, patch.y1 + o.size] : [patch.y0 - 1, patch.y1 + 1, patch.x0 - o.size, patch.x1 + o.size];
    for (let v = v0; v <= v1; v++) {
      for (const c of combsOnLine(space, patch, o, horizontal, v, u0, u1)) if (!best || c.score > best.score) best = c;
    }
  }
  return best;
}
