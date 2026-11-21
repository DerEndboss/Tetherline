import type { ContentRegistry } from '../../content/registry';
import type { BuildingDef, Id, OrderGoal, RecipeDef } from '../../content/types';
import type { MapState } from '../state';

/**
 * Whether a map can be won: every order of the chain asks only for things that can be made from what the map
 * holds. Items and liquids are grown to a fixpoint from the floors on the map (with a drill or pump that can be
 * built from what is known so far), the pumps that work anywhere, and every recipe whose inputs are known and
 * whose machine can be built. Wreck blueprints do not count (a wreck is a bonus, not a plan).
 */

interface Known {
  items: Set<Id>;
  liquids: Set<Id>;
}

const canPay = (k: Known, b: BuildingDef): boolean => b.unlock !== 'wreck' && b.cost.every((c) => k.items.has(c.item));

interface Source {
  ore?: Id;
  liquid?: Id;
  hardness: number;
}

/** The ore and liquid floors this map has. */
function sourcesOf(content: ContentRegistry, map: MapState): Source[] {
  const seen = new Set<number>();
  for (const f of map.floor) if (f) seen.add(f);
  return [...seen].map((f) => content.floors.list[f - 1]!).map((d) => ({ ore: d.ore, liquid: d.liquid, hardness: d.hardness ?? 1 }));
}

/** Raw sources: ore under a drill that can be built and mines it, liquid under a pump, and anywhere-pumps. */
function mine(content: ContentRegistry, k: Known, sources: Source[]): void {
  const builds = content.buildings.list.filter((b) => canPay(k, b));
  const tier = Math.max(0, ...builds.map((b) => b.drill?.tier ?? 0));
  const pumps = builds.filter((b) => b.pump);
  for (const s of sources) {
    if (s.ore && s.hardness <= tier) k.items.add(s.ore);
    if (s.liquid && pumps.length) k.liquids.add(s.liquid);
  }
  for (const p of pumps) if (p.pump!.anywhere) k.liquids.add(p.pump!.anywhere);
}

function canRun(k: Known, r: RecipeDef): boolean {
  return r.inputs.every((i) => k.items.has(i.item)) && (r.liquidIn ?? []).every((l) => k.liquids.has(l.liquid));
}

/** Recipes of the machines that can be built now. */
function craft(content: ContentRegistry, k: Known): void {
  for (const b of content.buildings.list) {
    if (!b.recipes || !canPay(k, b)) continue;
    for (const id of b.recipes) {
      const r = content.recipes.get(id);
      if (!canRun(k, r)) continue;
      for (const o of r.outputs) k.items.add(o.item);
      for (const l of r.liquidOut ?? []) k.liquids.add(l.liquid);
    }
  }
}

/** Everything the map can give, from the start items on. */
export function obtainable(content: ContentRegistry, map: MapState): Known {
  const k: Known = { items: new Set(content.rules.startItems.map((s) => s.item)), liquids: new Set() };
  const sources = sourcesOf(content, map);
  for (let size = -1; size !== k.items.size + k.liquids.size; ) {
    size = k.items.size + k.liquids.size;
    mine(content, k, sources);
    craft(content, k);
  }
  return k;
}

/** A staged building's stages each need their own inputs: a goal on its product needs all of them. */
function stagesFor(content: ContentRegistry, item: Id): RecipeDef[] {
  return content.buildings.list.filter((b) => b.stages).flatMap((b) => (b.recipes ?? []).map((id) => content.recipes.get(id))).filter((r) => r.outputs.some((o) => o.item === item));
}

function goalMissing(content: ContentRegistry, k: Known, g: OrderGoal): Id[] {
  if (g.kind === 'build') return content.buildings.get(g.building).cost.filter((c) => !k.items.has(c.item)).map((c) => c.item);
  if (!k.items.has(g.item)) return [g.item];
  return stagesFor(content, g.item).flatMap((r) => r.inputs.filter((i) => !k.items.has(i.item)).map((i) => i.item));
}

/** What the order chain asks for that this map cannot give (empty: the map can be won). */
export function missingForWin(content: ContentRegistry, map: MapState): Id[] {
  const k = obtainable(content, map);
  const out = new Set<Id>();
  for (const o of content.orders.list) for (const id of goalMissing(content, k, o.goal)) out.add(id);
  return [...out];
}
