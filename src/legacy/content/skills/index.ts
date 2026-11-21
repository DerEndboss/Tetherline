import type { SkillBranchDef, SkillDef } from '../types';

/**
 * The skill tree: one branch per topic (Mining · Drones ·
 * Crafting · Power · Clearing · Start). Skills cost Prisms, the prestige currency, and stay through every
 * prestige. Each branch is a small tree (`requires`), cheap at the root and big at the top: visible effects
 * and big numbers. Head Start skills change how the next run begins (their stats are `runStart`).
 * Costs are first guesses for the balance bot (step 7).
 */
export const skillBranches: SkillBranchDef[] = [
  { id: 'mining', name: 'Mining', description: 'Faster drills and richer veins.', glyph: 'pick' },
  { id: 'drones', name: 'Drones', description: 'Quicker, cheaper drones with bigger crates.', glyph: 'rotor' },
  { id: 'crafting', name: 'Crafting', description: 'Hotter furnaces and better prices.', glyph: 'flame' },
  { id: 'power', name: 'Power', description: 'More power from every generator, less coal burnt.', glyph: 'bolt' },
  { id: 'clearing', name: 'Clearing', description: 'Harder taps, more loot, more relics.', glyph: 'beam' },
  { id: 'start', name: 'Head Start', description: 'Every new run starts further along.', glyph: 'lander' },
];

