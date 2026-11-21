import { beltItems } from './belts';
import { BLOCKS } from './blocks';
import type { TickContext } from './blocks/types';
import { autoLink, hasPower, unlinkAll } from './power';
import { placementProblem } from './placement';
import type { Building, Plan } from './state';
import { storeInCore } from './storage';
import { newBuilding, type World } from './world';

/**
 * Ghost building: placing queues a plan; the drone turns the plan into a site, then
 * builds it up, paying the cost from the core while it rises (no progress bar: the renderer shows the site
 * holographically from the bottom up by `build`). Removal runs a building back down and refunds what it cost.
 */

/** Clears dust boulders under a footprint (building over them removes them). */
export function clearBoulders(w: World, x: number, y: number, size: number): void {
  const { map } = w.state;
  for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) if (w.inBounds(tx, ty)) map.boulder[ty * map.w + tx] = 0;
}

/** The distinct buildings under a footprint (only belts and pipes can be there when placement allows it). */
function coveredBy(w: World, x: number, y: number, size: number): Building[] {
  const out: Building[] = [];
  for (let ty = y; ty < y + size; ty++) {
    for (let tx = x; tx < x + size; tx++) {
      const b = w.at(tx, ty);
      if (b && !out.includes(b)) out.push(b);
    }
  }
  return out;
}

/**
 * A belt over a belt (or a pipe over a pipe) is swapped in place: same kind only turns, another tier becomes a
 * site of the new kind that keeps the items or liquid on it (the old cost goes back to the core).
 */
function swapInPlace(w: World, b: Building, plan: Plan, ctx: TickContext): Building | null {
  const def = w.defs[plan.kind]!;
  if (w.def(b).behaviour !== def.behaviour) return null;
  b.removing = false;
  if (b.kind === plan.kind) {
    b.rot = plan.rot;
    w.touch();
    return b;
  }
  w.def(b).cost.forEach((c, i) => storeInCore(w, w.content.materials.indexOf(c.item), b.spent[i] ?? 0));
  w.reshape(b, () => {
    b.kind = plan.kind;
    b.rot = plan.rot;
    b.build = 0;
    b.spent = def.cost.map(() => 0);
  });
  ctx.events.push({ type: 'site', id: b.id });
  return b;
}

/** Turns a plan into a site; returns the site or why it cannot start. Belts and pipes under it are replaced. */
export function startSite(w: World, plan: Plan, ctx: TickContext): Building | string {
  const def = w.defs[plan.kind]!;
  const problem = placementProblem(w, def, plan.x, plan.y);
  if (problem) return problem;
  const covered = coveredBy(w, plan.x, plan.y, def.size);
  const swapped = covered.length === 1 && def.size === 1 ? swapInPlace(w, covered[0]!, plan, ctx) : null;
  if (swapped) return swapped;
  for (const b of covered) removeNow(w, b, ctx);
  clearBoulders(w, plan.x, plan.y, def.size);
  const site = newBuilding(w, plan.kind, plan.x, plan.y, plan.rot, plan.config);
  w.add(site);
  ctx.events.push({ type: 'site', id: site.id });
  return site;
}

/**
 * Pays for progress up to `to` (0..1) from the core: each cost entry is paid in whole items as the building
 * rises. Returns the material that is short ('' when paid).
 */
function pay(w: World, cost: { item: string; n: number }[], spent: number[], to: number): string {
  const need = cost.map((c, i) => Math.ceil(c.n * to) - (spent[i] ?? 0));
  for (let i = 0; i < cost.length; i++) {
    const item = w.content.materials.indexOf(cost[i]!.item);
    if ((w.state.stock[item] ?? 0) < need[i]!) return cost[i]!.item;
  }
  for (let i = 0; i < cost.length; i++) {
    const item = w.content.materials.indexOf(cost[i]!.item);
    w.state.stock[item]! -= Math.max(0, need[i]!);
    spent[i] = (spent[i] ?? 0) + Math.max(0, need[i]!);
  }
  return '';
}

/** Seconds of drone work this tick, as a share of the building's build time. */
function buildStep(w: World, kind: number, ctx: TickContext, speed: number): number {
  const core = w.core;
  const coreSpeed = core ? (w.def(core).core?.buildSpeed ?? 1) : 1;
  return (ctx.dt * speed * coreSpeed * w.state.bonus.build) / w.defs[kind]!.buildSeconds;
}

