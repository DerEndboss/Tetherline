import { ExtrudeGeometry, Mesh, Shape } from 'three';
import type { Material, Object3D } from 'three';
import { at, ball, bevelBox, crystal, crystalMat, cylinder, emissive, gemCluster, gloss, group, hexCoin, lathe, lighter, darker, MAT, metal, rand, ring, rock, strut, surface, taper, turn } from './parts';

/** Small standing emblems, shared by branch, tech and skill icons. Each is ~0.9 tall, built on y = 0, facing +Z. */

/** A shape drawn in X (right) and Y (up), extruded along Z (centred), bevelled. */
export function flat(points: readonly (readonly [number, number])[], depth: number, mat: Material): Mesh {
  const s = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const b = depth * 0.22;
  const geo = new ExtrudeGeometry(s, { depth: depth - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 2 });
  geo.translate(0, 0, -(depth - b * 2) / 2);
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const BOLT: [number, number][] = [[0.06, 0.9], [-0.22, 0.4], [-0.02, 0.4], [-0.12, 0.0], [0.24, 0.52], [0.04, 0.52], [0.2, 0.9]];
const PLINTH = (r = 0.3): Object3D => group(cylinder(r, 0.08, MAT.panel, 40, 0.03), at(cylinder(r * 0.8, 0.04, metal('#7a86b0'), 40, 0.012), 0, 0.08, 0));

export function bolt(color: string): Object3D {
  const g = group(PLINTH(0.28));
  g.add(at(flat(BOLT, 0.16, emissive(color, 1.6)), 0, 0.1, 0));
  g.add(at(flat(BOLT.map(([x, y]) => [x * 1.12, y * 1.04 - 0.02] as [number, number]), 0.1, surface(darker(color, 0.5), { rough: 0.3, coat: 1 })), 0, 0.1, -0.03));
  return g;
}

export function pick(color: string): Object3D {
  const steel = metal('#cfd8ea', 0.22);
  const wood = surface('#8a5a3a', { rough: 0.6, coat: 0.3 });
  const g = group(PLINTH(0.3));
  const t = group();
  t.add(at(cylinder(0.04, 0.82, wood, 12, 0.01), 0, -0.41, 0));
  t.add(at(flat([[-0.4, -0.05], [-0.28, 0.1], [0, 0.17], [0.28, 0.1], [0.4, -0.05], [0.3, 0.0], [0.0, 0.07], [-0.3, 0.0]], 0.1, steel), 0, 0.28, 0));
  t.add(at(ball(0.055, surface(color, { rough: 0.2, coat: 1 })), 0, 0.3, 0.05));
  t.rotation.z = -0.35;
  t.position.set(0, 0.52, 0);
  g.add(t);
  return g;
}

export function rotor(color: string): Object3D {
  const g = group(PLINTH(0.28));
  g.add(at(cylinder(0.12, 0.2, MAT.hull, 28, 0.04), 0, 0.1, 0));
  g.add(at(cylinder(0.04, 0.2, metal('#a3afcc'), 16, 0.01), 0, 0.3, 0));
  const blades = group();
  for (const a of [0, Math.PI / 2]) blades.add(turn(bevelBox(0.9, 0.025, 0.11, 0.012, surface(color, { rough: 0.3, coat: 0.8 })), a));
  blades.position.y = 0.5;
  blades.rotation.y = 0.5;
  g.add(blades, at(ball(0.06, metal('#e8eefc')), 0, 0.52, 0));
  const halo = ring(0.45, 0.012, emissive(color, 0.9), 56);
  halo.position.y = 0.5;
  g.add(halo);
  return g;
}

export function flame(color = '#ff8a3d'): Object3D {
  const g = group(PLINTH(0.32));
  g.add(at(lathe([[0.26, 0], [0.3, 0.02], [0.3, 0.14], [0.2, 0.2], [0.1, 0.2], [0.1, 0.14]], 32, MAT.gunmetal), 0, 0.1, 0));
  const f = lathe([[0, 0], [0.16, 0.05], [0.2, 0.18], [0.14, 0.4], [0.05, 0.62], [0, 0.74]], 24, emissive(color, 1.7));
  const inner = lathe([[0, 0], [0.09, 0.04], [0.1, 0.14], [0.05, 0.3], [0, 0.4]], 20, emissive('#fff0c0', 2.2));
  g.add(at(f, 0, 0.26, 0), at(inner, 0, 0.27, 0.0));
  return g;
}

export function beam(color: string): Object3D {
  const g = group(PLINTH(0.32));
  g.add(at(cylinder(0.14, 0.26, MAT.hull, 28, 0.04), 0, 0.1, 0));
  const arm = group(at(cylinder(0.09, 0.42, MAT.trim, 24, 0.03), 0, 0, 0), at(cylinder(0.065, 0.06, emissive(color, 2.2), 20, 0.01), 0, 0.42, 0));
  arm.rotation.z = -0.9;
  arm.position.set(0, 0.4, 0);
  g.add(arm);
  const ray = group();
  ray.add(at(taper(0.012, 0.03, 0.55, emissive(lighter(color, 0.4), 2.2), 12), 0, 0, 0));
  ray.rotation.z = -0.9;
  ray.position.set(0.3 * Math.sin(0.9) * 1.2, 0.4 + 0.46 * Math.cos(0.9), 0);
  g.add(ray);
  return g;
}

export function lander(color: string): Object3D {
  const g = group(PLINTH(0.3));
  g.add(at(lathe([[0, 0], [0.2, 0], [0.22, 0.12], [0.18, 0.4], [0.1, 0.58], [0, 0.66]], 36, MAT.hull), 0, 0.2, 0));
  g.add(at(cylinder(0.225, 0.05, surface(color, { rough: 0.3, coat: 0.8 }), 36, 0.015), 0, 0.42, 0));
  g.add(at(ball(0.07, emissive('#7fe8e0', 1.8)), 0, 0.56, 0.17));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(strut([Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16], [Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36], 0.022, MAT.steel));
  }
  return g;
}

