import { describe, expect, it } from 'vitest';
import { content, rawContent } from '.';
import type { BuildCategory, Id, RawContent } from './types';

interface Reach {
  items: Set<Id>;
  liquids: Set<Id>;
  /** Recipe ids that can run. */
  buildings: Set<Id>;
}

/** Runs one recipe if its inputs are there; returns whether it made something new. */
function tryRecipe(r: RawContent['recipes'][number], reach: Reach): boolean {
  const ok = r.inputs.every((s) => reach.items.has(s.item)) && (r.liquidIn ?? []).every((l) => reach.liquids.has(l.liquid));
  if (!ok) return false;
  reach.buildings.add(r.id);
  const before = reach.items.size + reach.liquids.size;
  for (const o of r.outputs) reach.items.add(o.item);
  for (const l of r.liquidOut ?? []) reach.liquids.add(l.liquid);
  return reach.items.size + reach.liquids.size > before;
}

/** Items and liquids one could make from raw ores and natural liquids, running every crafter recipe to a fixpoint. */
function closure(raw: RawContent, ores: Id[], naturalLiquids: Id[]): Reach {
  const reach: Reach = { items: new Set(ores), liquids: new Set(naturalLiquids), buildings: new Set() };
  const recipes = raw.buildings.filter((b) => b.behaviour === 'crafter' || b.behaviour === 'mega').flatMap((b) => b.recipes ?? []);
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of recipes) if (tryRecipe(raw.recipes.find((x) => x.id === id)!, reach)) changed = true;
  }
  return reach;
}

describe('the content', () => {
  it('has every building of the brief, in its category', () => {
    const brief: Record<BuildCategory, string[]> = {
      core: ['core-shard', 'core-foundation', 'core-nucleus', 'container', 'vault'],
      mining: ['mechanical-drill', 'pneumatic-drill', 'electric-drill', 'laser-drill', 'mechanical-pump', 'ground-pump', 'oil-derrick', 'slag-tap'],
      logistics: ['conveyor', 'fast-conveyor', 'junction', 'router', 'sorter', 'overflow-gate', 'bridge-conveyor', 'unloader', 'mass-driver'],
      power: ['combustion-generator', 'solar-panel', 'large-solar', 'wind-turbine', 'oil-generator', 'battery', 'large-battery', 'power-node', 'large-power-node'],
      factories: ['smelter', 'graphite-press', 'silicon-smelter', 'glass-kiln', 'steel-foundry', 'wire-mill', 'circuit-assembler', 'refinery', 'coolant-mixer', 'slag-separator', '3d-printer'],
      liquids: ['conduit', 'conduit-junction', 'liquid-router', 'tank', 'conduit-bridge'],
      mega: ['fusion-reactor', 'particle-accelerator', 'space-elevator'],
    };
    for (const [category, ids] of Object.entries(brief)) {
      for (const id of ids) expect(content.buildings.get(id).category, id).toBe(category);
    }
    expect(rawContent.buildings.length).toBeGreaterThanOrEqual(38);
  });

  it('has the materials and liquids of the brief', () => {
    const ores = ['copper-ore', 'iron-ore', 'coal', 'sand', 'lead-ore', 'tin-ore', 'titanium-ore', 'bauxite', 'lithium-salt', 'tungsten-ore', 'emberite', 'verdite', 'frostine', 'prismite', 'obsidion', 'scrap'];
    for (const id of ores) expect(content.materials.get(id).kind, id).toBe('raw');
    for (const id of ['copper-wire', 'iron-bar', 'graphite', 'silicon', 'glass', 'steel', 'titanium-plate', 'plastic', 'frame', 'circuit', 'motor', 'battery-cell', 'core-chip', 'star-alloy', 'singularity']) {
      expect(content.materials.has(id), id).toBe(true);
    }
    expect(rawContent.liquids.filter((l) => l.natural).map((l) => l.id)).toEqual(['water', 'oil', 'slag']);
    expect(content.liquids.has('coolant') && content.liquids.has('fuel')).toBe(true);
  });

  it('keeps the checkpoint ids and the order of the stored indices', () => {
    for (const id of ['copper-ore', 'iron-ore', 'iron-bar', 'mechanical-drill', 'conveyor', 'smelter', 'wire-mill', 'core-shard', 'container']) {
      expect(content.materials.has(id) || content.buildings.has(id), id).toBe(true);
    }
    // appended, never reordered: the first nineteen materials are the starter list
    expect(rawContent.materials.slice(0, 6).map((m) => m.id)).toEqual(['copper-ore', 'iron-ore', 'coal', 'sand', 'titanium-ore', 'scrap']);
  });

  it('every recipe belongs to a crafter and every ore floor has a drill that can cut it', () => {
    const used = new Set(rawContent.buildings.flatMap((b) => b.recipes ?? []));
    for (const r of rawContent.recipes) expect(used.has(r.id), `recipe ${r.id} has no building`).toBe(true);
    const top = Math.max(...rawContent.buildings.map((b) => b.drill?.tier ?? 0));
    for (const f of rawContent.floors) if (f.ore) expect(f.hardness ?? 1, f.id).toBeLessThanOrEqual(top);
  });

  it('every material has an icon id of its own and a distinct colour pair', () => {
    expect(new Set(rawContent.materials.map((m) => m.icon)).size).toBe(rawContent.materials.length);
    for (const m of rawContent.materials) expect(m.icon).toBe(`icon-${m.id}`);
  });
});

