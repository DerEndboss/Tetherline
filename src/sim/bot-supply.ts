import { recipeOf } from './blocks/production';
import type { Memory } from './bot-build';
import { SUPPLY } from './bot-hub';
import type { Command } from './commands';
import { droneCommand } from './drones';
import type { Building } from './state';
import { storageInfo } from './storage';
import type { World } from './world';

/**
 * Drone supply marks for the machines the bot placed without input lanes. Drones serve marked machines in mark
 * order and stay with the first one that still has room, so a marked machine whose product is not needed only
 * takes drone time from the others. A machine is marked while a running order asks for its product, when it has
 * no item product (the elevator, the coolant mixer), or while its product runs below LOW in the core; it loses
 * the mark above twice that (the gap keeps marks from flapping, which also reorders them). New marks go in order of
 * urgency, and every half minute the marks are sorted by urgency again (see `reorder`). The mark command
 * toggles; the next look already sees the new state.
 */

const LOW = 300;
/**
 * Products the round needs fewer of: a lower mark. Without it the motor printer, marked first, turned all steel
 * into 300 motors while the helper drones waited for 40 steel.
 */
const SMALL: Record<string, number> = {
  'battery-cell': 45,
  'tungsten-carbide': 70,
  plastic: 120,
  lithium: 40,
  motor: 30,
  frame: 100,
  'core-chip': 60,
  circuit: 200,
  'star-alloy': 60,
  singularity: 5,
};

const stockOf = (w: World, item: string): number => w.state.stock[w.content.materials.indexOf(item)] ?? 0;

/** Whether a running order asks for this item (delivered, made or at a rate). */
function ordered(w: World, item: string): boolean {
  return w.state.progress.active.some((a) => {
    const g = w.content.orders.get(a.id).goal;
    return g.kind !== 'build' && g.item === item;
  });
}

/**
 * Whether the core holds what a mega building still lacks for its stage. Until then it gets nothing: the
 * elevator's crown took every star alloy as it came, so none was left to compress the singularities it waits for.
 * Once marked it stays marked for that stage (the snapshot the worker sees has no machine contents to count).
 */
function stageReady(w: World, mem: Memory, b: Building, marked: boolean): boolean {
  const r = recipeOf(w, b);
  if (!r || w.def(b).behaviour !== 'mega') return true;
  if (marked && mem.stage.get(b.id) === b.config) return true;
  const ready = r.inputs.every((s) => stockOf(w, s.item) >= s.n);
  if (ready) mem.stage.set(b.id, b.config);
  return ready;
}

/**
 * Whether a mega building's stage still lacks this item in the core. The tower wanted 80 motors while the motor
 * printer stopped at its usual mark of 50: the run sat at 73 for two hours.
 */
function stageWants(w: World, item: string): boolean {
  return w.state.buildings.some((b) => {
    if (w.def(b).behaviour !== 'mega' || !w.ready(b)) return false;
    const need = recipeOf(w, b)?.inputs.find((s) => s.item === item)?.n ?? 0;
    return stockOf(w, item) < need;
  });
}

/** Lower is more urgent; Infinity = not wanted at all. */
function urgency(w: World, mem: Memory, b: Building, marked: boolean): number {
  if (!stageReady(w, mem, b, marked)) return Infinity;
  const product = recipeOf(w, b)?.outputs[0]?.item;
  if (!product) return -1;
  if (ordered(w, product)) return -2;
  if (stageWants(w, product)) return -1.5;
  return byStock(stockOf(w, product), SMALL[product] ?? LOW, marked);
}

/** A product below its mark is wanted (the emptier the sooner); a marked machine keeps going up to twice that. */
function byStock(have: number, low: number, marked: boolean): number {
  return have < low || (marked && have < low * 2) ? have / low : Infinity;
}

