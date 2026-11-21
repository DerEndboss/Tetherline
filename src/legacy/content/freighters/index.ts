import type { FreighterDef } from '../types';

/** Ships that land at landing pads and buy goods. Same tech colours as the base: they are the player's trade partners' kind. */
export const freighters: FreighterDef[] = [
  {
    id: 'hauler',
    name: 'Hauler',
    capacity: 20,
    awaySeconds: 22,
    approachSeconds: 3.6,
    loadSeconds: 4,
    departSeconds: 3.2,
    colors: { hull: '#e8edf5', accent: '#ff9a4d', engine: '#8ff3ff' },
  },
];
