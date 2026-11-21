import type { ObstacleDef } from '../types';

/**
 * Everything that overgrows the map. Every obstacle pays a few credits (salvage) plus its material, so the
 * one number at the top counts up from the first clear. Colours: main = lit side, shade = side in shadow,
 * glow = emissive parts (docs/art-direction.md).
 */
export const obstacles: ObstacleDef[] = [
  {
    id: 'boulder',
    name: 'Boulder',
    shape: 'boulder',
    hardness: 6,
    loot: [{ id: 'credits', min: 3, max: 6 }, { id: 'iron-ore', min: 1, max: 4 }, { id: 'coal', min: 0, max: 1 }],
    relicChance: 0.002,
    colors: ['#b56a55', '#5b2f4a'],
    sound: 'stone',
  },
  {
    id: 'crystal-rubble',
    name: 'Crystal Rubble',
    shape: 'crystal',
    hardness: 8,
    loot: [{ id: 'credits', min: 4, max: 9 }, { id: 'quartz-sand', min: 3, max: 6 }],
    relicChance: 0.008,
    colors: ['#63e6e2', '#2a5f9e'],
    glow: '#8ff8ff',
    sound: 'crystal',
  },
  {
    id: 'wreck',
    name: 'Wreckage',
    shape: 'wreck',
    hardness: 10,
    loot: [{ id: 'credits', min: 6, max: 12 }, { id: 'copper-ore', min: 1, max: 4 }, { id: 'tin-ore', min: 0, max: 3 }],
    relicChance: 0.012,
    colors: ['#a9b4c6', '#4b4f6e'],
    glow: '#ffb35c',
    sound: 'metal',
  },
  {
    id: 'scrub',
    name: 'Thornscrub',
    shape: 'scrub',
    hardness: 3,
    loot: [{ id: 'credits', min: 1, max: 3 }, { id: 'coal', min: 1, max: 3 }],
    relicChance: 0.003,
    colors: ['#b55fb8', '#4a2463'],
    glow: '#ff8fd6',
    sound: 'plant',
  },
  {
    id: 'monolith',
    name: 'Monolith',
    shape: 'monolith',
    hardness: 30,
    loot: [{ id: 'credits', min: 22, max: 36 }, { id: 'iron-ore', min: 6, max: 12 }],
    relicChance: 0.08,
    colors: ['#5a5288', '#221b3f'],
    glow: '#ffd98a',
    sound: 'stone',
  },
];
