import { CylinderGeometry, Mesh, type Material, type Object3D } from 'three';
import { content } from '../../src/content';
import { plan, sprite } from '../kit';
import { bar, board, coil, ICON, ingots, lump, nuggets, orb, plates, prism, rods, sand, seedOf, slag, truss, wafer, type Mat } from './items';
import { at, ball, bevelBox, crystal, crystalMat, cylinder, darker, emissive, gemCluster, group, hexCoin, hull, lathe, lighter, matte, metal, MAT, mix, nugget, rand, ring, rock, stone, strut, surface, taper, turn, type V } from './parts';

/**
 * Icons of the v2 materials and liquids: one model per id (`icon-<id>`, `icon-liquid-<id>`), each its own silhouette
 * and its own glow, big in the 32 px fixed box. Colours come from the content (`color`, `accent`) so the UI chip,
 * the belt item and the 3D icon agree. A material id without a model here gets a plain nugget, so a new ore never
 * breaks the render (look at the sheet and add its model).
 */

const glowing = (c: string, p = 1.6): Material => emissive(c, p);
const gl = (c: string, e = 0.7): Material => {
  const m = surface(c, { rough: 0.12, coat: 1 });
  m.emissive.set(c);
  m.emissiveIntensity = e;
  m.userData.glow = true;
  return m;
};

/** Iron ore: banded slabs of rusty rock with pale quartz veins. */
function banded(m: Mat): Object3D {
  const body = stone(m.color, 0.55);
  const dark = stone(darker(m.color, 0.3), 0.6);
  const vein = surface(m.accent ?? '#c9a28d', { rough: 0.3, metal: 0.5, coat: 0.8, flat: true });
  const g = group();
  [0, 1, 2].forEach((i) => {
    g.add(at(turn(bevelBox(0.74 - i * 0.12, 0.17, 0.6 - i * 0.08, 0.05, i % 2 ? dark : body, 2), 0.18 * i - 0.2), 0.02 * i, i * 0.165, 0.02 * i));
  });
  g.add(at(turn(bevelBox(0.3, 0.012, 0.03, 0.006, vein, 1), 0.5), 0.02, 0.5, 0.0), at(ball(0.04, vein), 0.2, 0.26, 0.2), at(ball(0.03, vein), -0.28, 0.1, 0.3));
  return g;
}

/** Faceted metallic shards in a rock bed (titanium, tungsten). */
function shards(m: Mat, count = 4): Object3D {
  const rnd = rand(seedOf(m.id));
  const mat = surface(m.color, { rough: 0.2, metal: 0.8, coat: 0.7, flat: true });
  const tip = surface(m.accent ?? lighter(m.color, 0.5), { rough: 0.12, metal: 0.9, coat: 1, flat: true });
  const g = group(at(rock(rnd, 0.46, 0.1, stone(darker(m.color, 0.4), 0.7), 12, 0.35), 0, 0, 0));
  const lay: [number, number, number, number, number, number][] = [[0, 0, 0.11, 0.48, 0.18, 0.05], [-0.2, 0.08, 0.09, 0.3, 0.14, -0.35], [0.2, 0.04, 0.08, 0.26, 0.12, 0.4], [0.02, -0.2, 0.07, 0.22, 0.1, 0.1], [-0.08, 0.22, 0.06, 0.18, 0.09, -0.1]];
  for (const [x, z, r, h, t, l] of lay.slice(0, count)) {
    g.add(at(crystal(rnd, { r, h, tip: t, sides: 4, lean: [l, l * 0.3] }, mat), x, 0.06, z));
    g.add(at(crystal(rnd, { r: r * 0.3, h: h * 0.4, tip: t * 0.4, sides: 4, lean: [l, l * 0.3] }, tip), x + 0.01, 0.4 * h + 0.06, z));
  }
  return g;
}

