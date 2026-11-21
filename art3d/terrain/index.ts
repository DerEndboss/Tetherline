import { Color, DoubleSide, Mesh, MeshStandardMaterial, RingGeometry, SphereGeometry, Float32BufferAttribute, type Group } from 'three';
import { at, between, bevelBox, group, plan, ownedIds, rand, rock, rockMat, sprite, surface, turn, WORLD, ICON_SCALE } from '../kit';

/**
 * Terrain category: ground decals (pebbles, cracks, sand ripples, flat stones), the sky planet and moon.
 * The painted ground, sky and horizon live in src/render (ground-painter.ts, sky.ts). Mist banks keep their SVG.
 */
plan(ownedIds('terrain'));
void ICON_SCALE;

const G = WORLD.ground;
const SKY = WORLD.sky;
const mixC = (a: string, b: string, t: number): string => '#' + new Color(a).lerp(new Color(b), t).getHexString();

// ---------- sky bodies (floating, unlit by the ground: ground 'none') ----------

function bandedSphere(r: number, colors: readonly string[], seed: number): Mesh {
  const geo = new SphereGeometry(r, 72, 48);
  const pos = geo.getAttribute('position');
  const rnd = rand(seed);
  const cols: number[] = [];
  const stops = colors.map((c) => new Color(c));
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / r;
    const x = pos.getX(i) / r;
    // wavy latitude bands with two turbulence swirls
    const t = 0.5 + 0.5 * y + Math.sin(y * 11 + x * 2.2) * 0.05 + Math.sin(y * 29 + 1.3) * 0.02;
    const f = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
    const k = Math.floor(f);
    const c = stops[k]!.clone().lerp(stops[k + 1]!, (f - k) * (f - k) * (3 - 2 * (f - k)));
    c.offsetHSL(0, 0, (rnd() - 0.5) * 0.004);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3));
  const m = surface('#ffffff', { rough: 0.55, coat: 0.25 });
  m.vertexColors = true;
  return new Mesh(geo, m);
}

function planet(): Group {
  const body = bandedSphere(0.9, ['#ffd9c0', '#ffb49a', '#f08aa0', '#d8709a', '#b8609c', '#8a5aa8', '#6a6ab8'], 5);
  (body.material as MeshStandardMaterial).emissive = new Color('#ff9a86');
  (body.material as MeshStandardMaterial).emissiveIntensity = 0.22;
  const ringMat = (c: string, o: number): MeshStandardMaterial => new MeshStandardMaterial({ color: new Color(c), roughness: 0.6, transparent: true, opacity: o, side: DoubleSide, emissive: new Color(c), emissiveIntensity: 0.12 });
  const rings = group();
  for (const [a, b, c, o] of [[1.22, 1.42, mixC(SKY.horizon, '#ffffff', 0.4), 0.7], [1.46, 1.52, mixC(SKY.haze, '#ffffff', 0.2), 0.45], [1.56, 1.84, mixC(SKY.horizon, SKY.haze, 0.5), 0.35]] as const) {
    const m = new Mesh(new RingGeometry(a, b, 128), ringMat(c, o));
    m.rotation.x = -Math.PI / 2;
    rings.add(m);
  }
  rings.rotation.set(0.0, 0, 0.18);
  rings.rotation.x = 0.42;
  const g = group(body, rings);
  g.position.y = 1.2;
  g.rotation.z = -0.1;
  return g;
}
sprite({ id: 'sky-planet', ground: 'none', bloom: 0.5, box: { w: 260, h: 160, fill: 0.98 }, scale: 4, build: () => planet() });

function moon(): Group {
  const rnd = rand(31);
  const body = bandedSphere(0.9, [mixC(SKY.horizon, '#ffffff', 0.7), mixC(SKY.horizon, '#ffffff', 0.55), mixC(SKY.haze, '#ffffff', 0.35)], 9);
  const crater = surface(mixC(SKY.haze, '#2a2040', 0.35), { rough: 0.9 });
  const g = group(body);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.283;
    const e = 0.2 + rnd() * 0.9;
    const r = 0.14 + rnd() * 0.2;
    const c = new Mesh(new SphereGeometry(r, 20, 12, 0, 6.283, 0, 0.5), crater);
    const dir: [number, number, number] = [Math.cos(a) * Math.cos(e) * 0.5 + 0.3, Math.sin(e) * 0.6, Math.abs(Math.sin(a)) * 0.8 + 0.4];
    const l = Math.hypot(...dir);
    c.position.set((dir[0] / l) * 0.9, (dir[1] / l) * 0.9, (dir[2] / l) * 0.9);
    c.lookAt(c.position.clone().multiplyScalar(2));
    c.rotateX(Math.PI / 2);
    c.scale.setScalar(1);
    g.add(c);
  }
  g.position.y = 0.9;
  return g;
}
sprite({ id: 'sky-moon', ground: 'none', bloom: 0.4, box: { w: 48, h: 48, fill: 0.96 }, scale: 6, build: () => moon() });