describe('every map can be won with what the generator guarantees', () => {
  const base = ['copper-ore', 'iron-ore', 'coal', 'sand', 'titanium-ore', 'tin-ore'];
  const goal = ['elevator-segment', 'singularity', 'star-alloy', 'core-chip', 'motor', 'frame', 'steel'];

  for (const [world, ore] of [
    ['Rust Desert', 'emberite'],
    ['Green Meadow', 'verdite'],
    ['Ice & Snow', 'frostine'],
  ] as const) {
    it(`${world}: the whole chain up to the Space Elevator runs with its world ore`, () => {
      const got = closure(rawContent, [...base, ore], ['water']);
      for (const item of goal) expect(got.items.has(item), `${item} on ${world}`).toBe(true);
    });
  }

  it('a map without coal still gets graphite, silicon and steel (sand, water and power)', () => {
    const got = closure(rawContent, ['copper-ore', 'iron-ore', 'sand', 'titanium-ore', 'lead-ore', 'verdite'], ['water']);
    for (const item of ['graphite', 'silicon', 'steel', 'circuit', 'core-chip', 'elevator-segment']) expect(got.items.has(item), item).toBe(true);
  });

  it('a map without a sand field gets sand from scrap, and lead can stand in for tin', () => {
    const got = closure(rawContent, ['copper-ore', 'iron-ore', 'coal', 'scrap', 'titanium-ore', 'lead-ore', 'emberite'], ['water']);
    expect(got.items.has('sand')).toBe(true);
    expect(got.buildings.has('make-circuit-lead')).toBe(true);
    expect(got.items.has('elevator-segment')).toBe(true);
  });

  it('plastic comes from oil, from gas out of the air, or from verdite', () => {
    expect(closure(rawContent, ['copper-ore', 'iron-ore', 'coal', 'sand'], ['water', 'oil']).items.has('plastic')).toBe(true);
    expect(closure(rawContent, ['copper-ore', 'iron-ore', 'coal', 'sand'], ['water']).items.has('plastic')).toBe(true);
    expect(closure(rawContent, ['copper-ore', 'iron-ore', 'coal', 'sand', 'verdite'], []).items.has('plastic')).toBe(true);
  });

  it('each rare ore opens a cheaper singularity; the plain route needs none', () => {
    const rare = (id: string) => rawContent.recipes.find((r) => r.id === id)!;
    const plain = rare('compress-singularity');
    for (const id of ['compress-singularity-prism', 'compress-singularity-obsidion']) {
      expect(rare(id).seconds).toBeLessThan(plain.seconds);
      expect(rare(id).inputs.reduce((n, s) => n + s.n, 0)).toBeLessThan(plain.inputs.reduce((n, s) => n + s.n, 0));
    }
  });
});

