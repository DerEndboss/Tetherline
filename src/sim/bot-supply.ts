import { recipeOf } from './blocks/production';
import type { RecipeDef } from '../content/types';
import type { Memory } from './bot-build';
import { SUPPLY } from './bot-hub';
import type { Command, PlanSpec } from './commands';
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
  return stageShare(w, item) < 1;
}

/**
 * How much of what a mega building's stage needs of an item the core holds (the least over the mega buildings;
 * 1 when none wants it). The emptiest goes first: with marks tied by id, three plate rollers took every trip of
 * the three drones while the steel foundries behind them got nothing and the tower waited 20 minutes for steel
 * (M1 rust).
 */
function stageShare(w: World, item: string): number {
  let share = 1;
  for (const b of w.state.buildings) {
    if (w.def(b).behaviour !== 'mega' || !w.ready(b)) continue;
    const need = recipeOf(w, b)?.inputs.find((s) => s.item === item)?.n ?? 0;
    if (need > 0) share = Math.min(share, stockOf(w, item) / need);
  }
  return share;
}

/**
 * Whether the drones were told to mine an ore the core has almost none of. Helpers mine only when no marked machine
 * has room, so with fifteen marks they never did: M5 rust waited 25 minutes for emberite (star alloy) while the
 * helpers kept topping up presses and printers. While a running order's product waits for it, only machines for the
 * running orders, for what goes into their products and for the megastructure's stage keep their marks.
 */
function mining(w: World, mem: Memory): boolean {
  const ore = mem.mining;
  // only for an ore a running order's product is made of (mining for later must not starve the machines), also
  // two steps away: the coolant mixer's titanium ore for the crown's singularities (S8 green)
  return ore != null && stockOf(w, ore) < MINED_LOW && orderTree(w).includes(ore);
}

/** One item of the order tree and the item it goes into (null for what the order itself asks for). */
export interface Need {
  item: string;
  into: string | null;
}

/**
 * What the running orders ask for and what that is made of, two recipes deep and through liquids, nearest first:
 * the crown waits for singularities, they for coolant, and the coolant mixer for titanium ore (S4 rust and S8 green
 * waited half an hour with no titanium in the core while the drones only hauled).
 */
export function orderNeeds(w: World, depth = 2): Need[] {
  // the ordered item itself first: "Dig sand" asks for an ore (S7 rust: no sand line found room, and the drones
  // never mined it, so the round stood at 6 of 80 sand for 44 minutes); a building to build asks for its price
  const roots = w.state.progress.active
    .map((a) => w.content.orders.get(a.id).goal)
    .flatMap((g) => (g.kind === 'build' ? w.content.buildings.get(g.building).cost.map((c) => c.item) : [g.item]));
  let level: Need[] = roots.map((item) => ({ item, into: null }));
  const out: Need[] = [...level];
  for (let d = 0; d < depth; d++) {
    level = level.flatMap((n) => w.content.recipes.list.filter((r) => r.outputs.some((o) => o.item === n.item)).flatMap((r) => inputsOf(w, r).map((item) => ({ item, into: n.item }))));
    for (const n of level) if (!out.some((o) => o.item === n.item && o.into === n.into)) out.push(n);
  }
  return out;
}

/** The items of `orderNeeds`, each once. */
export function orderTree(w: World, depth = 2): string[] {
  return [...new Set(orderNeeds(w, depth).map((n) => n.item))];
}

/** A recipe's input items, and the inputs of the recipes that make its input liquids. */
function inputsOf(w: World, r: RecipeDef): string[] {
  const liquids = (r.liquidIn ?? []).map((l) => l.liquid);
  const makers = w.content.recipes.list.filter((m) => m.liquidOut?.some((l) => liquids.includes(l.liquid)));
  return [...r.inputs, ...makers.flatMap((m) => m.inputs)].map((i) => i.item);
}

/** Whether an item goes straight into a running order's product (the steel and chips of star alloy, its ore). */
function orderInput(w: World, item: string): boolean {
  return orderTree(w, 1).includes(item);
}

const MINED_LOW = 100;

/** How long a holding step's want counts after it last said so (ticks). */
const WANT_FOR = 1200;

/** What the holding steps lacked within the last WANT_FOR ticks. */
function wanted(w: World, mem: Memory): string[] {
  return [...(mem.wanting ?? [])].filter(([, at]) => w.state.tick - at <= WANT_FOR).map(([id]) => id);
}

/**
 * What a running build order's building, or a holding step (a drone upgrade, the plastic works ...), needs more of
 * than the core holds. The drones make those first, and machines that would eat them wait: the accelerator
 * (Stage 3) waited half an hour for 40 circuits while three marked chip printers turned every circuit into core
 * chips the run already had (S8 ice, S8 rust), and the cargo hold the drones need to mine tungsten waited an hour
 * for 10 plastic the cell assemblers ate (S2 ice).
 */
function buildShort(w: World, mem: Memory): Set<string> {
  const short = new Set<string>();
  for (const a of w.state.progress.active) {
    const g = w.content.orders.get(a.id).goal;
    if (g.kind !== 'build') continue;
    for (const c of w.content.buildings.get(g.building).cost) if (stockOf(w, c.item) < c.n) short.add(c.item);
  }
  // the step counts what the steps above it set aside, so the core can hold its price and it is still short: S3
  // rust's plastic works waited for 25 steel with 48 in the core while the drones mined coal and fed no foundry
  for (const id of wanted(w, mem)) short.add(id);
  return short;
}