export function supplyMarks(w: World, mem: Memory): Command[] {
  const marked = new Set(w.state.droneOps?.supply ?? []);
  const fed = w.state.buildings.filter((b) => mem.feed.has(b.y * w.state.map.w + b.x) && w.ready(b) && SUPPLY.has(w.def(b).behaviour));
  const ranked = fed.map((b) => ({ b, u: urgency(w, mem, b, marked.has(b.id)) }));
  ranked.sort((a, b) => a.u - b.u || a.b.id - b.b.id);
  const toggles = ranked.filter((r) => Number.isFinite(r.u) !== marked.has(r.b.id)).map((r) => r.b.id);
  if (toggles.length) return toggles.map((id) => droneCommand('drone-supply', { id }));
  return reorder(w, mem, ranked.filter((r) => Number.isFinite(r.u)).map((r) => r.b.id));
}

/** How often the marks are put back in order of urgency (ticks). */
const REORDER = 600;

/**
 * Puts the marks in order of urgency when the most urgent machine is not first: each mark is toggled off and on
 * again, which moves it to the end, in the wanted order. At most every REORDER ticks, so a drone on its way keeps
 * its target and the order does not churn.
 */
function reorder(w: World, mem: Memory, want: number[]): Command[] {
  const now = (w.state.droneOps?.supply ?? []).filter((id) => want.includes(id));
  if (!want.length || now[0] === want[0] || w.state.tick - mem.reordered < REORDER) return [];
  mem.reordered = w.state.tick;
  return want.flatMap((id) => [droneCommand('drone-supply', { id }), droneCommand('drone-supply', { id })]);
}

/**
 * Surplus valve. Product lines carry several items into the core; once one of them fills the core its items stop
 * on the belt and block the others (iron bars at the cap stopped graphite and steel in a 45-minute run). A smelter
 * whose product is near the cap is switched to a recipe its ore line cannot feed, so it idles; it gets its recipe
 * back when the stock has dropped. A crafter with a single recipe is taken down and put back instead.
 */
const FULL = 0.95;
const RESUME = 0.6;
/**
 * Crafters pause earlier than ore lines: a product line into the core is shared, and five wire mills kept a line
 * full of wire at 94 % of the cap, so the silicon and steel behind it stood still (seen in balance runs).
 */
const CRAFT_FULL = 0.5;
const CRAFT_RESUME = 0.3;

function pauseRecipe(w: World, b: Building): number {
  const ids = w.def(b).recipes ?? [];
  const own = recipeOf(w, b)?.inputs.map((s) => s.item) ?? [];
  return ids.findIndex((id) => !w.content.recipes.get(id).inputs.some((s) => own.includes(s.item)));
}


/** The configure command that gives a paused crafter its recipe back, when its product has dropped. */
function resume(w: World, mem: Memory, b: Building, own: number, cap: number): Command | null {
  const product = w.content.recipes.get(w.def(b).recipes![own]!).outputs[0]!.item;
  if (stockOf(w, product) >= cap * CRAFT_RESUME && !ordered(w, product)) return null;
  mem.paused.delete(b.id);
  return { type: 'configure', id: b.id, value: own };
}

/**
 * A crafter that hands its product straight to another (the smelter of an iron -> smelter -> foundry chain) is not
 * on a product line: pausing it for the bars in the core starved every foundry of a run.
 */
function feedsCrafter(w: World, b: Building): boolean {
  return w.neighbours(b).some((n) => w.def(n).behaviour === 'crafter' || w.def(n).behaviour === 'mega');
}

/** Crafters the valve may pause: finished, on a product line, not fed by drones. */
function pausable(w: World, mem: Memory, b: Building): boolean {
  return w.def(b).behaviour === 'crafter' && w.ready(b) && !mem.feed.has(b.y * w.state.map.w + b.x) && !feedsCrafter(w, b);
}

/** The configure command that pauses a crafter whose product is at the cap. */
function pause(w: World, mem: Memory, b: Building, cap: number): Command | null {
  if (!pausable(w, mem, b)) return null;
  const product = recipeOf(w, b)?.outputs[0]?.item;
  if (!product || stockOf(w, product) < cap * CRAFT_FULL || ordered(w, product)) return null;
  const idle = pauseRecipe(w, b);
  if (idle < 0) return takeDown(w, mem, b, product);
  mem.paused.set(b.id, Math.max(0, b.config));
  return { type: 'configure', id: b.id, value: idle };
}

