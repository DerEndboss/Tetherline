import type { UpgradeDef } from '../types';

/**
 * Run upgrades (lost on prestige). Each level applies the effects once more:
 * adds stack, multipliers compound. Tap Charge keeps tapping useful once drones do the clearing.
 */
export const upgrades: UpgradeDef[] = [
  {
    id: 'tap-charge',
    name: 'Tap Charge',
    description: 'Your taps hit one point harder.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 60 }],
    costGrowth: 2.2,
    effects: [{ stat: 'tap-damage', op: 'add', value: 1 }],
  },
  {
    id: 'laser-focus',
    name: 'Laser Focus',
    description: 'Clearing drones cut 25 % faster.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 120 }],
    costGrowth: 2,
    effects: [{ stat: 'laser-power', op: 'mul', value: 1.25 }],
  },
  {
    id: 'thrusters',
    name: 'Thruster Tuning',
    description: 'Every drone flies 10 % faster.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 100 }],
    costGrowth: 1.9,
    effects: [{ stat: 'drone-speed', op: 'mul', value: 1.1 }],
  },
  {
    id: 'cargo-racks',
    name: 'Cargo Racks',
    description: 'Transport crates hold 2 more.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 80 }, { id: 'iron-bar', amount: 5 }],
    costGrowth: 1.9,
    effects: [{ stat: 'crate-size', op: 'add', value: 2 }],
  },
  {
    id: 'hot-furnaces',
    name: 'Hot Furnaces',
    description: 'Mines and smelters work 15 % faster.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 150 }, { id: 'iron-bar', amount: 10 }],
    costGrowth: 2,
    effects: [{ stat: 'machine-speed', op: 'mul', value: 1.15 }],
  },
  {
    id: 'welding-rigs',
    name: 'Welding Rigs',
    description: 'Build drones work 20 % faster.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 90 }],
    costGrowth: 1.9,
    effects: [{ stat: 'build-speed', op: 'mul', value: 1.2 }],
  },
  {
    id: 'trade-licence',
    name: 'Trade Licence',
    description: 'Freighters pay 10 % more.',
    maxLevel: 5,
    cost: [{ id: 'credits', amount: 200 }],
    costGrowth: 2,
    effects: [{ stat: 'sell-price', op: 'mul', value: 1.1 }],
  },
];