/** Scrap: bent plates, a cog and a bolt in a heap, rust-orange edges. */
function scrapPile(m: Mat): Object3D {
  const plate = metal(m.color, 0.45);
  const rust = surface(m.accent ?? '#c47a3a', { rough: 0.7, metal: 0.3 });
  const g = group();
  g.add(at(turn(bevelBox(0.6, 0.05, 0.46, 0.02, plate, 1), 0.3), 0, 0.02, 0));
  const t = turn(bevelBox(0.5, 0.05, 0.36, 0.02, rust, 1), -0.5);
  t.rotation.z = 0.35;
  g.add(at(t, 0.1, 0.14, -0.05));
  const u = turn(bevelBox(0.36, 0.05, 0.3, 0.02, plate, 1), 0.9);
  u.rotation.x = -0.4;
  g.add(at(u, -0.15, 0.2, 0.1));
  const cog = cylinder(0.2, 0.06, rust, 10, 0.012);
  cog.rotation.x = 0.7;
  g.add(at(cog, 0.25, 0.22, 0.22), at(cylinder(0.07, 0.07, MAT.deep, 10, 0.01), 0.27, 0.28, 0.2));
  g.add(at(cylinder(0.035, 0.3, metal('#aab2c2'), 8, 0.006), -0.3, 0.1, 0.3).rotateZ(1.2), at(hexCoin(0.07, 0.05, plate), -0.42, 0.26, 0.28));
  return g;
}

/** Lead ore: dense dark-blue cubes (galena) with metallic faces. */
function cubes(m: Mat): Object3D {
  const mat = surface(m.color, { rough: 0.22, metal: 0.75, coat: 0.8 });
  const hi = surface(m.accent ?? '#b8c6de', { rough: 0.15, metal: 0.9, coat: 1 });
  const g = group();
  for (const [x, y, z, s, a] of [[-0.12, 0, 0.0, 0.34, 0.2], [0.22, 0, 0.18, 0.24, -0.3], [-0.1, 0.3, 0.02, 0.22, 0.6], [0.2, 0.0, -0.22, 0.2, 0.9], [-0.3, 0, 0.3, 0.16, 0.1]] as const) {
    g.add(at(turn(bevelBox(s, s, s, s * 0.14, mat, 2), a), x, y, z));
    g.add(at(turn(bevelBox(s * 0.4, 0.012, s * 0.3, 0.005, hi, 1), a), x, y + s - 0.002, z));
  }
  return g;
}

/** Tin ore: smooth pale pebbles (cassiterite) with a glassy sheen. */
function pebbles(m: Mat): Object3D {
  const mat = surface(m.color, { rough: 0.3, coat: 1, metal: 0.1 });
  const dark = surface(darker(m.color, 0.35), { rough: 0.4, coat: 0.6 });
  const g = group();
  for (const [x, z, r, d] of [[0, 0, 0.26, 0], [0.3, 0.12, 0.17, 1], [-0.28, 0.12, 0.15, 0], [0.04, -0.28, 0.16, 1], [-0.18, -0.2, 0.12, 0], [0.22, 0.34, 0.1, 0]] as const) {
    const s = ball(r, d ? dark : mat);
    s.scale.set(1, 0.78, 0.9);
    g.add(at(s, x, r * 0.74, z));
  }
  g.add(at(ball(0.04, surface(m.accent ?? '#fff', { rough: 0.1, coat: 1 })), -0.05, 0.38, 0.1));
  return g;
}

/** Bauxite: a rust-red crust studded with round peas (pisolite). */
function peas(m: Mat): Object3D {
  const body = stone(m.color, 0.7);
  const pea = surface(m.accent ?? '#f08a5d', { rough: 0.35, coat: 0.6 });
  const rnd = rand(seedOf(m.id));
  const g = group(at(rock(rnd, 0.46, 0.22, body, 14, 0.35), 0, 0, 0));
  for (let i = 0; i < 12; i++) {
    const a = rnd() * 6.28;
    const r = 0.05 + rnd() * 0.34;
    g.add(at(ball(0.045 + rnd() * 0.035, pea), Math.cos(a) * r, 0.2 * (1 - r / 0.46) + 0.07, Math.sin(a) * r));
  }
  return g;
}