export function sun(color: string): Object3D {
  return group(ball(0.1, emissive(color, 2)));
}

export function gear(color: string): Object3D {
  const g = group(PLINTH(0.3));
  const c = group();
  const tooth = surface(color, { rough: 0.3, metal: 0.5, coat: 0.7 });
  c.add(at(cylinder(0.3, 0.14, tooth, 40, 0.03), 0, -0.07, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.add(at(turn(bevelBox(0.14, 0.14, 0.1, 0.025, tooth), -a), Math.cos(a) * 0.32, -0.07, Math.sin(a) * 0.32));
  }
  c.add(at(cylinder(0.12, 0.16, MAT.deep, 24, 0.02), 0, -0.08, 0), at(cylinder(0.05, 0.2, metal('#e8eefc'), 16, 0.01), 0, -0.1, 0));
  c.rotation.x = Math.PI / 2;
  c.position.set(0, 0.48, 0);
  g.add(c);
  return g;
}

export function dish(color: string): Object3D {
  const g = group(PLINTH(0.3));
  g.add(at(cylinder(0.04, 0.4, MAT.steel, 12, 0.01), 0, 0.1, 0));
  const d = group(at(lathe([[0, 0], [0.12, 0.02], [0.26, 0.09], [0.36, 0.22], [0.34, 0.22], [0.24, 0.1], [0.1, 0.04], [0, 0.03]], 40, MAT.hull), 0, 0, 0), at(strut([0, 0.03, 0], [0, 0.3, 0], 0.014, MAT.steel), 0, 0, 0), at(ball(0.04, emissive(color, 2.4)), 0, 0.32, 0));
  d.rotation.x = 0.9;
  d.position.set(0, 0.55, 0);
  g.add(d);
  return g;
}

export function gem(color: string, glow: string): Object3D {
  return group(PLINTH(0.34), at(gemCluster(9, color, glow, 4, 0.95), 0, 0.1, 0));
}

export function crate(): Object3D {
  const g = group(at(bevelBox(0.58, 0.42, 0.58, 0.05, MAT.hull), 0, 0, 0));
  g.add(at(bevelBox(0.6, 0.08, 0.6, 0.03, MAT.accent), 0, 0.17, 0), at(bevelBox(0.3, 0.1, 0.02, 0.008, MAT.tech), 0, 0.28, 0.3));
  return g;
}

export function coinStack(color: string): Object3D {
  const g = group();
  for (let i = 0; i < 4; i++) g.add(at(hexCoin(0.28, 0.1, metal(i % 2 ? color : lighter(color, 0.15), 0.22)), 0, i * 0.1, 0));
  return g;
}

export function drill(color: string): Object3D {
  const g = group(PLINTH(0.28));
  g.add(at(cylinder(0.13, 0.22, MAT.hull, 28, 0.04), 0, 0.1, 0), at(cylinder(0.14, 0.05, surface(color, { rough: 0.3, coat: 0.8 }), 28, 0.01), 0, 0.26, 0));
  const bit = lathe([[0.2, 0], [0.19, 0.08], [0.15, 0.2], [0.08, 0.34], [0.0, 0.46]], 12, metal('#d6deee', 0.2));
  g.add(at(bit, 0, 0.32, 0));
  for (let i = 0; i < 3; i++) g.add(at(ring(0.1 + (2 - i) * 0.03, 0.012, metal('#8a96b8'), 20), 0, 0.4 + i * 0.1, 0));
  return g;
}

export function oreChunk(color: string): Object3D {
  const r = rand(77);
  return group(PLINTH(0.34), at(rock(r, 0.3, 0.36, surface(color, { rough: 0.5, coat: 0.3, flat: true }), 14, 0.4), 0, 0.1, 0), at(rock(r, 0.1, 0.1, surface('#ffe9a0', { rough: 0.15, metal: 0.6, coat: 1, flat: true }), 8, 0.3), 0.1, 0.38, 0.1));
}

export function star(color: string): Object3D {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.17 : 0.4;
    pts.push([Math.cos(a) * r, 0.42 + Math.sin(a) * r]);
  }
  return group(PLINTH(0.3), at(flat(pts, 0.14, emissive(color, 1.5)), 0, 0.1, 0));
}

