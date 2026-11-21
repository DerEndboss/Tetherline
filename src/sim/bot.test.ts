import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Bot } from './bot';
import { playRound } from './bot-run';
import './drones';
import { createRun } from './newgame';
import { step } from './tick';
import type { World } from './world';

/** Plays `minutes` of game time with the bot at the wheel (it sees the events of the last tick). */
function play(seed: number, minutes: number): { w: World; bot: Bot } {
  const w = createRun(content, { seed });
  const bot = new Bot(w);
  let events = step(w, bot.think());
  for (let t = 1; t < minutes * 1200; t++) events = step(w, bot.think(events));
  return { w, bot };
}

/** The long run is opt-in (BOT_LONG=1): the test config types no `process`, so it is read through globalThis. */
const LONG_MINUTES = 90;
const LONG_STALL = 20;
const LONG = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BOT_LONG === '1';

const made = (w: World, id: string): number => w.state.stats.made[w.content.materials.indexOf(id)] ?? 0;

describe('autopilot', () => {
  it('opens the round: drills, belts, iron, graphite, silicon, and the core upgrade', () => {
    const { w } = play(1, 12);
    expect(made(w, 'iron-bar')).toBeGreaterThan(300);
    expect(made(w, 'graphite')).toBeGreaterThan(150);
    expect(made(w, 'silicon')).toBeGreaterThan(100);
    expect(w.def(w.core!).id).toBe('core-foundation');
    expect(w.state.progress.done.length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('plays the same run twice (it only reads the world)', () => {
    const a = play(3, 3);
    const b = play(3, 3);
    expect(a.w.state.stock).toEqual(b.w.state.stock);
    expect(a.w.state.buildings.length).toBe(b.w.state.buildings.length);
    expect(a.bot.log).toEqual(b.bot.log);
  }, 60_000);

  // The long round is opt-in (npm run test:bot): a whole round takes one to three real minutes. After the balance
  // for a one-hour round seed 1 wins at minute 70 with no stall over 12 minutes; before, it reached 28
  // of 34 orders by minute 120 (the old bar was 26 orders in 120 minutes).
  it.skipIf(!LONG)(`wins seed 1 within ${LONG_MINUTES} minutes, never ${LONG_STALL} minutes without progress`, () => {
    const r = playRound(content, { seed: 1, minutes: LONG_MINUTES });
    expect(r.orders.length).toBe(content.orders.list.length);
    expect(r.won).not.toBeNull();
    expect(r.longestStall).toBeLessThanOrEqual(LONG_STALL);
  }, 3_600_000);

  it('never queues a ghost on a tile that is not free', () => {
    const w = createRun(content, { seed: 2 });
    const bot = new Bot(w);
    let events = step(w, bot.think());
    let dropped = 0;
    for (let t = 1; t < 6 * 1200; t++) {
      events = step(w, bot.think(events));
      dropped += events.filter((e) => e.type === 'plan-dropped').length;
    }
    expect(dropped).toBe(0);
  }, 60_000);
});
