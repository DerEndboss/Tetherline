import { content } from '../../src/legacy/content';
import { sprite } from '../kit';
import { at, ball, bevelBox, crystalMat, cylinder, emissive, gemCluster, group, hexCoin, ingot, lathe, lighter, darker, matte, metal, MAT, nugget, rand, ring, rock, stone, strut, surface, taper, turn, type V } from './parts';
import type { Material, Object3D } from 'three';

/** Materials and currencies: every one its own silhouette (docs/art.md, icons). */

export const ICON = { exposure: 1.25, box: { w: 32, h: 32 }, ground: 'none' as const, shadow: 0, bloom: 0.25 };
export const seedOf = (id: string): number => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);

export type Mat = { id: string; color: string; accent?: string; icon: string; mark?: string };

export function nuggets(m: Mat): Object3D {
  const acc = m.accent ?? lighter(m.color, 0.5);
  const body = stone(m.color, 0.55);
  const fleck = surface(acc, { rough: 0.15, metal: 0.7, coat: 1 });
  return group(at(nugget(seedOf(m.id), 0.4, 0.4, body, fleck, 8), -0.06, 0, 0.02), at(nugget(seedOf(m.id) + 3, 0.22, 0.24, body, fleck, 4), 0.34, 0, 0.26), at(nugget(seedOf(m.id) + 5, 0.16, 0.16, body, fleck, 3), -0.3, 0, 0.3));
}

export function sand(m: Mat): Object3D {
  const base = matte(m.color, 0.9);
  const heap = lathe([[0.5, 0], [0.46, 0.05], [0.36, 0.14], [0.22, 0.26], [0.1, 0.36], [0.0, 0.4]], 9, base);
  const small = lathe([[0.26, 0], [0.22, 0.05], [0.12, 0.15], [0.0, 0.22]], 8, base);
  const g = group(heap, at(small, 0.36, 0, 0.26));
  const rnd = rand(11);
  const grain = surface(m.accent ?? '#fff6e0', { rough: 0.3, coat: 1 });
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28;
    const r = 0.1 + rnd() * 0.4;
    g.add(at(ball(0.022 + rnd() * 0.012, grain), Math.cos(a) * r, 0.34 * (1 - r / 0.55) + 0.03, Math.sin(a) * r));
  }
  return g;
}

export function lump(m: Mat): Object3D {
  const body = m.id === 'coal' ? surface('#4a4658', { rough: 0.3, coat: 0.8, flat: true }) : stone(m.color, 0.6);
  const sheen = m.id === 'coal' ? surface('#7a7890', { rough: 0.12, metal: 0.3, coat: 1, flat: true }) : surface(m.accent ?? '#f4d3a6', { rough: 0.5, flat: true });
  return group(at(nugget(seedOf(m.id), 0.38, 0.42, body, sheen, 9), -0.05, 0, 0), at(nugget(seedOf(m.id) + 2, 0.26, 0.3, body, sheen, 5), 0.3, 0, 0.22), at(nugget(seedOf(m.id) + 9, 0.17, 0.18, body, sheen, 3), -0.1, 0, 0.36));
}

export function block(m: Mat): Object3D {
  if (m.id === 'lumenite') return group(at(gemCluster(5, m.color, m.accent ?? '#f3e2ff', 5, 1.15), 0, 0, 0), at(rock(rand(2), 0.5, 0.1, stone('#4a3f6e'), 12), 0, 0, 0));
  // silicon carbide: a bevelled block with a lit inlay
  const g = group(bevelBox(0.6, 0.5, 0.6, 0.07, surface(m.color, { rough: 0.2, coat: 1, metal: 0.3 })));
  g.add(at(bevelBox(0.38, 0.04, 0.38, 0.015, surface(lighter(m.color, 0.5), { rough: 0.1, coat: 1 })), 0, 0.49, 0));
  g.add(at(bevelBox(0.18, 0.05, 0.18, 0.02, emissive(m.accent ?? '#b8fff0', 1.6)), 0, 0.5, 0));
  return g;
}

export function stamp(mark: string | undefined, top: number, w: number, mat: Material): Object3D[] {
  const out: Object3D[] = [];
  const y = top - 0.002;
  if (mark === 'line') out.push(at(bevelBox(w * 0.6, 0.02, 0.05, 0.01, mat), 0, y, 0));
  else if (mark === 'ring') out.push(at(ring(w * 0.17, 0.018, mat), 0, y + 0.01, 0));
  else if (mark === 'dot') out.push(at(ball(0.04, mat), 0, y + 0.01, 0));
  else if (mark === 'cross') {
    out.push(at(bevelBox(w * 0.4, 0.02, 0.05, 0.01, mat), 0, y, 0), at(bevelBox(0.05, 0.02, w * 0.3, 0.01, mat), 0, y, 0));
  }
  return out;
}

