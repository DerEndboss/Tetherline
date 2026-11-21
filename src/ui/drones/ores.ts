import type { Id } from '../../content/types';
import type { World } from '../../sim/world';

const cache = new WeakMap<Uint8Array, ReadonlySet<Id>>();

/**
 * The materials that have ore somewhere on this map: all that helpers could ever mine here. The panel offers only these,
 * so nobody picks Lithium on a map without any. Ore floors never change during a run, so one scan per map array.
 */
export function oresOnMap(w: World): ReadonlySet<Id> {
  const { floor } = w.state.map;
  const known = cache.get(floor);
  if (known) return known;
  const floors = w.content.floors.list;
  const seen = new Uint8Array(floors.length + 1);
  for (let i = 0; i < floor.length; i++) seen[floor[i] ?? 0] = 1;
  const ores = new Set<Id>();
  floors.forEach((f, i) => {
    if (f.ore && seen[i + 1]) ores.add(f.ore);
  });
  cache.set(floor, ores);
  return ores;
}
