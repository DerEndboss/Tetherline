import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Bot } from '../sim/bot';
import '../sim/drones';
import { createRun } from '../sim/newgame';
import { stressWorld } from '../sim/stress';
import { step } from '../sim/tick';
import { packBuildings, thinkRequest, unpackBuildings, worldOf } from './autopilot-snapshot';

describe('autopilot snapshot (what the worker sees)', () => {
  it('a bot on the snapshot plans exactly what a bot on the live world plans', () => {
    const w = createRun(content, { seed: 3 });
    const live = new Bot(w);
    const req0 = thinkRequest(w, 1, true);
    const copy = new Bot(worldOf(content, req0.state, req0.map!));
    let looks = 0;
    for (let t = 0; t < 4 * 1200; t++) {
      if (t % 10 === 0) {
        const req = structuredClone(thinkRequest(w, 1, false));
        copy.see(worldOf(content, req.state, req0.map!));
        const mine = live.think();
        expect(copy.think()).toEqual(mine);
        if (mine.length) looks++;
        step(w, mine);
      } else step(w);
    }
    expect(looks).toBeGreaterThan(5);
  }, 120_000);

  it('packs every field the bot reads', () => {
    expect(Math.max(...content.buildings.list.map((d) => d.cost.length))).toBeLessThanOrEqual(6);
    const w = createRun(content, { seed: 5 });
    const back = unpackBuildings(packBuildings(w.state.buildings));
    const pick = (b: (typeof back)[number]) => [b.id, b.kind, b.x, b.y, b.rot, b.build, b.config, b.removing, b.spent.slice(0, w.defs[b.kind]!.cost.length)];
    expect(back.map(pick)).toEqual(w.state.buildings.map(pick));
  });

  it('costs the main thread well under 4 ms on a 3,000-building base', () => {
    const w = stressWorld(content, { buildings: 3000, items: 2000 });
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      const req = thinkRequest(w, 1, false);
      structuredClone(req, { transfer: [req.state.buildings.buffer] });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(w.state.buildings.length).toBeGreaterThanOrEqual(3000);
    expect(times[7]!).toBeLessThan(4);
  });
});
