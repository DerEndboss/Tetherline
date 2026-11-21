import { BLOCKS, type TickContext } from './blocks';
import type { Command, CommandOf, CommandType, SimEvent } from './commands';
import { TICK_SECONDS } from './constants';
import { clearBoulders, removeNow, startUpgrade } from './construction';
import { stepDrones } from './drones/builder';
import { settleLiquids } from './liquids';
import { addLink, inLaserRange, powerFactor, removeLink, stepPower } from './power';
import { stepProgress } from './progression';
import { salvage } from './wrecks';
import type { Dir, Plan, SimState } from './state';
import { storeInCore } from './storage';
import type { World } from './world';

/* ---------- Commands ---------- */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function normal(r: Box): Box {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

function overlaps(ax: number, ay: number, as: number, bx: number, by: number, bs: number): boolean {
  return ax < bx + bs && bx < ax + as && ay < by + bs && by < ay + as;
}

/**
 * Queues a ghost; ghosts it overlaps are replaced. Unknown kinds are ignored. A core stage is never a ghost: the
 * next stage starts the upgrade in place, any other is dropped (one core per run).
 */
function queuePlan(w: World, p: { kind: string; x: number; y: number; rot: Dir; config?: number }): void {
  const kind = w.content.buildings.indexOf(p.kind);
  if (kind < 0) return;
  if (w.defs[kind]!.behaviour === 'core') {
    if (w.core && w.def(w.core).core?.next === p.kind) startUpgrade(w);
    return;
  }
  const size = w.defs[kind]!.size;
  w.state.plans = w.state.plans.filter((o) => !overlaps(o.x, o.y, w.defs[o.kind]!.size, p.x, p.y, size));
  const plan: Plan = { kind, x: p.x, y: p.y, rot: p.rot, config: p.config ?? -1 };
  w.state.plans.push(plan);
}

/** Whether a footprint overlaps an inclusive tile box. */
function inBox(r: Box, x: number, y: number, size: number): boolean {
  return x <= r.x1 && y <= r.y1 && x + size > r.x0 && y + size > r.y0;
}

function cancelPlans(w: World, box: Box): void {
  const r = normal(box);
  w.state.plans = w.state.plans.filter((p) => !inBox(r, p.x, p.y, w.defs[p.kind]!.size));
}

function markRemoval(w: World, box: Box, ctx: TickContext): void {
  const r = normal(box);
  cancelPlans(w, r);
  for (const b of [...w.state.buildings]) {
    if (b.id === w.state.core || !inBox(r, b.x, b.y, w.def(b).size)) continue;
    // a ghost-fresh site with nothing paid goes at once
    if (b.build <= 0 && b.spent.every((n) => n === 0)) removeNow(w, b, ctx);
    else b.removing = true;
  }
}

function link(w: World, id: number, target: number): void {
  const b = w.byId.get(id);
  const t = w.byId.get(target);
  if (!b || !t) return;
  const beh = w.def(b).behaviour;
  if (beh === 'power-node') {
    if (b.links.includes(t.id)) removeLink(w, b, t);
    else if (inLaserRange(w, b, t)) addLink(w, b, t);
    return;
  }
  if (beh === w.def(t).behaviour && t !== b) {
    b.link = b.link === t.id ? -1 : t.id;
    w.touch();
  }
}

type Handler<K extends CommandType> = (w: World, c: CommandOf<K>, ctx: TickContext) => void;
type Handlers = { [K in CommandType]: Handler<K> };

const HANDLERS: Handlers = {
  place: (w, c) => queuePlan(w, c),
  'place-many': (w, c) => c.plans.forEach((p) => queuePlan(w, p)),
  remove: (w, c, ctx) => markRemoval(w, c, ctx),
  cancel: (w, c) => cancelPlans(w, c),
  rotate: (w, c) => {
    const b = w.byId.get(c.id);
    if (b && w.def(b).rotates) {
      b.rot = c.rot;
      w.touch();
    }
  },
  configure: (w, c) => {
    const b = w.byId.get(c.id);
    if (b) b.config = c.value;
  },
  link: (w, c) => link(w, c.id, c.target),
  'clear-boulders': (w, c) => {
    const r = normal(c);
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) clearBoulders(w, x, y, 1);
  },
  'remove-deco': (w, c) => {
    const i = c.y * w.state.map.w + c.x;
    if (w.inBounds(c.x, c.y) && !w.state.deco.removed.includes(i)) w.state.deco.removed.push(i);
  },
  salvage: (w, c, ctx) => salvage(w, c.x, c.y, ctx),
  'upgrade-core': (w) => {
    startUpgrade(w);
  },
  'dev-give': (w, c) => {
    const i = w.content.materials.indexOf(c.item);
    if (i >= 0) storeInCore(w, i, c.n);
  },
};

/**
 * Adds the handler of a command a module declared in its own folder (CommandMap augmentation). Call it at module
 * load in that folder's index; tick.ts imports the drones and progression folders, others are imported by
 * whoever sends their commands.
 */
export function registerCommand<K extends CommandType>(type: K, handler: Handler<K>): void {
  (HANDLERS as Record<string, unknown>)[type] = handler;
}

function apply(w: World, c: Command, ctx: TickContext): void {
  const handler = (HANDLERS as Record<string, Handler<CommandType> | undefined>)[c.type];
  handler?.(w, c as CommandOf<CommandType>, ctx);
}

/* ---------- The tick ---------- */

/**
 * One fixed tick (TICK_HZ): commands, drones and construction, the power balance, every finished building in
 * placement order, liquids settle, then progression. Deterministic: no clocks, no Math.random.
 */
export function step(w: World, commands: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  const ctx: TickContext = { dt: TICK_SECONDS, tick: w.state.tick, events, power: (b) => powerFactor(w, b) };
  for (const c of commands) apply(w, c, ctx);
  stepDrones(w, ctx);
  stepPower(w, ctx.dt);
  const list = w.state.buildings;
  for (let i = 0; i < list.length; i++) {
    const b = list[i]!;
    if (b.build < 1 || b.removing) continue;
    BLOCKS[w.defs[b.kind]!.behaviour].update?.(w, b, ctx);
  }
  settleLiquids(w);
  stepProgress(w, ctx);
  w.state.tick++;
  return events;
}

/** Runs `ticks` ticks without commands (tests, headless runs). */
export function run(w: World, ticks: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) all.push(...step(w));
  return all;
}

export type { SimState };