export const skills: SkillDef[] = [
  // Mining
  { id: 'deep-bore', name: 'Deep Bore', branch: 'mining', description: 'Longer drill shafts reach the dense ore.', cost: 2, requires: [], effects: [{ stat: 'extract-rate', op: 'mul', value: 1.25 }] },
  { id: 'rich-veins', name: 'Rich Veins', branch: 'mining', description: 'Your survey picks better landing sites: veins hold more ore.', cost: 4, requires: ['deep-bore'], effects: [{ stat: 'vein-richness', op: 'mul', value: 1.5 }] },
  { id: 'diamond-heads', name: 'Diamond Heads', branch: 'mining', description: 'Drill heads that never dull.', cost: 6, requires: ['deep-bore'], effects: [{ stat: 'extract-rate', op: 'mul', value: 1.5 }] },
  { id: 'motherlode', name: 'Motherlode', branch: 'mining', description: 'Every vein runs twice as deep.', cost: 12, requires: ['rich-veins'], effects: [{ stat: 'vein-richness', op: 'mul', value: 2 }] },
  { id: 'core-drill', name: 'Core Drill', branch: 'mining', description: 'Mines dig twice as fast.', cost: 24, requires: ['diamond-heads', 'motherlode'], effects: [{ stat: 'extract-rate', op: 'mul', value: 2 }] },

  // Drones
  { id: 'quick-rotors', name: 'Quick Rotors', branch: 'drones', description: 'Lighter rotor blades for every drone.', cost: 2, requires: [], effects: [{ stat: 'drone-speed', op: 'mul', value: 1.2 }] },
  { id: 'cheap-hulls', name: 'Cheap Hulls', branch: 'drones', description: 'Drones cost a quarter less.', cost: 4, requires: ['quick-rotors'], effects: [{ stat: 'drone-cost', op: 'mul', value: 0.75 }] },
  { id: 'hot-lasers', name: 'Hot Lasers', branch: 'drones', description: 'Clearing lasers cut half again as deep.', cost: 4, requires: ['quick-rotors'], effects: [{ stat: 'laser-power', op: 'mul', value: 1.5 }] },
  { id: 'big-crates', name: 'Big Crates', branch: 'drones', description: 'Transport drones carry two more per crate.', cost: 6, requires: ['cheap-hulls'], effects: [{ stat: 'crate-size', op: 'add', value: 2 }] },
  { id: 'swarm-logic', name: 'Swarm Logic', branch: 'drones', description: 'Drones plan their routes together.', cost: 15, requires: ['hot-lasers', 'big-crates'], effects: [{ stat: 'drone-speed', op: 'mul', value: 1.4 }] },

  // Crafting
  { id: 'hot-crucibles', name: 'Hot Crucibles', branch: 'crafting', description: 'Smelters, mixers, the fabricator and the lab work faster.', cost: 2, requires: [], effects: [{ stat: 'craft-speed', op: 'mul', value: 1.2 }] },
  { id: 'fine-tolerances', name: 'Fine Tolerances', branch: 'crafting', description: 'Every machine, mines included, runs smoother.', cost: 4, requires: ['hot-crucibles'], effects: [{ stat: 'machine-speed', op: 'mul', value: 1.15 }] },
  { id: 'trade-contacts', name: 'Trade Contacts', branch: 'crafting', description: 'Freighters pay more for your goods.', cost: 5, requires: ['hot-crucibles'], effects: [{ stat: 'sell-price', op: 'mul', value: 1.2 }] },
  { id: 'arc-furnaces', name: 'Arc Furnaces', branch: 'crafting', description: 'Crafting at half again the pace.', cost: 10, requires: ['fine-tolerances'], effects: [{ stat: 'craft-speed', op: 'mul', value: 1.5 }] },
  { id: 'guild-prices', name: 'Guild Prices', branch: 'crafting', description: 'The freighter guild knows your name.', cost: 18, requires: ['trade-contacts', 'arc-furnaces'], effects: [{ stat: 'sell-price', op: 'mul', value: 1.4 }] },

  // Power
  { id: 'dense-cells', name: 'Dense Cells', branch: 'power', description: 'Every generator, solar array and the base give more power.', cost: 2, requires: [], effects: [{ stat: 'power-output', op: 'mul', value: 1.2 }] },
  { id: 'clean-burn', name: 'Clean Burn', branch: 'power', description: 'Coal generators burn less for the same power.', cost: 4, requires: ['dense-cells'], effects: [{ stat: 'fuel-use', op: 'mul', value: 0.7 }] },
  { id: 'grid-surge', name: 'Grid Surge', branch: 'power', description: 'A third more power on every network.', cost: 6, requires: ['dense-cells'], effects: [{ stat: 'power-output', op: 'mul', value: 1.3 }] },
  { id: 'slow-burn', name: 'Slow Burn', branch: 'power', description: 'Coal lasts much longer.', cost: 10, requires: ['clean-burn'], effects: [{ stat: 'fuel-use', op: 'mul', value: 0.6 }] },
  { id: 'superconductors', name: 'Superconductors', branch: 'power', description: 'Lines that lose nothing on the way.', cost: 18, requires: ['grid-surge', 'slow-burn'], effects: [{ stat: 'power-output', op: 'mul', value: 1.6 }] },

  // Clearing
  { id: 'heavy-hands', name: 'Heavy Hands', branch: 'clearing', description: 'Your taps hit harder.', cost: 1, requires: [], effects: [{ stat: 'tap-damage', op: 'add', value: 1 }] },
  { id: 'scavenger', name: 'Scavenger', branch: 'clearing', description: 'More loot from every piece of rubble.', cost: 3, requires: ['heavy-hands'], effects: [{ stat: 'clear-yield', op: 'mul', value: 1.25 }] },
  { id: 'lucky-finds', name: 'Lucky Finds', branch: 'clearing', description: 'Relics turn up half again as often.', cost: 4, requires: ['heavy-hands'], effects: [{ stat: 'relic-luck', op: 'mul', value: 1.5 }] },
  { id: 'iron-fists', name: 'Iron Fists', branch: 'clearing', description: 'Taps crack boulders in a few blows.', cost: 6, requires: ['scavenger'], effects: [{ stat: 'tap-damage', op: 'add', value: 3 }] },
  { id: 'treasure-sense', name: 'Treasure Sense', branch: 'clearing', description: 'You know where the old things lie.', cost: 12, requires: ['lucky-finds'], effects: [{ stat: 'relic-luck', op: 'mul', value: 2 }] },
  { id: 'salvage-rights', name: 'Salvage Rights', branch: 'clearing', description: 'Rubble pays far more.', cost: 16, requires: ['iron-fists', 'treasure-sense'], effects: [{ stat: 'clear-yield', op: 'mul', value: 1.6 }] },

  // Head Start
  { id: 'fleet-in-orbit', name: 'Fleet in Orbit', branch: 'start', description: 'Three clearing drones land with you.', cost: 3, requires: [], effects: [{ stat: 'start-drones', op: 'add', value: 3 }] },
  { id: 'cleared-landing', name: 'Cleared Landing', branch: 'start', description: 'The rubble near the base is cleared before you land.', cost: 3, requires: [], effects: [{ stat: 'start-clear', op: 'add', value: 2 }] },
  { id: 'first-mine', name: 'First Mine', branch: 'start', description: 'A mine already stands on the nearest vein.', cost: 5, requires: ['cleared-landing'], effects: [{ stat: 'start-mines', op: 'add', value: 1 }] },
  { id: 'seed-money', name: 'Seed Money', branch: 'start', description: 'Start every run with credits in the bank.', cost: 4, requires: ['fleet-in-orbit'], effects: [{ stat: 'start-credits', op: 'add', value: 500 }] },
  { id: 'rapid-assembly', name: 'Rapid Assembly', branch: 'start', description: 'Build drones weld twice as fast.', cost: 8, requires: ['fleet-in-orbit'], effects: [{ stat: 'build-speed', op: 'mul', value: 2 }] },
  { id: 'prism-lens', name: 'Prism Lens', branch: 'start', description: 'Every launch pays a quarter more Prisms.', cost: 14, requires: ['first-mine', 'seed-money'], effects: [{ stat: 'prism-yield', op: 'mul', value: 1.25 }] },
];
