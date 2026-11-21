import type { RecipeDef, Stack } from './types';

/** Short stacks: `s('coal', 2)` is two coal. */
const s = (item: string, n: number): Stack => ({ item, n });

/**
 * Fixed recipes (no ratio mixer). A crafter lists the ids it can run, the player picks one (the
 * first is the default). Chains run 4-5 steps deep; every vital material has a second, dearer way (`alt-` notes).
 * By-products are `vent` liquids: nothing needs them, a pipe can lead them to a generator or separator.
 */
export const recipes: RecipeDef[] = [
  // Smelter (no power)
  { id: 'smelt-iron', name: 'Iron Bar', inputs: [s('iron-ore', 2)], outputs: [s('iron-bar', 1)], liquidOut: [{ liquid: 'slag', n: 1, vent: true }], seconds: 1.6 },
  { id: 'smelt-lead', name: 'Lead Ingot', inputs: [s('lead-ore', 2)], outputs: [s('lead-ingot', 1)], liquidOut: [{ liquid: 'slag', n: 1, vent: true }], seconds: 1.6 },
  { id: 'smelt-tin', name: 'Tin Ingot', inputs: [s('tin-ore', 2)], outputs: [s('tin-ingot', 1)], liquidOut: [{ liquid: 'slag', n: 1, vent: true }], seconds: 2 },
  // Graphite press (no power)
  { id: 'press-graphite', name: 'Graphite', inputs: [s('coal', 2)], outputs: [s('graphite', 1)], seconds: 1.5 },
  // Wire mill
  { id: 'draw-wire', name: 'Copper Wire', inputs: [s('copper-ore', 1)], outputs: [s('copper-wire', 2)], seconds: 1 },
  // Glass kiln
  { id: 'fire-glass', name: 'Glass', inputs: [s('sand', 2)], outputs: [s('glass', 1)], seconds: 1.2 },
  { id: 'cut-prism-lens', name: 'Prism Lens', inputs: [s('glass', 1), s('prismite', 1)], outputs: [s('prism-lens', 2)], seconds: 3 },
  // Silicon smelter
  { id: 'smelt-silicon', name: 'Silicon', inputs: [s('sand', 2), s('coal', 1)], outputs: [s('silicon', 2)], seconds: 2 },
  { id: 'smelt-silicon-graphite', name: 'Silicon (graphite)', inputs: [s('sand', 2), s('graphite', 1)], outputs: [s('silicon', 2)], seconds: 2.5 },
  // Steel foundry
  { id: 'cast-steel', name: 'Steel', inputs: [s('iron-bar', 2), s('graphite', 1)], outputs: [s('steel', 2)], seconds: 2.4 },
  { id: 'roll-titanium', name: 'Titanium Plate', inputs: [s('titanium-ore', 2), s('graphite', 1)], outputs: [s('titanium-plate', 1)], seconds: 3 },
  // Alloy furnace
  { id: 'smelt-aluminium', name: 'Aluminium', inputs: [s('bauxite', 3)], outputs: [s('aluminium', 1)], liquidOut: [{ liquid: 'slag', n: 4, vent: true }], seconds: 3 },
  { id: 'refine-lithium', name: 'Lithium', inputs: [s('lithium-salt', 2)], outputs: [s('lithium', 1)], seconds: 3 },
  { id: 'forge-carbide', name: 'Tungsten Carbide', inputs: [s('tungsten-ore', 1), s('graphite', 1)], outputs: [s('tungsten-carbide', 1)], seconds: 2 },
  // Circuit assembler
  { id: 'make-circuit', name: 'Circuit', inputs: [s('copper-wire', 2), s('silicon', 1), s('tin-ingot', 1)], outputs: [s('circuit', 1)], seconds: 2.2 },
  { id: 'make-circuit-lead', name: 'Circuit (lead)', inputs: [s('copper-wire', 3), s('silicon', 1), s('lead-ingot', 1)], outputs: [s('circuit', 1)], seconds: 2.6 },
  { id: 'make-battery-cell', name: 'Battery Cell', inputs: [s('lead-ingot', 2), s('lithium', 1), s('plastic', 1)], outputs: [s('battery-cell', 1)], seconds: 4 },
  { id: 'make-battery-cell-tin', name: 'Battery Cell (tin)', inputs: [s('tin-ingot', 4), s('plastic', 2)], outputs: [s('battery-cell', 1)], seconds: 5 },
  { id: 'make-battery-cell-plain', name: 'Battery Cell (no lithium)', inputs: [s('lead-ingot', 4), s('plastic', 2)], outputs: [s('battery-cell', 1)], seconds: 5 },
  // 3D printer
  { id: 'print-frame', name: 'Frame', inputs: [s('steel', 2), s('aluminium', 1)], outputs: [s('frame', 2)], seconds: 3 },
  { id: 'print-frame-steel', name: 'Frame (steel only)', inputs: [s('steel', 3)], outputs: [s('frame', 1)], seconds: 3 },
  { id: 'print-motor', name: 'Motor', inputs: [s('steel', 2), s('copper-wire', 4), s('circuit', 1)], outputs: [s('motor', 1)], seconds: 3.5 },
  { id: 'print-core-chip', name: 'Core Chip', inputs: [s('circuit', 2), s('glass', 1), s('titanium-plate', 1)], outputs: [s('core-chip', 1)], seconds: 5 },
  // Refinery
  {
    id: 'refine-oil',
    name: 'Plastic and Fuel',
    inputs: [],
    outputs: [s('plastic', 2)],
    liquidIn: [{ liquid: 'oil', n: 30 }],
    liquidOut: [
      { liquid: 'fuel', n: 10 },
      { liquid: 'gas', n: 6, vent: true },
    ],
    seconds: 3,
  },
  { id: 'cook-gas', name: 'Plastic (gas)', inputs: [s('graphite', 1)], outputs: [s('plastic', 1)], liquidIn: [{ liquid: 'gas', n: 40 }], seconds: 4 },
  { id: 'press-bioplastic', name: 'Plastic (verdite)', inputs: [s('verdite', 2), s('sand', 1)], outputs: [s('plastic', 2)], seconds: 3 },
  // Coolant mixer
  { id: 'mix-coolant', name: 'Coolant', inputs: [s('titanium-ore', 1)], outputs: [], liquidIn: [{ liquid: 'water', n: 12 }], liquidOut: [{ liquid: 'coolant', n: 12 }], seconds: 1 },
  { id: 'mix-coolant-frost', name: 'Coolant (frostine)', inputs: [s('frostine', 1)], outputs: [], liquidIn: [{ liquid: 'water', n: 12 }], liquidOut: [{ liquid: 'coolant', n: 24 }], seconds: 1 },
  // Slag separator
  { id: 'sift-slag', name: 'Ore from Slag', inputs: [], outputs: [s('copper-ore', 1), s('iron-ore', 1), s('sand', 1)], liquidIn: [{ liquid: 'slag', n: 30 }], seconds: 3 },
  { id: 'sift-slag-titanium', name: 'Titanium from Slag', inputs: [], outputs: [s('titanium-ore', 1)], liquidIn: [{ liquid: 'slag', n: 90 }], seconds: 4 },
  // Alternative ways (dearer, hungrier for power)
  { id: 'crush-scrap', name: 'Sand from Scrap', inputs: [s('scrap', 1)], outputs: [s('sand', 2)], seconds: 1 },
  { id: 'synth-graphite', name: 'Graphite (synthetic)', inputs: [s('sand', 4)], outputs: [s('graphite', 1)], liquidIn: [{ liquid: 'water', n: 10 }], seconds: 3 },
  { id: 'condense-gas', name: 'Gas from Air', inputs: [], outputs: [], liquidOut: [{ liquid: 'gas', n: 8 }], seconds: 1 },
  // Particle accelerator: the wonder materials (one star alloy route per world ore)
  { id: 'forge-star-alloy-ember', name: 'Star Alloy (emberite)', inputs: [s('steel', 2), s('core-chip', 1), s('emberite', 2)], outputs: [s('star-alloy', 1)], seconds: 6 },
  { id: 'forge-star-alloy-verdite', name: 'Star Alloy (verdite)', inputs: [s('steel', 2), s('core-chip', 1), s('verdite', 3)], outputs: [s('star-alloy', 1)], seconds: 6 },
  { id: 'forge-star-alloy-frost', name: 'Star Alloy (frostine)', inputs: [s('steel', 2), s('core-chip', 1), s('frostine', 2)], outputs: [s('star-alloy', 1)], seconds: 6 },
  { id: 'compress-singularity', name: 'Singularity', inputs: [s('star-alloy', 2), s('core-chip', 2), s('titanium-plate', 3)], outputs: [s('singularity', 1)], liquidIn: [{ liquid: 'coolant', n: 60 }], seconds: 20 },
  { id: 'compress-singularity-prism', name: 'Singularity (prismite)', inputs: [s('star-alloy', 1), s('core-chip', 2), s('prism-lens', 2)], outputs: [s('singularity', 1)], liquidIn: [{ liquid: 'coolant', n: 30 }], seconds: 12 },
  { id: 'compress-singularity-obsidion', name: 'Singularity (obsidion)', inputs: [s('star-alloy', 1), s('core-chip', 2), s('obsidion', 2)], outputs: [s('singularity', 1)], liquidIn: [{ liquid: 'coolant', n: 30 }], seconds: 12 },
  // Space elevator: three stages, each makes one segment
  { id: 'elevator-foundation', name: 'Elevator: Foundation', inputs: [s('steel', 100), s('frame', 20), s('titanium-plate', 30)], outputs: [s('elevator-segment', 1)], seconds: 30 },
  { id: 'elevator-tower', name: 'Elevator: Tower', inputs: [s('steel', 100), s('motor', 16), s('circuit', 40), s('core-chip', 10)], outputs: [s('elevator-segment', 1)], seconds: 40 },
  { id: 'elevator-crown', name: 'Elevator: Crown', inputs: [s('star-alloy', 10), s('singularity', 2), s('core-chip', 12), s('titanium-plate', 40)], outputs: [s('elevator-segment', 1)], seconds: 45 },
];