/** Lithium salt: pale pink hexagonal prisms in a loose bundle, pink glow at the tips. */
function saltPrisms(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.16, coat: 1, metal: 0.05 });
  const tip = glowing(m.accent ?? '#ff9fd0', 1.8);
  const g = group();
  for (const [x, z, h, r, l] of [[0, 0, 0.62, 0.11, 0.05], [0.2, 0.1, 0.42, 0.09, 0.2], [-0.2, 0.06, 0.48, 0.09, -0.25], [0.05, -0.2, 0.34, 0.08, 0.05], [-0.06, 0.24, 0.28, 0.07, -0.1]] as const) {
    const p = cylinder(r, h, body, 6, 0.012);
    p.rotation.z = -l;
    g.add(at(p, x, 0, z));
    g.add(at(cylinder(r * 0.8, 0.03, tip, 6, 0.006), x + l * h * -0.0 - Math.sin(l) * h * 0.0, h - 0.015, z).translateX(-Math.sin(l) * h));
  }
  g.add(at(rock(rand(3), 0.4, 0.08, stone('#cdb3c4', 0.8), 10, 0.3), 0, 0, 0));
  return g;
}

/** Tungsten ore: dark tabular slabs fanned like a book, violet glints. */
function slabs(m: Mat): Object3D {
  const dark = surface(m.color, { rough: 0.28, metal: 0.6, coat: 0.7, flat: true });
  const glint = surface(m.accent ?? '#9a8fc4', { rough: 0.15, metal: 0.9, coat: 1 });
  const g = group(at(rock(rand(6), 0.42, 0.08, stone('#2e2a3a', 0.7), 10, 0.3), 0, 0, 0));
  for (let i = 0; i < 5; i++) {
    const a = -0.8 + i * 0.4;
    const s = turn(bevelBox(0.5, 0.06, 0.34 - Math.abs(i - 2) * 0.03, 0.02, i % 2 ? glint : dark, 1), 0);
    s.rotation.z = 1.05 - Math.abs(i - 2) * 0.12;
    s.rotation.y = a;
    g.add(at(s, Math.sin(a) * -0.05, 0.05, 0));
  }
  return g;
}

/** Emberite: dark rock split by glowing orange cracks, hot crystals on top. */
function ember(m: Mat): Object3D {
  const rnd = rand(seedOf(m.id));
  const rockM = stone('#2c2430', 0.75);
  const hot = emissive(m.color, 1.9);
  const g = group(at(rock(rnd, 0.46, 0.34, rockM, 14, 0.4), 0, 0, 0));
  for (const [x, z, h, r] of [[0, 0, 0.52, 0.1], [0.18, 0.1, 0.36, 0.08], [-0.17, 0.08, 0.3, 0.07]] as const) g.add(at(crystal(rnd, { r, h, tip: h * 0.4, lean: [(x + 0.01) * 0.6, 0] }, crystalMat(m.color, m.accent ?? '#ffd36b', 1.3)), x, 0.18, z));
  for (const [x, z, w, d, a] of [[0.0, 0.3, 0.3, 0.035, 0.2], [0.28, -0.05, 0.03, 0.3, 0.1], [-0.3, 0.02, 0.03, 0.26, -0.2], [0.0, -0.3, 0.26, 0.035, -0.3]] as const) g.add(at(turn(bevelBox(w, 0.02, d, 0.008, hot, 1), a), x, 0.2, z));
  g.add(at(ball(0.04, emissive(m.accent ?? '#ffd36b', 2.6)), 0.12, 0.4, 0.2));
  return g;
}

