import { TICK_HZ } from '../constants';
import { asDir, opposite, sideOf, turnLeft, turnRight } from '../grid';
import { accepts, dump, offer } from '../items';
import type { Building, Dir } from '../state';
import type { World } from '../world';
import type { BlockBehaviour } from './types';

/** Ticks an item waits inside a junction or router. */
function delayOf(w: World, b: Building): number {
  return Math.max(1, Math.ceil(TICK_HZ / (w.def(b).conveyor?.speed ?? 8)));
}

/** The direction an item from `source` travels through `b`. */
function travel(w: World, b: Building, source: Building): Dir {
  return opposite(sideOf(w.rect(b), w.rect(source)));
}

/** Junction: four queues, one per travel direction; lines cross without mixing. */
export const junction: BlockBehaviour = {
  accept: (w, b, _item, source) => {
    const q = b.queue[travel(w, b, source)] ?? [];
    return q.length / 2 < (w.def(b).items ?? 6);
  },
  handle: (w, b, item, source) => {
    while (b.queue.length < 4) b.queue.push([]);
    b.queue[travel(w, b, source)]!.push(item, w.state.tick + delayOf(w, b));
  },
  update: (w, b) => {
    for (let d = 0; d < b.queue.length; d++) {
      const q = b.queue[d]!;
      if (!q.length || q[1]! > w.state.tick) continue;
      const ahead = w.facing(b, asDir(d));
      if (ahead && offer(w, b, ahead, q[0]!)) q.splice(0, 2);
    }
  },
};

/** Router: holds one item and hands it to any neighbour but the one it came from, round-robin. */
export const router: BlockBehaviour = {
  accept: (_w, b) => !b.queue[0]?.length,
  handle: (w, b, item, source) => {
    b.queue[0] = [item, source.id, w.state.tick + delayOf(w, b)];
  },
  update: (w, b) => {
    const q = b.queue[0];
    if (!q?.length || q[2]! > w.state.tick) return;
    if (dump(w, b, q[0]!, q[1]!)) b.queue[0] = [];
  },
};

/** For instant pass-through blocks: the building an item from `source` goes to, or undefined. */
type Pick = (w: World, b: Building, item: number, source: Building) => Building | undefined;

/** Left or right of the travel direction, alternating, whichever takes it. */
function sides(w: World, b: Building, item: number, dir: Dir): Building | undefined {
  const order = b.rr % 2 === 0 ? [turnLeft(dir), turnRight(dir)] : [turnRight(dir), turnLeft(dir)];
  for (const d of order) {
    const n = w.facing(b, d);
    if (n && accepts(w, b, n, item)) return n;
  }
  return undefined;
}

function passThrough(pick: Pick): BlockBehaviour {
  return {
    accept: (w, b, item, source) => pick(w, b, item, source) !== undefined,
    handle: (w, b, item, source) => {
      const to = pick(w, b, item, source);
      if (to && offer(w, b, to, item)) b.rr++;
    },
  };
}

/** Sorter: the chosen item goes straight on, every other item to the sides. Instant, holds nothing. */
export const sorter = passThrough((w, b, item, source) => {
  const dir = travel(w, b, source);
  if (item === b.config) {
    const ahead = w.facing(b, dir);
    return ahead && accepts(w, b, ahead, item) ? ahead : undefined;
  }
  return sides(w, b, item, dir);
});

/** Overflow gate: straight on while the front takes it, else to the sides. */
export const overflow = passThrough((w, b, item, source) => {
  const dir = travel(w, b, source);
  const ahead = w.facing(b, dir);
  if (ahead && accepts(w, b, ahead, item)) return ahead;
  return sides(w, b, item, dir);
});
