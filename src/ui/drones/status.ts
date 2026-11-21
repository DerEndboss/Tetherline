import type { DroneAct } from '../../sim/drones';
import type { DroneState } from '../../sim/state';
import type { World } from '../../sim/world';

interface Words {
  /** Name of the building the drone works on ('' = none) and of what it carries. */
  building: string;
  carried: string;
}

const LINES: Partial<Record<DroneAct, (x: Words) => string>> = {
  build: (x) => `Building ${x.building}`.trim(),
  remove: (x) => `Dismantling ${x.building}`.trim(),
  clear: () => 'Clearing boulders',
  fetch: (x) => `Fetching ${x.carried || 'items'}`,
  deliver: (x) => (x.building ? `Delivering to ${x.building}` : 'Delivering'),
  mine: (x) => `Mining ${x.carried || 'ore'}`,
  return: () => 'Heading home',
};

function words(w: World, d: DroneState): Words {
  const target = d.target >= 0 ? w.byId.get(d.target) : undefined;
  const held = d.carry ? w.content.materials.list[d.carry.item] : undefined;
  return { building: target ? w.def(target).name : '', carried: held?.name ?? '' };
}

/** One short line about what a drone is doing ("Building Smelter", "Mining Copper Ore"), for the panel. */
export function describeDrone(w: World, d: DroneState): string {
  if (d.waiting) return `Waiting for ${w.content.materials.find(d.waiting)?.name ?? d.waiting}`;
  return LINES[d.act ?? 'idle']?.(words(w, d)) ?? 'Ready';
}

/** How a drone line is coloured: at work (teal), held up by a missing item (amber), or free (muted). */
export type DroneTone = 'work' | 'wait' | 'idle';

export function droneTone(d: DroneState): DroneTone {
  if (d.waiting) return 'wait';
  return (d.act ?? 'idle') === 'idle' ? 'idle' : 'work';
}
