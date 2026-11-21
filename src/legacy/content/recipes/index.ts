import type { RecipeDef } from '../types';

export const recipes: RecipeDef[] = [
  // Smelter: 1 raw -> 1 refined.
  { id: 'smelt-iron', building: 'smelter', inputs: [{ id: 'iron-ore', amount: 1 }], outputs: [{ id: 'iron-bar', amount: 1 }], seconds: 2 },
  { id: 'smelt-copper', building: 'smelter', inputs: [{ id: 'copper-ore', amount: 1 }], outputs: [{ id: 'copper-bar', amount: 1 }], seconds: 2 },
  { id: 'smelt-tin', building: 'smelter', inputs: [{ id: 'tin-ore', amount: 1 }], outputs: [{ id: 'tin-bar', amount: 1 }], seconds: 2 },
  { id: 'smelt-silicon', building: 'smelter', inputs: [{ id: 'quartz-sand', amount: 1 }], outputs: [{ id: 'silicon', amount: 1 }], seconds: 3 },
  { id: 'bake-graphite', building: 'smelter', inputs: [{ id: 'coal', amount: 1 }], outputs: [{ id: 'graphite', amount: 1 }], seconds: 3 },
  { id: 'smelt-aluminium', building: 'smelter', inputs: [{ id: 'bauxite', amount: 2 }], outputs: [{ id: 'aluminium', amount: 1 }], seconds: 3 },
  { id: 'grow-lumen-glass', building: 'smelter', inputs: [{ id: 'lumenite', amount: 1 }], outputs: [{ id: 'lumen-glass', amount: 1 }], seconds: 4 },

  // Fabricator: alloys and bars -> parts, printed layer by layer. Every part needs at least one alloy.
  { id: 'print-frame', building: 'fabricator', inputs: [{ id: 'steel', amount: 2 }], outputs: [{ id: 'frame', amount: 1 }], seconds: 6 },
  {
    id: 'print-conductor',
    building: 'fabricator',
    inputs: [{ id: 'copper-bar', amount: 2 }, { id: 'silicon-steel', amount: 1 }],
    outputs: [{ id: 'conductor', amount: 1 }],
    seconds: 8,
  },
  {
    id: 'print-circuit',
    building: 'fabricator',
    inputs: [{ id: 'silicon', amount: 2 }, { id: 'conductor', amount: 1 }, { id: 'pewter', amount: 1 }],
    outputs: [{ id: 'circuit', amount: 1 }],
    seconds: 10,
  },
  {
    id: 'print-core',
    building: 'fabricator',
    inputs: [{ id: 'frame', amount: 1 }, { id: 'circuit', amount: 1 }, { id: 'silicon-carbide', amount: 2 }],
    outputs: [{ id: 'core', amount: 1 }],
    seconds: 14,
  },

  // Research Lab: studies goods and turns them into research points (a currency: straight to the player).
  // The further up the chain, the more one unit teaches.
  { id: 'study-iron', building: 'lab', inputs: [{ id: 'iron-bar', amount: 1 }], outputs: [{ id: 'research', amount: 2 }], seconds: 4 },
  { id: 'study-copper', building: 'lab', inputs: [{ id: 'copper-bar', amount: 1 }], outputs: [{ id: 'research', amount: 2 }], seconds: 4 },
  { id: 'study-steel', building: 'lab', inputs: [{ id: 'steel', amount: 1 }], outputs: [{ id: 'research', amount: 5 }], seconds: 5 },
  { id: 'study-lumen', building: 'lab', inputs: [{ id: 'lumen-glass', amount: 1 }], outputs: [{ id: 'research', amount: 8 }], seconds: 4 },
  { id: 'study-circuit', building: 'lab', inputs: [{ id: 'circuit', amount: 1 }], outputs: [{ id: 'research', amount: 20 }], seconds: 8 },
];
