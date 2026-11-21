import type { Object3D } from 'three';
import { content } from '../../src/legacy/content';
import { sprite } from '../kit';
import { beam, bolt, coinStack, crate, dish, drill, facing, fist, flame, flat, gear, gem, lander, lens, oreChunk, pick, rotor, star } from './motifs';
import { at, ball, bevelBox, crystalMat, cylinder, emissive, gemCluster, group, lathe, lighter, darker, MAT, metal, rand, ring, rock, strut, surface, taper, turn } from './parts';

/** Relics, techs, skill branches, skills and the no-power badge. */

const ICON = { exposure: 1.25, box: { w: 32, h: 32 }, ground: 'none' as const, shadow: 0, bloom: 0.25 };
const BASE = (r = 0.3, c: string = '#3a4470'): Object3D => group(cylinder(r, 0.07, MAT.panel, 40, 0.025), at(cylinder(r * 0.82, 0.04, metal(c, 0.3), 40, 0.012), 0, 0.07, 0));
const glassOf = (c: string, e = 0.6): ReturnType<typeof surface> => {
  const m = surface(c, { rough: 0.05, coat: 1 });
  m.emissive.set(c);
  m.emissiveIntensity = e;
  m.userData.glow = true;
  return m;
};

type Relic = { id: string; shape: string; color: string; rarity: string };

const scaled = (o: Object3D, k: number): Object3D => {
  o.scale.setScalar(k);
  return o;
};

