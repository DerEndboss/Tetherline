import type { Building } from '../state';

/**
 * A short log of hops for the renderer (never read by the sim): a sorter or overflow gate passes an item in the
 * very tick it arrives, a bridge sends it to its partner in one tick. The picture lets such an item travel for a
 * moment; for that it needs to know that one just went by. The log lives in `queue[slot]` as flat records of
 * HOP_STRIDE numbers (tick, item, and two the block gives a meaning to) and keeps only the last HOP_KEEP ticks.
 * Old saves have no log and need none (an optional field: no SAVE_VERSION bump).
 */
export const HOP_STRIDE = 4;
/** Ticks a record is kept: longer than any hop is drawn. */
export const HOP_KEEP = 8;

/** Records that `item` just crossed `b` in `tick`; `a` and `c` are the block's own two numbers (sides, say). */
export function noteHop(b: Building, slot: number, tick: number, item: number, a: number, c: number): void {
  // no holes in the queue: a missing queue 0 would read as undefined (and as null after a save)
  while (b.queue.length <= slot) b.queue.push([]);
  const log = b.queue[slot]!;
  let old = 0;
  while (old < log.length && tick - log[old]! > HOP_KEEP) old += HOP_STRIDE;
  if (old > 0) log.splice(0, old);
  log.push(tick, item, a, c);
}
