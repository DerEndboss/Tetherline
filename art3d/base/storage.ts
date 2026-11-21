import { type Object3D } from 'three';
import { at, bevelBox, building, cable, COLORS, cylinder, dome, emissive, facet, group, Kit, lathe, lightPool, MAT, ring, rivets, turn, vents, WORLD } from '../kit';

/** Storage depot: a plinth with a ceramic silo, a cargo module and a lit door; levels add silos, crates, gold. */
const LED = emissive(COLORS.tech, 2.6);
const SOFT = emissive(COLORS.tech, 1.5);

function silo(x: number, z: number, h: number, r: number): Object3D {
  const body = lathe([[0, 0], [r, 0], [r * 1.04, 0.03], [r * 1.04, h], [r * 0.96, h + 0.04], [r * 0.6, h + 0.09], [0, h + 0.1]], 40, MAT.hull);
  const bands = [h * 0.28, h * 0.62].map((y) => at(ring(r * 1.045, 0.01, MAT.accent, 40), 0, y, 0));
  const groove = at(ring(r * 1.045, 0.005, MAT.deep, 40), 0, h * 0.82, 0);
  const lid = at(cylinder(r * 0.28, 0.03, MAT.steel, 16), 0, h + 0.1, 0);
  return at(group(body, ...bands, groove, lid), x, 0.1, z);
}

function crate(x: number, z: number, s: number, t: number, y = 0.1): Object3D {
  const box = bevelBox(s, s * 0.8, s, s * 0.08, MAT.trim);
  const stripe = at(bevelBox(s * 1.01, s * 0.14, s * 1.01, s * 0.03, MAT.accent, 1), 0, s * 0.3, 0);
  return turn(at(group(box, at(stripe, 0, s * 0.3, 0)), x, y, z), t);
}

const PARTS: (readonly [number, (k: Kit) => Object3D[]])[] = [
  [2, () => [silo(0.24, -0.2, 0.34, 0.12)]],
  [3, () => [crate(0.3, 0.3, 0.14, 0.3)]],
  [4, () => [at(bevelBox(0.04, 0.3, 0.012, 0.004, MAT.accent, 1), -0.12, 0.1, 0.425)]],
  [5, () => [crate(0.34, 0.12, 0.1, 0.8), crate(0.3, 0.3, 0.1, 0.2, 0.24)]],
  [6, () => [silo(-0.28, -0.32, 0.3, 0.1)]],
  [7, (k) => [at(cylinder(0.02, 0.5, MAT.steel, 10), 0.37, 0.1, -0.36), at(cylinder(0.03, 0.02, MAT.beacon, 10), 0.37, 0.6, -0.36), ...(k.light(0.37, 0.63, -0.36, COLORS.beacon, { r: 14, phase: 0.3, size: 0.03 }) ? [] : [])]],
  [8, () => [at(ring(0.43, 0.012, SOFT, 4), 0, 0.12, 0)]],
  [9, () => [at(ring(0.126, 0.012, MAT.gold, 40), 0.24, 0.253, -0.2)]],
  [10, () => [at(ring(0.43, 0.014, MAT.gold, 4), 0, 0.095, 0), at(dome(0.06, 0.05, MAT.gold, 24, 6), 0.24, 0.55, -0.2)]],
];

function storage(k: Kit, level: number): { pad: Object3D; body: Object3D } {
  const plinth = facet(lathe([[0, 0], [0.5, 0], [0.5, 0.075], [0.46, 0.1], [0, 0.1]], 4, MAT.panel, Math.PI / 4));
  plinth.scale.set(0.93, 1, 0.93);
  const rim = at(bevelBox(0.84, 0.012, 0.84, 0.004, MAT.trim, 1), 0, 0.1, 0);
  const feet = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => at(bevelBox(0.09, 0.05, 0.09, 0.015, MAT.gunmetal), a! * 0.4, 0, b! * 0.4));
  const mainSilo = silo(-0.1, -0.05, 0.5, 0.2);
  // cargo module in front with a lit door
  const mod = at(bevelBox(0.5, 0.3, 0.3, 0.04, MAT.hull), 0.1, 0.1, 0.27);
  const door = at(bevelBox(0.26, 0.2, 0.02, 0.01, MAT.panel), 0.1, 0.12, 0.425);
  const strip = at(bevelBox(0.22, 0.016, 0.01, 0.005, LED, 1), 0.1, 0.33, 0.437);
  const stripe = at(bevelBox(0.51, 0.04, 0.31, 0.012, MAT.accent, 1), 0.1, 0.3, 0.27);
  const roof = at(bevelBox(0.4, 0.02, 0.22, 0.008, MAT.trim, 1), 0.1, 0.4, 0.27);
  const ventRow = at(vents(4, 0.06, 0.02, 0.025, MAT.deep), 0.3, 0.2, 0.425);
  const pipe = cable([[0.22, 0.4, 0.2], [0.2, 0.52, 0.1], [0.08, 0.56, -0.02]], 0.014, MAT.steel);
  const feedBox = at(bevelBox(0.1, 0.1, 0.1, 0.02, MAT.gunmetal), 0.36, 0.1, 0.0);
  k.light(0.1, 0.38, 0.43, COLORS.tech, { r: 12, phase: 0.2, size: 0.02 });
  k.goods(0.3, 0.12, 0.4);
  k.wire(-0.1, 0.62, -0.05);
  const parts = PARTS.filter(([l]) => level >= l).flatMap(([, p]) => p(k));
  const body = group(mainSilo, mod, door, strip, stripe, roof, ventRow, pipe, feedBox, ...parts, at(rivets(0.2, 16, 0.008, MAT.trim), -0.1, 0.12, -0.05));
  return { pad: group(plinth, rim, ...feet, lightPool(0.7, WORLD.tech, 0.08)), body };
}
building('storage', storage, { levels: [1], stages: false });
