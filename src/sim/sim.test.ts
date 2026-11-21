import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { beltItems } from './belts';
import { TICK_HZ } from './constants';
import { beltLine, paint, placeNow, testWorld } from './dev';
import { hashValue } from './hash';
import { createRun } from './newgame';
import { powerFactor } from './power';
import { run, step } from './tick';
import type { World } from './world';

const M = (id: string) => content.materials.indexOf(id);
const seconds = (s: number) => Math.round(s * TICK_HZ);
const stock = (w: World, id: string) => w.state.stock[M(id)] ?? 0;

/** A 3x3 core at (20, 20) on a flat map. */
function withCore(): World {
  const w = testWorld(content);
  placeNow(w, 'core-shard', 20, 20);
  return w;
}

describe('the playable checkpoint', () => {
  it('a mechanical drill on copper feeds a belt into the core', () => {
    const w = withCore();
    paint(w, 'ore-copper', 10, 20, 2, 2);
    placeNow(w, 'mechanical-drill', 10, 20);
    beltLine(w, 12, 21, 0, 8); // x 12..19, into the core at x 20
    run(w, seconds(30));
    expect(stock(w, 'copper-ore')).toBeGreaterThan(8);
  });

  it('a drill hands ore straight to a smelter, which hands bars to the core', () => {
    const w = withCore();
    paint(w, 'ore-iron', 16, 20, 2, 2);
    placeNow(w, 'mechanical-drill', 16, 20);
    placeNow(w, 'smelter', 18, 20); // touches the drill (x 17) and the core (x 20)
    run(w, seconds(40));
    expect(stock(w, 'iron-bar')).toBeGreaterThan(3);
  });

  it('the core powers a building that touches it; an unconnected one stands still', () => {
    const w = withCore();
    paint(w, 'ore-copper', 16, 20, 2, 2);
    paint(w, 'ore-copper', 4, 4, 2, 2);
    placeNow(w, 'mechanical-drill', 16, 20);
    const mill = placeNow(w, 'wire-mill', 18, 20);
    placeNow(w, 'mechanical-drill', 4, 4);
    const lonely = placeNow(w, 'wire-mill', 6, 4);
    run(w, seconds(20));
    expect(powerFactor(w, mill)).toBeGreaterThan(0);
    expect(stock(w, 'copper-wire')).toBeGreaterThan(4);
    expect(powerFactor(w, lonely)).toBe(0);
    expect(lonely.items[M('copper-wire')]).toBe(0);
  });
});

describe('ghosts and the builder drone', () => {
  it('builds a queued ghost, paying from the core as it rises', () => {
    const w = createRun(content, { seed: 7 });
    const core = w.core!;
    const before = stock(w, 'copper-ore');
    // a container next to the core, east side
    w.state.plans.push({ kind: content.buildings.indexOf('container'), x: core.x + 3, y: core.y, rot: 0, config: -1 });
    step(w, [{ type: 'dev-give', item: 'iron-bar', n: 100 }]);
    run(w, seconds(20));
    const built = w.state.buildings.find((b) => w.def(b).id === 'container');
    expect(built?.build).toBe(1);
    expect(stock(w, 'copper-ore')).toBe(before - 60);
  });

  it('removal refunds the cost', () => {
    const w = createRun(content, { seed: 7 });
    const core = w.core!;
    step(w, [{ type: 'place', kind: 'conveyor', x: core.x - 2, y: core.y, rot: 0 }]);
    run(w, seconds(5));
    const before = stock(w, 'copper-ore');
    step(w, [{ type: 'remove', x0: core.x - 2, y0: core.y, x1: core.x - 2, y1: core.y }]);
    run(w, seconds(5));
    expect(w.at(core.x - 2, core.y)).toBeUndefined();
    expect(stock(w, 'copper-ore')).toBe(before + 1);
  });

  it('upgrades the core in place', () => {
    const w = createRun(content, { seed: 3 });
    for (const s of content.buildings.get('core-foundation').cost) step(w, [{ type: 'dev-give', item: s.item, n: s.n }]);
    step(w, [{ type: 'upgrade-core' }]);
    run(w, seconds(70));
    expect(w.def(w.core!).id).toBe('core-foundation');
  });
});

