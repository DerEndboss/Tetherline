import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { HOP_KEEP, HOP_STRIDE } from '../../sim/blocks/transit';
import { beltGap } from '../../sim/blocks/conveyor';
import { BELT_LEN } from '../../sim/constants';
import { placeNow, testWorld } from '../../sim/dev';
import { offer } from '../../sim/items';
import type { Building } from '../../sim/state';
import { run, step } from '../../sim/tick';
import type { World } from '../../sim/world';
import { depthKey } from '../sprite-pool';
import { EXIT_TICKS, HUB_BEHAVIOURS, HubItems, PASS_TICKS, progress, type Put } from './hub-items';

interface Drawn {
  item: number;
  gx: number;
  gy: number;
  lift: number;
  scale: number;
  z: number;
}

const COPPER = content.materials.indexOf('copper-ore');
const IRON = content.materials.indexOf('iron-ore');
const HUGE = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };

/** What `hub.draw` puts on screen for building `b` at `tick + alpha`. */
function drawn(w: World, b: Building, alpha = 0, view = HUGE): Drawn[] {
  const out: Drawn[] = [];
  const put: Put = (item, gx, gy, lift, scale, z) => void out.push({ item, gx, gy, lift, scale, z });
  const hub = new HubItems(put);
  hub.begin(view, 0);
  hub.draw(w, b, w.def(b).behaviour, w.state.tick + alpha);
  return out;
}

/** A belt facing east at (x, y): the source an item comes from. */
const belt = (w: World, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0): Building => placeNow(w, 'conveyor', x, y, rot);

describe('hub items: which blocks', () => {
  it('every kind is a real behaviour of the content', () => {
    const have = new Set<string>(content.buildings.list.map((d) => d.behaviour));
    for (const b of HUB_BEHAVIOURS) expect(have.has(b), b).toBe(true);
  });

  it('progress starts at the entry edge when the render first sees the tick after the one that took the item', () => {
    expect(progress(5, 4, 3)).toBe(0);
    expect(progress(5.5, 4, 3)).toBeCloseTo(0.5 / 3);
    expect(progress(8, 4, 3)).toBe(1);
  });
});

describe('items in a junction', () => {
  function crossing(): { w: World; from: Building; j: Building } {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const j = placeNow(w, 'junction', 6, 10);
    return { w, from, j };
  }

  it('an item glides from the entry edge to the exit edge in the junction delay, and is gone when it leaves', () => {
    const { w, from, j } = crossing();
    const out = belt(w, 7, 10);
    expect(offer(w, from, j, COPPER)).toBe(true);
    step(w);
    // the render's first picture of it: exactly on the edge the belt before left it at (x 6.0), mid tile in y
    const first = drawn(w, j)[0]!;
    expect(first.gx).toBeCloseTo(6.0);
    expect(first.gy).toBeCloseTo(10.5);
    expect(first.item).toBe(COPPER);
    // half a tick later it has moved on, towards the far edge (x 7.0)
    expect(drawn(w, j, 0.5)[0]!.gx).toBeGreaterThan(first.gx);
    let last = first.gx;
    let ticks = 0;
    while (w.state.belts.count[out.slot] === 0 && ticks++ < 20) {
      const g = drawn(w, j, 0.99)[0];
      if (g) {
        expect(g.gx).toBeGreaterThanOrEqual(last);
        last = g.gx;
      }
      step(w);
    }
    // the tick it left, the picture had reached the far edge (where the next belt starts its own item)
    expect(last).toBeGreaterThan(6.6);
    expect(drawn(w, j)).toHaveLength(0);
    expect(w.state.belts.count[out.slot]).toBe(1);
  });

  it('crossing traffic in both directions: one queue per direction, items on their own line', () => {
    const { w, from, j } = crossing();
    const north = belt(w, 6, 9, 1); // heading south: its item crosses towards y + 1
    belt(w, 7, 10);
    belt(w, 6, 11, 1);
    expect(offer(w, from, j, COPPER)).toBe(true);
    expect(offer(w, north, j, IRON)).toBe(true);
    step(w);
    const items = drawn(w, j, 0.5);
    const east = items.find((d) => d.item === COPPER)!;
    const south = items.find((d) => d.item === IRON)!;
    expect(east.gy).toBeCloseTo(10.5);
    expect(south.gx).toBeCloseTo(6.5);
    expect(east.gx).toBeGreaterThan(6);
    expect(south.gy).toBeGreaterThan(10);
  });

  it('items behind a blocked one keep a belt gap and wait at the front edge', () => {
    const { w, from, j } = crossing();
    for (let i = 0; i < 6; i++) {
      offer(w, from, j, COPPER);
      run(w, 1);
    }
    run(w, 10);
    const xs = drawn(w, j).map((d) => d.gx);
    const gap = beltGap(w) / BELT_LEN;
    expect(xs.length).toBeGreaterThanOrEqual(3);
    expect(xs[0]).toBeCloseTo(7.0, 5); // the front item sits on the exit edge, where the blocked neighbour starts
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1]! - xs[i]!).toBeCloseTo(gap, 5);
  });

  it('draws nothing for an empty junction, an unfinished one or one out of view', () => {
    const { w, from, j } = crossing();
    expect(drawn(w, j)).toHaveLength(0);
    offer(w, from, j, COPPER);
    step(w);
    expect(drawn(w, j)).toHaveLength(1);
    expect(drawn(w, j, 0, { left: 5000, top: 5000, right: 6000, bottom: 6000 })).toHaveLength(0);
  });

  it('sorts above the junction sprite and its overlays, below the next row', () => {
    const { w, from, j } = crossing();
    offer(w, from, j, COPPER);
    step(w);
    const item = drawn(w, j)[0]!;
    expect(item.z).toBeGreaterThan(depthKey(j.x, j.y) + 0.02);
    expect(item.z).toBeLessThan(depthKey(j.x, j.y) + 1);
    expect(item.lift).toBeGreaterThan(0);
    expect(item.scale).toBe(1); // the size of a belt item
  });
});

