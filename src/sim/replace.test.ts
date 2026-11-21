import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { beltItems } from './belts';
import { BELT_LEN, TICK_HZ } from './constants';
import { startSite } from './construction';
import { beltLine, paint, placeNow, testWorld } from './dev';
import { placementProblem } from './placement';
import type { Building } from './state';
import { run, step } from './tick';
import type { World } from './world';

const M = (id: string) => content.materials.indexOf(id);
const K = (id: string) => content.buildings.indexOf(id);
const seconds = (s: number) => Math.round(s * TICK_HZ);
const ctx = () => ({ dt: 0, tick: 0, events: [], power: () => 1 });
const gap = Math.floor(BELT_LEN / content.rules.beltSlots);

/** A drill on copper feeding a belt line of `n` tiles east that ends in nothing (a jam). */
function jammedLine(n: number): { w: World; line: Building[] } {
  const w = testWorld(content);
  placeNow(w, 'core-shard', 30, 30);
  paint(w, 'ore-copper', 4, 10, 2, 2);
  placeNow(w, 'mechanical-drill', 4, 10);
  const line = beltLine(w, 6, 10, 0, n);
  run(w, seconds(90));
  return { w, line };
}

describe('belt jams', () => {
  it('a jammed line closes up evenly: full tiles, every gap kept, also across tile seams', () => {
    const { w, line } = jammedLine(4);
    const items = line.map((b) => beltItems(w.state.belts, b.slot));
    for (const tile of items) {
      expect(tile.length).toBe(3);
      for (let i = 1; i < tile.length; i++) expect(tile[i - 1]![1] - tile[i]![1]).toBeGreaterThanOrEqual(gap);
    }
    for (let t = 0; t + 1 < items.length; t++) {
      const front = items[t]![0]![1];
      const lastAhead = items[t + 1]![2]![1];
      expect(BELT_LEN - front + lastAhead).toBeGreaterThanOrEqual(gap);
    }
  });

  it('runs on as soon as there is room again, without losing or doubling items', () => {
    const { w, line } = jammedLine(3);
    const onBelts = () => line.reduce((n, b) => n + beltItems(w.state.belts, b.slot).length, 0);
    const before = onBelts();
    const box = placeNow(w, 'container', 9, 10);
    run(w, seconds(1));
    const moved = box.items[M('copper-ore')] ?? 0;
    expect(moved).toBeGreaterThan(0);
    expect(onBelts() + moved).toBeGreaterThanOrEqual(before);
  });
});

describe('replacing belts', () => {
  it('belts and pipes do not block placement, real buildings do', () => {
    const w = testWorld(content);
    placeNow(w, 'conveyor', 5, 5);
    placeNow(w, 'conduit', 6, 5);
    paint(w, 'ore-copper', 10, 10, 2, 2);
    placeNow(w, 'mechanical-drill', 10, 10);
    expect(placementProblem(w, content.buildings.get('smelter'), 5, 5)).toBeNull();
    expect(placementProblem(w, content.buildings.get('conveyor'), 10, 10)).toBe('occupied');
  });

  it('a faster belt over a belt swaps in place and keeps the items riding on it', () => {
    const { w, line } = jammedLine(3);
    const mid = line[1]!;
    const items = beltItems(w.state.belts, mid.slot);
    const copper = w.state.stock[M('copper-ore')]!;
    const site = startSite(w, { kind: K('fast-conveyor'), x: mid.x, y: mid.y, rot: 0, config: -1 }, ctx());
    expect(site).toBe(mid);
    expect(w.def(mid).id).toBe('fast-conveyor');
    expect(mid.build).toBe(0);
    expect(beltItems(w.state.belts, mid.slot)).toEqual(items);
    expect(w.state.stock[M('copper-ore')]!).toBeGreaterThanOrEqual(copper);
  });

  it('a machine over belts removes them and sends their items to the core', () => {
    const { w, line } = jammedLine(3);
    const held = beltItems(w.state.belts, line[0]!.slot).length + beltItems(w.state.belts, line[1]!.slot).length;
    const copper = w.state.stock[M('copper-ore')]!;
    const site = startSite(w, { kind: K('smelter'), x: 6, y: 10, rot: 0, config: -1 }, ctx());
    expect(typeof site).toBe('object');
    expect(w.state.buildings.includes(line[0]!)).toBe(false);
    expect(w.state.stock[M('copper-ore')]!).toBeGreaterThanOrEqual(copper + held);
  });
});

describe('wrecks', () => {
  it('a wreck blueprint is locked until the wreck is salvaged, which also gives scrap', () => {
    const w = testWorld(content);
    placeNow(w, 'core-shard', 30, 30);
    w.state.map.wrecks.push({ x: 10, y: 10, building: 'phase-conveyor', taken: false });
    const def = content.buildings.get('phase-conveyor');
    expect(placementProblem(w, def, 5, 5)).toBe('locked');
    const events = step(w, [{ type: 'salvage', x: 12, y: 11 }]);
    expect(events.some((e) => e.type === 'wreck-salvaged')).toBe(true);
    expect(placementProblem(w, def, 5, 5)).toBeNull();
    expect(w.state.stock[M('scrap')]).toBeGreaterThan(0);
    expect(w.state.map.wrecks[0]!.taken).toBe(true);
  });
});
