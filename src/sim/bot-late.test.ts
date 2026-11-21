import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Bot } from './bot';
import { Brain } from './bot-brain';
import { coolantAnnex, coolantRefit } from './bot-late';
import { TICK_HZ } from './constants';
import { placeNow, testWorld } from './dev';
import './drones';
import { run } from './tick';
import type { World } from './world';

/**
 * The finale (it once sat at "elevator-6 2/3" for an hour): the coolant plant's water must never be spoilt, and
 * a spoilt one is rebuilt. S8 ice/rust: a smelter beside a ground pump filled the water network with slag.
 */

const L = (id: string): number => content.liquids.indexOf(id);

function withCore(): World {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 28, 28);
  return w;
}

describe('the coolant plant of the accelerator', () => {
  it('a pump network that holds slag is taken down and built again', () => {
    const w = withCore();
    const bot = new Bot(w);
    placeNow(w, 'ground-pump', 6, 6);
    const tank = placeNow(w, 'tank', 8, 6);
    // what a smelter beside it vented into the empty network before the pump gave any water
    tank.liquidId = L('slag');
    tank.liquid = 200;
    w.touch();
    run(w, 1);
    const out = coolantRefit(w, bot.mem);
    expect(out.map((c) => c.type)).toEqual(['remove', 'remove']);
    expect(bot.mem.refit.map((p) => p.kind).sort()).toEqual(['ground-pump', 'tank']);
    // nothing goes back while the old parts stand
    expect(coolantRefit(w, bot.mem)).toEqual([]);
  });

  it('a pump that gives what its network holds is left alone', () => {
    const w = withCore();
    const bot = new Bot(w);
    placeNow(w, 'ground-pump', 6, 6);
    placeNow(w, 'tank', 8, 6);
    run(w, Math.round(2 * TICK_HZ));
    expect(coolantRefit(w, bot.mem)).toEqual([]);
  });

  it('never lays the plant where a smelter touches its pipe, pumps or tank', () => {
    const w = withCore();
    const bot = new Bot(w);
    const k = new Brain(w, bot.mem);
    const spot = { x: 30, y: 10 };
    const mix = content.buildings.get('coolant-mixer').recipes!.indexOf('mix-coolant');
    const free = coolantAnnex(mix)(k.ctx, spot, 5);
    expect(free).not.toBeNull();
    // a smelter on every side of the accelerator, two tiles out: right where the pipe or the plant would go
    for (const [x, y] of [[36, 12], [32, 16], [27, 12], [32, 7]] as const) placeNow(w, 'smelter', x, y, 0, 0);
    const k2 = new Brain(w, bot.mem);
    const plans = coolantAnnex(mix)(k2.ctx, spot, 5);
    for (const p of plans ?? []) {
      if (!['ground-pump', 'tank', 'conduit'].includes(p.kind)) continue;
      const size = content.buildings.get(p.kind).size;
      for (const s of w.state.buildings.filter((b) => w.def(b).id === 'smelter')) {
        const apart = s.x > p.x + size || p.x > s.x + 2 || s.y > p.y + size || p.y > s.y + 2;
        expect(apart, `${p.kind} at ${p.x},${p.y} touches the smelter at ${s.x},${s.y}`).toBe(true);
      }
    }
  });
});
