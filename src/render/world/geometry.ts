import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';
import { footprintExtent, gridToWorld, worldX, worldY, type Point } from '../iso';
import { depthKey } from '../sprite-pool';

/** World px of a footprint's centre on the ground (where building sprites are anchored). */
export function footprintCentre(x: number, y: number, size: number): Point {
  return gridToWorld(x + size / 2, y + size / 2);
}

/** Sort key of a footprint: its front-most tile. */
export function footprintDepth(x: number, y: number, size: number): number {
  return depthKey(x + size - 1, y + size - 1);
}

export function buildingCentre(w: World, b: Building): Point {
  return footprintCentre(b.x, b.y, w.def(b).size);
}

/** Screen width of a footprint in world px (scales placeholder art to fit). */
export function footprintWidth(size: number): number {
  return footprintExtent(size, size).halfW * 2;
}

/** A band from grid point a to b, `half` tiles wide either side, as a flat world-px polygon. */
export function band(ax: number, ay: number, bx: number, by: number, half: number): number[] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  const pts = [
    [ax + nx, ay + ny],
    [bx + nx, by + ny],
    [bx - nx, by - ny],
    [ax - nx, ay - ny],
  ];
  return pts.flatMap(([x, y]) => [worldX(x!, y!), worldY(x!, y!)]);
}