// ---------- ground decals ----------

const STONE = [rockMat(mixC(G[3]!, '#a58aa8', 0.25)), rockMat(mixC(G[2]!, '#c09a90', 0.2)), rockMat(mixC(G[1]!, '#8a7aa0', 0.3)), rockMat(mixC(G[4]!, '#d8b090', 0.2), 0.7)];
const DUST = rockMat(mixC(G[4]!, G[3]!, 0.6), 0.95);
const DARK = rockMat(mixC(G[0]!, '#000000', 0.55), 0.95);

function pebbles(seed: number, n: number): Group {
  const rnd = rand(seed);
  const g = group();
  for (let i = 0; i < n; i++) {
    const r = between(rnd, 0.035, 0.09);
    g.add(turn(at(rock(rnd, r, r * between(rnd, 0.55, 0.9), STONE[i % STONE.length]!, 12, 0.35), between(rnd, -0.34, 0.34), 0, between(rnd, -0.34, 0.34)), rnd() * 6));
  }
  return g;
}

function crack(seed: number): Group {
  const rnd = rand(seed);
  const g = group();
  const branch = (x: number, z: number, a: number, len: number, w: number, depth: number): void => {
    let px = x;
    let pz = z;
    for (let s = 0; s < 5; s++) {
      const step = len / 5;
      const na = a + between(rnd, -0.55, 0.55);
      const m = bevelBox(step * 1.15, 0.006, w * (1 - s * 0.14), 0.002, DARK, 1);
      m.rotation.y = -na;
      m.position.set(px + (Math.cos(na) * step) / 2, 0.003, pz + (Math.sin(na) * step) / 2);
      // lighter lip along the crack
      const lip = bevelBox(step * 1.1, 0.01, w * 1.9 * (1 - s * 0.12), 0.003, STONE[1]!, 1);
      lip.rotation.y = -na;
      lip.position.set(m.position.x + 0.004, 0.001, m.position.z + 0.004);
      g.add(lip, m);
      px += Math.cos(na) * step;
      pz += Math.sin(na) * step;
      a = na;
      if (depth > 0 && s === 2) branch(px, pz, a + (rnd() < 0.5 ? 0.9 : -0.9), len * 0.5, w * 0.7, depth - 1);
    }
  };
  branch(-0.32, between(rnd, -0.15, 0.15), between(rnd, -0.3, 0.5), 0.5, 0.032, 1);
  g.add(at(rock(rnd, 0.05, 0.035, STONE[0]!, 10, 0.4), 0.3, 0, 0.14), at(rock(rnd, 0.035, 0.025, STONE[2]!, 10, 0.4), 0.22, 0, 0.2));
  return g;
}

function ripples(seed: number): Group {
  const rnd = rand(seed);
  const g = group();
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 3; j++) {
      const m = rock(rnd, between(rnd, 0.08, 0.12), between(rnd, 0.012, 0.02), DUST, 14, 0.2);
      m.scale.set(1.7, 1, 0.45);
      m.rotation.y = -0.45;
      g.add(at(m, -0.3 + j * 0.2 + (k % 2) * 0.07, 0, -0.27 + k * 0.17 + between(rnd, -0.02, 0.02)));
    }
  }
  g.add(at(rock(rnd, 0.04, 0.03, STONE[3]!, 10, 0.3), 0.18, 0, 0.1));
  return g;
}

function slabs(seed: number): Group {
  const rnd = rand(seed);
  const g = group();
  const n = 3;
  for (let i = 0; i < n; i++) {
    const w = between(rnd, 0.14, 0.26);
    const d = between(rnd, 0.1, 0.2);
    const m = bevelBox(w, between(rnd, 0.03, 0.06), d, 0.015, STONE[i % STONE.length]!, 2);
    m.rotation.y = between(rnd, -0.8, 0.8);
    m.rotation.z = between(rnd, -0.05, 0.05);
    g.add(at(m, -0.2 + i * 0.2 + between(rnd, -0.04, 0.04), 0.012, between(rnd, -0.18, 0.18)));
  }
  g.add(at(rock(rnd, 0.05, 0.04, DARK, 10, 0.4), 0.0, 0, 0.3));
  return g;
}

for (let i = 0; i < 10; i++) {
  const kind = i % 5;
  const seed = 9001 + i * 31;
  sprite({
    id: `decal-${i}`,
    shadow: 0.4,
    build: () => (kind === 0 ? pebbles(seed, 4 + (i % 3)) : kind === 3 ? pebbles(seed, 6 + (i % 4)) : kind === 1 ? crack(seed) : kind === 2 ? ripples(seed) : slabs(seed)),
  });
}
