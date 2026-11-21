import type { MapState } from '../state';

/** Tile helpers shared by the generator steps. */
export interface Point {
  x: number;
  y: number;
}

export const idx = (map: MapState, x: number, y: number): number => y * map.w + x;

export const inMap = (map: MapState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < map.w && y < map.h;

export const isLand = (map: MapState, x: number, y: number): boolean => inMap(map, x, y) && map.ground[y * map.w + x]! > 0;

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Visits every tile within `radius` of (cx, cy) that lies on the map. */
export function eachInDisc(map: MapState, cx: number, cy: number, radius: number, visit: (x: number, y: number, d: number) => void): void {
  const r = Math.ceil(radius);
  for (let y = Math.max(0, Math.floor(cy) - r); y <= Math.min(map.h - 1, Math.floor(cy) + r); y++) {
    for (let x = Math.max(0, Math.floor(cx) - r); x <= Math.min(map.w - 1, Math.floor(cx) + r); x++) {
      const d = dist(x + 0.5, y + 0.5, cx, cy);
      if (d <= radius) visit(x, y, d);
    }
  }
}