/** Verdite: a green bio-crystal with curling vine-like arms and tiny glowing seeds. */
function bio(m: Mat): Object3D {
  const rnd = rand(seedOf(m.id));
  const g = group(at(rock(rnd, 0.36, 0.08, stone('#3a5a3a', 0.8), 10, 0.3), 0, 0, 0));
  g.add(at(gemCluster(seedOf(m.id), m.color, m.accent ?? '#c8ffd9', 5, 1.15), 0, 0.04, 0));
  const vine = surface('#2f8a52', { rough: 0.45, coat: 0.5 });
  g.add(at(strut([0.2, 0.06, 0.15], [0.34, 0.24, 0.1], 0.025, vine, 8), 0, 0, 0), at(strut([0.34, 0.24, 0.1], [0.3, 0.4, 0.06], 0.02, vine, 8), 0, 0, 0));
  g.add(at(strut([-0.2, 0.06, 0.1], [-0.34, 0.2, 0.2], 0.025, vine, 8), 0, 0, 0));
  for (const [x, y, z] of [[0.3, 0.43, 0.06], [-0.34, 0.23, 0.2], [0.1, 0.55, 0.1]] as const) g.add(at(ball(0.04, emissive(m.accent ?? '#c8ffd9', 2.4)), x, y, z));
  return g;
}

/** Frostine: tall icy blue shards with white tips and a frost rim. */
function ice(m: Mat): Object3D {
  const rnd = rand(seedOf(m.id));
  const mat = crystalMat(m.color, m.accent ?? '#e6f6ff', 0.8);
  const g = group(at(rock(rnd, 0.4, 0.07, surface('#dcecf6', { rough: 0.5, coat: 0.6, flat: true }), 10, 0.3), 0, 0, 0));
  for (const [x, z, h, r, l] of [[0, 0, 0.72, 0.1, 0.06], [0.2, 0.1, 0.5, 0.08, 0.3], [-0.2, 0.06, 0.58, 0.08, -0.28], [0.06, -0.2, 0.4, 0.07, 0.1], [-0.12, 0.24, 0.3, 0.06, -0.2]] as const) g.add(at(crystal(rnd, { r, h, tip: h * 0.3, sides: 6, lean: [l, l * 0.2] }, mat), x, 0.04, z));
  g.add(at(ring(0.34, 0.016, emissive('#e6f6ff', 1.0), 36), 0, 0.06, 0));
  return g;
}

/** Prismite: a rainbow crystal cluster, every crystal its own hue. */
function rainbow(m: Mat): Object3D {
  const rnd = rand(seedOf(m.id));
  const hues = ['#ff7aa8', '#ffd166', '#7ff0b0', '#7fd4ff', '#c78bff'];
  const g = group(at(rock(rnd, 0.38, 0.08, stone('#4a3f6e', 0.8), 10, 0.3), 0, 0, 0));
  const lay: [number, number, number, number, number][] = [[0, 0, 0.1, 0.55, 0.05], [-0.17, 0.06, 0.08, 0.36, -0.3], [0.17, 0.04, 0.08, 0.32, 0.35], [0.03, 0.17, 0.07, 0.24, 0.45], [-0.06, -0.16, 0.07, 0.26, -0.4]];
  lay.forEach(([x, z, r, h, l], i) => g.add(at(crystal(rnd, { r, h, tip: h * 0.45, lean: [l, l * 0.4] }, crystalMat(hues[i]!, lighter(hues[i]!, 0.4), 1.1)), x, 0.04, z)));
  g.add(at(ball(0.045, emissive('#ffffff', 2.6)), 0.0, 0.7, 0.04));
  return g;
}

/** Obsidion: a black-violet glass shard with a violet core and edge light. */
function obsidian(m: Mat): Object3D {
  const rnd = rand(seedOf(m.id));
  const glass = surface(m.color, { rough: 0.04, metal: 0.4, coat: 1, flat: true });
  const core = emissive(m.accent ?? '#b06bff', 1.6);
  const g = group(at(rock(rnd, 0.4, 0.07, stone('#1a1428', 0.7), 10, 0.3), 0, 0, 0));
  const pts: V[] = [[-0.14, 0, -0.1], [0.16, 0, -0.08], [0.18, 0, 0.12], [-0.1, 0, 0.16], [-0.06, 0.78, 0.02], [0.06, 0.55, -0.02], [0.02, 0.9, 0.02]];
  g.add(at(hull(pts, glass), 0, 0.04, 0));
  g.add(at(hull([[-0.08, 0, -0.05], [0.08, 0, -0.04], [0.04, 0.0, 0.08], [0.0, 0.5, 0.0]] as V[], core), 0, 0.06, 0));
  const small = hull([[-0.1, 0, -0.08], [0.1, 0, -0.06], [0.08, 0, 0.1], [-0.06, 0, 0.1], [0.04, 0.36, 0.0]] as V[], glass);
  g.add(at(small, 0.28, 0.04, 0.14), at(turn(hull([[-0.08, 0, -0.06], [0.08, 0, -0.06], [0.0, 0, 0.1], [-0.03, 0.28, 0.0]] as V[], glass), 1), -0.3, 0.04, 0.12));
  return g;
}

