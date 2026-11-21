import type { RelicDef } from '../types';

/**
 * Relics: rare finds from clearing rubble, each found
 * once and kept through every prestige, each a permanent bonus. Rarer ones drop less often
 * (`rules.relicRarityWeights`). The art is one of six shapes in the relic's own colour.
 */
export const relics: RelicDef[] = [
  { id: 'survey-lens', name: 'Survey Lens', description: 'A cracked lens from an older expedition.', rarity: 'common', shape: 'lens', color: '#9fd8ff', effects: [{ stat: 'clear-yield', op: 'mul', value: 1.1 }] },
  { id: 'humming-shard', name: 'Humming Shard', description: 'It hums whenever you tap rock.', rarity: 'common', shape: 'shard', color: '#7ff0e6', effects: [{ stat: 'tap-damage', op: 'add', value: 1 }] },
  { id: 'brass-cog', name: 'Brass Cog', description: 'From a machine nobody has seen whole.', rarity: 'common', shape: 'cog', color: '#e8b464', effects: [{ stat: 'build-speed', op: 'mul', value: 1.15 }] },
  { id: 'spare-cell', name: 'Spare Cell', description: 'Still holds a charge after all this time.', rarity: 'common', shape: 'beacon', color: '#ffe27a', effects: [{ stat: 'power-output', op: 'mul', value: 1.1 }] },
  { id: 'pilot-beacon', name: 'Pilot Beacon', description: 'Still blinking. Drones follow it gladly.', rarity: 'rare', shape: 'beacon', color: '#ff8a7a', effects: [{ stat: 'drone-speed', op: 'mul', value: 1.15 }] },
  { id: 'rune-tablet', name: 'Rune Tablet', description: 'Old instructions, still accurate.', rarity: 'rare', shape: 'tablet', color: '#c9a3ff', effects: [{ stat: 'machine-speed', op: 'mul', value: 1.1 }] },
  { id: 'ember-shard', name: 'Ember Shard', description: 'Warm to the touch, warmer near a furnace.', rarity: 'rare', shape: 'shard', color: '#ff9a4d', effects: [{ stat: 'craft-speed', op: 'mul', value: 1.2 }] },
  { id: 'tide-lens', name: 'Tide Lens', description: 'Freighter pilots trade well for a look through it.', rarity: 'rare', shape: 'lens', color: '#6fe8dc', effects: [{ stat: 'sell-price', op: 'mul', value: 1.1 }] },
  { id: 'drill-saint', name: 'Drill Saint', description: 'A worn cog that turns by itself.', rarity: 'rare', shape: 'cog', color: '#b8c4e0', effects: [{ stat: 'extract-rate', op: 'mul', value: 1.2 }] },
  { id: 'seed-vault', name: 'Seed Vault', description: 'Someone planned to come back.', rarity: 'legendary', shape: 'seed', color: '#9be86f', effects: [{ stat: 'relic-luck', op: 'mul', value: 2 }] },
  { id: 'star-seed', name: 'Star Seed', description: 'It glows brighter over ore.', rarity: 'legendary', shape: 'seed', color: '#ffd98a', effects: [{ stat: 'vein-richness', op: 'mul', value: 1.3 }] },
  { id: 'crown-tablet', name: 'Crown Tablet', description: 'The same rune as on the Skyforge plans.', rarity: 'legendary', shape: 'tablet', color: '#ffb8e0', effects: [{ stat: 'prism-yield', op: 'mul', value: 1.2 }] },
];