describe('first balance', () => {
  it('the early game is cheap and free of power', () => {
    const noPower = ['mechanical-drill', 'pneumatic-drill', 'conveyor', 'junction', 'router', 'sorter', 'overflow-gate', 'bridge-conveyor', 'smelter', 'graphite-press', 'combustion-generator', 'mechanical-pump', 'battery', 'power-node'];
    for (const id of noPower) expect(content.buildings.get(id).power?.use ?? 0, id).toBe(0);
    const start = new Map(content.rules.startItems.map((s) => [s.item, s.n]));
    const cost = (id: string) => content.buildings.get(id).cost.reduce((n, s) => n + s.n, 0);
    // a first copper drill, ten belts and a smelter come out of the starting stock
    expect(cost('mechanical-drill') * 4 + cost('conveyor') * 20 + cost('smelter')).toBeLessThan(start.get('copper-ore')!);
  });

  it('the core powers two or three powered machines, then power matters', () => {
    const core = content.buildings.get('core-shard').power!.make!;
    const use = (id: string) => content.buildings.get(id).power!.use!;
    expect(use('wire-mill') + use('silicon-smelter')).toBeLessThanOrEqual(core + 1);
    expect(use('wire-mill') + use('silicon-smelter') + use('electric-drill') + use('steel-foundry')).toBeGreaterThan(core * 2);
    expect(content.buildings.get('combustion-generator').power!.make!).toBeGreaterThan(core);
  });

  it('solar pays off: eight panels match a generator and cost only early materials', () => {
    const solar = content.buildings.get('solar-panel');
    expect(solar.power!.make! * 8).toBeGreaterThanOrEqual(content.buildings.get('combustion-generator').power!.make!);
    for (const c of solar.cost) expect(['copper-ore', 'copper-wire', 'iron-bar']).toContain(c.item);
  });

  it('the unloader comes early: copper and iron only, so the first wire mill can be fed from the core', () => {
    for (const c of content.buildings.get('unloader').cost) expect(['copper-ore', 'iron-bar']).toContain(c.item);
  });

  it('a generator costs less than the machines it feeds, and bigger sources pay off', () => {
    const make = (id: string) => content.buildings.get(id).power!.make!;
    expect(make('large-solar')).toBeGreaterThan(make('solar-panel') * 8);
    expect(make('oil-generator')).toBeGreaterThan(make('combustion-generator'));
    expect(make('fusion-reactor')).toBeGreaterThan(make('oil-generator') * 4);
  });

  it('the Space Elevator is a three-stage crown of about the right size', () => {
    const elevator = content.buildings.get('space-elevator');
    expect(elevator.stages).toBe(true);
    expect(elevator.recipes).toHaveLength(3);
    const crown = content.recipes.get('elevator-crown');
    expect(crown.inputs.some((s) => s.item === 'singularity')).toBe(true);
    expect(crown.inputs.some((s) => s.item === 'star-alloy')).toBe(true);
    // every stage hands over one segment: three segments finish the round
    for (const id of elevator.recipes!) expect(content.recipes.get(id).outputs).toEqual([{ item: 'elevator-segment', n: 1 }]);
  });

  it('chains are four to five steps deep from ore to the top product', () => {
    const makers = new Map<Id, Id[]>();
    for (const r of rawContent.recipes) for (const o of r.outputs) if (!makers.has(o.item)) makers.set(o.item, r.inputs.map((i) => i.item));
    const depth = (item: Id, seen = new Set<Id>()): number => {
      const from = makers.get(item);
      if (!from || seen.has(item)) return 0;
      return 1 + Math.max(0, ...from.map((i) => depth(i, new Set([...seen, item]))));
    };
    expect(depth('core-chip')).toBeGreaterThanOrEqual(4);
    expect(depth('star-alloy')).toBeGreaterThanOrEqual(5);
    expect(depth('elevator-segment')).toBeGreaterThanOrEqual(5);
  });

  /** Raw ore needed for `n` of an item along the plainest recipe (the first one that makes it, no alternatives). */
  const rawCost = (item: Id, n: number, acc = new Map<Id, number>()): Map<Id, number> => {
    const ore = rawContent.floors.some((f) => f.ore === item);
    const r = ore ? undefined : rawContent.recipes.find((x) => x.outputs.some((o) => o.item === item));
    if (!r) return acc.set(item, (acc.get(item) ?? 0) + n);
    const crafts = n / r.outputs.find((o) => o.item === item)!.n;
    for (const i of r.inputs) rawCost(i.item, i.n * crafts, acc);
    return acc;
  };
  const total = (m: Map<Id, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

  // Balance for a one-hour round: the cost used to be 12k to 25k, which made the elevator alone take about an hour
  it('the whole elevator costs 2k to 5k raw items on the plain route: the last quarter hour of a grown factory', () => {
    const elevator = content.buildings.get('space-elevator');
    const inputs = elevator.recipes!.flatMap((id) => content.recipes.get(id).inputs);
    const all = new Map<Id, number>();
    for (const s of [...elevator.cost, ...inputs]) rawCost(s.item, s.n, all);
    expect(total(all)).toBeGreaterThan(2000);
    expect(total(all)).toBeLessThan(5000);
  });

  it('the first power and the first parts come cheap: a powered drill under 200 raw, a generator under 60', () => {
    const cost = (id: string) => total(content.buildings.get(id).cost.reduce((m, s) => rawCost(s.item, s.n, m), new Map<Id, number>()));
    expect(cost('combustion-generator')).toBeLessThan(60);
    expect(cost('electric-drill')).toBeLessThan(200);
    expect(cost('smelter') + cost('graphite-press') + cost('wire-mill')).toBeLessThan(160);
  });
});
