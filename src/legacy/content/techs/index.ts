import type { TechDef } from '../types';

/**
 * The research tree: new buildings, materials, drone types and region unlocks, kept once researched. Research points come from the Research Lab. What a tech unlocks is
 * named on the unlocked entry itself (`unlockedBy` on buildings, drones, materials and regions); techs
 * with only stat effects carry a glyph. Mixer and fabricator stay open from the start: the crafting chain
 * is the core of a run, research opens what lies around it. Costs are first guesses for the balance bot.
 */
export const techs: TechDef[] = [
  { id: 'solar-power', name: 'Solar Power', description: 'Panels that turn the dusk light into power, no coal needed.', cost: 40, requires: [] },
  {
    id: 'machine-tuning',
    name: 'Machine Tuning',
    description: 'Tighter tolerances: every machine works 10 % faster.',
    cost: 30,
    requires: [],
    effects: [{ stat: 'machine-speed', op: 'mul', value: 1.1 }],
    glyph: 'gear',
  },
  { id: 'deep-survey', name: 'Deep Survey', description: 'Scans through the fog and opens the Glow Basin behind the base.', cost: 60, requires: [] },
  { id: 'aluminium-smelting', name: 'Aluminium Smelting', description: 'Smelters learn to turn bauxite into aluminium bars.', cost: 50, requires: [] },

  {
    id: 'high-voltage',
    name: 'High-Voltage Lines',
    description: 'Every generator, solar array and the base give 25 % more power.',
    cost: 90,
    requires: ['solar-power'],
    effects: [{ stat: 'power-output', op: 'mul', value: 1.25 }],
    glyph: 'bolt',
  },
  { id: 'cargo-drones', name: 'Cargo Drones', description: 'Bigger transport drones that carry crates of ten.', cost: 80, requires: ['machine-tuning'] },
  { id: 'focused-lasers', name: 'Focused Lasers', description: 'A heavy clearing drone with a cutting laser three times as strong.', cost: 80, requires: ['machine-tuning'] },
  { id: 'lumen-refining', name: 'Lumen Refining', description: 'Smelters grow lumenite crystals into lumen glass.', cost: 120, requires: ['deep-survey'] },

  { id: 'long-range-survey', name: 'Long-Range Survey', description: 'Pushes the scan further and opens the Shard Rise.', cost: 200, requires: ['lumen-refining'] },
  {
    id: 'overclocked-drones',
    name: 'Overclocked Drones',
    description: 'Every drone flies 15 % faster.',
    cost: 160,
    requires: ['cargo-drones', 'focused-lasers'],
    effects: [{ stat: 'drone-speed', op: 'mul', value: 1.15 }],
    glyph: 'rotor',
  },

  {
    id: 'megastructures',
    name: 'Megastructures',
    description: 'The plans for the Skyforge, the build that ends a run.',
    cost: 600,
    requires: ['long-range-survey', 'overclocked-drones', 'high-voltage'],
  },
];
