import type { LiquidDef } from './types';

/**
 * Liquids: three natural ones, made ones grow to eight later. `fuel` = seconds a
 * generator burns per 10 units. Appended, never reordered (the index is stored).
 */
export const liquids: LiquidDef[] = [
  { id: 'water', name: 'Water', natural: true, color: '#4a9fd8' },
  { id: 'oil', name: 'Oil', natural: true, color: '#2b2630', fuel: 3 },
  { id: 'slag', name: 'Slag', natural: true, color: '#ff7a3a', hot: true },
  { id: 'coolant', name: 'Coolant', natural: false, color: '#7ff0e8' },
  { id: 'fuel', name: 'Fuel', natural: false, color: '#f6c94a', fuel: 8 },
  { id: 'gas', name: 'Gas', natural: false, color: '#c9e6a8', fuel: 5 },
];