function relic(r: Relic): Object3D {
  const c = r.color;
  const g = group();
  const rimMetal = r.rarity === 'legendary' ? MAT.gold : r.rarity === 'rare' ? metal('#dfe6f6', 0.2) : metal('#b09a74', 0.3);
  g.add(group(at(cylinder(0.34, 0.07, MAT.panel, 40, 0.025), 0, 0, 0), at(cylinder(0.3, 0.035, rimMetal, 40, 0.01), 0, 0.07, 0)));
  const y0 = 0.1;
  if (r.shape === 'lens') {
    const l = group(ring(0.3, 0.05, rimMetal, 48), at(cylinder(0.27, 0.05, glassOf(c, 0.5), 40, 0.015), 0, -0.025, 0));
    l.rotation.x = Math.PI / 2;
    l.position.set(0, 0.52, 0);
    g.add(l, at(bevelBox(0.14, 0.4, 0.07, 0.03, rimMetal), 0, y0, -0.02));
    if (r.id === 'survey-lens') g.add(at(bevelBox(0.5, 0.012, 0.012, 0.004, MAT.deep), 0, 0.6, 0.06).rotateZ(-0.7) && at(bevelBox(0.26, 0.012, 0.012, 0.004, emissive('#ffffff', 1.5)), -0.04, 0.58, 0.07));
    else g.add(at(ball(0.05, emissive('#ffffff', 2)), -0.09, 0.6, 0.06), at(ring(0.16, 0.01, emissive(lighter(c, 0.4), 1.5), 40), 0, 0.52, 0.04));
  } else if (r.shape === 'shard') {
    const rnd = rand(r.id.length * 13);
    g.add(at(rock(rnd, 0.28, 0.09, surface('#4a4f78', { rough: 0.7, flat: true }), 10), 0, y0, 0));
    g.add(gemCluster(r.id.length, c, lighter(c, 0.3), 5, 1.15));
    g.children[g.children.length - 1]!.position.y = y0 + 0.02;
    if (r.id === 'ember-shard') g.add(at(ball(0.05, emissive('#ffd08a', 2)), 0.12, 0.16, 0.2));
  } else if (r.shape === 'cog') {
    const t = surface(c, { rough: 0.26, metal: 0.5, coat: 0.8 });
    const cg = group(at(cylinder(0.27, 0.12, t, 40, 0.03), 0, -0.06, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      cg.add(at(turn(bevelBox(0.13, 0.12, 0.09, 0.02, t), -a), Math.cos(a) * 0.3, -0.06, Math.sin(a) * 0.3));
    }
    cg.add(at(cylinder(0.11, 0.14, MAT.deep, 24, 0.02), 0, -0.07, 0), at(cylinder(0.045, 0.18, MAT.gold, 16, 0.01), 0, -0.09, 0));
    cg.rotation.x = Math.PI / 2;
    cg.position.set(0, 0.46, 0);
    g.add(cg);
    if (r.id === 'drill-saint') g.add(at(ring(0.38, 0.014, emissive(c, 1.3), 56), 0, 0.46, 0).rotateX(Math.PI / 2));
  } else if (r.shape === 'beacon') {
    if (r.id === 'spare-cell') {
      g.add(at(cylinder(0.17, 0.5, surface('#d6dcec', { rough: 0.25, coat: 0.9 }), 32, 0.03), 0, y0, 0), at(cylinder(0.175, 0.14, emissive(c, 1.5), 32, 0.01), 0, y0 + 0.16, 0), at(cylinder(0.07, 0.07, MAT.gold, 16, 0.01), 0, y0 + 0.5, 0));
    } else {
      g.add(at(taper(0.18, 0.05, 0.42, surface('#d6dcec', { rough: 0.3, coat: 0.9 }), 28), 0, y0, 0), at(cylinder(0.19, 0.05, MAT.accent, 28, 0.015), 0, y0 + 0.05, 0), at(ball(0.13, emissive(c, 2)), 0, y0 + 0.52, 0), at(ring(0.2, 0.014, metal('#dfe6f6'), 32), 0, y0 + 0.52, 0));
    }
  } else if (r.shape === 'tablet') {
    const slab = surface('#7d7aa8', { rough: 0.5, coat: 0.5, flat: false });
    const t = group(at(bevelBox(0.5, 0.72, 0.12, 0.04, slab), 0, 0, 0));
    for (let i = 0; i < 4; i++) t.add(at(bevelBox(0.26 - (i % 2) * 0.1, 0.035, 0.02, 0.01, emissive(c, 1.8)), -0.04 + (i % 2) * 0.04, 0.12 + i * 0.12, 0.065));
    t.add(at(ring(0.07, 0.012, emissive(c, 1.8), 20), 0, 0.6, 0.07).rotateX(Math.PI / 2));
    if (r.id === 'crown-tablet') for (let i = -1; i <= 1; i++) t.add(at(taper(0.07, 0.01, 0.16 + (i === 0 ? 0.06 : 0), MAT.gold, 6), i * 0.17, 0.7, 0));
    t.position.y = y0;
    g.add(t);
  } else if (r.shape === 'seed') {
    if (r.id === 'seed-vault') {
      g.add(at(lathe([[0, 0], [0.24, 0], [0.26, 0.06], [0.26, 0.4], [0.2, 0.5], [0.1, 0.54], [0, 0.55]], 36, glassOf('#cfeee0', 0.15)), 0, y0, 0), at(cylinder(0.27, 0.06, MAT.gold, 36, 0.015), 0, y0, 0), at(cylinder(0.27, 0.06, MAT.gold, 36, 0.015), 0, y0 + 0.45, 0));
      g.add(at(ball(0.11, emissive(c, 1.8)), 0, y0 + 0.24, 0), at(taper(0.012, 0.012, 0.16, surface('#5fc03a', { rough: 0.5 }), 8), 0, y0 + 0.3, 0));
    } else {
      g.add(at(ball(0.2, emissive(c, 1.6)), 0, y0 + 0.28, 0), at(ball(0.1, emissive('#fff6d8', 2.4)), -0.05, y0 + 0.34, 0.08));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(at(taper(0.045, 0.004, 0.24, emissive(c, 1.4), 8).rotateZ(0) && strut([0, y0 + 0.28, 0], [Math.cos(a) * 0.42, y0 + 0.28 + Math.sin(a) * 0.3, 0], 0.014, emissive(lighter(c, 0.4), 1.8)), 0, 0, 0));
      }
    }
  }
  return facing(g);
}

