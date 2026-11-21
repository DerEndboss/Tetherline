import { DX, DY, opposite, turnLeft, turnRight } from '../../sim/grid';
import type { Building, Dir } from '../../sim/state';
import type { World } from '../../sim/world';

/**
 * Where a conveyor tile gets its items from, and the path an item rides across it. Pure maths (no Pixi): the
 * texture bake, the item sprites and the tests share it. A tile always leaves through its front; it is fed
 * from the back (`BACK`), the left (`LEFT`) or the right (`RIGHT`), seen along its heading.
 */
export const BACK = 1;
export const LEFT = 2;
export const RIGHT = 4;
/** Shapes 1..7 (a mask of the three feed sides; 0 draws as a plain straight belt). */
export const SHAPES = 8;

/** What stands on a tile as far as belt shapes care: a belt with a heading, or another building. */
export interface TileProbe {
  belt: boolean;
  rot: Dir;
}

export type Probe = (x: number, y: number) => TileProbe | undefined;

/** The probe of the real world: finished or unfinished buildings on their tiles. */
export function worldProbe(w: World): Probe {
  return (x, y) => {
    const n = w.at(x, y);
    if (!n) return undefined;
    return { belt: w.def(n).behaviour === 'conveyor', rot: n.rot };
  };
}

/** Feed mask of a belt at (x, y) heading `rot`: neighbours that hand items in. */
export function feedMask(probe: Probe, x: number, y: number, rot: Dir): number {
  let mask = 0;
  const sides: [Dir, number][] = [
    [opposite(rot), BACK],
    [turnLeft(rot), LEFT],
    [turnRight(rot), RIGHT],
  ];
  for (const [d, bit] of sides) {
    const nx = x + DX[d]!;
    const ny = y + DY[d]!;
    const n = probe(nx, ny);
    if (!n) continue;
    const into = n.belt && nx + DX[n.rot]! === x && ny + DY[n.rot]! === y;
    // a machine or router straight behind feeds the belt too; beside it only belts that point in are drawn
    if (into || (bit === BACK && !n.belt)) mask |= bit;
  }
  return mask || BACK;
}

export const feedMaskOf = (w: World, b: Building): number => feedMask(worldProbe(w), b.x, b.y, b.rot);

/** A single side feed and nothing behind: the belt bends. */
export const isCorner = (mask: number): boolean => mask === LEFT || mask === RIGHT;

/** Unit grid direction vectors of a heading. */
export const dirX = (d: number): number => DX[d & 3]!;
export const dirY = (d: number): number => DY[d & 3]!;

/**
 * Local grid point (tile centre = 0, 0; edges at +-0.5) of an item `t` (0..1) of the way across a tile heading
 * `rot` with feed `mask`: straight from the back edge to the front edge, or a quarter circle around the inner
 * corner from the side edge (the same curve the belt art draws). Writes into `out` (no allocation).
 */
export function pathPoint(mask: number, rot: Dir, t: number, out: { x: number; y: number }): void {
  const fx = dirX(rot);
  const fy = dirY(rot);
  if (!isCorner(mask)) {
    out.x = fx * (t - 0.5);
    out.y = fy * (t - 0.5);
    return;
  }
  const side = mask === LEFT ? turnLeft(rot) : turnRight(rot);
  const sx = dirX(side) * 0.5;
  const sy = dirY(side) * 0.5;
  // exact ends (cos/sin of a right angle are not exactly 0)
  const c = t <= 0 ? 1 : t >= 1 ? 0 : Math.cos(t * (Math.PI / 2));
  const s = t <= 0 ? 0 : t >= 1 ? 1 : Math.sin(t * (Math.PI / 2));
  out.x = sx + fx * 0.5 - fx * 0.5 * c - sx * s;
  out.y = sy + fy * 0.5 - fy * 0.5 * c - sy * s;
}

/** Heading (unit vector) of the path at `t`, for treads along a bend. */
export function pathTangent(mask: number, rot: Dir, t: number, out: { x: number; y: number }): void {
  const fx = dirX(rot);
  const fy = dirY(rot);
  if (!isCorner(mask)) {
    out.x = fx;
    out.y = fy;
    return;
  }
  const side = mask === LEFT ? turnLeft(rot) : turnRight(rot);
  const a = t * (Math.PI / 2);
  // d/da of the arc: f sin a - s cos a (unit length: f and s are perpendicular unit vectors)
  out.x = fx * Math.sin(a) - dirX(side) * Math.cos(a);
  out.y = fy * Math.sin(a) - dirY(side) * Math.cos(a);
}

/**
 * Where items sit on the next tick, in belt units: the sim's own move rule (each item steps `step` but never
 * closer than `gap` to the one ahead). The renderer blends from the current to this by the tick fraction, so
 * items glide and stop exactly where the sim stops them. Writes into `out`; returns the count.
 */
export function nextPositions(pos: Int16Array, base: number, n: number, step: number, gap: number, len: number, out: Float32Array): number {
  let limit = len;
  for (let i = 0; i < n; i++) {
    const p = pos[base + i]!;
    const next = Math.max(p, Math.min(p + step, limit));
    out[i] = next;
    limit = next - gap;
  }
  return n;
}
