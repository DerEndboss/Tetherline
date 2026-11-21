import type { Behaviour, BuildingDef, Id, RawContent, RecipeDef } from './types';

/**
 * Checks content for broken references and impossible numbers. Returns one line per problem; the test keeps
 * the list empty. Every kind of content data is checked here, so a typo fails a test instead of
 * a run.
 */
export function validateContent(raw: RawContent): string[] {
  const problems: string[] = [];
  const ids = idSets(raw);
  checkUnique(raw, problems);
  for (const b of raw.buildings) checkBuilding(b, raw, ids, problems);
  for (const r of raw.recipes) checkRecipe(r, ids, problems);
  checkFloors(raw, ids, problems);
  checkProgression(raw, ids, problems);
  checkRules(raw, ids, problems);
  checkReachable(raw, problems);
  return problems;
}

interface IdSets {
  items: Set<Id>;
  liquids: Set<Id>;
  floors: Set<Id>;
  buildings: Set<Id>;
  recipes: Set<Id>;
  orders: Set<Id>;
  meta: Set<Id>;
  themes: Set<Id>;
  sizes: Set<Id>;
}

function idSets(raw: RawContent): IdSets {
  const of = (list: readonly { id: Id }[]) => new Set(list.map((e) => e.id));
  return {
    items: of(raw.materials),
    liquids: of(raw.liquids),
    floors: of(raw.floors),
    buildings: of(raw.buildings),
    recipes: of(raw.recipes),
    orders: of(raw.orders),
    meta: of(raw.meta),
    themes: of(raw.themes),
    sizes: of(raw.sizes),
  };
}

function checkUnique(raw: RawContent, problems: string[]): void {
  const kinds: [string, readonly { id: Id }[]][] = [
    ['material', raw.materials],
    ['liquid', raw.liquids],
    ['floor', raw.floors],
    ['building', raw.buildings],
    ['recipe', raw.recipes],
    ['order', raw.orders],
    ['meta node', raw.meta],
    ['theme', raw.themes],
    ['size', raw.sizes],
    ['map property', raw.mapProperties],
  ];
  for (const [kind, list] of kinds) {
    const seen = new Set<Id>();
    for (const e of list) {
      if (seen.has(e.id)) problems.push(`duplicate ${kind} id "${e.id}"`);
      seen.add(e.id);
    }
  }
  // Floors are stored as one byte (index + 1), materials on belts as int16.
  if (raw.floors.length > 254) problems.push('more than 254 floors do not fit the floor byte');
}

function checkStacks(where: string, list: readonly { item: Id; n: number }[], items: Set<Id>, problems: string[]): void {
  for (const s of list) {
    if (!items.has(s.item)) problems.push(`${where}: unknown item "${s.item}"`);
    if (!(s.n > 0)) problems.push(`${where}: amount of "${s.item}" must be > 0`);
  }
}

/** What each behaviour needs in its definition. */
const NEEDS: Partial<Record<Behaviour, (b: BuildingDef) => string | null>> = {
  core: (b) => (b.core && b.storage ? null : 'needs core and storage'),
  storage: (b) => (b.storage ? null : 'needs storage'),
  drill: (b) => (b.drill && (b.items ?? 0) > 0 ? null : 'needs drill and items'),
  pump: (b) => (b.pump && b.liquid ? null : 'needs pump and liquid'),
  conveyor: (b) => (b.conveyor && b.conveyor.speed > 0 ? null : 'needs conveyor.speed'),
  junction: (b) => (b.conveyor && (b.items ?? 0) > 0 ? null : 'needs conveyor.speed and items'),
  bridge: (b) => (b.bridge && b.bridge.range > 1 ? null : 'needs bridge.range > 1'),
  'mass-driver': (b) => (b.bridge && (b.items ?? 0) > 0 && b.power?.use ? null : 'needs bridge, items and power.use'),
  unloader: (b) => ((b.throughput ?? 0) > 0 ? null : 'needs throughput'),
  crafter: (b) => (b.recipes?.length && (b.items ?? 0) > 0 ? null : 'needs recipes and items'),
  mega: (b) => (b.recipes?.length && (b.items ?? 0) > 0 && b.stages ? null : 'needs recipes, items and stages'),
  generator: (b) => (b.generator && b.power?.make ? null : 'needs generator and power.make'),
  solar: (b) => (b.power?.make ? null : 'needs power.make'),
  battery: (b) => (b.power?.store ? null : 'needs power.store'),
  'power-node': (b) => (b.power?.laserRange && b.power.maxLinks ? null : 'needs power.laserRange and maxLinks'),
  conduit: (b) => (b.liquid ? null : 'needs liquid'),
  'liquid-junction': (b) => (b.liquid ? null : 'needs liquid'),
  'liquid-router': (b) => (b.liquid ? null : 'needs liquid'),
  tank: (b) => (b.liquid ? null : 'needs liquid'),
  'liquid-bridge': (b) => (b.liquid && b.bridge ? null : 'needs liquid and bridge'),
};

