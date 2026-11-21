import type { ContentRegistry } from '../../content/registry';
import type { Id } from '../../content/types';
import type { SlotSummary } from '../../save/serialize';
import { orderProgress, orderRate } from '../../sim/progression';
import type { RadioLine } from '../../sim/progression';
import type { World } from '../../sim/world';

/** What the HUD shows about the order chain (computed from the world at snapshot pace). */

export interface OrderView {
  id: Id;
  title: string;
  have: number;
  need: number;
  /** Rate goals: current and wanted items per minute, else null. */
  rate: { now: number; want: number } | null;
  /** 0..1 */
  fraction: number;
}

export interface ChainView {
  chapter: string;
  active: OrderView[];
  done: number;
  total: number;
  /** Space Elevator stages finished and in all (0 total = the chain has none). */
  stages: { done: number; total: number; name: string };
  tutorial: { index: number; count: number; hint: string; highlight: Id | undefined; id: Id } | null;
  won: boolean;
}

function activeViews(w: World): OrderView[] {
  const p = w.state.progress;
  return p.active.map((a) => {
    const def = w.content.orders.get(a.id);
    const [have, need] = orderProgress(w, def, a.count);
    const goal = def.goal;
    const rate = goal.kind === 'rate' ? { now: orderRate(w, def.id), want: goal.perMinute } : null;
    return { id: def.id, title: def.title, have: Math.min(have, need), need, rate, fraction: need > 0 ? Math.min(1, have / need) : 1 };
  });
}

function stageInfo(w: World): ChainView['stages'] {
  const all = w.content.orders.list.filter((o) => o.stage !== undefined);
  const stages = [...new Set(all.map((o) => o.stage as number))];
  const done = stages.filter((s) => all.filter((o) => o.stage === s).every((o) => w.state.progress.done.includes(o.id))).length;
  return { done, total: stages.length, name: 'Space Elevator' };
}

function tutorialInfo(w: World): ChainView['tutorial'] {
  const list = w.content.orders.list.filter((o) => o.tutorial);
  const p = w.state.progress;
  const current = list.find((o) => p.active.some((a) => a.id === o.id));
  if (!current?.tutorial) return null;
  return { index: list.indexOf(current) + 1, count: list.length, hint: current.tutorial.hint, highlight: current.tutorial.highlight, id: current.id };
}

export function chainView(w: World): ChainView {
  const p = w.state.progress;
  const active = activeViews(w);
  const first = active[0];
  const chapter = first ? (w.content.orders.get(first.id).chapter ?? '') : '';
  return { chapter, active, done: p.done.length, total: w.content.orders.list.length, stages: stageInfo(w), tutorial: tutorialInfo(w), won: p.won };
}

/** The newest radio line, or null. */
export function lastRadio(w: World): RadioLine | null {
  const log = w.state.progress.radio;
  return log?.length ? (log[log.length - 1] ?? null) : null;
}

/** Hours and minutes of sim time: "1 h 05 min" or "42 min". */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "1 building", "3 buildings". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sim time as a stamp: "4:07". */
export function stamp(tick: number, hz: number): string {
  const s = Math.max(0, Math.floor(tick / hz));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Blueprints", but "1 Blueprint": the currency's name for a count (the content only knows the plural). */
export function currencyName(n: number, name: string): string {
  return n === 1 ? name.replace(/s$/, '') : name;
}

/** "Nov 20, 14:03" for a save's time, '' when it was never saved. */
export function savedWhen(at: number): string {
  if (!at) return '';
  return new Date(at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** The facts of a saved round, one chip each (theme, size, play time, orders, buildings). */
export function slotFacts(content: ContentRegistry, s: SlotSummary): string[] {
  const theme = content.themes.find(s.theme)?.name ?? s.theme;
  const size = content.sizes.find(s.size)?.name ?? s.size;
  return [theme, size, clock(s.seconds), plural(s.ordersDone, 'order'), plural(s.buildings, 'building')];
}
