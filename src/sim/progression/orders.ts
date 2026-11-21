import type { Id, OrderDef } from '../../content/types';
import { TICK_HZ } from '../constants';
import type { World } from '../world';
import type { RadioLine, RateTrack } from './schema';

/** Orders (Chill mode's story chain): deliver, rate and build goals, chained by `after`. */

const RADIO_KEEP = 40;
/** The rate window in seconds, and the seconds of samples needed before a rate counts at all. */
const WINDOW = 60;
const MIN_SAMPLES = 10;
/** A broken rate streak loses this many seconds of progress per second below the goal. */
const DECAY = 3;

/** How far an order is: [have, need]. Goals that name something the content does not have count as done. */
export function orderProgress(w: World, def: OrderDef, since: number): [number, number] {
  const g = def.goal;
  if (g.kind === 'build') return buildProgress(w, g.building, g.n);
  if (g.kind === 'rate') return [Math.min(w.state.progress.rates?.[def.id]?.held ?? 0, g.minutes * 60), g.minutes * 60];
  if (g.kind === 'make') return [madeNow(w, g.item), g.n];
  const i = w.content.materials.indexOf(g.item);
  if (i < 0) return [1, 1];
  return [(w.state.stats.delivered[i] ?? 0) - since, g.n];
}

function buildProgress(w: World, building: Id, n: number): [number, number] {
  const i = w.content.buildings.indexOf(building);
  if (i < 0) return [n, n];
  // built counts every finished one; an upgraded core (not "built") counts through the core's kind
  const built = w.state.stats.built[i] ?? 0;
  return [w.core?.kind === i ? Math.max(built, 1) : built, n];
}

/** Items per minute an order's rate goal currently measures (0 before enough samples). */
export function orderRate(w: World, id: Id): number {
  return w.state.progress.rates?.[id]?.rate ?? 0;
}

export function pushRadio(w: World, id: Id, text: string): void {
  const p = w.state.progress;
  const log: RadioLine[] = (p.radio ??= []);
  log.push({ id, tick: w.state.tick, text });
  if (log.length > RADIO_KEEP) log.splice(0, log.length - RADIO_KEEP);
}

function madeNow(w: World, item: Id): number {
  const i = w.content.materials.indexOf(item);
  return i < 0 ? 0 : (w.state.stats.made[i] ?? 0);
}

function startOne(w: World, o: OrderDef): void {
  const p = w.state.progress;
  const g = o.goal;
  const since = g.kind === 'deliver' ? (w.state.stats.delivered[w.content.materials.indexOf(g.item)] ?? 0) : 0;
  p.active.push({ id: o.id, since: w.state.tick, count: since });
  if (g.kind === 'rate') (p.rates ??= {})[o.id] = { hist: [madeNow(w, g.item)], held: 0, rate: 0 };
  pushRadio(w, o.id, o.radio);
}

/** Starts every order whose prerequisites are done and that is not running or done yet. */
export function startOrders(w: World): void {
  const p = w.state.progress;
  for (const o of w.content.orders.list) {
    if (p.done.includes(o.id) || p.active.some((a) => a.id === o.id)) continue;
    if (o.after.every((id) => p.done.includes(id))) startOne(w, o);
  }
}

/** One second of a rate goal: sample the output, compute items per minute, keep or lose the streak. */
function sampleRate(w: World, o: OrderDef, t: RateTrack): void {
  const g = o.goal;
  if (g.kind !== 'rate') return;
  t.hist.push(madeNow(w, g.item));
  if (t.hist.length > WINDOW + 1) t.hist.shift();
  const span = t.hist.length - 1;
  t.rate = span >= MIN_SAMPLES ? (((t.hist[span] ?? 0) - (t.hist[0] ?? 0)) * 60) / span : 0;
  t.held = t.rate >= g.perMinute ? t.held + 1 : Math.max(0, t.held - DECAY);
}

function sampleRates(w: World): void {
  const p = w.state.progress;
  for (const a of p.active) {
    const t = p.rates?.[a.id];
    if (t) sampleRate(w, w.content.orders.get(a.id), t);
  }
}

/** Marks an order done: unlocks, reward, event. Returns the radio-free bookkeeping only. */
function finishOrder(w: World, id: Id, events: { type: 'order-done'; id: Id }[]): void {
  const p = w.state.progress;
  const def = w.content.orders.get(id);
  p.done.push(id);
  for (const u of def.unlocks ?? []) if (!p.unlocked.includes(u)) p.unlocked.push(u);
  p.earned = (p.earned ?? 0) + (def.reward ?? 0);
  if (p.rates) delete p.rates[id];
  events.push({ type: 'order-done', id });
}

/** Checks the running orders twice a second (rate goals sample once a second). Returns true when the run was won now. */
export function stepOrders(w: World, tick: number, events: { type: 'order-done'; id: Id }[]): boolean {
  if (tick % (TICK_HZ / 2) !== 0) return false;
  const p = w.state.progress;
  if (!p.active.length && !p.won) startOrders(w);
  if (tick % TICK_HZ === 0) sampleRates(w);
  const finished = p.active.filter((a) => {
    const [have, need] = orderProgress(w, w.content.orders.get(a.id), a.count);
    return have >= need;
  });
  if (!finished.length) return false;
  for (const a of finished) finishOrder(w, a.id, events);
  p.active = p.active.filter((a) => !finished.includes(a));
  startOrders(w);
  return !p.won && p.active.length === 0 && p.done.length === w.content.orders.list.length;
}