/** Builds a site up by one tick of work; returns what is missing ('' while it goes on or when done). */
export function buildSite(w: World, site: Building, ctx: TickContext, speed: number): string {
  if (site.upgrade) return buildUpgrade(w, site, ctx, speed);
  const to = Math.min(1, site.build + buildStep(w, site.kind, ctx, speed));
  const short = pay(w, w.def(site).cost, site.spent, to);
  if (short) return short;
  site.build = to;
  if (to >= 1) finishSite(w, site, ctx);
  return '';
}

export function finishSite(w: World, site: Building, ctx: TickContext): void {
  site.build = 1;
  w.touch();
  BLOCKS[w.def(site).behaviour].built?.(w, site);
  if (hasPower(w, site)) autoLink(w, site);
  w.state.stats.built[site.kind] = (w.state.stats.built[site.kind] ?? 0) + 1;
  ctx.events.push({ type: 'built', id: site.id, kind: site.kind });
}

/** Runs a building marked for removal down; at 0 it is gone and its cost goes back to the core. */
export function unbuild(w: World, b: Building, ctx: TickContext, speed: number): void {
  b.build = Math.max(0, b.build - buildStep(w, b.kind, ctx, speed) * 2);
  if (b.build > 0) return;
  removeNow(w, b, ctx);
}

/** Removes a building at once, refunding what was spent on it (and anything it held). */
export function removeNow(w: World, b: Building, ctx: TickContext): void {
  const def = w.def(b);
  def.cost.forEach((c, i) => storeInCore(w, w.content.materials.indexOf(c.item), b.spent[i] ?? 0));
  b.items.forEach((n, i) => n > 0 && storeInCore(w, i, n));
  if (b.slot >= 0) for (const [item] of beltItems(w.state.belts, b.slot)) storeInCore(w, item, 1);
  BLOCKS[def.behaviour].removed?.(w, b);
  unlinkAll(w, b);
  for (const o of w.state.buildings) if (o.link === b.id) o.link = -1;
  w.remove(b);
  ctx.events.push({ type: 'removed', id: b.id, kind: b.kind, x: b.x, y: b.y });
}

/* ---------- Core upgrade in place ---------- */

/** Footprint of the next core stage around the current one (it grows right and down). */
export function upgradeSpot(w: World, core: Building): { kind: number; x: number; y: number } | null {
  const next = w.def(core).core?.next;
  if (!next) return null;
  const kind = w.content.buildings.indexOf(next);
  const grow = w.defs[kind]!.size - w.def(core).size;
  return { kind, x: core.x - Math.floor(grow / 2), y: core.y - Math.floor(grow / 2) };
}

export function startUpgrade(w: World): string {
  const core = w.core;
  if (!core || core.upgrade) return 'busy';
  const spot = upgradeSpot(w, core);
  if (!spot) return 'max';
  const problem = placementProblem(w, w.defs[spot.kind]!, spot.x, spot.y, core);
  if (problem) return problem;
  core.upgrade = { kind: spot.kind, build: 0, spent: w.defs[spot.kind]!.cost.map(() => 0) };
  return '';
}

function buildUpgrade(w: World, core: Building, ctx: TickContext, speed: number): string {
  const up = core.upgrade!;
  const to = Math.min(1, up.build + buildStep(w, up.kind, ctx, speed));
  const short = pay(w, w.defs[up.kind]!.cost, up.spent, to);
  if (short) return short;
  up.build = to;
  if (to < 1) return '';
  const spot = upgradeSpot(w, core)!;
  if (placementProblem(w, w.defs[spot.kind]!, spot.x, spot.y, core)) return 'blocked';
  clearBoulders(w, spot.x, spot.y, w.defs[spot.kind]!.size);
  w.reshape(core, () => {
    core.kind = spot.kind;
    core.x = spot.x;
    core.y = spot.y;
    core.spent = up.spent;
    core.upgrade = null;
  });
  ctx.events.push({ type: 'core-upgraded', id: core.id, kind: core.kind });
  return '';
}