/** A generic ingot with a stamp, for the metal bars (lead, tin). */
function barOf(mark: string): (m: Mat) => Object3D {
  return (m) => bar({ ...m, mark });
}

/** Glass: a framed pane that glows from inside. */
function pane(m: Mat): Object3D {
  return wafer({ ...m, id: 'lumen-glass' });
}

/** Plastic: a lilac moulded block with four studs and a rounded body. */
function brick(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.3, coat: 0.9 });
  const acc = surface(m.accent ?? '#b49be0', { rough: 0.25, coat: 1 });
  const g = group(at(bevelBox(0.74, 0.34, 0.5, 0.08, body, 3), 0, 0, 0));
  for (const x of [-0.2, 0.2]) for (const z of [-0.12, 0.12]) g.add(at(cylinder(0.08, 0.08, body, 20, 0.012), x, 0.33, z));
  g.add(at(bevelBox(0.5, 0.04, 0.012, 0.006, acc, 1), 0, 0.12, 0.255));
  return turn(g, -0.4);
}

/** Aluminium: a bundle of light hexagonal rods lying together, bright and clean. */
function hexBundle(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.18, metal: 0.8, coat: 0.8 });
  const end = surface(m.accent ?? '#fff', { rough: 0.1, metal: 0.9, coat: 1 });
  const g = group();
  const place: [number, number][] = [[-0.14, 0], [0.14, 0], [0, -0.24], [-0.28, -0.24], [0.28, -0.24], [-0.14, 0.24], [0.14, 0.24]];
  place.forEach(([x, z]) => {
    const r = cylinder(0.13, 0.62, body, 6, 0.012);
    r.rotation.z = Math.PI / 2;
    g.add(at(r, 0.31, 0.13, z * 0.9 + 0.0 * x));
    g.add(at(cylinder(0.1, 0.012, end, 6, 0.004).rotateZ(-Math.PI / 2), 0.32, 0.13, z * 0.9));
  });
  g.children.forEach((c, i) => (c.position.y = 0.13 + (i % 2 ? 0.0 : 0.0)));
  return turn(g, -0.5);
}

/** Lithium: a pink-silver sphere in a ring cradle with a pink glow. */
function cradle(m: Mat): Object3D {
  const g = group(at(cylinder(0.3, 0.07, MAT.panel, 36, 0.025), 0, 0, 0));
  g.add(ball(0.27, metal(m.color, 0.15), 0.42));
  g.add(at(ball(0.07, emissive(m.accent ?? '#fff0f8', 2.2)), -0.1, 0.62, 0.14));
  const r1 = ring(0.34, 0.03, metal('#c9bcd8', 0.25), 40);
  r1.rotation.x = 0.35;
  const r2 = ring(0.34, 0.03, glowing(m.color, 1.3), 40);
  r2.rotation.z = 0.35;
  g.add(at(r1, 0, 0.42, 0), at(r2, 0, 0.42, 0));
  return g;
}

/** Tungsten carbide: a hexagonal cutting insert with a centre hole and violet bevel light. */
function insert(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.2, metal: 0.8, coat: 0.9 });
  const lit = surface(m.accent ?? '#b9b0e6', { rough: 0.12, metal: 0.9, coat: 1 });
  const g = group(at(hexCoin(0.46, 0.14, body), 0, 0, 0), at(hexCoin(0.34, 0.05, lit), 0, 0.12, 0), at(cylinder(0.12, 0.2, MAT.deep, 24, 0.01), 0, 0.0, 0));
  g.add(at(ring(0.4, 0.012, glowing(m.accent ?? '#b9b0e6', 1.4), 6), 0, 0.15, 0));
  return turn(g, 0.3);
}

