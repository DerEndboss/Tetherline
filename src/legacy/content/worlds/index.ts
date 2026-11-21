import type { WorldDef } from '../types';

/** Rustfield: warm rust and violet ground under a deep blue dusk sky with a pink-orange horizon. */
export const worlds: WorldDef[] = [
  {
    id: 'rustfield',
    name: 'Rustfield',
    size: { w: 40, h: 40 },
    startClearRadius: 2,
    obstacleDensity: 0.5,
    obstacles: [
      { id: 'boulder', weight: 10 },
      { id: 'scrub', weight: 6 },
      { id: 'crystal-rubble', weight: 1.6 },
      { id: 'wreck', weight: 1 },
      { id: 'monolith', weight: 0.035, scatter: true },
    ],
    obstacleClusters: 6,
    showcase: ['monolith', 'crystal-rubble', 'wreck', 'scrub', 'crystal-rubble'],
    depositCount: 10,
    deposits: [
      { material: 'iron-ore', weight: 5, richness: [1500, 3000], guaranteed: 2 },
      { material: 'copper-ore', weight: 4, richness: [750, 1750] },
      { material: 'coal', weight: 4, richness: [750, 2000] },
      { material: 'quartz-sand', weight: 3, richness: [750, 1500] },
      { material: 'tin-ore', weight: 2, richness: [500, 1250] },
    ],
    // Four fogged edges of the map, pinwheeled around the 22 x 22 start area (tiles 9..30). The two in front
    // of the camera open for credits, the two behind the base through research.
    regions: [
      {
        id: 'ochre-flats',
        name: 'Ochre Flats',
        description: 'Warm flats in front of the base. Bauxite lies under the rubble here.',
        rects: [{ x: 9, y: 31, w: 31, h: 9 }],
        cost: [{ id: 'credits', amount: 400 }],
        depositCount: 6,
        deposits: [
          { material: 'bauxite', weight: 4, richness: [750, 1750] },
          { material: 'iron-ore', weight: 2, richness: [1250, 2500] },
          { material: 'coal', weight: 2, richness: [1000, 2250] },
        ],
      },
      {
        id: 'tin-hollow',
        name: 'Tin Hollow',
        description: 'A long hollow to the east, rich in tin, sand and copper.',
        rects: [{ x: 31, y: 0, w: 9, h: 31 }],
        cost: [{ id: 'credits', amount: 1500 }],
        depositCount: 6,
        deposits: [
          { material: 'tin-ore', weight: 3, richness: [1000, 2250] },
          { material: 'quartz-sand', weight: 2, richness: [1000, 2250] },
          { material: 'copper-ore', weight: 2, richness: [1250, 2500] },
          { material: 'bauxite', weight: 1, richness: [750, 1750] },
        ],
      },
      {
        id: 'glow-basin',
        name: 'Glow Basin',
        description: 'Behind the base, where the ground glows violet. Lumenite crystals grow here.',
        rects: [{ x: 0, y: 0, w: 31, h: 9 }],
        unlockedBy: 'deep-survey',
        depositCount: 6,
        deposits: [
          { material: 'lumenite', weight: 4, richness: [625, 1500] },
          { material: 'coal', weight: 1, richness: [1000, 2250] },
          { material: 'quartz-sand', weight: 1, richness: [1000, 2250] },
        ],
      },
      {
        id: 'shard-rise',
        name: 'Shard Rise',
        description: 'The far western rise: rich iron, bauxite and the densest lumenite.',
        rects: [{ x: 0, y: 9, w: 9, h: 31 }],
        unlockedBy: 'long-range-survey',
        depositCount: 7,
        deposits: [
          { material: 'lumenite', weight: 3, richness: [1000, 2250] },
          { material: 'bauxite', weight: 2, richness: [1000, 2250] },
          { material: 'iron-ore', weight: 2, richness: [2000, 3750] },
        ],
      },
    ],
    // The Skyforge's foundation: the back corner of the map, so the tower rises behind the base against the sky.
    sites: [{ building: 'megastructure', x: 1, y: 1 }],
    palette: {
      void: '#0a1028',
      sky: { top: '#0a1130', mid: '#173a6b', horizon: '#ff9a76', haze: '#b4607e' },
      ground: ['#3d2a4a', '#4e2f4c', '#62384d', '#78464e', '#8d5a50'],
      groundEdge: '#d08a6a',
      groundSide: '#21142e',
      tech: '#6fe8dc',
      light: '#ffc99a',
      shadow: '#170c2a',
      dust: '#a8705e',
      fog: { veil: '#1c1638', mist: '#8f7fb8' },
    },
    sound: { rootHz: 293.66, scale: [0, 2, 4, 7, 9] },
  },
];
