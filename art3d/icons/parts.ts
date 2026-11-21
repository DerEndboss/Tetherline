import { CylinderGeometry, ExtrudeGeometry, Mesh, Shape, SphereGeometry, type Material, type Object3D } from 'three';
import { at, bevelBox, crystal, crystalMat, cylinder, emissive, group, hull, lathe, MAT, rand, ring, rock, strut, surface, taper, turn, type V } from '../kit';

/** Shared parts of the icon models: finishes and small builders, so every icon speaks the same visual language. */

export const metal = (c: string, rough = 0.3): Material => surface(c, { rough, metal: 0.45, coat: 0.6 });
export const gloss = (c: string): Material => surface(c, { rough: 0.25, coat: 0.9 });
export const matte = (c: string, rough = 0.8): Material => surface(c, { rough, flat: false });
export const stone = (c: string, rough = 0.6): Material => surface(c, { rough, coat: 0.25, flat: true });

/** Mixes two hex colours (t = 0 gives a). */
export function mix(a: string, b: string, t: number): string {
  const p = (s: string, i: number): number => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const h = (i: number): string =>
    Math.round(p(a, i) * (1 - t) + p(b, i) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}
export const lighter = (c: string, t = 0.35): string => mix(c, '#ffffff', t);
export const darker = (c: string, t = 0.35): string => mix(c, '#0a1024', t);

/** A tall, slightly tapered ingot: trapezoid bar with a bevel feel (hull of 8 points). */
export function ingot(w: number, h: number, d: number, mat: Material): Mesh {
  const t = 0.78;
  const pts: V[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push([sx * w * 0.5, 0, sz * d * 0.5]);
    pts.push([sx * w * 0.5 * t, h, sz * d * 0.5 * t]);
    pts.push([sx * w * 0.5 * (t + 0.08), h * 0.93, sz * d * 0.5 * (t + 0.08)]);
  }
  return hull(pts, mat);
}

/** Hexagon plate / coin with chamfer, base at y = 0. */
export const hexCoin = (r: number, h: number, mat: Material): Mesh => cylinder(r, h, mat, 6, h * 0.3);

/** Flat shape extruded upwards (outline in X/Z, y up), with a bevel. */
export function extrude(points: readonly (readonly [number, number])[], h: number, mat: Material, bevel = h * 0.18): Mesh {
  const s = new Shape();
  points.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function ball(r: number, mat: Material, y = 0): Mesh {
  const m = new Mesh(new SphereGeometry(r, 20, 14), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

/** A lumpy nugget: faceted rock with glossy flecks pressed into it. */
export function nugget(seed: number, r: number, h: number, body: Material, fleck: Material, flecks = 7): Object3D {
  const rnd = rand(seed);
  const g = group(rock(rnd, r, h, body, 16, 0.4));
  for (let i = 0; i < flecks; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = r * (0.2 + rnd() * 0.7);
    const f = rock(rnd, r * 0.17, r * 0.13, fleck, 8, 0.4);
    const y = h * (0.78 - (rr / r) ** 2 * 0.62);
    g.add(at(f, Math.cos(a) * rr, Math.max(0.02, y), Math.sin(a) * rr));
  }
  return g;
}

export function cog(r: number, h: number, teeth: number, mat: Material, holeMat: Material): Object3D {
  const g = group(cylinder(r * 0.82, h, mat, 40, h * 0.2));
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = bevelBox(r * 0.34, h, r * 0.3, h * 0.12, mat, 2);
    t.position.set(Math.cos(a) * r * 0.9, 0, -Math.sin(a) * r * 0.9);
    t.rotation.y = a;
    g.add(t);
  }
  g.add(at(cylinder(r * 0.3, h * 1.06, holeMat, 24, h * 0.1), 0, 0, 0));
  g.add(at(cylinder(r * 0.12, h * 1.25, mat, 16, h * 0.08), 0, 0, 0));
  return g;
}

/** A tilted, glowing-core crystal cluster. */
export function gemCluster(seed: number, main: string, glow: string, count = 4, scale = 1): Object3D {
  const rnd = rand(seed);
  const m = crystalMat(main, glow, 0.5);
  const g = group();
  const lay: [number, number, number, number, number, number][] = [
    [0, 0, 0.13, 0.5, 0.26, 0.05],
    [-0.17, 0.06, 0.1, 0.32, 0.18, -0.3],
    [0.17, 0.04, 0.09, 0.28, 0.16, 0.35],
    [0.03, 0.17, 0.08, 0.2, 0.13, 0.45],
    [-0.06, -0.16, 0.07, 0.22, 0.12, -0.4],
  ];
  for (const [x, z, r, h, tip, l] of lay.slice(0, count)) g.add(at(crystal(rnd, { r: r * scale, h: h * scale, tip: tip * scale, lean: [l, l * 0.4] }, m), x * scale, 0, z * scale));
  return g;
}

/** A flat teal-glow rim ring (for plaques, lens frames). */
export function rim(r: number, tube: number, mat: Material): Mesh {
  return ring(r, tube, mat, 48);
}

export { at, bevelBox, crystal, crystalMat, cylinder, emissive, group, hull, lathe, MAT, rand, ring, rock, strut, surface, taper, turn, CylinderGeometry };
export type { V };