/** A crafter with one recipe (a graphite press) cannot idle by recipe: it is taken down and put back later. */
function takeDown(w: World, mem: Memory, b: Building, product: string): Command {
  const size = w.def(b).size;
  mem.downed.push({ plan: { kind: w.def(b).id, x: b.x, y: b.y, rot: b.rot, config: b.config }, product });
  return { type: 'remove', x0: b.x, y0: b.y, x1: b.x + size - 1, y1: b.y + size - 1 };
}

/** Crafters taken down by the valve whose product has dropped again: their ghosts. */
function putBack(w: World, mem: Memory, cap: number): Command[] {
  const back = mem.downed.filter((d) => stockOf(w, d.product) < cap * CRAFT_RESUME || ordered(w, d.product));
  if (!back.length) return [];
  mem.downed = mem.downed.filter((d) => !back.includes(d));
  return [{ type: 'place-many', plans: back.map((d) => d.plan) }];
}

export function surplusValves(w: World, mem: Memory): Command[] {
  const cap = storageInfo(w).capacity;
  const out: Command[] = [];
  for (const b of w.state.buildings) {
    const own = mem.paused.get(b.id);
    const c = own !== undefined ? resume(w, mem, b, own, cap) : pause(w, mem, b, cap);
    if (c) out.push(c);
  }
  return [...out, ...putBack(w, mem, cap)];
}

/**
 * Silicon from whichever of coal and graphite there is more of: coal also feeds the plants and the presses,
 * graphite also steel and plates. Drone-supplied silicon smelters switch when one runs low and the other does not.
 */
export function siliconSwitch(w: World, mem: Memory): Command[] {
  const k = w.content.buildings.indexOf('silicon-smelter');
  const ids = w.content.buildings.get('silicon-smelter').recipes ?? [];
  const coal = stockOf(w, 'coal');
  const graphite = stockOf(w, 'graphite');
  const want = coal < 100 && graphite > 300 ? 'smelt-silicon-graphite' : graphite < 100 && coal > 300 ? 'smelt-silicon' : null;
  const value = want ? ids.indexOf(want) : -1;
  if (value < 0) return [];
  return w.state.buildings
    .filter((b) => b.kind === k && w.ready(b) && mem.feed.has(b.y * w.state.map.w + b.x) && Math.max(0, b.config) !== value)
    .map((b) => ({ type: 'configure', id: b.id, value }) as Command);
}

/**
 * Ore valve. Ores other than copper share their lines into the core; one ore at the cap stops the rest on them
 * (titanium at the cap stopped the coal, so no graphite was pressed, so no titanium was rolled: a deadlock). Its
 * mining lines' drills are taken down (refunded) until the stock is back under RESUME of the cap, then put back.
 */
export function oreValves(w: World, mem: Memory): Command[] {
  const cap = storageInfo(w).capacity;
  const out: Command[] = [];
  for (const line of mem.lines) {
    if (line.cls !== 'raw' || !line.drills?.length) continue;
    const c = oreValve(w, line, cap);
    if (c) out.push(...c);
  }
  return out;
}

/** One mining line's valve: its drills come down at the cap and back below RESUME (or when an order wants the ore). */
function oreValve(w: World, line: Memory['lines'][number], cap: number): Command[] | null {
  const have = stockOf(w, line.item);
  // a running order counts what arrives (the full core burns the rest): its ore keeps flowing
  const wanted = ordered(w, line.item);
  if (!line.idle && have >= cap * FULL && !wanted) {
    line.idle = true;
    return line.drills!.map((d) => {
      const size = w.content.buildings.get(d.kind).size;
      return { type: 'remove', x0: d.x, y0: d.y, x1: d.x + size - 1, y1: d.y + size - 1 } as Command;
    });
  }
  if (line.idle && (have < cap * RESUME || wanted)) {
    line.idle = false;
    return [{ type: 'place-many', plans: line.drills! }];
  }
  return null;
}