/** -2 for a machine that makes what an order asks for or a build order lacks, Infinity for one that eats what a
 * build order lacks, else null. */
function forOrders(w: World, b: Building, product: string, short: ReadonlySet<string>): number | null {
  if (ordered(w, product) || short.has(product)) return -2;
  if (!short.size) return null;
  const eats = recipeOf(w, b)?.inputs.some((s) => short.has(s.item)) ?? false;
  return eats && !stageWants(w, product) ? Infinity : null;
}

/** Lower is more urgent; Infinity = not wanted at all. */
function urgency(w: World, mem: Memory, b: Building, marked: boolean, short: ReadonlySet<string>): number {
  if (!stageReady(w, mem, b, marked)) return Infinity;
  const product = recipeOf(w, b)?.outputs[0]?.item;
  if (!product) return -1;
  const pull = forOrders(w, b, product, short);
  if (pull !== null) return pull;
  if (stageWants(w, product)) return -1.5 + stageShare(w, product) * 0.4;
  const keep = !mining(w, mem) || orderInput(w, product);
  return keep ? byStock(stockOf(w, product), SMALL[product] ?? LOW, marked) : Infinity;
}

/** A product below its mark is wanted (the emptier the sooner); a marked machine keeps going up to twice that. */
function byStock(have: number, low: number, marked: boolean): number {
  return have < low || (marked && have < low * 2) ? have / low : Infinity;
}

export function supplyMarks(w: World, mem: Memory): Command[] {
  const marked = new Set(w.state.droneOps?.supply ?? []);
  const fed = w.state.buildings.filter((b) => mem.feed.has(b.y * w.state.map.w + b.x) && w.ready(b) && SUPPLY.has(w.def(b).behaviour));
  const short = buildShort(w, mem);
  const ranked = fed.map((b) => ({ b, u: urgency(w, mem, b, marked.has(b.id), short) }));
  ranked.sort((a, b) => a.u - b.u || a.b.id - b.b.id);
  const toggles = ranked.filter((r) => Number.isFinite(r.u) !== marked.has(r.b.id)).map((r) => r.b.id);
  if (toggles.length) return toggles.map((id) => droneCommand('drone-supply', { id }));
  return reorder(w, mem, ranked.filter((r) => Number.isFinite(r.u)).map((r) => r.b.id));
}

/** How often the marks are put back in order of urgency (ticks). */
const REORDER = 600;

/**
 * Puts the marks in order of urgency when they are out of it: each mark is toggled off and on
 * again, which moves it to the end, in the wanted order. At most every REORDER ticks, so a drone on its way keeps
 * its target and the order does not churn.
 */
function reorder(w: World, mem: Memory, want: number[]): Command[] {
  const now = (w.state.droneOps?.supply ?? []).filter((id) => want.includes(id));
  // the whole order counts, not only the first: with the ordered motor printer first, two plate rollers above
  // their mark kept the drones while six steel foundries behind them got nothing for 25 minutes (S8 green)
  const same = now.length === want.length && want.every((id, i) => now[i] === id);
  if (!want.length || same || w.state.tick - mem.reordered < REORDER) return [];
  mem.reordered = w.state.tick;
  return want.flatMap((id) => [droneCommand('drone-supply', { id }), droneCommand('drone-supply', { id })]);
}

/**
 * Surplus valve. Product lines carry several items into the core; once one of them fills the core its items stop
 * on the belt and block the others (iron bars at the cap stopped graphite and steel in a 45-minute run). A smelter
 * whose product is near the cap is switched to a recipe its ore line cannot feed, so it idles; it gets its recipe
 * back when the stock has dropped. A crafter with a single recipe is taken down and put back instead.
 */
/**
 * Ore lines pause at half the cap too (they used to pause at 95 %): the full core burns what does not fit,
 * so the only harm left is the belt, and a coal line at 78 % of the cap filled the trunk the refinery's plastic
 * needed, so the cells order waited 40 minutes (M1 green).
 */
const FULL = 0.5;
const RESUME = 0.3;
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

/**
 * Whether a taken-down building can go back where it stood: nothing else was built on its footprint since (a belt
 * laid there would be torn out by it). The building itself, still on its way out, does not count.
 */
function freeFor(w: World, p: PlanSpec): boolean {
  const kind = w.content.buildings.indexOf(p.kind);
  const size = w.content.buildings.get(p.kind).size;
  for (let y = p.y; y < p.y + size; y++) {
    for (let x = p.x; x < p.x + size; x++) {
      const b = w.at(x, y);
      if (b && !(b.kind === kind && b.x === p.x && b.y === p.y)) return false;
    }
  }
  return true;
}

/**
 * Crafters taken down by the valve whose product has dropped again: their ghosts. One whose old spot is built over
 * is forgotten (the planners build anew where there is room): a graphite press put back on the accelerator's output
 * belt cut it, and the crown waited an hour for the two singularities inside (M5 rust).
 */
function putBack(w: World, mem: Memory, cap: number): Command[] {
  const back = mem.downed.filter((d) => stockOf(w, d.product) < cap * CRAFT_RESUME || ordered(w, d.product));
  if (!back.length) return [];
  mem.downed = mem.downed.filter((d) => !back.includes(d));
  const plans = back.map((d) => d.plan).filter((p) => freeFor(w, p));
  return plans.length ? [{ type: 'place-many', plans }] : [];
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
    // a drill whose spot was built over in the meantime stays away (it would tear out what stands there now)
    line.drills = line.drills!.filter((d) => freeFor(w, d));
    return [{ type: 'place-many', plans: line.drills }];
  }
  return null;
}
