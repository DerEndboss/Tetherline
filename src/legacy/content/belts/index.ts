import type { BeltDef } from '../types';

/** Conveyor belts, laid by dragging. Later tiers (faster belts) are further entries. */
export const belts: BeltDef[] = [
  {
    id: 'conveyor',
    name: 'Conveyor Belt',
    description: 'Drag from one building to the next. No drone needed.',
    cost: [{ id: 'credits', amount: 2 }],
    speed: 1.25,
    spacing: 0.3,
  },
];