/** Star alloy: a gold bar with a glowing four-point star on top. */
function starBar(m: Mat): Object3D {
  const g = group(bar({ ...m, color: '#e6b84a', mark: undefined }));
  const star = glowing(m.accent ?? '#fffbe0', 2.8);
  g.add(at(bevelBox(0.3, 0.03, 0.05, 0.01, star, 1), 0, 0.21, 0), at(bevelBox(0.05, 0.03, 0.3, 0.01, star, 1), 0, 0.21, 0), at(ball(0.04, star), 0, 0.23, 0));
  g.add(at(ball(0.045, star), 0.38, 0.5, 0.2), at(ball(0.03, star), -0.34, 0.42, -0.2));
  return g;
}

/** Singularity: a black sphere with a bright accretion ring and a lensing halo. */
function hole(m: Mat): Object3D {
  const g = group(at(cylinder(0.26, 0.05, MAT.panel, 36, 0.02), 0, 0, 0));
  g.add(ball(0.24, surface('#05030a', { rough: 0.1, metal: 0.4, coat: 1 }), 0.5));
  const disk = ring(0.4, 0.04, glowing(m.accent ?? '#c78bff', 2.4), 56);
  disk.rotation.x = 0.35;
  const halo = ring(0.3, 0.015, glowing('#ffffff', 2), 56);
  halo.rotation.x = 1.2;
  g.add(at(disk, 0, 0.5, 0), at(halo, 0, 0.5, 0));
  return g;
}

/** Elevator segment: a hexagonal white tube with gold bands and a teal strip. */
function segment(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.25, coat: 0.8, metal: 0.2 });
  const gold = surface(m.accent ?? '#ffd36b', { rough: 0.22, metal: 0.95 });
  const g = group(at(cylinder(0.26, 0.72, body, 6, 0.03), 0, 0, 0));
  for (const y of [0.04, 0.34, 0.66]) g.add(at(cylinder(0.285, 0.05, gold, 6, 0.012), 0, y, 0));
  g.add(at(bevelBox(0.05, 0.4, 0.02, 0.01, glowing('#5fd0b5', 2), 1), 0, 0.14, 0.245));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    g.add(at(cylinder(0.014, 0.8, MAT.gunmetal, 6, 0.003), Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27));
  }
  return turn(g, 0.5);
}

/** Motor: a gunmetal can with cooling fins, an orange end cap and a shaft. */
function motor(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.3, metal: 0.6, coat: 0.7 });
  const cap = surface(m.accent ?? '#f2994a', { rough: 0.3, coat: 0.9 });
  const g = group();
  const can = cylinder(0.28, 0.5, body, 32, 0.03);
  can.rotation.z = Math.PI / 2;
  g.add(at(can, -0.1, 0.28, 0));
  for (let i = 0; i < 5; i++) g.add(at(ring(0.29, 0.016, MAT.steel, 32), -0.3 + i * 0.075, 0.28, 0).rotateZ(Math.PI / 2));
  const endcap = cylinder(0.3, 0.1, cap, 32, 0.025);
  endcap.rotation.z = Math.PI / 2;
  g.add(at(endcap, 0.15, 0.28, 0));
  const shaft = cylinder(0.05, 0.3, MAT.steel, 16, 0.008);
  shaft.rotation.z = -Math.PI / 2;
  g.add(at(shaft, 0.18, 0.28, 0), at(bevelBox(0.5, 0.05, 0.4, 0.02, MAT.panel, 1), -0.05, 0, 0));
  return turn(g, -0.45);
}