describe('items in a router', () => {
  it('slides from the side it came in on to the middle and stays there while nothing takes it', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const r = placeNow(w, 'router', 6, 10);
    offer(w, from, r, COPPER);
    step(w);
    const start = drawn(w, r)[0]!;
    expect(start.gx).toBeCloseTo(6.0); // the west edge, where the belt before it left the item
    expect(start.gy).toBeCloseTo(10.5);
    run(w, 6);
    const mid = drawn(w, r)[0]!;
    expect(mid.gx).toBeCloseTo(6.5);
    expect(mid.gy).toBeCloseTo(10.5);
  });

  it('slides out to the side a neighbour took it by, then is gone', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const r = placeNow(w, 'router', 6, 10);
    const out = belt(w, 7, 10);
    offer(w, from, r, COPPER);
    // held in the middle until its delay is over, then handed to the only neighbour that takes it (east)
    let ticks = 0;
    while (r.queue[0]?.length && ticks++ < 20) step(w);
    expect(w.state.belts.count[out.slot]).toBe(1);
    const leaving = drawn(w, r)[0]!;
    expect(leaving.gx).toBeCloseTo(6.5); // starts where it sat
    expect(drawn(w, r, 0.99)[0]!.gx).toBeGreaterThan(6.6);
    run(w, EXIT_TICKS);
    expect(drawn(w, r)).toHaveLength(0);
  });
});