export function fist(color: string): Object3D {
  const g = group(PLINTH(0.3));
  g.add(at(bevelBox(0.38, 0.4, 0.34, 0.1, surface(color, { rough: 0.3, metal: 0.4, coat: 0.7 })), 0, 0.1, 0));
  for (let i = -1.5; i <= 1.5; i++) g.add(at(bevelBox(0.07, 0.1, 0.1, 0.03, metal(lighter(color, 0.3), 0.25)), i * 0.09, 0.42, 0.18));
  return g;
}

export function lens(color: string): Object3D {
  const g = group(PLINTH(0.3));
  const glass = surface(color, { rough: 0.04, coat: 1 });
  glass.emissive.set(color);
  glass.emissiveIntensity = 0.5;
  glass.userData.glow = true;
  const l = group(ring(0.32, 0.045, metal('#d8e0f2', 0.2)), at(cylinder(0.3, 0.04, glass, 40, 0.015), 0, -0.02, 0));
  l.rotation.x = Math.PI / 2;
  l.position.y = 0.5;
  g.add(l, at(cylinder(0.05, 0.1, MAT.steel, 12, 0.01), 0, 0.1, 0));
  return g;
}

export function facing(o: Object3D): Object3D {
  return turn(group(o), Math.PI / 4);
}
export { crystal, crystalMat, gloss, rock, taper, strut };
