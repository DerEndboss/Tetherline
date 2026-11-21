import type { ContentRegistry } from '../content/registry';
import { BELT_SLOTS } from './constants';
import { beltGap } from './blocks/conveyor';
import { paint, placeNow, testWorld } from './dev';
import type { Dir } from './state';
import type { World } from './world';

/**
 * The performance scene (target: 60 fps with 3,000 buildings and 10,000 items on belts): rings of
 * conveyors with items that keep circling, plus drill -> smelter -> core lines. Dev only (`?dev&stress`,
 * `npm run bench`).
 */
export interface StressOptions {
  buildings: number;
  items: number;
}

/** A closed ring of conveyors around a w x h box with its top-left at (x, y), running clockwise. */
function ring(w: World, x: number, y: number, rw: number, rh: number): number {
  const tiles: [number, number, Dir][] = [];
  for (let i = 0; i < rw - 1; i++) tiles.push([x + i, y, 0]);
  for (let i = 0; i < rh - 1; i++) tiles.push([x + rw - 1, y + i, 1]);
  for (let i = 0; i < rw - 1; i++) tiles.push([x + rw - 1 - i, y + rh - 1, 2]);
  for (let i = 0; i < rh - 1; i++) tiles.push([x, y + rh - 1 - i, 3]);
  for (const [tx, ty, d] of tiles) placeNow(w, 'conveyor', tx, ty, d);
  return tiles.length;
}

/** Spreads `total` items evenly over the conveyors (`ratio` per belt, spaced by the belt gap). */
function fill(w: World, total: number, ratio: number): void {
  const s = w.state.belts;
  const gap = beltGap(w);
  const items = w.content.materials.list.length;
  let k = 0;
  let left = total;
  for (const b of w.state.buildings) {
    if (b.slot < 0 || left <= 0) continue;
    const n = Math.min(left, Math.floor((k + 1) * ratio) - Math.floor(k * ratio));
    k++;
    for (let i = 0; i < n; i++) {
      s.item[b.slot * BELT_SLOTS + i] = (b.id + i) % items;
      s.pos[b.slot * BELT_SLOTS + i] = (n - 1 - i) * gap;
    }
    s.count[b.slot] = n;
    left -= n;
  }
}

/** Drill -> smelter pairs on iron next to the rings (busy crafters, power-free). */
function factories(w: World, x0: number, y0: number, pairs: number, width: number): void {
  for (let i = 0; i < pairs; i++) {
    const x = x0 + (i % width) * 5;
    const y = y0 + Math.floor(i / width) * 3;
    paint(w, 'ore-iron', x, y, 2, 2);
    placeNow(w, 'mechanical-drill', x, y);
    placeNow(w, 'smelter', x + 2, y);
  }
}

/**
 * Belts enough to carry `items` while still moving (at most 2.5 items per belt; a full ring would jam and cost
 * nothing), at least 80 % of `buildings`; the rest of `buildings` (at least a fifth) are drill -> smelter pairs.
 */
export function stressWorld(content: ContentRegistry, opts: StressOptions): World {
  const side = 6;
  const perRing = (side - 1) * 4;
  const wanted = Math.max(opts.buildings * 0.8, opts.items / Math.min(2.5, content.rules.beltSlots));
  const rings = Math.max(1, Math.round(wanted / perRing));
  const across = Math.ceil(Math.sqrt(rings));
  const pairs = Math.max(0, Math.round(Math.max(opts.buildings * 0.2, opts.buildings - rings * perRing) / 2));
  const size = across * (side + 1) + 20;
  const w = testWorld(content, size, size + Math.ceil(pairs / Math.floor(size / 5)) * 3 + 10, 7);
  placeNow(w, 'core-shard', 2, 2);
  for (let i = 0; i < rings; i++) ring(w, 8 + (i % across) * (side + 1), 8 + Math.floor(i / across) * (side + 1), side, side);
  const belts = rings * perRing;
  fill(w, opts.items, Math.min(w.content.rules.beltSlots, opts.items / belts));
  factories(w, 2, size, pairs, Math.floor(size / 5) - 1);
  return w;
}
