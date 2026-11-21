import type { StatDef } from '../types';

/**
 * Stats the simulation reads by id. Skills, relics, techs and run upgrades change them through effects.
 * `runStart` stats are read when a run begins (the head start), so buying one shows from the next run on.
 */
export const stats: StatDef[] = [
  { id: 'tap-damage', name: 'Tap damage', base: 1 },
  { id: 'clear-yield', name: 'Clearing yield', base: 1 },
  { id: 'relic-luck', name: 'Relic luck', base: 1 },
  { id: 'drone-speed', name: 'Drone speed', base: 1 },
  { id: 'build-speed', name: 'Build speed', base: 1 },
  { id: 'sell-price', name: 'Sell price', base: 1 },
  { id: 'machine-speed', name: 'Machine speed', base: 1 },
  { id: 'laser-power', name: 'Laser power', base: 1 },
  { id: 'crate-size', name: 'Crate size', base: 0 },
  { id: 'power-output', name: 'Power output', base: 1 },
  { id: 'extract-rate', name: 'Mining speed', base: 1 },
  { id: 'craft-speed', name: 'Crafting speed', base: 1 },
  { id: 'drone-cost', name: 'Drone price', base: 1 },
  { id: 'fuel-use', name: 'Coal burnt', base: 1 },
  { id: 'prism-yield', name: 'Prisms per launch', base: 1 },
  { id: 'vein-richness', name: 'Ore per vein', base: 1, runStart: true },
  { id: 'start-drones', name: 'Clearing drones at the start', base: 0, runStart: true },
  { id: 'start-clear', name: 'Cleared rings around the base', base: 0, runStart: true },
  { id: 'start-mines', name: 'Mines standing at the start', base: 0, runStart: true },
  { id: 'start-credits', name: 'Credits at the start', base: 0, runStart: true },
];
