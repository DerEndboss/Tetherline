import type { TickContext } from '../blocks/types';
import type { World } from '../world';
import { pushRadio, startOrders, stepOrders } from './orders';
import { startMeta, winBonus } from './meta';
import './schema';

export { orderProgress, orderRate, pushRadio, startOrders } from './orders';
export { applyMeta, bonusOf, isUnlocked, nodeState, setOwnedMeta, unlocksOf, winBonus } from './meta';
export type { RadioLine, RateTrack } from './schema';

/**
 * Progression in the tick: the meta tree on a run's first tick, the order chain, the win. Player input arrives
 * through the inbox (not a command: this part keeps its bookkeeping out of the shared command table).
 */

export type ProgressMessage = { run: number; type: 'claimed'; to: number } | { run: number; type: 'celebrated' };

let inbox: ProgressMessage[] = [];

/** UI -> sim: the meta store has been paid up to `to`, or the victory screen was seen. Applied on the next tick. */
export function sendProgress(msg: ProgressMessage): void {
  inbox.push(msg);
}

function readInbox(w: World): void {
  const mine = inbox.filter((m) => m.run === w.state.seed);
  inbox = inbox.filter((m) => m.run !== w.state.seed);
  const p = w.state.progress;
  for (const m of mine) {
    if (m.type === 'claimed') p.claimed = Math.max(p.claimed ?? 0, Math.min(m.to, p.earned ?? 0));
    else p.celebrated = true;
  }
}

/** The win: flag, time bonus, a closing radio line, event. */
function win(w: World, ctx: TickContext): void {
  const p = w.state.progress;
  p.won = true;
  p.wonAt = w.state.tick;
  p.earned = (p.earned ?? 0) + winBonus(w.state.tick / 20);
  pushRadio(w, 'won', 'The elevator is climbing. Nobody on this planet has seen anything like it. Keep building if you like.');
  ctx.events.push({ type: 'won' });
}

export function stepProgress(w: World, ctx: TickContext): void {
  if (inbox.length) readInbox(w);
  if (w.state.progress.metaApplied === undefined) {
    startMeta(w);
    startOrders(w);
  }
  const done: { type: 'order-done'; id: string }[] = [];
  const won = stepOrders(w, w.state.tick, done);
  ctx.events.push(...done);
  if (won) win(w, ctx);
}
