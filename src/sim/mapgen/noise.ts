/** Seeded value noise for map generation (integer hashes, deterministic everywhere). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in 0..1 at a point (one octave). */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, seed) * (1 - fx) + hash2(x0 + 1, y0, seed) * fx;
  const b = hash2(x0, y0 + 1, seed) * (1 - fx) + hash2(x0 + 1, y0 + 1, seed) * fx;
  return a * (1 - fy) + b * fy;
}

/** Two octaves of value noise, 0..1. */
export function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) * 0.65 + valueNoise(x * 2.1, y * 2.1, seed + 17) * 0.35;
}
