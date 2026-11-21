/// <reference lib="webworker" />
import { content } from '../content';
import { Bot } from '../sim/bot';
import type { MapState } from '../sim/state';
import { worldOf, type ThinkReply, type ThinkRequest } from './autopilot-snapshot';

/**
 * The autopilot's planner off the main thread: the bot's belt searches can take hundreds of milliseconds on a big
 * base, which stalled frames when it ran beside the renderer. The worker keeps the map and the bot's memory and
 * rebuilds the world from each snapshot it gets.
 */

let gen = -1;
let map: MapState | null = null;
let bot: Bot | null = null;

self.onmessage = (e: MessageEvent<ThinkRequest>): void => {
  const req = e.data;
  if (req.map) map = req.map;
  if (!map) return;
  const t0 = performance.now();
  const world = worldOf(content, req.state, map);
  if (req.gen !== gen || !bot) {
    gen = req.gen;
    bot = new Bot(world);
  } else {
    bot.see(world);
  }
  const commands = bot.think();
  const reply: ThinkReply = { gen, tick: req.state.tick, commands, ms: performance.now() - t0, note: bot.log.at(-1) ?? '' };
  self.postMessage(reply);
};
