import type { Building } from '../state';
import { itemTotal } from '../items';
import { drawLiquid } from '../liquids';
import { autoLink } from '../power';
import type { World } from '../world';
import type { BlockBehaviour } from './types';

/** Seconds one item burns in this generator (0 = it does not burn here). A generator's own `burn` table wins. */
export function burnSeconds(w: World, b: Building, item: number): number {
  const spec = w.def(b).generator;
  const m = w.content.materials.list[item];
  if (!spec?.items || !m) return 0;
  return spec.burn ? (spec.burn[m.id] ?? 0) : (m.fuel ?? 0);
}

/** Liquids this generator burns (index), in order of preference. */
function fuelLiquids(w: World, b: Building): number[] {
  const spec = w.def(b).generator;
  const ids = [spec?.liquid, ...(spec?.liquids ?? [])].filter((id): id is string => id !== undefined);
  return ids.map((id) => w.content.liquids.indexOf(id)).filter((i) => i >= 0);
}

/** Burns a second's worth of the first fuel liquid the neighbouring pipes hold; returns the burn seconds. */
function burnLiquid(w: World, b: Building): number {
  for (const id of fuelLiquids(w, b)) {
    const per10 = w.content.liquids.list[id]?.fuel ?? 0;
    const got = per10 > 0 ? drawLiquid(w, b, id, 10 / per10) : 0;
    if (got > 0) return (got * per10) / 10;
  }
  return 0;
}

/** The coolant a reactor needs this tick: false when its pipes are dry (the fire dies). */
function cooled(w: World, b: Building, dt: number): boolean {
  const need = w.def(b).generator?.coolant;
  if (!need) return true;
  const want = need.perSecond * dt;
  return drawLiquid(w, b, w.content.liquids.indexOf(need.liquid), want) >= want * 0.9;
}

function burnItem(w: World, b: Building): number {
  const fuel = b.items.findIndex((n, i) => n > 0 && burnSeconds(w, b, i) > 0);
  if (fuel < 0) return 0;
  b.items[fuel]!--;
  return burnSeconds(w, b, fuel);
}

/** Combustion / liquid generator / reactor: burns fuel; `work` holds the seconds of burn left. */
export const generator: BlockBehaviour = {
  accept: (w, b, item) => burnSeconds(w, b, item) > 0 && itemTotal(b) < (w.def(b).items ?? 4),
  handle: (_w, b, item) => {
    b.items[item] = (b.items[item] ?? 0) + 1;
  },
  update: (w, b, ctx) => {
    if (b.work > 0) {
      b.work = cooled(w, b, ctx.dt) ? Math.max(0, b.work - ctx.dt) : 0;
      if (b.work > 0) return;
    }
    // Light a new fire only when the coolant is there, so a dry reactor does not eat its fuel.
    if (!cooled(w, b, ctx.dt)) return;
    b.work = fuelLiquids(w, b).length > 0 ? burnLiquid(w, b) : burnItem(w, b);
  },
};

/** Solar panel, battery: everything happens in the power balance (power.ts). */
export const passivePower: BlockBehaviour = {};

/** Power node: links by laser when finished. */
export const powerNode: BlockBehaviour = {
  built: (w, b) => autoLink(w, b),
};
