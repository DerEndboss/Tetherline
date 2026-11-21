import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Bot } from './bot';
import { surplusValves } from './bot-supply';
import { trunkTiles, trunkUpgrades } from './bot-trunk';
import type { PlanSpec } from './commands';
import { beltLine, placeNow, testWorld } from './dev';
import type { World } from './world';

/**
 * Shared belts (measured): a plain trunk that carries several lines is full, and a line that joins from the
 * side waits forever (M11 green: plastic stood on 70 full belts). The bot turns trunks into fast conveyors.
 */

const M = (id: string): number => content.materials.indexOf(id);

/** A core at (30, 30) and three lines joining one trunk that runs east into its west face. */
function threeIntoOne(): World {
  const w = testWorld(content, 60, 60);
  placeNow(w, 'core-shard', 30, 30);
  beltLine(w, 10, 31, 0, 20); // the trunk: x 10..29 at y 31, into the core
  beltLine(w, 14, 25, 1, 6); // a line from the north, joins at (14, 31)
  beltLine(w, 20, 37, 3, 6); // a line from the south, joins at (20, 31)
  beltLine(w, 5, 10, 1, 4); // a line that ends in nothing
  return w;
}

const W = (w: World): number => w.state.map.w;

describe('trunk upgrade', () => {
  it('finds the belts that carry three lines and reach the core, busiest first', () => {
    const w = threeIntoOne();
    const tiles = trunkTiles(w).map((t) => [t % W(w), Math.floor(t / W(w))]);
    // from the south line's join to the core: x 20..29 carry three lines
    expect(tiles.length).toBe(10);
    expect(tiles.every(([x, y]) => y === 31 && x! >= 20 && x! <= 29)).toBe(true);
  });

  it('places fast conveyors over them once there are iron bars, and not more often than once a minute', () => {
    const w = threeIntoOne();
    const bot = new Bot(w);
    expect(trunkUpgrades(w, bot.mem)).toEqual([]); // no iron bars yet
    w.state.stock[M('iron-bar')] = 500;
    const out = trunkUpgrades(w, bot.mem);
    expect(out.length).toBe(1);
    const plans = (out[0] as { plans: PlanSpec[] }).plans;
    expect(plans.length).toBe(10);
    expect(plans.every((p) => p.kind === 'fast-conveyor' && p.rot === 0)).toBe(true);
    expect(trunkUpgrades(w, bot.mem)).toEqual([]);
  });
});

describe('surplus valve', () => {
  it('does not put a taken-down crafter back where a belt was laid since', () => {
    const w = testWorld(content, 60, 60);
    placeNow(w, 'core-shard', 30, 30);
    const bot = new Bot(w);
    bot.mem.downed.push({ plan: { kind: 'graphite-press', x: 10, y: 10, rot: 0, config: -1 }, product: 'graphite' });
    bot.mem.downed.push({ plan: { kind: 'graphite-press', x: 20, y: 10, rot: 0, config: -1 }, product: 'graphite' });
    beltLine(w, 9, 11, 0, 4); // the accelerator's output belt now runs over the first spot
    const out = surplusValves(w, bot.mem);
    expect(out.length).toBe(1);
    expect((out[0] as { plans: PlanSpec[] }).plans.map((p) => p.x)).toEqual([20]);
    expect(bot.mem.downed).toEqual([]);
  });
});
