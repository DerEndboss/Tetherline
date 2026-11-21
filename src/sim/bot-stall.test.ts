import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Bot } from './bot';
import { Brain } from './bot-brain';
import { supplyMarks } from './bot-supply';
import { route, Space } from './bot-space';
import { beltLine, placeNow, testWorld } from './dev';
import './drones';
import { createRun } from './newgame';
import type { World } from './world';

/**
 * The long pauses on small maps (measured on S4/S5 rust and S2/S8 ice): S4/S5 rust and S2/S8 ice waited 20 to 31 minutes.
 * The drones kept mining an ore no order wanted any more, the supply marks kept a stale order, and the crown waited
 * for titanium ore two recipes away.
 */

const M = (id: string): number => content.materials.indexOf(id);

function running(w: World, id: string): void {
  w.state.progress.active = [{ id, since: 0, count: 0 }];
}

describe('what the drones mine', () => {
  it('the crown looks through singularities and coolant to titanium ore and the world ore', () => {
    const w = createRun(content, { seed: 4, size: 'small', theme: 'rust-desert' });
    running(w, 'elevator-6');
    const ores = new Brain(w, new Bot(w).mem).orderOres();
    expect(ores).toContain('emberite');
    expect(ores).toContain('titanium-ore');
  });

  it('an ore the running order waits for wins over the one mined for an earlier order', () => {
    const w = createRun(content, { seed: 4, size: 'small', theme: 'rust-desert' });
    const bot = new Bot(w);
    running(w, 'elevator-5');
    bot.mem.mining = 'iron-ore';
    bot.mem.stalls = 1;
    expect(new Brain(w, bot.mem).droneOre()).toBe('emberite');
    // once there is some, the choice sticks while the order still eats it
    bot.mem.mining = 'emberite';
    w.state.stock[M('emberite')] = 120;
    expect(new Brain(w, bot.mem).droneOre()).toBe('emberite');
  });

  it('mines what a short part of a building order lacks, not an ore whose product is plenty', () => {
    const w = createRun(content, { seed: 7, size: 'small', theme: 'rust-desert' });
    const bot = new Bot(w);
    running(w, 'elevator-4'); // build the accelerator: its core chips need glass, the glass sand
    w.state.stock.fill(1000);
    for (const [id, n] of [['sand', 0], ['glass', 0], ['iron-ore', 0], ['core-chip', 20]] as const) w.state.stock[M(id)] = n;
    bot.mem.stalls = 1;
    expect(new Brain(w, bot.mem).droneOre()).toBe('sand');
  });
});

describe('supply marks', () => {
  /** A core, a motor printer and two foundries, all fed by drones and marked in a stale order. */
  function marked(): { w: World; bot: Bot; ids: number[] } {
    const w = testWorld(content, 60, 60);
    placeNow(w, 'core-shard', 28, 28);
    const bot = new Bot(w);
    const printer = content.buildings.get('3d-printer').recipes!.indexOf('print-motor');
    const foundry = content.buildings.get('steel-foundry').recipes!;
    const parts = [
      placeNow(w, '3d-printer', 10, 10, 0, printer),
      placeNow(w, 'steel-foundry', 20, 10, 0, foundry.indexOf('roll-titanium')),
      placeNow(w, 'steel-foundry', 30, 10, 0, foundry.indexOf('cast-steel')),
    ];
    for (const b of parts) bot.mem.feed.add(b.y * w.state.map.w + b.x);
    w.state.droneOps = { focus: null, supply: parts.map((b) => b.id), boulders: [], mine: -1 };
    w.state.stock[M('titanium-plate')] = 500;
    w.state.stock[M('steel')] = 0;
    running(w, 'motors');
    w.state.tick = 2000;
    return { w, bot, ids: parts.map((b) => b.id) };
  }

  it('are put back in order when a machine below the first is out of place', () => {
    const { w, bot, ids } = marked();
    const out = supplyMarks(w, bot.mem);
    // every mark toggled off and on, in the wanted order: printer (ordered), steel (empty), plates (above their mark)
    const order = out.filter((_, i) => i % 2 === 0).map((c) => (c as unknown as { id: number }).id);
    expect(out.every((c) => (c.type as string) === 'drone-supply')).toBe(true);
    expect(order).toEqual([ids[0], ids[2], ids[1]]);
  });
});

describe('routed lines', () => {
  it('turn into a junction to cross a belt, and never cross themselves', () => {
    // a belt row at y 20, a row of nodes at y 18: the start at (12, 19) can only turn down into the crossing
    const w = testWorld(content, 40, 40);
    beltLine(w, 2, 20, 0, 36);
    for (let x = 0; x < 40; x++) placeNow(w, 'power-node', x, 18);
    const line = route(new Space(w, new Set()), { starts: [{ x: 12, y: 19 }], goals: [{ x: 14, y: 26, dir: 1 }], cross: true });
    expect(line).not.toBeNull();
    expect(line!.some((t) => t.cross && t.y === 20)).toBe(true);
    expect(new Set(line!.map((t) => `${t.x},${t.y}`)).size).toBe(line!.length);
  });
});
