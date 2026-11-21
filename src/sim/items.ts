import { BLOCKS } from './blocks/registry';
import type { Building } from './state';
import type { World } from './world';

/** How deep instant hand-offs (sorter -> sorter -> ...) may chain before an item is refused. */
const MAX_DEPTH = 8;
let depth = 0;

/** Whether `to` would take `item` from `from` now. */
export function accepts(w: World, from: Building, to: Building, item: number): boolean {
  if (!w.ready(to) || depth >= MAX_DEPTH) return false;
  const block = BLOCKS[w.def(to).behaviour];
  depth++;
  try {
    return block.accept?.(w, to, item, from) ?? false;
  } finally {
    depth--;
  }
}

/** Hands one item from `from` to `to` if it takes it. The only way items move between buildings. */
export function offer(w: World, from: Building, to: Building, item: number): boolean {
  if (!accepts(w, from, to, item)) return false;
  depth++;
  try {
    BLOCKS[w.def(to).behaviour].handle?.(w, to, item, from);
  } finally {
    depth--;
  }
  return true;
}

/**
 * Offers `item` to `b`'s neighbours round-robin (starting after the last one served), skipping `except`.
 * Returns whether one took it.
 */
export function dump(w: World, b: Building, item: number, except = -1): boolean {
  const ns = w.neighbours(b);
  for (let i = 0; i < ns.length; i++) {
    const n = ns[(b.rr + i) % ns.length]!;
    if (n.id === except) continue;
    if (offer(w, b, n, item)) {
      b.rr = (b.rr + i + 1) % ns.length;
      return true;
    }
  }
  return false;
}

/** Dumps one unit of the first of `candidates` that `b` holds and a neighbour takes. */
export function dumpFrom(w: World, b: Building, candidates: readonly number[]): boolean {
  for (const item of candidates) {
    if ((b.items[item] ?? 0) <= 0) continue;
    if (dump(w, b, item)) {
      b.items[item]!--;
      return true;
    }
  }
  return false;
}

/** Total items a building holds. */
export function itemTotal(b: Building): number {
  let n = 0;
  for (const v of b.items) n += v;
  return n;
}
