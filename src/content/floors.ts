import type { FloorDef } from './types';

/**
 * Floor kinds under buildings (one byte per tile, index + 1; 0 = plain ground). Ore floors feed drills,
 * liquid floors feed pumps. New floors are appended (the index is stored in maps).
 *
 * Hardness = the drill tier needed: 1 mechanical, 2 pneumatic, 3 electric, 4 laser.
 */
export const floors: FloorDef[] = [
  { id: 'ore-copper', name: 'Copper Ore', ore: 'copper-ore', hardness: 1, color: '#c9773f' },
  { id: 'ore-iron', name: 'Iron Ore', ore: 'iron-ore', hardness: 1, color: '#7d5f55' },
  { id: 'ore-coal', name: 'Coal', ore: 'coal', hardness: 1, color: '#2e2b33' },
  { id: 'sand', name: 'Sand', ore: 'sand', hardness: 1, color: '#dcc08a' },
  { id: 'ore-titanium', name: 'Titanium Ore', ore: 'titanium-ore', hardness: 2, color: '#7f96c9' },
  { id: 'water', name: 'Water', liquid: 'water', deep: true, color: '#3f86c0' },
  { id: 'shallow-water', name: 'Shallow Water', liquid: 'water', color: '#5aa3cf' },
  { id: 'oil', name: 'Oil Seep', liquid: 'oil', color: '#2a2430' },
  { id: 'slag-field', name: 'Slag Field', liquid: 'slag', color: '#7a3b25' },
  { id: 'ore-lead', name: 'Lead Ore', ore: 'lead-ore', hardness: 1, color: '#5f6f8c' },
  { id: 'ore-tin', name: 'Tin Ore', ore: 'tin-ore', hardness: 2, color: '#b8a98c' },
  { id: 'ore-bauxite', name: 'Bauxite', ore: 'bauxite', hardness: 2, color: '#a4412f' },
  { id: 'ore-lithium', name: 'Lithium Salt', ore: 'lithium-salt', hardness: 3, color: '#e3c4dc' },
  { id: 'ore-tungsten', name: 'Tungsten Ore', ore: 'tungsten-ore', hardness: 3, color: '#3f3a4e' },
  { id: 'ore-emberite', name: 'Emberite', ore: 'emberite', hardness: 3, color: '#e8651f' },
  { id: 'ore-verdite', name: 'Verdite', ore: 'verdite', hardness: 3, color: '#3fbf66' },
  { id: 'ore-frostine', name: 'Frostine', ore: 'frostine', hardness: 3, color: '#62b6f0' },
  { id: 'ore-prismite', name: 'Prismite', ore: 'prismite', hardness: 4, color: '#d58cf5' },
  { id: 'scrap-pile', name: 'Scrap Heap', ore: 'scrap', hardness: 1, color: '#6d737c' },
  { id: 'ore-obsidion', name: 'Obsidion', ore: 'obsidion', hardness: 4, color: '#2b1f48' },
];
