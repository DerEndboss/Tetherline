import type { Dir } from './state';

/** Unit steps per direction (0 east, 1 south, 2 west, 3 north). */
export const DX: readonly number[] = [1, 0, -1, 0];
export const DY: readonly number[] = [0, 1, 0, -1];

export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) & 3) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) & 3) as Dir;
export const asDir = (n: number): Dir => (n & 3) as Dir;

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/** Which side of `a` the rect `b` touches (or lies towards); for touching footprints it is exact. */
export function sideOf(a: Rect, b: Rect): Dir {
  if (b.x >= a.x + a.size) return 0;
  if (b.x + b.size <= a.x) return 2;
  if (b.y >= a.y + a.size) return 1;
  return 3;
}

/** Whether two footprints share an edge (touch without overlapping, not only at a corner). */
export function touches(a: Rect, b: Rect): boolean {
  const ox = a.x < b.x + b.size && b.x < a.x + a.size;
  const oy = a.y < b.y + b.size && b.y < a.y + a.size;
  const adjX = a.x + a.size === b.x || b.x + b.size === a.x;
  const adjY = a.y + a.size === b.y || b.y + b.size === a.y;
  return (adjX && oy) || (adjY && ox);
}

/** Tiles just outside a footprint, clockwise from the east side's top: [x, y, side]. */
export function edgeTiles(r: Rect): [number, number, Dir][] {
  const out: [number, number, Dir][] = [];
  for (let i = 0; i < r.size; i++) out.push([r.x + r.size, r.y + i, 0]);
  for (let i = r.size - 1; i >= 0; i--) out.push([r.x + i, r.y + r.size, 1]);
  for (let i = r.size - 1; i >= 0; i--) out.push([r.x - 1, r.y + i, 2]);
  for (let i = 0; i < r.size; i++) out.push([r.x + i, r.y - 1, 3]);
  return out;
}

/** Shortest distance in tiles between two footprints (0 when touching or overlapping). */
export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.size), a.x - (b.x + b.size));
  const dy = Math.max(0, b.y - (a.y + a.size), a.y - (b.y + b.size));
  return Math.hypot(dx, dy);
}
