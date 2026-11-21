import type { ContentRegistry } from '../../content/registry';
import type { BuildingDef, RecipeDef } from '../../content/types';

/** One amount in a tooltip: an item or a liquid with its display name. */
export interface StackFact {
  kind: 'item' | 'liquid';
  id: string;
  name: string;
  n: number;
}

export interface RecipeFact {
  name: string;
  inputs: StackFact[];
  outputs: StackFact[];
  seconds: number;
}

export interface FactLine {
  label: string;
  value: string;
}

/** What the palette tooltip says about a building type (cost, power, size, inputs). Pure data. */
export interface BuildingFacts {
  size: string;
  cost: StackFact[];
  lines: FactLine[];
  recipes: RecipeFact[];
}

/** Trims a number for display: 4, 1.5, 0.25. */
export function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function items(c: ContentRegistry, list: { item: string; n: number }[]): StackFact[] {
  return list.map((s) => ({ kind: 'item', id: s.item, name: c.materials.find(s.item)?.name ?? s.item, n: s.n }));
}

function liquids(c: ContentRegistry, list: { liquid: string; n: number }[] | undefined): StackFact[] {
  return (list ?? []).map((s) => ({ kind: 'liquid', id: s.liquid, name: c.liquids.find(s.liquid)?.name ?? s.liquid, n: s.n }));
}

/** The recipe as tooltip data (inputs and outputs include liquids). */
export function recipeFact(c: ContentRegistry, r: RecipeDef): RecipeFact {
  return {
    name: r.name,
    inputs: [...items(c, r.inputs), ...liquids(c, r.liquidIn)],
    outputs: [...items(c, r.outputs), ...liquids(c, r.liquidOut)],
    seconds: r.seconds,
  };
}

type LineMaker = (c: ContentRegistry, def: BuildingDef) => FactLine | null;

const row = (label: string, value: string): FactLine => ({ label, value });

/** One entry per spec of a building: the tooltip shows the ones it has. */
const LINES: LineMaker[] = [
  (_c, d) => (d.power?.use ? row('Uses power', `${num(d.power.use)}/s`) : null),
  (_c, d) => (d.power?.make ? row('Makes power', `${num(d.power.make)}/s`) : null),
  (_c, d) => (d.power?.store ? row('Stores', `${num(d.power.store)} power`) : null),
  (_c, d) => (d.power?.laserRange ? row('Laser range', `${num(d.power.laserRange)} tiles`) : null),
  (_c, d) => (d.power?.maxLinks ? row('Links', `up to ${d.power.maxLinks}`) : null),
  (_c, d) => (d.drill ? row('Mines', `drill tier ${d.drill.tier}, ${num(60 / d.drill.seconds)}/min on full ore`) : null),
  (c, d) => (d.drill?.boost ? row('Boost', `${c.liquids.find(d.drill.boost.liquid)?.name ?? d.drill.boost.liquid} x${num(d.drill.boost.factor)}`) : null),
  (_c, d) => (d.pump ? row('Pumps', `${num(d.pump.perTile)}/s per tile`) : null),
  (_c, d) => (d.conveyor ? row('Speed', `${num(d.conveyor.speed)} tiles/s`) : null),
  // a bridge's range is the distance to its partner (one more than the tiles it jumps over), a driver's is the gap
  (_c, d) => (d.bridge ? row('Range', `${d.bridge.range} tiles${d.behaviour === 'mass-driver' ? '' : ' apart'}, ${num(d.bridge.rate)}/s`) : null),
  (_c, d) => (d.storage ? row('Holds', `${num(d.storage.capacity)} of each item`) : null),
  (_c, d) => (d.liquid ? row('Liquid', `holds ${num(d.liquid.capacity)}${d.liquid.flow ? `, ${num(d.liquid.flow)}/s` : ''}`) : null),
  (_c, d) => (d.throughput ? row('Moves', `${num(d.throughput)} items/s`) : null),
  (_c, d) => row('Build time', `${num(d.buildSeconds)} s`),
];

/** Everything the tooltip shows for a building type. */
export function buildingFacts(c: ContentRegistry, def: BuildingDef): BuildingFacts {
  return {
    size: `${def.size}x${def.size}`,
    cost: items(c, def.cost),
    lines: LINES.flatMap((make) => make(c, def) ?? []),
    recipes: (def.recipes ?? []).flatMap((id) => {
      const r = c.recipes.find(id);
      return r ? [recipeFact(c, r)] : [];
    }),
  };
}
