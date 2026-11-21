/**
 * Deterministic random numbers for art variants (mulberry32). Separate from the simulation's RNG: art may
 * change freely without touching game state or replays.
 */
export type Rand = () => number;

export function rand(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(r: Rand, min: number, max: number): number {
  return min + r() * (max - min);
}

/** Stable 32-bit hash of integers, for per-object visual variation (variant, phase, decal). */
export function hash2(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
