/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), used to keep land at least `minWidth` wide. */
const INF = 1e20;

function pass(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  const cut = (q: number, p: number): number => (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = cut(q, v[k]!);
    while (s <= z[k]!) {
      k--;
      s = cut(q, v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    out[q] = (q - p) * (q - p) + f[p]!;
  }
}

/**
 * For every cell: the distance to the nearest cell whose `inside` byte is 0 (0 for those cells themselves).
 * With no zero cell at all every distance is huge.
 */
export function distanceToZero(inside: Uint8Array, w: number, h: number): Float32Array {
  const grid = new Float64Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? INF : 0;
    pass(f, h, out, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = out[y]!;
  }
  const result = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    pass(f, w, out, v, z);
    for (let x = 0; x < w; x++) result[y * w + x] = Math.sqrt(out[x]!);
  }
  return result;
}

/**
 * Morphological opening with round brushes: land strips narrower than `width` tiles disappear, wider shapes
 * keep their form (corners round off). Works on a 0/1 mask in place.
 */
export function openMask(mask: Uint8Array, w: number, h: number, width: number): void {
  const eroded = new Uint8Array(w * h);
  const toVoid = distanceToZero(mask, w, h);
  const keep = (width + 1) / 2;
  for (let i = 0; i < mask.length; i++) eroded[i] = mask[i] && toVoid[i]! >= keep ? 1 : 0;
  const away = distanceToZero(eroded.map((e) => 1 - e) as Uint8Array, w, h);
  const reach = (width - 1) / 2 + 0.45;
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i] && away[i]! <= reach ? 1 : 0;
}