/** Tech icons: one small piece of that technology on a plinth. */
function tech(id: string): Object3D {
  const g = group();
  switch (id) {
    case 'solar-power': {
      g.add(BASE(0.34));
      const p = group(at(bevelBox(0.78, 0.05, 0.56, 0.02, MAT.solar), 0, 0, 0));
      for (let i = -1; i <= 1; i++) p.add(at(bevelBox(0.012, 0.012, 0.54, 0.004, metal('#9fc4ff', 0.2)), i * 0.2, 0.046, 0));
      p.add(at(bevelBox(0.78, 0.012, 0.012, 0.004, metal('#9fc4ff', 0.2)), 0, 0.046, 0));
      p.rotation.x = 0.7;
      p.position.set(0, 0.46, 0);
      g.add(p, strut([-0.3, 0.1, 0.21], [-0.3, 0.3, 0.21], 0.03, MAT.steel), strut([0.3, 0.1, 0.21], [0.3, 0.3, 0.21], 0.03, MAT.steel), strut([0, 0.1, -0.2], [0, 0.62, -0.2], 0.035, MAT.steel), at(ball(0.12, emissive('#ffd98a', 2.2)), 0.34, 0.86, -0.1));
      break;
    }
    case 'machine-tuning':
      g.add(gear('#7fd4ff'));
      for (const [i, y] of [0.2, 0.42, 0.64].entries()) g.add(at(bevelBox(0.05, 0.05, 0.05, 0.015, emissive('#ffd98a', 1.6)), 0.46, y, 0.2 - i * 0.1));
      break;
    case 'deep-survey':
      g.add(dish('#7fd4ff'), at(ring(0.45, 0.012, emissive('#7fd4ff', 1), 56), 0, 0.2, 0));
      break;
    case 'aluminium-smelting': {
      g.add(BASE(0.4));
      g.add(at(lathe([[0.18, 0], [0.3, 0.02], [0.36, 0.3], [0.33, 0.34], [0.3, 0.3], [0.25, 0.08], [0, 0.07]], 36, surface('#454d75', { rough: 0.5, metal: 0.4, coat: 0.4 })), 0, 0.1, 0));
      g.add(at(cylinder(0.3, 0.03, emissive('#ffb066', 1.6), 36, 0.005), 0, 0.34, 0));
      g.add(at(bevelBox(0.3, 0.1, 0.18, 0.04, metal('#cfe4f8', 0.2)), 0.36, 0.1, 0.2));
      break;
    }
    case 'high-voltage': {
      g.add(BASE(0.34));
      g.add(at(taper(0.07, 0.04, 0.8, MAT.steel, 8), 0, 0.1, 0));
      for (const y of [0.35, 0.55, 0.72]) {
        g.add(at(cylinder(0.14 - (y - 0.35) * 0.1, 0.035, surface('#d6dcec', { rough: 0.3, coat: 0.9 }), 28, 0.01), 0, y, 0));
      }
      g.add(at(flat([[0.0, 0.5], [-0.12, 0.26], [0.0, 0.26], [-0.06, 0.0], [0.14, 0.3], [0.03, 0.3], [0.1, 0.5]], 0.1, emissive('#ffe27a', 1.6)), 0.3, 0.1, 0.12));
      break;
    }
    case 'cargo-drones':
      g.add(BASE(0.36), at(crate(), 0, 0.1, 0), scaled(at(rotor('#7fb0ff'), 0, 0.5, 0), 0.7));
      break;
    case 'focused-lasers':
      g.add(lens('#7fe8e0'));
      g.add(at(taper(0.012, 0.012, 0.3, emissive('#ff7a7a', 2), 8), 0.4, 0.5, 0.0).rotateZ(Math.PI / 2));
      break;
    case 'lumen-refining':
      g.add(BASE(0.38), at(gemCluster(3, '#8e74f0', '#e9ddff', 3, 0.8), 0, 0.1, 0), at(ring(0.34, 0.025, metal('#dfe6f6', 0.2), 48), 0, 0.28, 0), at(ring(0.34, 0.012, emissive('#e9ddff', 1.5), 48), 0, 0.34, 0));
      break;
    case 'long-range-survey': {
      g.add(BASE(0.36));
      for (const [x, z] of [[-0.18, -0.14], [0.18, -0.14], [0, 0.2]] as const) g.add(strut([0, 0.5, 0], [x, 0.1, z], 0.02, MAT.steel));
      const t = group(at(cylinder(0.08, 0.6, MAT.hull, 28, 0.02), 0, 0, 0), at(cylinder(0.11, 0.1, MAT.accent, 28, 0.02), 0, 0.5, 0), at(cylinder(0.06, 0.03, emissive('#7fd4ff', 2), 20, 0.005), 0, 0.6, 0));
      t.rotation.z = -1.0;
      t.position.set(-0.1, 0.5, 0);
      g.add(t);
      break;
    }
    case 'overclocked-drones':
      g.add(rotor('#ffb04a'), at(flat([[0.0, 0.5], [-0.12, 0.26], [0.0, 0.26], [-0.06, 0.0], [0.14, 0.3], [0.03, 0.3], [0.1, 0.5]], 0.07, emissive('#ffe27a', 1.6)), 0.36, 0.1, 0.12));
      break;
    default: {
      // megastructures: a tall spire with rings
      g.add(BASE(0.4), at(taper(0.16, 0.03, 0.95, MAT.hull, 24), 0, 0.1, 0));
      for (const [y, r] of [[0.3, 0.3], [0.52, 0.22], [0.72, 0.15]] as const) g.add(at(ring(r, 0.02, emissive('#7fd4ff', 1.5), 48), 0, y, 0));
      g.add(at(ball(0.06, emissive('#ffffff', 2.4)), 0, 1.06, 0));
    }
  }
  return facing(g);
}