export function bar(m: Mat): Object3D {
  const body = metal(m.color, 0.28);
  const dark = metal(darker(m.color, 0.35), 0.4);
  const w = 0.82, d = 0.42, h = 0.2;
  const g = group(at(ingot(w, h, d, body), 0, 0, 0));
  g.add(at(bevelBox(w * 0.52, 0.025, d * 0.5, 0.01, dark), 0, h - 0.012, 0));
  for (const s of stamp(m.mark, h + 0.012, w, metal(lighter(m.color, 0.55), 0.2))) g.add(s);
  return turn(g, -0.42);
}

export function ingots(m: Mat): Object3D {
  const body = metal(m.color, 0.26);
  const hi = metal(lighter(m.color, 0.4), 0.2);
  const w = 0.6, d = 0.3, h = 0.17;
  const g = group();
  for (const [x, z] of [[-0.33, 0.22], [0.33, 0.22]] as const) g.add(at(ingot(w, h, d, body), x, 0, z));
  g.add(at(ingot(w, h, d, body), 0, 0, -0.14));
  g.add(at(ingot(w, h, d, body), 0, h * 0.98, 0.1));
  g.add(at(bevelBox(w * 0.4, 0.02, 0.05, 0.01, hi), 0, h * 1.98, 0.1));
  return turn(g, -0.15);
}

export function plates(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.22, metal: 0.45, coat: 0.8 });
  const edge = metal(lighter(m.color, 0.45), 0.2);
  const g = group();
  for (let i = 0; i < 4; i++) {
    g.add(at(turn(bevelBox(0.78, 0.075, 0.6, 0.025, body), (i % 2 ? 0.1 : -0.08) + i * 0.02), (i % 2) * 0.03, i * 0.085, 0));
  }
  g.add(at(bevelBox(0.3, 0.02, 0.04, 0.01, edge), -0.12, 0.34, 0.12));
  g.add(at(ball(0.026, edge), 0.28, 0.35, -0.16));
  return g;
}

export function wafer(m: Mat): Object3D {
  const lit = m.id === 'lumen-glass';
  if (lit) {
    const frame = metal('#4a4f78', 0.3);
    const pane = surface(m.color, { rough: 0.05, coat: 1, metal: 0.1 });
    pane.emissive.set(m.color);
    pane.emissiveIntensity = 0.9;
    pane.userData.glow = true;
    const g = group(at(bevelBox(0.6, 0.06, 0.28, 0.025, frame), 0, 0, 0));
    const p = group(at(bevelBox(0.56, 0.7, 0.07, 0.03, pane), 0, 0, 0), at(bevelBox(0.64, 0.05, 0.1, 0.02, frame), 0, 0.68, 0), at(bevelBox(0.64, 0.05, 0.1, 0.02, frame), 0, -0.01, 0));
    p.add(at(bevelBox(0.3, 0.03, 0.09, 0.012, emissive(m.accent ?? '#e9ddff', 2)), -0.06, 0.4, 0.02));
    g.add(at(p, 0, 0.05, 0));
    return turn(g, -0.5);
  }
  const base = surface(lighter(m.color, 0.2), { rough: 0.12, metal: 0.4, coat: 1 });
  const g = group(at(cylinder(0.42, 0.07, base, 48, 0.02), 0, 0.06, 0));
  const line = metal(m.accent ?? '#b9c6ec', 0.15);
  for (let i = -3; i <= 3; i++) {
    const L = Math.sqrt(Math.max(0, 0.38 ** 2 - (i * 0.11) ** 2)) * 2;
    g.add(at(bevelBox(L, 0.012, 0.012, 0.004, line), 0, 0.134, i * 0.11));
    g.add(at(bevelBox(0.012, 0.012, L, 0.004, line), i * 0.11, 0.134, 0));
  }
  g.add(at(cylinder(0.42, 0.06, MAT.deep, 48, 0.02), 0, 0, 0));
  g.add(at(bevelBox(0.12, 0.08, 0.05, 0.02, MAT.deep), 0.36, 0.06, 0));
  return turn(g, -0.3);
}