/** Battery cell: a standing cell with a bright charge band and a terminal cap. */
function cell(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.2, coat: 1 });
  const dark = surface(m.accent ?? '#1f3b4d', { rough: 0.35, coat: 0.6 });
  const g = group(at(cylinder(0.26, 0.7, dark, 32, 0.04), 0, 0, 0), at(cylinder(0.265, 0.3, body, 32, 0.02), 0, 0.12, 0));
  g.add(at(cylinder(0.265, 0.07, glowing(m.color, 1.8), 32, 0.01), 0, 0.46, 0), at(cylinder(0.1, 0.1, MAT.steel, 20, 0.015), 0, 0.7, 0));
  g.add(at(bevelBox(0.18, 0.2, 0.015, 0.006, glowing('#ffffff', 1.6), 1), 0, 0.22, 0.262));
  return g;
}

/** Core chip: a square package with gold pins and a bright cyan die. */
function coreChip(m: Mat): Object3D {
  const pkg = surface('#1c2442', { rough: 0.25, metal: 0.3, coat: 1 });
  const gold = metal('#ffd98a', 0.2);
  const g = group(at(bevelBox(0.72, 0.12, 0.72, 0.04, pkg, 2), 0, 0, 0));
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) {
    g.add(at(bevelBox(0.05, 0.05, 0.1, 0.012, gold, 1), i * 0.095, 0.02, s * 0.4), at(bevelBox(0.1, 0.05, 0.05, 0.012, gold, 1), s * 0.4, 0.02, i * 0.095));
  }
  g.add(at(bevelBox(0.4, 0.04, 0.4, 0.02, MAT.panel, 1), 0, 0.11, 0), at(bevelBox(0.26, 0.05, 0.26, 0.02, glowing(m.color, 2.0), 1), 0, 0.14, 0), at(bevelBox(0.1, 0.05, 0.1, 0.02, glowing(m.accent ?? '#ffffff', 3), 1), 0, 0.17, 0));
  return turn(g, -0.4);
}

/** Copper ore: rough copper nuggets with a verdigris crust. */
function copperOre(m: Mat): Object3D {
  const g = nuggets(m) as import('three').Group;
  g.add(at(ball(0.05, surface('#5fd0b5', { rough: 0.5, coat: 0.5 })), 0.12, 0.3, 0.14));
  return g;
}

/** A liquid: a glossy teardrop on a small plinth, each with its own mark. */
function drop(color: string, opts: { glow?: number; dark?: boolean } = {}): Object3D {
  const body = lathe([[0, 0], [0.18, 0.02], [0.3, 0.12], [0.34, 0.26], [0.3, 0.4], [0.2, 0.56], [0.1, 0.72], [0.03, 0.86], [0, 0.9]], 40, opts.glow ? gl(color, opts.glow) : surface(color, { rough: 0.08, coat: 1, metal: opts.dark ? 0.5 : 0.05 }));
  const g = group(at(cylinder(0.34, 0.06, MAT.panel, 40, 0.02), 0, -0.04, 0), at(body, 0, 0.02, 0));
  g.add(at(ball(0.05, emissive('#ffffff', 1.5)), -0.12, 0.4, 0.2));
  return g;
}