describe('logistics', () => {
  it('a junction lets two lines cross', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    paint(w, 'sand', 12, 10, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    beltLine(w, 6, 21, 0, 6); // to x 11
    placeNow(w, 'junction', 12, 21);
    beltLine(w, 13, 21, 0, 7); // to the core
    placeNow(w, 'mechanical-drill', 12, 10);
    beltLine(w, 12, 12, 1, 9); // down to y 20, into the junction at y 21
    beltLine(w, 12, 22, 1, 3); // the vertical line continues and ends in nothing
    run(w, seconds(30));
    expect(stock(w, 'copper-ore')).toBeGreaterThan(4);
    expect(stock(w, 'sand')).toBe(0);
  });

  it('a sorter sends its item straight on and the rest to the side', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    paint(w, 'sand', 6, 22, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    placeNow(w, 'mechanical-drill', 6, 22); // feeds the belt from the side
    beltLine(w, 6, 21, 0, 4);
    placeNow(w, 'sorter', 10, 21, 0, M('sand'));
    beltLine(w, 11, 21, 0, 9); // straight on: sand into the core
    placeNow(w, 'container', 10, 22); // below: the rest
    run(w, seconds(30));
    expect(stock(w, 'sand')).toBeGreaterThan(2);
    expect(stock(w, 'copper-ore')).toBe(0);
    expect(w.at(10, 22)!.items[M('copper-ore')]).toBeGreaterThan(2);
  });

  it('a bridge jumps items over a gap', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    beltLine(w, 6, 21, 0, 3);
    placeNow(w, 'bridge-conveyor', 9, 21, 0);
    placeNow(w, 'bridge-conveyor', 12, 21, 0);
    beltLine(w, 13, 21, 0, 7);
    run(w, seconds(30));
    expect(w.at(9, 21)!.link).toBe(w.at(12, 21)!.id);
    expect(stock(w, 'copper-ore')).toBeGreaterThan(4);
  });

  it('an unloader takes the chosen item out of the core', () => {
    const w = withCore();
    w.state.stock[M('coal')] = 50;
    placeNow(w, 'unloader', 19, 21, 0, M('coal'));
    placeNow(w, 'container', 17, 21);
    run(w, seconds(3));
    expect(w.at(17, 21)!.items[M('coal')]).toBeGreaterThan(10);
  });

  it('a router splits a line', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    beltLine(w, 6, 21, 0, 3);
    placeNow(w, 'router', 9, 21);
    placeNow(w, 'container', 9, 22);
    beltLine(w, 10, 21, 0, 10);
    run(w, seconds(40));
    expect(stock(w, 'copper-ore')).toBeGreaterThan(2);
    expect(w.at(9, 22)!.items[M('copper-ore')]).toBeGreaterThan(2);
  });

  it('a powered mass driver shoots to its partner', () => {
    const w = withCore();
    const a = placeNow(w, 'mass-driver', 2, 2);
    placeNow(w, 'unloader', 19, 22);
    // the receiving driver touches the core; the sending one gets items and power by hand
    const b = placeNow(w, 'mass-driver', 17, 20);
    expect(a.link).toBe(b.id);
    placeNow(w, 'combustion-generator', 5, 2);
    w.at(5, 2)!.items[M('coal')] = 4;
    a.queue[0] = Array.from({ length: 20 }, () => M('sand'));
    run(w, seconds(10));
    expect(stock(w, 'sand')).toBeGreaterThan(0);
  });

  it('keeps 3 items per belt tile, spaced', () => {
    const w = withCore();
    paint(w, 'ore-copper', 4, 21, 2, 2);
    placeNow(w, 'mechanical-drill', 4, 21);
    const line = beltLine(w, 6, 21, 0, 3); // ends in nothing
    run(w, seconds(30));
    const items = beltItems(w.state.belts, line[2]!.slot);
    expect(items.length).toBe(3);
    expect(items[0]![1] - items[1]![1]).toBeGreaterThanOrEqual(333);
  });
});

describe('power', () => {
  it('a node links a generator to a consumer out of reach; batteries store the surplus', () => {
    const w = withCore();
    const gen = placeNow(w, 'combustion-generator', 2, 2);
    gen.items[M('coal')] = 4;
    placeNow(w, 'power-node', 4, 2);
    placeNow(w, 'battery', 2, 3);
    paint(w, 'ore-copper', 8, 2, 2, 2);
    placeNow(w, 'mechanical-drill', 8, 2);
    const mill = placeNow(w, 'wire-mill', 10, 2);
    expect(w.at(4, 2)!.links).toContain(mill.id);
    run(w, seconds(5));
    expect(powerFactor(w, mill)).toBe(1);
    expect(w.at(2, 3)!.charge).toBeGreaterThan(0);
  });
});

describe('liquids', () => {
  it('a pump fills conduits and a tank; parallel conduits stay apart', () => {
    const w = withCore();
    paint(w, 'shallow-water', 2, 10, 1, 1);
    paint(w, 'oil', 1, 11, 1, 1);
    placeNow(w, 'mechanical-pump', 2, 10);
    placeNow(w, 'mechanical-pump', 1, 11); // diagonal to the water pump: not connected
    beltLine(w, 3, 10, 0, 4, 'conduit');
    beltLine(w, 2, 11, 0, 5, 'conduit'); // right under the water line
    const tank = placeNow(w, 'tank', 7, 8);
    run(w, seconds(10));
    expect(tank.liquidId).toBe(content.liquids.indexOf('water'));
    expect(tank.liquid).toBeGreaterThan(50);
    expect(w.at(4, 11)!.liquidId).toBe(content.liquids.indexOf('oil'));
  });
});

describe('determinism', () => {
  it('two runs of a seed end in the same state', () => {
    const play = () => {
      const w = createRun(content, { seed: 42 });
      const c = w.core!;
      step(w, [{ type: 'place', kind: 'conveyor', x: c.x - 1, y: c.y + 1, rot: 0 }]);
      run(w, seconds(20));
      return hashValue({ ...w.state, belts: [...w.state.belts.item] });
    };
    expect(play()).toBe(play());
  });

  it('a generated map has copper, sand, coal and water near the core', () => {
    const w = createRun(content, { seed: 11 });
    const c = w.core!;
    const near = new Set<string>();
    const { map } = w.state;
    for (let y = c.y - 25; y < c.y + 25; y++) {
      for (let x = c.x - 25; x < c.x + 25; x++) {
        const f = map.floor[y * map.w + x] ?? 0;
        if (f) near.add(content.floors.list[f - 1]!.id);
      }
    }
    for (const id of ['ore-copper', 'sand', 'ore-coal', 'shallow-water']) expect(near.has(id)).toBe(true);
  });
});

describe('the checkpoint through ghosts and the drone', () => {
  it('the demo plan (drill, belt, smelter) gets built and fills the core', async () => {
    const { demoCommands } = await import('../game/demo');
    const w = createRun(content, { seed: 7 });
    step(w, demoCommands(w));
    run(w, seconds(120));
    expect(w.state.plans.length).toBe(0);
    expect(stock(w, 'iron-bar')).toBeGreaterThan(0);
    expect(w.state.stats.delivered[M('copper-ore')]).toBeGreaterThan(10);
  });
});