export function rods(m: Mat): Object3D {
  const body = surface(m.color, { rough: 0.3, metal: 0.2, coat: 0.7 });
  const tip = metal(m.accent ?? '#a6a2b4', 0.18);
  const g = group();
  const lay: [number, number, number][] = [[0, 0, 0.78], [-0.17, 0.1, 0.62], [0.17, 0.08, 0.66], [-0.05, 0.22, 0.5], [0.1, -0.16, 0.56], [-0.2, -0.1, 0.46]];
  lay.forEach(([x, z, h], i) => {
    g.add(at(cylinder(0.085, h, body, 6, 0.012), x, 0, z));
    g.add(at(cylinder(0.088, 0.04, tip, 6, 0.01), x, h - 0.01, z));
    if (i < 3) g.add(at(cylinder(0.09, 0.03, tip, 6, 0.008), x, h * 0.4, z));
  });
  g.add(at(ring(0.27, 0.014, metal('#8a87a0')), -0.02, 0.28, 0.02));
  return g;
}

export function slag(m: Mat): Object3D {
  const crust = surface(m.color, { rough: 0.9, flat: true });
  const ember = emissive(m.accent ?? '#ff9a4d', 1.3);
  const rnd = rand(4);
  const g = group(at(rock(rnd, 0.46, 0.2, crust, 12, 0.5), 0, 0, 0), at(rock(rnd, 0.28, 0.22, crust, 10, 0.5), 0.2, 0.08, 0.05), at(rock(rnd, 0.18, 0.16, crust, 9, 0.5), -0.25, 0.06, 0.15));
  g.add(at(bevelBox(0.22, 0.012, 0.03, 0.006, ember), -0.02, 0.19, 0.2), at(bevelBox(0.03, 0.012, 0.2, 0.006, ember), 0.05, 0.2, 0.1), at(ball(0.035, ember), -0.3, 0.17, 0.2));
  return g;
}

export function truss(m: Mat): Object3D {
  const bar_ = surface(m.color, { rough: 0.25, metal: 0.7, coat: 0.8 });
  const node = metal(lighter(m.color, 0.5), 0.2);
  const s = 0.34;
  const c: V[] = [];
  for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) c.push([x * s, y * s * 1.7 + 0.04, z * s]);
  const g = group();
  const edge = (a: V, b: V): void => void g.add(strut(a, b, 0.032, bar_));
  const idx = (x: number, y: number, z: number): V => c[x * 4 + y * 2 + z]!;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) edge(idx(x, y, 0), idx(x, y, 1));
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) edge(idx(x, 0, z), idx(x, 1, z));
  for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) edge(idx(0, y, z), idx(1, y, z));
  for (const x of [0, 1]) edge(idx(x, 0, 0), idx(x, 1, 1));
  edge(idx(0, 0, 1), idx(1, 1, 1));
  edge(idx(0, 1, 0), idx(1, 0, 0));
  for (const p of c) g.add(at(ball(0.058, node), p[0], p[1], p[2]));
  return turn(g, 0.2);
}

export function coil(m: Mat): Object3D {
  const copper = metal(m.color, 0.22);
  const bobbin = surface(m.accent ?? '#5d6a94', { rough: 0.4, metal: 0.4, coat: 0.5 });
  const g = group(at(cylinder(0.3, 0.05, bobbin, 36, 0.015), 0, 0, 0), at(cylinder(0.3, 0.05, bobbin, 36, 0.015), 0, 0.52, 0), at(cylinder(0.17, 0.5, bobbin, 24, 0.01), 0, 0.03, 0));
  for (let i = 0; i < 7; i++) {
    g.add(at(ring(0.255, 0.034, copper, 40), 0, 0.1 + i * 0.056, 0));
    g.add(at(ring(0.215, 0.034, copper, 40), 0, 0.12 + i * 0.056, 0));
  }
  g.add(at(ball(0.04, metal('#f2e6c8'), 0.5), 0.1, 0.56, 0.12));
  return g;
}

export function board(m: Mat): Object3D {
  const pcb = surface(m.color, { rough: 0.3, coat: 0.9, metal: 0.1 });
  const gold = metal(m.accent ?? '#ffd98a', 0.2);
  const dark = surface('#161a2e', { rough: 0.25, coat: 1, metal: 0.3 });
  const g = group(at(bevelBox(0.84, 0.07, 0.84, 0.03, pcb), 0, 0, 0));
  g.add(at(bevelBox(0.36, 0.1, 0.36, 0.025, dark), 0, 0.06, 0));
  for (let i = -2; i <= 2; i++) {
    for (const s of [-1, 1]) {
      g.add(at(bevelBox(0.05, 0.05, 0.1, 0.012, gold), i * 0.12, 0.05, s * 0.43));
      g.add(at(bevelBox(0.1, 0.05, 0.05, 0.012, gold), s * 0.43, 0.05, i * 0.12));
    }
  }
  const lit = emissive(lighter(m.color, 0.35), 1.2);
  for (const [x, z, w, d] of [[-0.3, 0.3, 0.2, 0.02], [0.32, -0.3, 0.02, 0.2], [-0.32, -0.28, 0.14, 0.02], [0.3, 0.3, 0.02, 0.14]] as const) g.add(at(bevelBox(w, 0.012, d, 0.005, lit), x, 0.065, z));
  g.add(at(bevelBox(0.1, 0.02, 0.1, 0.01, gold), 0, 0.17, 0), at(ball(0.03, emissive('#ff7a5a', 2.2)), -0.3, 0.09, -0.3));
  return turn(g, -0.4);
}

