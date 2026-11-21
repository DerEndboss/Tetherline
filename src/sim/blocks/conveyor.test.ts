import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { beltItems } from '../belts';
import { BELT_LEN, BELT_SLOTS, TICK_HZ } from '../constants';
import { beltLine, paint, placeNow, testWorld } from '../dev';
import { offer } from '../items';
import type { Building } from '../state';
import { step } from '../tick';
import type { World } from '../world';
import { beltGap, FROM_BACK, FROM_LEFT, SIDE_ENTRY, shownPos, sideOffset } from './conveyor';


/** A drill on copper whose belt runs south two tiles and meets the tile (7, 10) from the north. */
function sideFeed(w: World): void {
  placeNow(w, 'core-shard', 30, 30);
  paint(w, 'ore-copper', 6, 6, 2, 2);
  placeNow(w, 'mechanical-drill', 6, 6);
  beltLine(w, 7, 8, 1, 2);
}

/** Steps until belt `b` holds an item; returns that item's position and origin (or null after `seconds`). */
function firstItem(w: World, b: Building, seconds: number): { pos: number; from: number } | null {
  for (let t = 0; t < seconds * TICK_HZ; t++) {
    step(w);
    if ((w.state.belts.count[b.slot] ?? 0) > 0) {
      const i = b.slot * BELT_SLOTS;
      return { pos: w.state.belts.pos[i]!, from: w.state.belts.from[i]! };
    }
  }
  return null;
}

describe('belt side inputs (Mindustry)', () => {
  it('an item from the side lands mid-belt on a straight belt and remembers its side', () => {
    const w = testWorld(content);
    sideFeed(w);
    const line = beltLine(w, 5, 10, 0, 5);
    const first = firstItem(w, line[2]!, 60);
    expect(first).not.toBeNull();
    expect(first!.from).toBe(FROM_LEFT);
    expect(first!.pos).toBeGreaterThanOrEqual(SIDE_ENTRY);
    expect(first!.pos).toBeLessThan(SIDE_ENTRY + 400);
  });

  it('a single side feed with nothing behind is a bend: the item starts at the back edge', () => {
    const w = testWorld(content);
    sideFeed(w);
    const line = beltLine(w, 7, 10, 0, 3);
    const first = firstItem(w, line[0]!, 60);
    expect(first).not.toBeNull();
    expect(first!.from).toBe(FROM_BACK);
    expect(first!.pos).toBeLessThan(400);
  });

  it('a side item slides from the edge (half a tile) to the middle by the front edge', () => {
    expect(sideOffset(FROM_BACK, 600)).toBe(0);
    expect(sideOffset(FROM_LEFT, SIDE_ENTRY)).toBeCloseTo(0.5);
    expect(sideOffset(FROM_LEFT, 1000)).toBe(0);
    expect(sideOffset(FROM_LEFT, 750)).toBeCloseTo(0.25);
  });
});

/** Puts `items` on belt `b` by hand, front first, at the given positions. */
function load(w: World, b: Building, items: readonly [number, number][]): void {
  const s = w.state.belts;
  items.forEach(([item, pos], i) => {
    s.item[b.slot * BELT_SLOTS + i] = item;
    s.pos[b.slot * BELT_SLOTS + i] = pos;
    s.from[b.slot * BELT_SLOTS + i] = FROM_BACK;
  });
  s.count[b.slot] = items.length;
}

describe('item spacing on belts', () => {
  it('a side item enters mid-belt, or earlier when the item ahead is only a little past 0.7: never closer than a gap', () => {
    const gap = beltGap(testWorld(content));
    for (const rear of [700, 760, 833, 900]) {
      const w = testWorld(content);
      placeNow(w, 'conveyor', 5, 10, 0); // feeds the belt from behind, so the side feed counts as a side feed
      const main = placeNow(w, 'conveyor', 6, 10, 0);
      const side = placeNow(w, 'conveyor', 6, 9, 1);
      load(w, main, [[0, rear]]);
      expect(offer(w, side, main, 1)).toBe(true);
      const [ahead, landed] = beltItems(w.state.belts, main.slot);
      expect(ahead![1] - landed![1]).toBeGreaterThanOrEqual(gap);
      expect(landed![1]).toBeLessThanOrEqual(SIDE_ENTRY);
      expect(w.state.belts.from[main.slot * BELT_SLOTS + 1]).toBe(FROM_LEFT);
    }
  });

  it('a side item that lands before the middle is drawn at the mouth of the side belt, not upstream of it (no jump)', () => {
    for (const rear of [700, 760, 833, 900]) {
      const w = testWorld(content);
      placeNow(w, 'conveyor', 5, 10, 0);
      const main = placeNow(w, 'conveyor', 6, 10, 0);
      const side = placeNow(w, 'conveyor', 6, 9, 1);
      load(w, main, [[0, rear]]);
      expect(offer(w, side, main, 1)).toBe(true);
      const landed = w.state.belts.pos[main.slot * BELT_SLOTS + 1]!;
      const from = w.state.belts.from[main.slot * BELT_SLOTS + 1]!;
      // the side belt's lane ends at the middle of this tile, at the edge: that is where the item shows first
      expect(shownPos(from, landed)).toBe(SIDE_ENTRY);
      expect(sideOffset(from, shownPos(from, landed))).toBeCloseTo(0.5);
      // later it is drawn where the sim has it, and an item from behind is never moved
      expect(shownPos(from, SIDE_ENTRY + 150)).toBe(SIDE_ENTRY + 150);
      expect(shownPos(FROM_BACK, 100)).toBe(100);
    }
  });

  it('a side item waits while the rearmost one is still before 0.7', () => {
    const w = testWorld(content);
    placeNow(w, 'conveyor', 5, 10, 0);
    const main = placeNow(w, 'conveyor', 6, 10, 0);
    const side = placeNow(w, 'conveyor', 6, 9, 1);
    load(w, main, [[0, 650]]);
    expect(offer(w, side, main, 1)).toBe(false);
  });

  it('a dense fast side line merging into a slow main never puts two items closer than a gap, in a tile or across a seam', () => {
    const w = testWorld(content);
    placeNow(w, 'core-shard', 30, 30);
    const main = beltLine(w, 20, 31, 0, 10);
    const side = beltLine(w, 25, 24, 1, 7, 'fast-conveyor');
    const gap = beltGap(w);
    const full = (): [number, number][] => [[1, BELT_LEN], [1, BELT_LEN - gap], [1, BELT_LEN - 2 * gap]];
    let seen = 0;
    for (let tick = 0; tick < TICK_HZ * 8; tick++) {
      // the side line is kept full, so it offers an item to the main belt almost every tick
      for (const b of side) if ((w.state.belts.count[b.slot] ?? 0) === 0) load(w, b, full());
      step(w);
      const along: number[] = [];
      main.forEach((b, i) => beltItems(w.state.belts, b.slot).forEach(([, pos]) => along.push(i * BELT_LEN + pos)));
      along.sort((a, c) => a - c);
      for (let i = 1; i < along.length; i++) expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(gap);
      seen += along.length;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
