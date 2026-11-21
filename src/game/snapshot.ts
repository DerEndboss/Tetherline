import { orderProgress } from '../sim/progression';
import { powerGraph } from '../sim/power';
import { storageInfo } from '../sim/storage';
import type { World } from '../sim/world';

/** What the HUD shows, built at most 10 times a second (the UI never reads the world directly). */
export interface Snapshot {
  tick: number;
  /** Core stock by material index, and the per-material capacity. */
  stock: readonly number[];
  capacity: number;
  ghosts: number;
  sites: number;
  drone: { task: string; waiting: string };
  orders: { id: string; title: string; have: number; need: number }[];
  done: number;
  won: boolean;
  power: { made: number; wanted: number };
  coreKind: string;
}

export function buildSnapshot(w: World): Snapshot {
  const s = w.state;
  const drone = s.drones[0];
  let made = 0;
  let wanted = 0;
  for (const n of powerGraph(w).nets) {
    made += n.made;
    wanted += n.wanted;
  }
  return {
    tick: s.tick,
    stock: [...s.stock],
    capacity: storageInfo(w).capacity,
    ghosts: s.plans.length,
    sites: s.buildings.reduce((n, b) => n + (b.build < 1 ? 1 : 0), 0),
    drone: { task: drone?.task ?? 'idle', waiting: drone?.waiting ?? '' },
    orders: s.progress.active.map((a) => {
      const def = w.content.orders.get(a.id);
      const [have, need] = orderProgress(w, def, a.count);
      return { id: a.id, title: def.title, have: Math.min(have, need), need };
    }),
    done: s.progress.done.length,
    won: s.progress.won,
    power: { made, wanted },
    coreKind: w.core ? w.def(w.core).id : '',
  };
}
