import type { RecipeDef } from '../../content/types';
import { dump, dumpFrom } from '../items';
import { drawLiquid, pushLiquid } from '../liquids';
import { mapEffect } from '../map-effects';
import type { Building } from '../state';
import type { World } from '../world';
import type { BlockBehaviour, TickContext } from './types';

/** What a drill mines: the most common mineable ore under it, how many tiles of it, out of how many. */
export interface DrillInfo {
  item: number;
  count: number;
  area: number;
}

/** Ore under a footprint for a drill of `tier` (ties go to the lower floor index). Pure, for ghosts too. */
/** The ore item a tile gives a drill of `tier`, or -1. */
function oreAt(w: World, x: number, y: number, tier: number): number {
  if (!w.inBounds(x, y)) return -1;
  const { map } = w.state;
  const f = map.floor[y * map.w + x]!;
  const floor = f > 0 ? w.content.floors.list[f - 1] : undefined;
  if (!floor?.ore || (floor.hardness ?? 1) > tier) return -1;
  return w.content.materials.indexOf(floor.ore);
}

export function drillInfoAt(w: World, x: number, y: number, size: number, tier: number): DrillInfo {
  const counts = new Map<number, number>();
  for (let ty = y; ty < y + size; ty++) {
    for (let tx = x; tx < x + size; tx++) {
      const item = oreAt(w, tx, ty, tier);
      if (item >= 0) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  let best: DrillInfo = { item: -1, count: 0, area: size * size };
  for (const [item, count] of [...counts].sort((a, b) => a[0] - b[0])) if (count > best.count) best = { item, count, area: size * size };
  return best;
}

const drillCache = new WeakMap<World, Map<number, DrillInfo>>();

export function drillInfo(w: World, b: Building): DrillInfo {
  let m = drillCache.get(w);
  if (!m) drillCache.set(w, (m = new Map()));
  let info = m.get(b.id);
  if (!info) m.set(b.id, (info = drillInfoAt(w, b.x, b.y, w.def(b).size, w.def(b).drill?.tier ?? 1)));
  return info;
}

/** Items per second a drill makes at full power and without boost. */
export function drillRate(w: World, b: Building): number {
  const info = drillInfo(w, b);
  const spec = w.def(b).drill;
  if (!spec || info.item < 0) return 0;
  return (info.count / info.area / spec.seconds) * w.state.bonus.drill * mapEffect(w, 'drill');
}

function drillBoost(w: World, b: Building, dt: number): number {
  const boost = w.def(b).drill?.boost;
  if (!boost) return 1;
  const liquid = w.content.liquids.indexOf(boost.liquid);
  const want = boost.perSecond * dt;
  return drawLiquid(w, b, liquid, want) >= want * 0.9 ? boost.factor : 1;
}

/** Drill: mines the ore under it, faster with more ore tiles; hands items to any neighbour that takes them. */
function mine(w: World, b: Building, item: number, ctx: TickContext): void {
  if ((b.items[item] ?? 0) >= (w.def(b).items ?? 10)) return;
  b.work += drillRate(w, b) * ctx.dt * ctx.power(b) * drillBoost(w, b, ctx.dt);
  if (b.work < 1) return;
  b.work -= 1;
  b.items[item] = (b.items[item] ?? 0) + 1;
  w.state.stats.made[item] = (w.state.stats.made[item] ?? 0) + 1;
  ctx.events.push({ type: 'mined', id: b.id, item });
}

export const drill: BlockBehaviour = {
  update: (w, b, ctx) => {
    const { item } = drillInfo(w, b);
    if (item < 0) return;
    mine(w, b, item, ctx);
    if ((b.items[item] ?? 0) > 0 && dump(w, b, item)) b.items[item]!--;
  },
  wantsPower: (w, b) => {
    const { item } = drillInfo(w, b);
    return item >= 0 && (b.items[item] ?? 0) < (w.def(b).items ?? 10);
  },
};

/** The recipe a crafter runs (its config picks among the def's recipes). */
export function recipeOf(w: World, b: Building): RecipeDef | undefined {
  const def = w.def(b);
  const ids = def.recipes ?? [];
  // Staged mega buildings run their recipes in order (`config` counts the finished ones); past the last, nothing.
  const i = def.stages ? Math.max(b.config, 0) : b.config >= 0 && b.config < ids.length ? b.config : 0;
  const id = ids[i];
  return id ? w.content.recipes.get(id) : undefined;
}

/** How many stages of a staged mega building are done (0 for anything else). */
export function stagesDone(w: World, b: Building): number {
  return w.def(b).stages ? Math.max(b.config, 0) : 0;
}

const itemIndex = (w: World, id: string): number => w.content.materials.indexOf(id);

/** Room per input: enough for two crafts, at least the building's buffer. */
function inputCap(w: World, b: Building, need: number): number {
  return Math.max(w.def(b).items ?? 10, need * 2);
}

const has = (b: Building, i: number, n: number): boolean => (b.items[i] ?? 0) >= n;

function liquidsReady(w: World, b: Building, r: RecipeDef): boolean {
  const inputs = r.liquidIn ?? [];
  return inputs.every((l) => b.liquidId === w.content.liquids.indexOf(l.liquid) && b.liquid >= l.n - 1e-6);
}

/** Whether every made liquid that must not be vented still has room in its output queue. */
function liquidRoom(w: World, b: Building, r: RecipeDef): boolean {
  const cap = w.def(b).liquid?.capacity ?? 0;
  return (r.liquidOut ?? []).every((l, i) => l.vent === true || (b.queue[i]?.[1] ?? 0) <= cap);
}

/** Inputs there, room for the outputs (items and made liquid). */
function ready(w: World, b: Building, r: RecipeDef): boolean {
  if (!r.inputs.every((s) => has(b, itemIndex(w, s.item), s.n)) || !liquidsReady(w, b, r)) return false;
  const cap = w.def(b).items ?? 10;
  if (r.outputs.some((s) => (b.items[itemIndex(w, s.item)] ?? 0) + s.n > cap)) return false;
  return liquidRoom(w, b, r);
}

function produce(w: World, b: Building, item: number, n: number, ctx: TickContext): void {
  b.items[item] = (b.items[item] ?? 0) + n;
  w.state.stats.made[item] = (w.state.stats.made[item] ?? 0) + n;
  ctx.events.push({ type: 'crafted', id: b.id, item });
}

function finish(w: World, b: Building, r: RecipeDef, ctx: TickContext): void {
  for (const s of r.inputs) b.items[itemIndex(w, s.item)]! -= s.n;
  for (const l of r.liquidIn ?? []) b.liquid -= l.n;
  for (const s of r.outputs) produce(w, b, itemIndex(w, s.item), s.n, ctx);
  const cap = w.def(b).liquid?.capacity ?? 0;
  (r.liquidOut ?? []).forEach((l, i) => {
    while (b.queue.length <= i) b.queue.push([-1, 0]);
    const held = (b.queue[i]?.[1] ?? 0) + l.n;
    b.queue[i] = [w.content.liquids.indexOf(l.liquid), l.vent ? Math.min(held, cap) : held];
  });
  if (w.def(b).stages) b.config = Math.max(b.config, 0) + 1;
}

/** Pulls the recipe's input liquid from neighbouring networks. */
function pullLiquid(w: World, b: Building, r: RecipeDef): void {
  const cap = w.def(b).liquid?.capacity ?? 0;
  const input = r.liquidIn?.[0];
  if (!input || cap <= 0) return;
  const id = w.content.liquids.indexOf(input.liquid);
  if (b.liquidId !== id && b.liquid <= 1e-6) b.liquidId = id;
  if (b.liquidId === id) b.liquid += drawLiquid(w, b, id, cap - b.liquid);
}

/** Pulls input liquid and pushes made liquids (queue i holds [liquid, amount] of the recipe's i-th output) out. */
function liquidIo(w: World, b: Building, r: RecipeDef): void {
  pullLiquid(w, b, r);
  for (const out of b.queue) if (out && out[0]! >= 0 && out[1]! > 0) out[1] = out[1]! - pushLiquid(w, b, out[0]!, out[1]!);
}

/** Crafter: a fixed recipe; neighbours feed it directly, it hands its products to any neighbour. */
export const crafter: BlockBehaviour = {
  accept: (w, b, item) => {
    const r = recipeOf(w, b);
    const s = r?.inputs.find((x) => itemIndex(w, x.item) === item);
    return s !== undefined && (b.items[item] ?? 0) < inputCap(w, b, s.n);
  },
  handle: (_w, b, item) => {
    b.items[item] = (b.items[item] ?? 0) + 1;
  },
  update: (w, b, ctx) => {
    const r = recipeOf(w, b);
    if (!r) return;
    liquidIo(w, b, r);
    if (ready(w, b, r)) {
      b.work += (ctx.dt / r.seconds) * ctx.power(b);
      if (b.work >= 1) {
        b.work = 0;
        finish(w, b, r, ctx);
      }
    }
    dumpFrom(
      w,
      b,
      r.outputs.map((s) => itemIndex(w, s.item)),
    );
  },
  wantsPower: (w, b) => {
    const r = recipeOf(w, b);
    return r !== undefined && ready(w, b, r);
  },
};