const BRANCH: Record<string, { color: string; make: () => Object3D }> = {
  mining: { color: '#ffb04a', make: () => pick('#ffb04a') },
  drones: { color: '#7fb0ff', make: () => rotor('#7fb0ff') },
  crafting: { color: '#ff8a3d', make: () => flame() },
  power: { color: '#ffe27a', make: () => bolt('#ffe27a') },
  clearing: { color: '#7fe8e0', make: () => beam('#7fe8e0') },
  start: { color: '#c58cf0', make: () => lander('#c58cf0') },
};

const EMBLEM: Record<string, (c: string) => Object3D> = {
  'extract-rate': (c) => drill(c),
  'vein-richness': () => gem('#ffb04a', '#ffd98a'),
  'drone-speed': (c) => rotor(c),
  'drone-cost': () => coinStack('#e8b464'),
  'laser-power': (c) => beam(c),
  'crate-size': () => crate(),
  'craft-speed': () => flame(),
  'machine-speed': (c) => gear(c),
  'sell-price': () => coinStack('#ffc65c'),
  'power-output': (c) => bolt(c),
  'fuel-use': () => flame('#ffd08a'),
  'tap-damage': (c) => fist(c),
  'clear-yield': () => oreChunk('#9a7a5a'),
  'relic-luck': () => star('#ffd98a'),
  'start-drones': (c) => rotor(c),
  'start-clear': (c) => beam(c),
  'start-mines': () => drill('#ffb04a'),
  'start-credits': () => coinStack('#ffc65c'),
  'build-speed': (c) => gear(c),
  'prism-yield': () => gem('#d79bff', '#f3e2ff'),
};

function skill(id: string): Object3D {
  const def = content.skills.list.find((s) => s.id === id)!;
  const br = BRANCH[def.branch]!;
  const stat = def.effects[0]!.stat as string;
  const mk = EMBLEM[stat] ?? (() => BRANCH[def.branch]!.make());
  const depth = Math.min(4, content.skills.list.filter((s) => s.branch === def.branch).indexOf(def));
  const g = group();
  const bare = stat === 'drone-cost' || stat === 'sell-price' || stat === 'start-credits' || stat === 'crate-size';
  if (bare) {
    g.add(BASE(0.34));
    const e = mk(br.color);
    e.position.y = 0.1;
    g.add(e);
  } else g.add(mk(br.color));
  g.add(at(ring(0.34, 0.022, emissive(br.color, 1.7), 48), 0, 0.09, 0));
  for (let i = 0; i <= depth; i++) g.add(at(ball(0.036, emissive(br.color, 2.4)), (i - depth / 2) * 0.1, 0.07, 0.33));
  return facing(g);
}

function noPower(): Object3D {
  const disc = group(at(cylinder(0.42, 0.1, surface('#2a1e3a', { rough: 0.3, coat: 0.9 }), 40, 0.02), 0, 0, 0), at(ring(0.38, 0.03, emissive('#ff5a5a', 1.7), 48), 0, 0.1, 0));
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.5;
  const g = group(at(cylinder(0.2, 0.08, MAT.panel, 32, 0.025), 0, 0, 0), at(cylinder(0.05, 0.12, MAT.steel, 12, 0.01), 0, 0.06, 0), disc);
  const b = flat([[0.0, 0.5], [-0.12, 0.26], [0.0, 0.26], [-0.06, 0.0], [0.14, 0.3], [0.03, 0.3], [0.1, 0.5]], 0.08, emissive('#ffd98a', 1.5));
  b.position.set(0, 0.25, 0.08);
  b.scale.setScalar(1.1);
  const slash = bevelBox(0.8, 0.06, 0.06, 0.02, emissive('#ff5a5a', 2));
  slash.position.set(0, 0.5, 0.14);
  slash.rotation.z = -0.8;
  g.add(b, slash);
  return g;
}

export function registerMisc(): void {
  for (const r of content.relics.list as unknown as Relic[]) sprite({ id: `relic-${r.id}`, build: () => relic(r), ...ICON });
  for (const t of content.techs.list) sprite({ id: `tech-${t.id}`, build: () => tech(t.id), ...ICON });
  for (const b of content.skillBranches.list) sprite({ id: `skill-branch-${b.id}`, build: () => facing(BRANCH[b.id]!.make()), ...ICON });
  for (const s of content.skills.list) sprite({ id: `skill-${s.id}`, build: () => skill(s.id), ...ICON });
  sprite({ id: 'fx-no-power', build: () => facing(noPower()), ...ICON });
}
export { crystalMat, darker, lathe, rock };
