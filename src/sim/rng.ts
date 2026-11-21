/**
 * Seeded random numbers for the simulation. The whole generator state is one uint32 inside the game state,
 * so saving, loading and replaying stay deterministic. Algorithm: mulberry32.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Next uint32. */
export function nextU32(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(r: RngState): number {
  return nextU32(r) / 4294967296;
}

/** Integer in [min, max], both inclusive. */
export function nextInt(r: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(r) * (max - min + 1));
}

/** Picks an item by weight; `weights` must have at least one positive entry. */
export function pickWeighted<T>(r: RngState, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
  let roll = nextFloat(r) * total;
  for (const it of items) {
    roll -= Math.max(0, weight(it));
    if (roll < 0) return it;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('pickWeighted needs at least one item');
  return last;
}

/** Turns any seed text or number into a uint32 (FNV-1a over the decimal or text form). */
export function hashSeed(input: string | number): number {
  const text = String(input).trim();
  if (/^\d+$/.test(text) && Number(text) <= 0xffffffff) return Number(text) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
