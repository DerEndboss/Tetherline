import type { ContentRegistry } from '../../content/registry';
import type { MapState } from '../state';
import type { Point } from './grid';

/**
 * The opening check (S4: copper and iron "existed", but the first line found no room).
 * A start ore counts only when, within OPEN_RADIUS of the core, it gives room for enough drills of the first
 * kind (2x2, at least two ore tiles each, on buildable ground, not overlapping), each with a free tile beside it
 * for the belt that carries the ore away. Copper and iron need a first line (six drills); coal feeds the graphite
 * press, the silicon smelter and the "coal run" order at once (S6: two small patches went to the presses and 80
 * coal never reached the core for 70 minutes), sand the silicon smelter and the kiln. The generator stamps one
 * more start patch when an ore falls short (`openingShort`); the test checks every seed of every size and world.
 */
export const OPENING_SLOTS: Readonly<Record<string, number>> = { 'ore-copper': 6, 'ore-iron': 6, 'ore-coal': 12, sand: 8 };
export const OPEN_RADIUS = 24;
const DRILL = 2;

/** Land a building can stand on: ground, no ridge, no deep liquid. */
function buildable(content: ContentRegistry, map: MapState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const i = y * map.w + x;
  if (!map.ground[i] || map.ridge[i]) return false;
  const f = map.floor[i]!;
  return !(f > 0 && content.floors.list[f - 1]?.deep);
}

/** Ore tiles of `floor` under a 2x2 drill at (x, y); -1 when the footprint is not all buildable. */
function oreUnder(content: ContentRegistry, map: MapState, x: number, y: number, floor: number): number {
  let n = 0;
  for (let ty = y; ty < y + DRILL; ty++) {
    for (let tx = x; tx < x + DRILL; tx++) {
      if (!buildable(content, map, tx, ty)) return -1;
      if (map.floor[ty * map.w + tx] === floor) n++;
    }
  }
  return n;
}

/** Whether a free buildable tile (not ore, not taken by another slot) lies beside a 2x2 footprint. */
function beltBeside(content: ContentRegistry, map: MapState, x: number, y: number, taken: Uint8Array): boolean {
  for (let k = 0; k < DRILL; k++) {
    for (const [tx, ty] of [[x - 1, y + k], [x + DRILL, y + k], [x + k, y - 1], [x + k, y + DRILL]] as const) {
      if (buildable(content, map, tx, ty) && !taken[ty * map.w + tx]) return true;
    }
  }
  return false;
}

/** Drill slots of a start ore near the core, greedy and without overlap (row by row). */
export function openingSlots(content: ContentRegistry, map: MapState, centre: Point, floorId: string): number {
  const floor = content.floors.indexOf(floorId) + 1;
  const taken = new Uint8Array(map.w * map.h);
  const r = OPEN_RADIUS;
  let slots = 0;
  for (let y = Math.floor(centre.y - r); y <= centre.y + r; y++) {
    for (let x = Math.floor(centre.x - r); x <= centre.x + r; x++) {
      if (Math.hypot(x + 1 - centre.x, y + 1 - centre.y) > r || taken[y * map.w + x]) continue;
      if (oreUnder(content, map, x, y, floor) < 2 || takenAny(map, taken, x, y) || !beltBeside(content, map, x, y, taken)) continue;
      for (let ty = y; ty < y + DRILL; ty++) for (let tx = x; tx < x + DRILL; tx++) taken[ty * map.w + tx] = 1;
      slots++;
    }
  }
  return slots;
}

function takenAny(map: MapState, taken: Uint8Array, x: number, y: number): boolean {
  for (let ty = y; ty < y + DRILL; ty++) for (let tx = x; tx < x + DRILL; tx++) if (taken[ty * map.w + tx]) return true;
  return false;
}

/** The start ores whose opening falls short on this map. */
export function openingShort(content: ContentRegistry, map: MapState, centre: Point): string[] {
  return Object.entries(OPENING_SLOTS)
    .filter(([f, n]) => content.floors.has(f) && openingSlots(content, map, centre, f) < n)
    .map(([f]) => f);
}