function checkBuilding(b: BuildingDef, raw: RawContent, ids: IdSets, problems: string[]): void {
  const where = `building ${b.id}`;
  if (!Number.isInteger(b.size) || b.size < 1 || b.size > 6) problems.push(`${where}: size must be 1..6`);
  if (!(b.buildSeconds > 0)) problems.push(`${where}: buildSeconds must be > 0`);
  if (!b.cost.length) problems.push(`${where}: needs a cost`);
  checkStacks(where, b.cost, ids.items, problems);
  const need = NEEDS[b.behaviour]?.(b);
  if (need) problems.push(`${where} (${b.behaviour}): ${need}`);
  checkBuildingRefs(b, raw, ids, problems);
  checkLiquidRefs(b, raw, ids, problems);
  checkGenerator(b, ids, problems);
  checkCrafterRoom(b, raw, problems);
}

/** A generator's burn table and coolant name real items and liquids. */
function checkGenerator(b: BuildingDef, ids: IdSets, problems: string[]): void {
  const g = b.generator;
  if (!g) return;
  for (const item of Object.keys(g.burn ?? {})) if (!ids.items.has(item)) problems.push(`building ${b.id}: unknown burn item "${item}"`);
  for (const l of [g.coolant?.liquid, ...(g.liquids ?? [])]) if (l && !ids.liquids.has(l)) problems.push(`building ${b.id}: unknown liquid "${l}"`);
}

/** A crafter's item buffer must hold what its recipes make, or it stalls with full hands. */
function checkCrafterRoom(b: BuildingDef, raw: RawContent, problems: string[]): void {
  for (const id of b.recipes ?? []) {
    const r = raw.recipes.find((x) => x.id === id);
    const most = Math.max(0, ...(r?.outputs ?? []).map((o) => o.n));
    if (most > (b.items ?? 0)) problems.push(`building ${b.id}: recipe ${id} makes ${most} at once, items buffer is ${b.items ?? 0}`);
  }
}

function checkBuildingRefs(b: BuildingDef, raw: RawContent, ids: IdSets, problems: string[]): void {
  const where = `building ${b.id}`;
  for (const r of b.recipes ?? []) if (!ids.recipes.has(r)) problems.push(`${where}: unknown recipe "${r}"`);
  const next = b.core?.next;
  if (!next) return;
  const def = raw.buildings.find((x) => x.id === next);
  if (def?.behaviour !== 'core') problems.push(`${where}: core.next "${next}" is not a core`);
  else if (def.size < b.size) problems.push(`${where}: core.next must not be smaller`);
}

function usesLiquid(b: BuildingDef, raw: RawContent): boolean {
  return (b.recipes ?? []).some((r) => {
    const rec = raw.recipes.find((x) => x.id === r);
    return Boolean(rec?.liquidIn?.length || rec?.liquidOut?.length);
  });
}

function checkLiquidRefs(b: BuildingDef, raw: RawContent, ids: IdSets, problems: string[]): void {
  const where = `building ${b.id}`;
  for (const l of [b.drill?.boost?.liquid, b.generator?.liquid, b.pump?.anywhere]) if (l && !ids.liquids.has(l)) problems.push(`${where}: unknown liquid "${l}"`);
  checkLiquidRoom(b, raw, problems);
}

/** Recipes that use or vent liquids need a liquid buffer on the building. */
function checkLiquidRoom(b: BuildingDef, raw: RawContent, problems: string[]): void {
  if (b.liquid) return;
  if (usesLiquid(b, raw)) problems.push(`building ${b.id}: a recipe uses liquids, the building needs liquid.capacity`);
  if (venting(b, raw)) problems.push(`building ${b.id}: a recipe vents a by-product, the building needs liquid.capacity`);
}

function venting(b: BuildingDef, raw: RawContent): boolean {
  return (b.recipes ?? []).some((r) => raw.recipes.find((x) => x.id === r)?.liquidOut?.some((l) => l.vent));
}

function checkRecipe(r: RecipeDef, ids: IdSets, problems: string[]): void {
  const where = `recipe ${r.id}`;
  checkStacks(where, r.inputs, ids.items, problems);
  checkStacks(where, r.outputs, ids.items, problems);
  for (const l of [...(r.liquidIn ?? []), ...(r.liquidOut ?? [])]) if (!ids.liquids.has(l.liquid)) problems.push(`${where}: unknown liquid "${l.liquid}"`);
  if (!(r.seconds > 0)) problems.push(`${where}: seconds must be > 0`);
  if (!r.outputs.length && !r.liquidOut?.length) problems.push(`${where}: makes nothing`);
}

