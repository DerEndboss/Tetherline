import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { TICK_HZ } from '../constants';
import { paint, placeNow, testWorld } from '../dev';
import { hashValue } from '../hash';
import { linePath } from '../../game/line';
import { run, step } from '../tick';
import type { World } from '../world';
import { droneCommand } from './commands';
import { fleetStats, HELPER_PRICES, MAX_DRONES, opsOf, TRACKS, techOf } from './tech';
import type { DroneState } from '../state';

const M = (id: string) => content.materials.indexOf(id);
const seconds = (s: number) => Math.round(s * TICK_HZ);
const stock = (w: World, id: string) => w.state.stock[M(id)] ?? 0;

function drone(id: number, x: number, y: number): DroneState {
  return { id, x, y, task: 'idle', target: -1, waiting: '' };
}

/** A 3x3 core at (28, 28) on a flat 60x60 map with the player's drone next to it. */
function base(helpers = 0): World {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 28, 28);
  w.state.drones.push(drone(0, 27, 27));
  for (let i = 1; i <= helpers; i++) w.state.drones.push(drone(i, 27, 27));
  return w;
}

const give = (w: World, id: string, n: number) => (w.state.stock[M(id)] = n);
const send = (w: World, ...cs: ReturnType<typeof droneCommand>[]) => step(w, cs);

describe('drone data', () => {
  it('names only materials that exist', () => {
    const prices = [...TRACKS.flatMap((t) => t.levels.flat()), ...HELPER_PRICES.flat()];
    for (const p of prices) expect(content.materials.has(p.item), p.item).toBe(true);
  });

  it('has a price for every level and four helpers', () => {
    for (const t of TRACKS) expect(t.levels).toHaveLength(3);
    expect(HELPER_PRICES).toHaveLength(MAX_DRONES - 1);
  });
});

describe('upgrades and helpers', () => {
  it('buys the next level and pays for it', () => {
    const w = base();
    give(w, 'iron-bar', 100);
    give(w, 'copper-wire', 100);
    const speed = fleetStats(w).speed;
    send(w, droneCommand('drone-upgrade', { track: 'speed' }));
    expect(techOf(w).speed).toBe(1);
    expect(stock(w, 'iron-bar')).toBe(80);
    expect(fleetStats(w).speed).toBeGreaterThan(speed);
  });

  it('refuses an upgrade it cannot pay', () => {
    const w = base();
    send(w, droneCommand('drone-upgrade', { track: 'build' }));
    expect(techOf(w).build).toBe(0);
  });

  it('builds helpers up to five drones and no more', () => {
    const w = base();
    for (const m of ['steel', 'circuit', 'iron-bar', 'motor', 'frame', 'titanium-plate', 'core-chip']) give(w, m, 9999);
    for (let i = 0; i < 8; i++) send(w, droneCommand('drone-add', {}));
    expect(w.state.drones).toHaveLength(MAX_DRONES);
    expect(new Set(w.state.drones.map((d) => d.id)).size).toBe(MAX_DRONES);
  });
});

describe('building with several drones', () => {
  it('splits the ghost queue and pays each building once', () => {
    const w = base(1);
    give(w, 'copper-ore', 500);
    give(w, 'iron-bar', 500);
    const cost = (kind: string) => content.buildings.get(kind).cost;
    paint(w, 'ore-copper', 10, 10, 8, 2);
    const before = { ...w.state.stock };
    step(w, [
      { type: 'place', kind: 'mechanical-drill', x: 10, y: 10, rot: 0 },
      { type: 'place', kind: 'mechanical-drill', x: 14, y: 10, rot: 0 },
    ]);
    run(w, seconds(8));
    expect(w.state.buildings.filter((b) => w.def(b).id === 'mechanical-drill' && b.build >= 1)).toHaveLength(2);
    for (const c of cost('mechanical-drill')) {
      const i = M(c.item);
      expect(before[i]! - w.state.stock[i]!).toBe(c.n * 2);
    }
  });

  it('two drones finish a big queue faster than one', () => {
    const time = (helpers: number) => {
      const w = base(helpers);
      give(w, 'copper-ore', 5000);
      give(w, 'iron-bar', 5000);
      paint(w, 'ore-copper', 5, 5, 20, 2);
      const plans = Array.from({ length: 6 }, (_, i) => ({ kind: 'mechanical-drill', x: 5 + i * 3, y: 5, rot: 0 as const }));
      step(w, [{ type: 'place-many', plans }]);
      let t = 0;
      while ((w.state.plans.length > 0 || w.state.buildings.some((b) => b.build < 1)) && t < 5000) {
        step(w);
        t++;
      }
      return t;
    };
    const [one, two] = [time(0), time(1)];
    expect(one).toBeLessThan(5000);
    expect(two).toBeLessThan(one);
  });

  it('removes a building once, refunding once', () => {
    const w = base(2);
    const b = placeNow(w, 'mechanical-drill', 10, 10);
    const bars = stock(w, 'iron-bar');
    b.removing = true;
    run(w, seconds(6));
    expect(w.byId.has(b.id)).toBe(false);
    const refund = content.buildings.get('mechanical-drill').cost.find((c) => c.item === 'iron-bar')?.n ?? 0;
    expect(stock(w, 'iron-bar') - bars).toBeLessThanOrEqual(refund);
  });
});