describe('items passing a sorter or overflow gate', () => {
  it('crosses the tile edge, middle, edge in PASS_TICKS and is gone after', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const s = placeNow(w, 'sorter', 6, 10, 0, COPPER);
    belt(w, 7, 10);
    expect(offer(w, from, s, COPPER)).toBe(true);
    step(w);
    const at = (a: number): Drawn => drawn(w, s, a)[0]!;
    expect(at(0).gx).toBeCloseTo(6.0);
    expect(at(0).gy).toBeCloseTo(10.5);
    // half way: the middle; at the end of its time: the far edge, then gone
    run(w, PASS_TICKS / 2);
    expect(at(0).gx).toBeCloseTo(6.5);
    run(w, PASS_TICKS / 2 - 1);
    expect(at(0.99).gx).toBeGreaterThan(6.9);
    run(w, 2);
    expect(drawn(w, s)).toHaveLength(0);
  });

  it('a side item leaves by the side it was sent to', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const s = placeNow(w, 'sorter', 6, 10, 0, COPPER);
    belt(w, 6, 11, 1); // south of the sorter
    // iron is not the chosen item: it goes to the side
    expect(offer(w, from, s, IRON)).toBe(true);
    step(w);
    run(w, PASS_TICKS - 1);
    const late = drawn(w, s, 0.9)[0]!;
    expect(late.gx).toBeCloseTo(6.5);
    expect(late.gy).toBeGreaterThan(10.8);
  });

  it('the overflow gate shows its passes the same way', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const g = placeNow(w, 'overflow-gate', 6, 10);
    belt(w, 7, 10);
    expect(offer(w, from, g, COPPER)).toBe(true);
    step(w);
    expect(drawn(w, g)).toHaveLength(1);
  });

  it('keeps only the last few ticks of passes, so the log stays small', () => {
    const w = testWorld(content);
    const from = belt(w, 5, 10);
    const s = placeNow(w, 'sorter', 6, 10, 0, COPPER);
    belt(w, 7, 10);
    for (let i = 0; i < 100; i++) {
      offer(w, from, s, COPPER);
      step(w);
      if (w.state.belts.count[w.at(7, 10)!.slot]! > 2) w.state.belts.count[w.at(7, 10)!.slot] = 0;
    }
    expect(s.queue[0]!.length).toBeLessThanOrEqual((HOP_KEEP + 1) * HOP_STRIDE);
  });
});

describe('items crossing a bridge', () => {
  function bridges(): { w: World; from: Building; a: Building; b: Building } {
    const w = testWorld(content);
    const from = belt(w, 3, 10);
    const a = placeNow(w, 'bridge-conveyor', 4, 10, 0);
    const b = placeNow(w, 'bridge-conveyor', 7, 10, 0);
    return { w, from, a, b };
  }

  it('the two bridges link up as the sim expects', () => {
    const { a, b } = bridges();
    expect(a.link).toBe(b.id);
  });

  it('a waiting item is a pile on top, a hop is a flight over the span on an arc', () => {
    const { w, from, a, b } = bridges();
    belt(w, 8, 10);
    offer(w, from, a, COPPER);
    const waiting = drawn(w, a)[0]!;
    expect(waiting.gx).toBeCloseTo(4.5); // waiting on the sender, on top of it
    expect(waiting.scale).toBe(1);
    // the sender's rate decides the tick it lets go; do not hard-code it
    for (let i = 0; i < 10 && a.queue[0]!.length > 0; i++) step(w);
    expect(a.queue[0]).toHaveLength(0);
    // the flight starts on the sender and reaches the partner at its end
    const start = drawn(w, a)[0]!;
    expect(start.gx).toBeCloseTo(4.5);
    run(w, 2);
    const mid = drawn(w, a)[0]!;
    expect(mid.gx).toBeGreaterThan(4.9);
    expect(mid.gx).toBeLessThan(7.5);
    expect(mid.gy).toBeCloseTo(10.5);
    // higher and a little bigger than the same item waiting, most of all half way
    expect(mid.lift).toBeGreaterThan(waiting.lift);
    expect(mid.scale).toBeGreaterThan(1);
    expect(b.queue[0]!.length + (w.state.belts.count[w.at(8, 10)!.slot] ?? 0)).toBeGreaterThan(0);
    // gone once its time is over
    run(w, HOP_KEEP);
    expect(drawn(w, a)).toHaveLength(0);
  });

  it('flights stay in the log no longer than HOP_KEEP ticks of sends', () => {
    const { w, from, a } = bridges();
    belt(w, 8, 10);
    for (let i = 0; i < 80; i++) {
      offer(w, from, a, COPPER);
      step(w);
      const out = w.at(8, 10)!;
      w.state.belts.count[out.slot] = 0;
    }
    expect((a.queue[1]?.length ?? 0) / HOP_STRIDE).toBeLessThanOrEqual((HOP_KEEP + 1) * 2);
    expect(a.queue[0]).toBeDefined();
  });

  it('a bridge that sends nowhere only holds items', () => {
    const w = testWorld(content);
    const lone = placeNow(w, 'bridge-conveyor', 10, 10, 0);
    offer(w, belt(w, 9, 10), lone, COPPER);
    const d = drawn(w, lone);
    expect(d).toHaveLength(1);
    expect(d[0]!.gx).toBeCloseTo(10.5);
  });
});