const LIQUIDS: Record<string, (c: string) => Object3D> = {
  water: (c) => {
    const g = drop(c, { glow: 0.5 });
    g.add(at(ring(0.38, 0.015, emissive('#e6f6ff', 1.0), 44), 0, 0.02, 0));
    return g;
  },
  oil: (c) => {
    const g = drop('#1c1822', { dark: true });
    for (const [i, col] of ['#7a5cff', '#2fd0b0', '#ff7ab0'].entries()) g.add(at(bevelBox(0.16 - i * 0.03, 0.012, 0.02, 0.006, emissive(col, 1.2), 1), -0.06, 0.5 - i * 0.07, 0.31));
    void c;
    return g;
  },
  slag: (c) => {
    const crust = surface('#3a2a2a', { rough: 0.9, flat: true });
    const g = group(at(rock(rand(4), 0.42, 0.22, crust, 12, 0.5), 0, 0, 0));
    g.add(at(cylinder(0.3, 0.08, emissive(c, 1.9), 28, 0.02), 0, 0.2, 0), at(ball(0.07, emissive('#ffd08a', 2.6)), -0.1, 0.34, 0.06), at(ball(0.045, emissive('#ffd08a', 2.6)), 0.14, 0.32, -0.05));
    return g;
  },
  coolant: (c) => {
    const g = drop(c, { glow: 0.9 });
    const rnd = rand(5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(at(crystal(rnd, { r: 0.035, h: 0.1, tip: 0.07, sides: 5, lean: [Math.cos(a) * 0.3, Math.sin(a) * 0.3] }, crystalMat('#cffffb', '#ffffff', 0.8)), Math.cos(a) * 0.39, 0.0, Math.sin(a) * 0.39));
    }
    return g;
  },
  fuel: (c) => {
    const g = drop(c, { glow: 0.8 });
    g.add(at(taper(0.07, 0.0, 0.22, emissive('#ff8a3d', 2.2), 10), 0, 0.28, 0.3), at(taper(0.035, 0.0, 0.12, emissive('#fff1c0', 3), 10), 0, 0.29, 0.31));
    return g;
  },
  gas: (c) => {
    const puff = gl(c, 0.7);
    const g = group(at(cylinder(0.34, 0.06, MAT.panel, 40, 0.02), 0, 0, 0));
    for (const [x, y, z, r] of [[0, 0.32, 0, 0.26], [0.26, 0.26, 0.1, 0.18], [-0.24, 0.24, 0.08, 0.17], [0.08, 0.58, -0.04, 0.17], [-0.1, 0.46, 0.18, 0.12]] as const) g.add(at(ball(r, puff), x, y, z));
    for (const [x, y, z] of [[0.3, 0.6, 0.1], [-0.28, 0.54, -0.05]] as const) g.add(at(ball(0.035, emissive('#f4ffe0', 1.8)), x, y, z));
    return g;
  },
};

const SHAPES: Record<string, (m: Mat) => Object3D> = {
  'copper-ore': copperOre,
  'iron-ore': banded,
  coal: lump,
  sand,
  'titanium-ore': (m) => shards(m, 5),
  scrap: scrapPile,
  'lead-ore': cubes,
  'tin-ore': pebbles,
  bauxite: peas,
  'lithium-salt': saltPrisms,
  'tungsten-ore': slabs,
  emberite: ember,
  verdite: bio,
  frostine: ice,
  prismite: rainbow,
  obsidion: obsidian,
  'copper-wire': coil,
  'iron-bar': barOf('line'),
  graphite: rods,
  silicon: wafer,
  glass: pane,
  steel: ingots,
  'titanium-plate': plates,
  plastic: brick,
  'lead-ingot': barOf('ring'),
  'tin-ingot': barOf('dot'),
  aluminium: hexBundle,
  lithium: cradle,
  'tungsten-carbide': insert,
  'prism-lens': (m) => prism({ color: m.color }),
  'star-alloy': starBar,
  singularity: hole,
  'elevator-segment': segment,
  frame: truss,
  circuit: board,
  motor,
  'battery-cell': cell,
  'core-chip': coreChip,
};

/** Registers `icon-<id>` for every v2 material and `icon-liquid-<id>` for every liquid. */
export function registerV2Icons(): void {
  const ids: string[] = [];
  for (const m of content.materials.list as unknown as Mat[]) {
    const f = SHAPES[m.id] ?? nuggets;
    ids.push(m.icon);
    sprite({ id: m.icon, build: () => f(m), ...ICON, bloom: (m as unknown as { kind: string }).kind === 'raw' || m.id.includes('star') || m.id === 'singularity' ? 0.4 : 0.25 });
  }
  for (const l of content.liquids.list) {
    const f = LIQUIDS[l.id] ?? ((c: string) => drop(c, { glow: 0.6 }));
    const id = `icon-liquid-${l.id}`;
    ids.push(id);
    sprite({ id, build: () => f(l.color), ...ICON });
  }
  plan(ids);
}
void [CylinderGeometry, Mesh, nugget, matte, mix, hexCoin, hull, crystalMat, sand, slag, orb, board, truss, coil, plates, rods, bar, ingots, wafer, prism, lump, strut];
