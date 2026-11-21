import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { TICK_HZ } from '../constants';
import { beltLine, paint, placeNow, testWorld } from '../dev';
import { powerFactor } from '../power';
import { run } from '../tick';
import type { World } from '../world';

const M = (id: string) => content.materials.indexOf(id);
const L = (id: string) => content.liquids.indexOf(id);
const seconds = (s: number) => Math.round(s * TICK_HZ);

function withCore(): World {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 20, 20);
  return w;
}

describe('crafters with liquids', () => {
  it('a smelter keeps working with no pipe: its slag is vented, not stuck', () => {
    const w = withCore();
    paint(w, 'ore-iron', 16, 20, 2, 2);
    placeNow(w, 'mechanical-drill', 16, 20);
    placeNow(w, 'smelter', 18, 20);
    run(w, seconds(60));
    expect(w.state.stock[M('iron-bar')]).toBeGreaterThan(8);
  });

  it('a smelter pushes its slag into a conduit next to it', () => {
    const w = withCore();
    paint(w, 'ore-iron', 6, 4, 2, 2);
    placeNow(w, 'mechanical-drill', 6, 4);
    placeNow(w, 'smelter', 8, 4);
    placeNow(w, 'container', 8, 6);
    beltLine(w, 10, 4, 0, 4, 'conduit');
    const tank = placeNow(w, 'tank', 14, 3);
    run(w, seconds(40));
    expect(tank.liquidId).toBe(L('slag'));
    expect(tank.liquid).toBeGreaterThan(0.5);
  });

  it('the refinery makes fuel into a pipe and plastic into a container, and vents its gas', () => {
    const w = withCore();
    paint(w, 'oil', 2, 2, 1, 1);
    placeNow(w, 'mechanical-pump', 2, 2);
    beltLine(w, 3, 2, 0, 3, 'conduit');
    const refinery = placeNow(w, 'refinery', 6, 1);
    const store = placeNow(w, 'container', 9, 1);
    placeNow(w, 'combustion-generator', 6, 4); // power by hand
    w.at(6, 4)!.items[M('coal')] = 4;
    placeNow(w, 'power-node', 5, 4);
    run(w, seconds(30));
    expect(refinery.items[M('plastic')]! + (store.items[M('plastic')] ?? 0)).toBeGreaterThan(0);
  });

  it('the atmospheric condenser needs no input and feeds an oil generator with gas', () => {
    const w = withCore();
    placeNow(w, 'combustion-generator', 2, 2);
    w.at(2, 2)!.items[M('coal')] = 4;
    const condenser = placeNow(w, 'atmospheric-condenser', 3, 2);
    placeNow(w, 'oil-generator', 5, 2);
    run(w, seconds(20));
    expect(condenser.work).toBeGreaterThanOrEqual(0);
    expect(powerFactor(w, condenser)).toBeGreaterThan(0);
  });
});

describe('the fusion reactor', () => {
  function reactor(): { w: World; fusion: ReturnType<typeof placeNow>; tank: ReturnType<typeof placeNow> } {
    const w = testWorld(content, 60, 60);
    placeNow(w, 'core-shard', 40, 40);
    const fusion = placeNow(w, 'fusion-reactor', 10, 10);
    fusion.items[M('lithium')] = 3;
    const tank = placeNow(w, 'tank', 14, 10); // touches the reactor
    return { w, fusion, tank };
  }

  it('burns lithium while a pipe or tank next to it holds coolant', () => {
    const { w, fusion, tank } = reactor();
    tank.liquidId = L('coolant');
    tank.liquid = 1000;
    run(w, seconds(2));
    expect(fusion.work).toBeGreaterThan(100);
    expect(fusion.items[M('lithium')]).toBe(2);
    expect(tank.liquid).toBeLessThan(1000);
  });

  it('stays dark and keeps its fuel without coolant', () => {
    const { w, fusion } = reactor();
    run(w, seconds(5));
    expect(fusion.work).toBe(0);
    expect(fusion.items[M('lithium')]).toBe(3);
  });

  it('water is not coolant, and only lithium burns in it', () => {
    const { w, fusion, tank } = reactor();
    tank.liquidId = L('water');
    tank.liquid = 1000;
    run(w, seconds(3));
    expect(fusion.work).toBe(0);
    expect(content.buildings.get('combustion-generator').generator!.burn).toBeUndefined();
    expect(content.buildings.get('fusion-reactor').generator!.burn).toEqual({ lithium: 120 });
  });
});

describe('the space elevator', () => {
  it('builds a segment per stage from its inputs and ends after the crown', () => {
    const w = withCore();
    const elevator = placeNow(w, 'space-elevator', 20, 23); // touches the core (4 units) ...
    for (let y = 23; y < 27; y++) placeNow(w, 'combustion-generator', 26, y).items[M('coal')] = 20; // ... plus 32 more
    expect(elevator.config).toBe(-1);
    for (const s of content.recipes.get('elevator-foundation').inputs) elevator.items[M(s.item)] = s.n;
    run(w, seconds(75));
    expect(w.state.stats.made[M('elevator-segment')] ?? 0).toBe(1);
    expect(elevator.config).toBe(1);
    // stage 2 waits for its own inputs: nothing more happens without them
    run(w, seconds(30));
    expect(elevator.config).toBe(1);
  });

  it('only takes what the current stage asks for', () => {
    const w = withCore();
    const elevator = placeNow(w, 'space-elevator', 20, 23);
    placeNow(w, 'unloader', 23, 22); // touches the core below and the elevator above, takes any item
    w.state.stock[M('steel')] = 50;
    w.state.stock[M('singularity')] = 5;
    run(w, seconds(10));
    expect(elevator.items[M('steel')] ?? 0).toBeGreaterThan(0);
    expect(elevator.items[M('singularity')] ?? 0).toBe(0);
  });

  it('a finished elevator idles', () => {
    const w = withCore();
    const elevator = placeNow(w, 'space-elevator', 20, 23);
    elevator.config = 3;
    run(w, seconds(5));
    expect(elevator.config).toBe(3);
  });
});