export function orb(m: Mat): Object3D {
  const core = emissive(m.color, 1.7);
  const cage = metal('#8e92b8', 0.25);
  const g = group(at(cylinder(0.3, 0.1, MAT.panel, 36, 0.03), 0, 0, 0), at(cylinder(0.2, 0.06, cage, 36, 0.02), 0, 0.1, 0));
  g.add(ball(0.3, core, 0.5));
  g.add(at(ball(0.13, emissive(m.accent ?? '#ffffff', 2.4)), -0.08, 0.58, 0.08));
  const r1 = ring(0.37, 0.025, cage, 48);
  const r2 = turn(ring(0.37, 0.025, cage, 48), 0);
  r1.rotation.x = 0.5;
  r2.rotation.z = 0.5;
  g.add(at(r1, 0, 0.5, 0), at(r2, 0, 0.5, 0));
  return g;
}

function chip(m: { color: string }): Object3D {
  const g = group(at(hexCoin(0.46, 0.13, metal(darker(m.color, 0.25), 0.3)), 0, 0, 0), at(hexCoin(0.36, 0.07, metal(m.color, 0.18)), 0, 0.1, 0), at(hexCoin(0.18, 0.05, metal(lighter(m.color, 0.5), 0.15)), 0, 0.16, 0));
  g.add(at(hexCoin(0.34, 0.12, metal(darker(m.color, 0.25), 0.3)), 0.34, 0, 0.4).translateY(0));
  return turn(g, 0.4);
}

function flask(m: { color: string }): Object3D {
  const glass = surface('#bfe8ff', { rough: 0.04, coat: 1, metal: 0 });
  glass.transparent = true;
  glass.opacity = 0.38;
  const liquid = surface(m.color, { rough: 0.2, coat: 1 });
  liquid.emissive.set(m.color);
  liquid.emissiveIntensity = 0.8;
  liquid.userData.glow = true;
  const body = lathe([[0, 0], [0.38, 0], [0.4, 0.04], [0.3, 0.3], [0.13, 0.52], [0.13, 0.78], [0.17, 0.8], [0.17, 0.84]], 40, glass);
  const fill = lathe([[0, 0.01], [0.36, 0.01], [0.38, 0.04], [0.26, 0.27], [0.0, 0.27]], 40, liquid);
  const g = group(body, fill, at(cylinder(0.135, 0.16, matte('#c98a52', 0.7), 24, 0.03), 0, 0.78, 0));
  for (const [x, y, z, r] of [[0.0, 0.14, 0.1, 0.04], [0.1, 0.2, -0.05, 0.028], [-0.1, 0.1, -0.1, 0.022]] as const) g.add(at(ball(r, emissive(lighter(m.color, 0.5), 1.8)), x, y, z));
  g.add(at(ring(0.14, 0.012, metal('#8e92b8')), 0, 0.7, 0));
  return g;
}

export function prism(m: { color: string }): Object3D {
  const glass = crystalMat(m.color, lighter(m.color, 0.25), 0.55);
  const a = cylinder(0.3, 0.95, glass, 3, 0.03);
  a.rotation.z = Math.PI / 2;
  a.position.set(0.47, 0.32, 0);
  const g = group(a);
  g.add(at(bevelBox(0.9, 0.04, 0.5, 0.02, MAT.panel), 0, -0.0, 0));
  a.position.y = 0.36;
  // a thin light split out of the right face
  for (const [i, c] of ['#ff7a8a', '#ffd166', '#7ff0b0', '#7fd4ff'].entries()) g.add(at(bevelBox(0.3, 0.025, 0.02, 0.01, emissive(c, 1.8)), 0.62, 0.22 + i * 0.05, 0.3 + i * 0.015));
  return turn(g, -0.5);
}

export function registerItems(): void {
  for (const c of content.currencies.list as unknown as { id: string; color: string }[]) {
    const f = { credits: chip, research: flask, prisms: prism }[c.id as 'credits'];
    sprite({ id: `icon-${c.id}`, build: () => f(c), ...ICON });
  }
}
export { taper };
