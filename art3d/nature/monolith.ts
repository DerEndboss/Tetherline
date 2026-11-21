import { PointLight, type Object3D } from 'three';
import { at, bevelBox, emissive, group, hull, lightPool, obstacleColors, rand, rock, rockMat, sprite, surface, turn, WORLD, type V } from '../kit';

/** Monolith: a tall tapered slab with a chamfered cap, glowing runes, an inlaid band and a broken plinth. */
const C = obstacleColors('monolith');
const SLAB = surface(C.main, { rough: 0.42, coat: 0.6, metal: 0.15, flat: true });
const EDGE = surface('#7a72ad', { rough: 0.35, coat: 0.8, flat: true });
const RUNE = emissive(C.glow, 2.3);
const SAND = [rockMat(WORLD.ground[1]!), rockMat(WORLD.ground[2]!, 0.75), rockMat(C.shade, 0.7)];

function slab(w: number, d: number, h: number): Object3D {
  const ring = (k: number, y: number, ox = 0): V[] => [[-w * k + ox, y, -d * k], [w * k + ox, y, -d * k], [w * k + ox, y, d * k], [-w * k + ox, y, d * k]];
  const body = hull([...ring(1, 0), ...ring(0.9, h * 0.82, 0.01), ...ring(0.62, h * 0.97, 0.02)], SLAB);
  const cap = hull([...ring(0.64, h * 0.95, 0.02), [0.02, h * 1.04, 0.0], [0.07, h * 1.03, 0.04]], EDGE);
  return group(body, cap);
}

function glyph(kind: number, s: number, ox: number, oy: number, z: number): Object3D[] {
  const bar = (x: number, y: number, w: number, hgt: number, rot = 0): Object3D => {
    const m = at(bevelBox(w * s, hgt * s, 0.02, 0.004, RUNE), ox + x * s, oy + y * s, z);
    m.rotation.z = rot;
    return m;
  };
  const t = 0.12;
  if (kind === 0) return [bar(0, 0, t, 1.8), bar(0, 0.6, 1.0, t)];
  if (kind === 1) return [bar(0, 0, 1.2, t), bar(-0.5, 0.45, t, 0.9), bar(0.5, -0.45, t, 0.9)];
  if (kind === 2) return [bar(0, 0, 1.1, t, 0.7), bar(0, 0, 1.1, t, -0.7)];
  return [bar(0, 0.4, 1.1, t), bar(0, 0, t, 1.0), bar(0, -0.45, 0.7, t)];
}

function monolith(variant: number): Object3D {
  const rnd = rand(7400 + variant * 23);
  const w = 0.3 + (variant % 2) * 0.03;
  const d = 0.15;
  const h = 1.85 + variant * 0.07;
  const body = slab(w, d, h);
  const runes: Object3D[] = [];
  const zf = d + 0.004;
  for (let i = 0; i < 4; i++) runes.push(...glyph((i + variant) % 4, 0.17, (rnd() - 0.5) * 0.08, 0.45 + i * 0.32, zf * (1 - (0.1 * (0.45 + i * 0.32)) / h)));
  const band = at(bevelBox(w * 2 * 0.99, 0.03, 0.01, 0.004, RUNE), 0, 0.3, d + 0.003);
  const inset = at(bevelBox(w * 1.5, 1.1, 0.012, 0.01, surface(C.shade, { rough: 0.4, coat: 0.5 })), 0, 0.4, d - 0.002);
  const upright = group(body, inset, band, ...runes);
  upright.rotation.z = -0.04;
  upright.rotation.x = 0.035;
  const plinth = at(rock(rnd, 0.42, 0.1, SAND[2]!, 14, 0.2), 0, -0.02, 0);
  const rubble = [
    at(rock(rnd, 0.14, 0.14, SAND[0]!, 12, 0.35), 0.34, -0.01, 0.2),
    at(rock(rnd, 0.1, 0.1, SAND[1]!, 10, 0.35), -0.34, -0.01, 0.26),
    at(rock(rnd, 0.07, 0.06, SAND[0]!, 9, 0.35), 0.18, -0.005, 0.4),
    at(rock(rnd, 0.08, 0.07, SAND[2]!, 9, 0.35), -0.22, -0.005, -0.3),
  ];
  const spill = new PointLight(C.glow, 0.35, 0.8, 1.8);
  spill.position.set(0, 0.8, 0.4);
  return turn(group(lightPool(0.55, C.glow, 0.14), plinth, upright, ...rubble, spill), -0.2 + variant * 0.05);
}

for (let v = 0; v < 4; v++) sprite({ id: `obstacle-monolith-${v}`, glow: true, build: () => monolith(v) });
