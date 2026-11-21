import type { AlloyDef } from '../types';

/**
 * What the mixer makes. The player sets the share of each input; the alloy whose
 * ratio lies nearest wins if the mix is within its tolerance, anything else is slag. Same inputs at
 * another ratio give another alloy: copper and tin make pewter, speculum, bell metal or bronze.
 * Ratios are simplified from the real alloys, wide enough to find by hand; windows never overlap (validated).
 */
export const alloys: AlloyDef[] = [
  { id: 'mix-steel', inputs: ['iron-bar', 'graphite'], ratio: [0.85, 0.15], tolerance: 0.06, output: 'steel' },
  { id: 'mix-cast-iron', inputs: ['iron-bar', 'graphite'], ratio: [0.6, 0.4], tolerance: 0.08, output: 'cast-iron' },

  { id: 'mix-bronze', inputs: ['copper-bar', 'tin-bar'], ratio: [0.9, 0.1], tolerance: 0.05, output: 'bronze' },
  { id: 'mix-bell-metal', inputs: ['copper-bar', 'tin-bar'], ratio: [0.75, 0.25], tolerance: 0.05, output: 'bell-metal' },
  { id: 'mix-speculum', inputs: ['copper-bar', 'tin-bar'], ratio: [0.6, 0.4], tolerance: 0.05, output: 'speculum' },
  { id: 'mix-pewter', inputs: ['copper-bar', 'tin-bar'], ratio: [0.1, 0.9], tolerance: 0.08, output: 'pewter' },

  { id: 'mix-silicon-steel', inputs: ['iron-bar', 'silicon'], ratio: [0.9, 0.1], tolerance: 0.06, output: 'silicon-steel' },
  { id: 'mix-tinplate', inputs: ['iron-bar', 'tin-bar'], ratio: [0.8, 0.2], tolerance: 0.07, output: 'tinplate' },
  { id: 'mix-silicon-bronze', inputs: ['copper-bar', 'silicon'], ratio: [0.92, 0.08], tolerance: 0.05, output: 'silicon-bronze' },
  { id: 'mix-silicon-carbide', inputs: ['silicon', 'graphite'], ratio: [0.7, 0.3], tolerance: 0.08, output: 'silicon-carbide' },

  // Aluminium (bauxite from the Ochre Flats, smelting after research): the same pair gives two alloys.
  { id: 'mix-aluminium-bronze', inputs: ['copper-bar', 'aluminium'], ratio: [0.9, 0.1], tolerance: 0.05, output: 'aluminium-bronze' },
  { id: 'mix-duralumin', inputs: ['copper-bar', 'aluminium'], ratio: [0.05, 0.95], tolerance: 0.04, output: 'duralumin' },
];