function checkFloors(raw: RawContent, ids: IdSets, problems: string[]): void {
  for (const f of raw.floors) {
    if (f.ore && !ids.items.has(f.ore)) problems.push(`floor ${f.id}: unknown ore "${f.ore}"`);
    if (f.liquid && !ids.liquids.has(f.liquid)) problems.push(`floor ${f.id}: unknown liquid "${f.liquid}"`);
  }
  checkSpawns(raw, ids, problems);
}

function checkSpawns(raw: RawContent, ids: IdSets, problems: string[]): void {
  for (const s of raw.spawns) {
    if (!ids.floors.has(s.floor)) problems.push(`spawn: unknown floor "${s.floor}"`);
    if (s.chance <= 0 || s.chance > 1) problems.push(`spawn ${s.floor}: chance must be in (0, 1]`);
    for (const t of s.themes ?? []) if (!ids.themes.has(t)) problems.push(`spawn ${s.floor}: unknown theme "${t}"`);
  }
  for (const t of raw.themes) if (t.palette.ground.length < 2) problems.push(`theme ${t.id}: needs at least two ground tones`);
}

function checkOrder(o: RawContent['orders'][number], ids: IdSets, problems: string[]): void {
  const g = o.goal;
  if (g.kind === 'build' && !ids.buildings.has(g.building)) problems.push(`order ${o.id}: unknown building "${g.building}"`);
  if (g.kind !== 'build' && !ids.items.has(g.item)) problems.push(`order ${o.id}: unknown item "${g.item}"`);
  for (const a of o.after) if (!ids.orders.has(a)) problems.push(`order ${o.id}: unknown order "${a}" in after`);
  for (const u of o.unlocks ?? []) if (!ids.buildings.has(u)) problems.push(`order ${o.id}: unknown unlock "${u}"`);
}

function checkProgression(raw: RawContent, ids: IdSets, problems: string[]): void {
  for (const o of raw.orders) checkOrder(o, ids, problems);
  if (hasCycle(raw.orders.map((o) => [o.id, o.after]))) problems.push('orders: the after-chain has a cycle');
  for (const m of raw.meta) {
    for (const r of m.requires) if (!ids.meta.has(r)) problems.push(`meta ${m.id}: unknown requirement "${r}"`);
    if (m.effect.kind === 'unlock' && !ids.buildings.has(m.effect.building)) problems.push(`meta ${m.id}: unknown building`);
    if (m.effect.kind === 'start-items') checkStacks(`meta ${m.id}`, m.effect.items, ids.items, problems);
  }
  if (hasCycle(raw.meta.map((m) => [m.id, m.requires]))) problems.push('meta: requirements have a cycle');
}

/** Depth-first search for a cycle in id -> prerequisite ids. */
function hasCycle(edges: [Id, Id[]][]): boolean {
  const next = new Map(edges);
  const state = new Map<Id, 1 | 2>();
  const visit = (id: Id): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    if ((next.get(id) ?? []).some(visit)) return true;
    state.set(id, 2);
    return false;
  };
  return edges.some(([id]) => visit(id));
}

function checkRules(raw: RawContent, ids: IdSets, problems: string[]): void {
  const r = raw.rules;
  if (raw.buildings.find((b) => b.id === r.startCore)?.behaviour !== 'core') problems.push(`rules: startCore "${r.startCore}" is not a core`);
  if (!ids.themes.has(r.defaultTheme)) problems.push(`rules: unknown theme "${r.defaultTheme}"`);
  if (!ids.sizes.has(r.defaultSize)) problems.push(`rules: unknown size "${r.defaultSize}"`);
  checkStacks('rules.startItems', r.startItems, ids.items, problems);
  if (r.beltSlots < 1 || r.beltSlots > 4) problems.push('rules: beltSlots must be 1..4 (BeltStore SLOTS)');
}

/** Every material comes from somewhere: an ore floor or a recipe. */
function checkReachable(raw: RawContent, problems: string[]): void {
  const made = new Set<Id>();
  for (const f of raw.floors) if (f.ore) made.add(f.ore);
  for (const r of raw.recipes) for (const o of r.outputs) made.add(o.item);
  const unmade = raw.materials.filter((m) => !made.has(m.id)).map((m) => m.id);
  if (unmade.length) problems.push(`materials nobody makes: ${unmade.join(', ')}`);
}