/** Queues a dragged belt line (like the player's drag) and plays it out; returns the drawing order of what got built. */
function layLine(w: World, from: { x: number; y: number }, to: { x: number; y: number }, kind = 'conveyor') {
  const path = linePath(from, to, 0);
  step(w, [{ type: 'place-many', plans: path.map((t) => ({ kind, x: t.x, y: t.y, rot: t.rot })) }]);
  const built: { tick: number; x: number; y: number; dx: number; dy: number }[] = [];
  let tick = 0;
  while ((w.state.plans.length > 0 || w.state.buildings.some((b) => b.build < 1)) && tick < 1200) {
    const events = step(w);
    tick++;
    for (const e of events) {
      const b = e.type === 'built' ? w.byId.get(e.id) : undefined;
      if (b) built.push({ tick, x: b.x, y: b.y, dx: w.state.drones[0]!.x - b.x - 0.5, dy: w.state.drones[0]!.y - b.y - 0.5 });
    }
  }
  return { path, built };
}

describe('laying a belt line', () => {
  it('builds the pieces one after the other in the order they were drawn', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    const { path, built } = layLine(w, { x: 32, y: 40 }, { x: 52, y: 40 });
    expect(path).toHaveLength(21);
    expect(built.map((b) => [b.x, b.y])).toEqual(path.map((t) => [t.x, t.y]));
  });

  it('keeps the order round a corner', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    const { path, built } = layLine(w, { x: 32, y: 40 }, { x: 44, y: 50 });
    expect(path.length).toBeGreaterThan(20);
    expect(built.map((b) => [b.x, b.y])).toEqual(path.map((t) => [t.x, t.y]));
  });

  it('is quick: a piece about every two or three ticks, with no stall in between', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    const { built } = layLine(w, { x: 32, y: 40 }, { x: 56, y: 40 });
    const gaps = built.slice(1).map((b, i) => b.tick - built[i]!.tick);
    // before the drone glided along the line a belt took 4 to 9 ticks (and stopped in between)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(4);
    expect((built.at(-1)!.tick - built[0]!.tick) / (built.length - 1)).toBeLessThan(2.6);
  });

  it('is built from close by: the drone glides along the line instead of sitting at the far end of its range', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    const reach = fleetStats(w).range;
    const { built } = layLine(w, { x: 32, y: 40 }, { x: 56, y: 40 });
    for (const b of built) expect(Math.hypot(b.dx, b.dy), `at ${b.x}`).toBeLessThanOrEqual(reach * 0.35);
  });

  it('never flies back while the line grows', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    step(w, [{ type: 'place-many', plans: linePath({ x: 32, y: 40 }, { x: 56, y: 40 }, 0).map((t) => ({ kind: 'conveyor', x: t.x, y: t.y, rot: t.rot })) }]);
    const d = w.state.drones[0]!;
    let last = d.x;
    for (let i = 0; i < 200 && w.state.plans.length > 0; i++) {
      step(w);
      expect(d.x).toBeGreaterThanOrEqual(last - 1e-9);
      last = d.x;
    }
  });

  it('pays one copper per piece and nothing twice', () => {
    const w = base();
    give(w, 'copper-ore', 100);
    layLine(w, { x: 32, y: 40 }, { x: 51, y: 40 });
    expect(stock(w, 'copper-ore')).toBe(80);
  });

  it('stays in order while the core runs dry and fills up again', () => {
    const w = base();
    give(w, 'copper-ore', 5);
    const path = linePath({ x: 32, y: 40 }, { x: 45, y: 40 }, 0);
    step(w, [{ type: 'place-many', plans: path.map((t) => ({ kind: 'conveyor', x: t.x, y: t.y, rot: t.rot })) }]);
    run(w, seconds(3));
    expect(w.state.buildings.filter((b) => b.kind === content.buildings.indexOf('conveyor') && b.build >= 1)).toHaveLength(5);
    give(w, 'copper-ore', 100);
    run(w, seconds(8));
    expect(w.state.plans).toHaveLength(0);
    expect(w.state.buildings.filter((b) => b.kind === content.buildings.indexOf('conveyor') && b.build >= 1)).toHaveLength(path.length);
  });

  it('still builds a big machine from the full range, and takes its time', () => {
    const w = base();
    give(w, 'copper-ore', 500);
    give(w, 'iron-bar', 500);
    give(w, 'silicon', 500);
    step(w, [{ type: 'place', kind: 'smelter', x: 36, y: 40, rot: 0 }]);
    let built = 0;
    for (let i = 0; i < seconds(20) && built === 0; i++) built = step(w).filter((e) => e.type === 'built').length;
    expect(built).toBe(1);
    expect(w.state.tick).toBeGreaterThan(seconds(content.buildings.get('smelter').buildSeconds * 0.9));
  });
});

