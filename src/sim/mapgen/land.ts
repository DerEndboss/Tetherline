import type { MapSizeDef } from '../../content/types';
import { nextFloat, type RngState } from '../rng';
import type { MapState } from '../state';
import { DIRS, dist, type Point } from './grid';
import { distanceToZero, openMask } from './edt';
import { fbm } from './noise';

/** One land piece: a noisy disc. */
export interface Blob extends Point {
  r: number;
}

/** Free margin of void around the landmass, in tiles. */
export const MARGIN = 6;
/** Radius of the solid start area around the map centre. */
export const START_DISC = 10;

const between = (rng: RngState, lo: number, hi: number): number => lo + nextFloat(rng) * (hi - lo);

/** The main piece in the middle plus `size.pieces - 1` satellites inside the landmass circle, spread around. */
export function planBlobs(rng: RngState, size: MapSizeDef, centre: number): Blob[] {
  const reach = size.diameter / 2 - 2;
  const blobs: Blob[] = [{ x: centre, y: centre, r: size.diameter * between(rng, 0.24, 0.29) }];
  const turn = nextFloat(rng) * Math.PI * 2;
  for (let i = 1; i < size.pieces; i++) {
    const r = size.diameter * between(rng, 0.09, 0.17);
    const base = turn + ((i - 1) / (size.pieces - 1)) * Math.PI * 2;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = base + between(rng, -0.5, 0.5);
      const far = between(rng, blobs[0]!.r * 0.9 + r * 0.6, Math.max(blobs[0]!.r * 0.9 + r * 0.6, reach - r));
      const at = { x: centre + Math.cos(angle) * far, y: centre + Math.sin(angle) * far, r };
      const gap = attempt < 40 ? size.minWidth : -r * 0.5;
      if (blobs.every((b) => dist(at.x, at.y, b.x, b.y) >= b.r + r + gap)) {
        blobs.push(at);
        break;
      }
      if (attempt === 59) blobs.push(at);
    }
  }
  return blobs;
}

/** Land bridges: a spanning tree over the pieces (nearest first) and, on bigger maps, one extra loop. */
export function planBridges(rng: RngState, blobs: Blob[]): [Blob, Blob][] {
  const linked = new Set<number>([0]);
  const links: [Blob, Blob][] = [];
  while (linked.size < blobs.length) {
    let best: [number, number, number] = [Infinity, 0, 0];
    for (const a of linked) {
      blobs.forEach((b, j) => {
        const d = linked.has(j) ? Infinity : dist(blobs[a]!.x, blobs[a]!.y, b.x, b.y) - blobs[a]!.r - b.r;
        if (d < best[0]) best = [d, a, j];
      });
    }
    linked.add(best[2]);
    links.push([blobs[best[1]]!, blobs[best[2]]!]);
  }
  if (blobs.length >= 5 && nextFloat(rng) < 0.7) {
    const a = 1 + Math.floor(nextFloat(rng) * (blobs.length - 1));
    const b = 1 + Math.floor(nextFloat(rng) * (blobs.length - 1));
    if (a !== b && !links.some(([p, q]) => (p === blobs[a] && q === blobs[b]) || (p === blobs[b] && q === blobs[a]))) links.push([blobs[a]!, blobs[b]!]);
  }
  return links;
}

function segmentDistance(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return dist(px, py, a.x + dx * t, a.y + dy * t);
}

function blobCovers(b: Blob, i: number, x: number, y: number, seed: number): boolean {
  const d = dist(x + 0.5, y + 0.5, b.x, b.y);
  if (d > b.r * 1.3) return false;
  return d < b.r * (0.72 + 0.56 * fbm(x / 12 + i * 5.1, y / 12 + i * 3.7, seed + i * 13));
}

function bridgeCovers(link: [Blob, Blob], x: number, y: number, seed: number, half: number): boolean {
  const wobble = 0.88 + 0.3 * fbm(x / 7, y / 7, seed + 41);
  return segmentDistance(x + 0.5, y + 0.5, link[0], link[1]) < half * wobble;
}

/** Land-or-not for every tile: the pieces and bridges, clipped to the landmass circle. */
function rasterise(map: MapState, blobs: Blob[], links: [Blob, Blob][], minWidth: number, seed: number, radius: number): Uint8Array {
  const mask = new Uint8Array(map.w * map.h);
  const c = map.w / 2;
  const half = minWidth * 0.75;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (dist(x + 0.5, y + 0.5, c, c) > radius) continue;
      if (blobs.some((b, i) => blobCovers(b, i, x, y, seed)) || links.some((l) => bridgeCovers(l, x, y, seed, half))) mask[y * map.w + x] = 1;
    }
  }
  return mask;
}

/** Tiles reachable from `start` over 4-neighbours that pass `ok` (1 = reached). */
export function flood(w: number, h: number, start: number, ok: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(w * h);
  if (!ok(start)) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!seen[n] && ok(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return seen;
}

/** Size of a void part and whether it touches the map edge (open sea) or is enclosed. */
function measure(part: Uint8Array, w: number, h: number): { size: number; rim: boolean } {
  let size = 0;
  let rim = false;
  for (let i = 0; i < part.length; i++) {
    if (!part[i]) continue;
    size++;
    const x = i % w;
    const y = (i - x) / w;
    rim ||= x === 0 || y === 0 || x === w - 1 || y === h - 1;
  }
  return { size, rim };
}

/** Small enclosed voids (specks of sky inside land) become land; big bays stay. */
function fillPonds(mask: Uint8Array, w: number, h: number, limit: number): void {
  const outer = mask.map((m) => 1 - m);
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < outer.length; start++) {
    if (!outer[start] || seen[start]) continue;
    const part = flood(w, h, start, (i) => outer[i] === 1);
    part.forEach((p, i) => p && (seen[i] = 1));
    const { size, rim } = measure(part, w, h);
    if (!rim && size < limit) part.forEach((p, i) => p && (mask[i] = 1));
  }
}

/** What `shapeLand` hands on. */
export interface LandResult {
  blobs: Blob[];
  /** Distance to the nearest void tile; ridges and features keep away from thin land with it. */
  coast: Float32Array;
}

/**
 * Organic landmass: pieces and bridges, opened to the minimum width, only the part holding the start kept,
 * ground tones from noise. `map.ground` ends up 0 (void) or the 1-based tone.
 */
export function shapeLand(map: MapState, size: MapSizeDef, rng: RngState, seed: number, tones: number): LandResult {
  const centre = map.w / 2;
  const blobs = planBlobs(rng, size, centre);
  const links = planBridges(rng, blobs);
  const mask = rasterise(map, blobs, links, size.minWidth, seed, size.diameter / 2);
  const c = Math.floor(centre);
  for (let y = c - START_DISC; y <= c + START_DISC; y++) for (let x = c - START_DISC; x <= c + START_DISC; x++) if (dist(x, y, c, c) < START_DISC) mask[y * map.w + x] = 1;
  fillPonds(mask, map.w, map.h, 260);
  openMask(mask, map.w, map.h, size.minWidth);
  const main = flood(map.w, map.h, c * map.w + c, (i) => mask[i] === 1);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!main[i]) continue;
      const v = Math.min(1, Math.max(0, (fbm(x / 9, y / 9, seed + 3) - 0.5) * 2 + 0.5));
      map.ground[i] = Math.min(tones - 1, Math.floor(v * tones)) + 1;
    }
  }
  const inside = new Uint8Array(map.w * map.h);
  for (let i = 0; i < inside.length; i++) inside[i] = map.ground[i] ? 1 : 0;
  return { blobs, coast: distanceToZero(inside, map.w, map.h) };
}
