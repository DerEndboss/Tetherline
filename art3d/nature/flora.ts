import { PointLight, type Mesh, type Object3D } from 'three';
import { at, bevelBox, crystal, crystalMat, cylinder, dome, emissive, group, hull, lightPool, obstacleColors, pipe, rand, rock, rockMat, sprite, surface, turn, WORLD, type V } from '../kit';

/** Thornscrub: a rosette of curved alien blades around a root knob, curled stalks with glowing bulbs. */
const C = obstacleColors('scrub');
const BLADE = [surface(C.main, { rough: 0.5, coat: 0.4, flat: true }), surface('#9a4aa6', { rough: 0.5, coat: 0.4, flat: true }), surface('#c97ac4', { rough: 0.5, coat: 0.4, flat: true })];
const ROOT = surface(C.shade, { rough: 0.7, flat: true });
const BULB = emissive(C.glow, 2.2);
const SAND = [rockMat(WORLD.ground[1]!), rockMat(WORLD.ground[2]!, 0.75)];

/** One blade: three tapered segments bending outwards and over, as a chain of hulls. */
function blade(dir: number, len: number, width: number, bend: number, mat: Mesh['material']): Object3D {
  const segs = 4;
  const parts: Object3D[] = [];
  const pt = (t: number): V => {
    const out = t * len * 0.85;
    const up = Math.sin(Math.min(1, t * 1.5) * 1.35) * len * 0.8 - t * t * len * bend;
    return [Math.cos(dir) * out, Math.max(0.01, up), Math.sin(dir) * out];
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const w0 = width * (1 - t0 * 0.9);
    const w1 = width * (1 - t1 * 0.9);
    const a = pt(t0);
    const b = pt(t1);
    const sx = -Math.sin(dir);
    const sz = Math.cos(dir);
    const th0 = 0.012 + w0 * 0.1;
    const th1 = 0.006;
    const pts: V[] = [
      [a[0] + sx * w0, a[1], a[2] + sz * w0],
      [a[0] - sx * w0, a[1], a[2] - sz * w0],
      [a[0], a[1] + th0, a[2]],
      [a[0], a[1] - th0, a[2]],
      [b[0] + sx * w1, b[1], b[2] + sz * w1],
      [b[0] - sx * w1, b[1], b[2] - sz * w1],
      [b[0], b[1] + th1, b[2]],
      [b[0], b[1] - th1, b[2]],
    ];
    parts.push(hull(pts, mat as never));
  }
  return group(...parts);
}

function scrub(variant: number): Object3D {
  const rnd = rand(6300 + variant * 19);
  const blades: Object3D[] = [];
  const n = 12 + (variant % 2) * 3;
  for (let i = 0; i < n; i++) {
    const ring = i < 5 ? 0 : 1;
    const dir = (i / (ring ? n - 5 : 5)) * Math.PI * 2 + rnd() * 0.5;
    const len = (ring ? 0.62 : 0.45) + rnd() * 0.18;
    blades.push(blade(dir, len, 0.1 + rnd() * 0.03, 0.4 + rnd() * 0.4, BLADE[(i + variant) % 3]!));
  }
  const knob = at(rock(rnd, 0.17, 0.14, ROOT, 12, 0.3), 0, -0.01, 0);
  const pebbles = Array.from({ length: 5 }, (_, i) => {
    const a = rnd() * 6.28;
    return at(rock(rnd, 0.03 + rnd() * 0.04, 0.03 + rnd() * 0.03, SAND[i % 2]!, 9, 0.3), Math.cos(a) * 0.45, -0.005, Math.sin(a) * 0.4);
  });
  const bulbs: Object3D[] = [];
  const stalks = variant === 3 ? 2 : variant === 1 ? 1 : 1;
  for (let s = 0; s < stalks; s++) {
    const side = s % 2 ? 1 : -1;
    const sx = side * 0.04;
    const pts: V[] = [[sx, 0.04, 0], [sx + side * 0.05, 0.3, 0.02], [sx + side * 0.14, 0.52, 0.04], [sx + side * 0.26, 0.62 + s * 0.06, 0.02]];
    bulbs.push(pipe(pts, 0.02, ROOT, 0.1, 8));
    const tip = pts[3]!;
    bulbs.push(at(dome(0.09, 0.09, BULB, 16, 6), tip[0], tip[1] - 0.01, tip[2]));
    bulbs.push(at(dome(0.06, -0.0001 + 0.03, BLADE[0]!, 12, 3), tip[0], tip[1] - 0.045, tip[2]));
  }
  const spill = new PointLight(C.glow, 0.7, 0.8, 1.6);
  spill.position.set(0.15, 0.55, 0.1);
  void crystal; void crystalMat; void bevelBox; void cylinder; void turn;
  return group(lightPool(0.45, C.glow, 0.1), knob, ...blades, ...bulbs, ...pebbles, spill);
}

for (let v = 0; v < 4; v++) sprite({ id: `obstacle-scrub-${v}`, glow: true, build: () => scrub(v) });