describe('dust boulders', () => {
  it('are cleared by a drone, one after the other', () => {
    const w = base();
    const { map } = w.state;
    for (const x of [10, 11, 12]) map.boulder[10 * map.w + x] = 1;
    step(w, [{ type: 'clear-boulders', x0: 10, y0: 10, x1: 12, y1: 10 }]);
    expect(map.boulder[10 * map.w + 10]).toBe(1);
    expect(opsOf(w).boulders).toHaveLength(3);
    run(w, seconds(8));
    expect([10, 11, 12].every((x) => map.boulder[10 * map.w + x] === 0)).toBe(true);
    expect(opsOf(w).boulders).toHaveLength(0);
  });
});

describe('supply and mining', () => {
  it('keeps a marked smelter fed from the core stock', () => {
    const w = base();
    const smelter = placeNow(w, 'smelter', 40, 40);
    give(w, 'iron-ore', 100);
    send(w, droneCommand('drone-supply', { id: smelter.id }));
    expect(opsOf(w).supply).toEqual([smelter.id]);
    run(w, seconds(30));
    expect(stock(w, 'iron-ore')).toBeLessThan(100);
    expect((smelter.items[M('iron-ore')] ?? 0) + (smelter.items[M('iron-bar')] ?? 0)).toBeGreaterThan(0);
  });

  it('ignores machines that eat nothing', () => {
    const w = base();
    const belt = placeNow(w, 'conveyor', 40, 40);
    send(w, droneCommand('drone-supply', { id: belt.id }));
    expect(opsOf(w).supply).toEqual([]);
  });

  it('lets a helper mine ore into the core, but not the player drone', () => {
    const solo = base();
    paint(solo, 'ore-copper', 36, 28, 4, 4);
    run(solo, seconds(30));
    expect(stock(solo, 'copper-ore')).toBe(0);
    const w = base(1);
    paint(w, 'ore-copper', 36, 28, 4, 4);
    run(w, seconds(40));
    expect(stock(w, 'copper-ore')).toBeGreaterThan(4);
  });

  it('stops mining when told to', () => {
    const w = base(1);
    paint(w, 'ore-copper', 36, 28, 4, 4);
    send(w, droneCommand('drone-mine', { item: 'off' }));
    run(w, seconds(30));
    expect(stock(w, 'copper-ore')).toBe(0);
  });
});

describe('determinism', () => {
  it('the same commands give the same state', () => {
    const go = () => {
      const w = base(2);
      give(w, 'copper-ore', 500);
      give(w, 'iron-bar', 500);
      paint(w, 'ore-copper', 36, 28, 4, 4);
      paint(w, 'ore-copper', 10, 10, 2, 2);
      step(w, [{ type: 'place', kind: 'mechanical-drill', x: 10, y: 10, rot: 0 }]);
      run(w, seconds(30));
      return hashValue(w.state);
    };
    expect(go()).toBe(go());
  });
});
