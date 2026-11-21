import { floors } from './floors';
import type { MapPropertyDef, MapSizeDef, ResourceSpawnDef } from './types';

/** Map sizes S/M/L (about 120/180/260 tiles across; Quick Round uses M). */
export const sizes: MapSizeDef[] = [
  { id: 'small', name: 'Small', diameter: 120, pieces: 3, minWidth: 8 },
  { id: 'medium', name: 'Medium', diameter: 180, pieces: 5, minWidth: 10 },
  { id: 'large', name: 'Large', diameter: 260, pieces: 8, minWidth: 12 },
];

/** Seeded map properties: each run rolls a few (rules.mapProperties). Two properties never share an effect. */
export const mapProperties: MapPropertyDef[] = [
  { id: 'dusty', name: 'Dusty', description: 'Dust in the air: solar power -30 %.', weight: 3, effects: { solar: 0.7 } },
  { id: 'windy', name: 'Windy', description: 'Strong winds: wind turbines make twice the power.', weight: 3, effects: { wind: 2 } },
  { id: 'geothermal', name: 'Geothermal', description: 'Hot ground: many more slag fields.', weight: 2, effects: { slagFields: 0.6 } },
  { id: 'sunny', name: 'Sunny', description: 'Clear skies: solar power +30 %.', weight: 2, effects: { solar: 1.3 } },
  { id: 'soft-ground', name: 'Soft Ground', description: 'Loose rock: drills work 15 % faster.', weight: 2, effects: { drill: 1.15 } },
];

const known = new Set(floors.map((f) => f.id));

/** The first of these floor ids that exists in the content (ids differ a little between content versions). */
function spawn(ids: string[], def: Omit<ResourceSpawnDef, 'floor'>): ResourceSpawnDef[] {
  const floor = ids.find((id) => known.has(id));
  return floor ? [{ floor, ...def }] : [];
}

/**
 * Which floors a map may have and how much. Groups (the generator tells them apart by the fields):
 * - start (`nearStart`): always there, within reach of the core: copper, iron, sand, coal, a shallow pond.
 * - standard (`chance` < 1, nothing else): rolled per seed, generous; the generator keeps at least four kinds.
 * - world (`themes`): one world ore per theme, mid distance.
 * - rare (`minDistance`): only some maps, far from the core.
 * - needed (`needed`): what the order chain cannot do without (titanium, tungsten, lead or tin, the world ore). A
 *   map that did not roll one still gets a patch of it, far out if need be (mapgen.test.ts checks 30 seeds a size).
 * - liquids: deep lakes (with a shallow rim), oil seeps, slag fields (Geothermal makes them common).
 * `density` = patches per 10,000 land tiles (kept low: the maps are mostly empty).
 */
export const spawns: ResourceSpawnDef[] = [
  { floor: 'ore-copper', chance: 1, density: 4, radius: [3, 6], nearStart: 14 },
  { floor: 'ore-iron', chance: 1, density: 3.5, radius: [3, 5], nearStart: 17 },
  { floor: 'sand', chance: 1, density: 3, radius: [3, 6], nearStart: 19 },
  { floor: 'ore-coal', chance: 1, density: 3, radius: [2, 5], nearStart: 21 },
  { floor: 'shallow-water', chance: 1, density: 0.6, radius: [3, 5], nearStart: 22 },
  { floor: 'water', chance: 0.95, density: 1.3, radius: [5, 9], minDistance: 18 },
  ...spawn(['ore-lead', 'lead'], { chance: 0.85, density: 2.4, radius: [2, 5], minDistance: 20, needed: 'circuit-metal' }),
  ...spawn(['ore-tin', 'tin'], { chance: 0.8, density: 2, radius: [2, 4], minDistance: 20, needed: 'circuit-metal' }),
  { floor: 'ore-titanium', chance: 0.8, density: 1.8, radius: [2, 4], minDistance: 26, needed: 'titanium' },
  ...spawn(['ore-bauxite', 'bauxite'], { chance: 0.7, density: 1.6, radius: [2, 4], minDistance: 24 }),
  ...spawn(['ore-lithium', 'ore-lithium-salt', 'lithium-salt'], { chance: 0.65, density: 1.5, radius: [2, 4], minDistance: 26 }),
  ...spawn(['ore-tungsten', 'tungsten-ore'], { chance: 0.6, density: 1.2, radius: [2, 4], minDistance: 30, needed: 'tungsten' }),
  ...spawn(['ore-emberite', 'emberite'], { chance: 1, density: 1.6, radius: [2, 4], themes: ['rust-desert'], needed: 'world-ore' }),
  ...spawn(['ore-verdite', 'verdite'], { chance: 1, density: 1.6, radius: [2, 4], themes: ['green-meadow'], needed: 'world-ore' }),
  ...spawn(['ore-frostine', 'frostine'], { chance: 1, density: 1.6, radius: [2, 4], themes: ['ice-snow'], needed: 'world-ore' }),
  ...spawn(['ore-prismite', 'prismite'], { chance: 0.3, density: 0.6, radius: [2, 3], minDistance: 44 }),
  ...spawn(['ore-obsidion', 'obsidion'], { chance: 0.25, density: 0.5, radius: [2, 3], minDistance: 44 }),
  { floor: 'oil', chance: 0.6, density: 1.1, radius: [2, 4], minDistance: 22 },
  { floor: 'slag-field', chance: 0.5, density: 1.1, radius: [2, 4], minDistance: 22 },
];

/**
 * Safety net for content that grows: an ore or liquid floor nobody listed above still shows up (a few rare
 * patches, farther out the harder the ore), so a new floor is never silently missing from every map.
 */
const listed = new Set(spawns.map((s) => s.floor));
for (const f of floors) {
  if (listed.has(f.id) || (!f.ore && !f.liquid)) continue;
  const far = 20 + (f.hardness ?? 1) * 8;
  spawns.push({ floor: f.id, chance: 0.6, density: 2, radius: [2, 4], minDistance: far });
}
