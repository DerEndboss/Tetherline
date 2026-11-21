import { CylinderGeometry, Mesh, type Material, type Object3D } from 'three';
import { at, bevelBox, crystal, crystalMat, cylinder, emissive, group, hull, lathe, rock, smooth, surface, turn, type V } from '../kit';
import { ball, darker, lighter, metal, stone } from '../icons/parts';
import type { Part } from './layout';

/**
 * The ores' own parts (docs/art.md, category ores). Every ore is three builders: `chunk` (its lump, the same
 * silhouette as its material icon in public/art/icons: copper as rounded nuggets, iron as angular rusty
 * blocks, coal as black splinters, sand as low dunes ...), `spike` (its upright crystal form) and `grit` (the
 * tiny pebbles between). Colours come from the material in src/content (`color`, `accent`), so field, item and
 * icon agree. Builders stand on y = 0 at the origin; layout.ts places them.
 */

type Rand = () => number;

export interface Look {
  chunk: (rnd: Rand, p: Part) => Object3D;
  spike: (rnd: Rand, p: Part) => Object3D;
  grit: Material;
  /** Glowing ores light the ground around them in this colour. */
  spill?: string;
}

export interface Tones {
  color: string;
  accent: string;
}

/* ---------- shared builders ---------- */

const lump = (rnd: Rand, p: Part, mat: Material, n = 12, rough = 0.38): Mesh => rock(rnd, p.r, p.h, mat, n, rough);

/** An upright faceted crystal of the part's size, leaning as the layout says. */
function point(rnd: Rand, p: Part, mat: Material, sides = 6, r = p.r): Mesh {
  return crystal(rnd, { r, h: p.h * 0.62, tip: p.h * 0.38, sides, lean: p.lean, jitter: 0.22, phase: p.turn }, mat);
}

/** A crystal lying on its side, half sunk (tumbled shards in a flat field). */
function lying(rnd: Rand, p: Part, mat: Material, sides = 6): Object3D {
  const m = crystal(rnd, { r: p.r * 0.42, h: p.r * 1.4, tip: p.r * 0.7, sides, jitter: 0.25 }, mat);
  m.rotation.z = -Math.PI / 2 + 0.22;
  m.position.set(-p.r * 0.9, p.r * 0.25, 0);
  return group(m);
}

/** A small blob on top of a chunk (a vein, a fleck, a seed). */
function fleck(p: Part, mat: Material, size = 0.32, dx = -0.25): Mesh {
  const b = ball(p.r * size, mat);
  b.scale.set(1, 0.6, 1);
  return at(b, p.r * dx, p.h * 0.82, p.r * 0.2);
}

const glowing = (c: string, power: number): Material => emissive(c, power);

/* ---------- the ores ---------- */

function copper(t: Tones): Look {
  const body = surface(t.color, { rough: 0.28, metal: 0.4, coat: 0.9 });
  const dull = surface(darker(t.color, 0.2), { rough: 0.4, metal: 0.35, coat: 0.5 });
  const crust = surface(t.accent, { rough: 0.5, coat: 0.4, flat: true });
  /** A verdigris crust: a thin faceted patch on one side of the nugget, not a dot. */
  const patina = (rnd: Rand, p: Part): Mesh => at(rock(rnd, p.r * 0.5, p.h * 0.32, crust, 9, 0.45), -p.r * 0.25, p.h * 0.6, p.r * 0.15);
  return {
    chunk: (rnd, p) => group(lump(rnd, p, p.pick < 0.3 ? dull : body, 16, 0.42), ...(p.pick > 0.7 ? [patina(rnd, p)] : [])),
    // copper does not grow crystals: its upright form is a little pile of nuggets
    spike: (rnd, p) => group(lump(rnd, { ...p, r: p.r * 1.5, h: p.h * 0.45 }, body, 14, 0.4), at(lump(rnd, { ...p, r: p.r * 0.95, h: p.h * 0.4 }, p.pick > 0.5 ? dull : body, 12, 0.4), p.r * 0.2, p.h * 0.3, -p.r * 0.1)),
    grit: dull,
  };
}

function iron(t: Tones): Look {
  const body = stone(darker(t.color, 0.15), 0.55);
  const dark = stone(darker(t.color, 0.45), 0.6);
  const vein = surface(t.accent, { rough: 0.3, metal: 0.5, coat: 0.8, flat: true });
  const quartz = surface(lighter(t.accent, 0.2), { rough: 0.18, coat: 1, flat: true });
  return {
    chunk: (rnd, p) => group(lump(rnd, p, p.pick < 0.45 ? dark : body, 8, 0.55), ...(p.pick > 0.6 ? [fleck(p, vein, 0.24, 0.1)] : [])),
    spike: (rnd, p) => point(rnd, p, quartz, 6),
    grit: dark,
  };
}

/** A long thin splinter lying flat (coal). */
function splinter(rnd: Rand, p: Part, mat: Material): Mesh {
  const l = p.r * 1.5;
  const w = p.r * 0.55;
  const pts: V[] = [[-l, 0, 0], [l, 0, (rnd() - 0.5) * w], [0, 0, -w], [0.2 * l, 0, w], [-0.3 * l, p.h * 0.8, 0.1 * w], [0.4 * l, p.h, -0.2 * w], [0, p.h * 0.6, w * 0.6]];
  return hull(pts, mat);
}

function coal(t: Tones): Look {
  const body = surface('#3c3846', { rough: 0.3, coat: 0.8, flat: true });
  const sheen = surface(lighter(t.accent, 0.15), { rough: 0.12, metal: 0.3, coat: 1, flat: true });
  return {
    chunk: (rnd, p) => splinter(rnd, p, p.pick > 0.7 ? sheen : body),
    spike: (rnd, p) => point(rnd, p, p.pick > 0.5 ? sheen : body, 3),
    grit: body,
  };
}

function sand(t: Tones): Look {
  const body = surface(t.color, { rough: 0.9 });
  const crest = surface(lighter(t.color, 0.2), { rough: 0.85 });
  const grain = surface(t.accent, { rough: 0.3, coat: 1 });
  const dune = (p: Part, mat: Material, sides: number): Object3D => {
    const r = p.r * 1.45;
    const m = lathe([[r, 0], [r * 0.75, p.h * 0.16], [r * 0.4, p.h * 0.42], [0, p.h * 0.52]], sides, mat);
    m.scale.set(1.35, 1, 0.42);
    return group(smooth(m));
  };
  return {
    chunk: (_rnd, p) => dune(p, p.pick > 0.5 ? crest : body, 28),
    spike: (_rnd, p) => dune({ ...p, r: p.r * 1.6, h: p.h * 0.55 }, crest, 24),
    grit: grain,
  };
}

function titanium(t: Tones): Look {
  const bed = stone(darker(t.color, 0.45), 0.7);
  const shard = surface(t.color, { rough: 0.2, metal: 0.8, coat: 0.7, flat: true });
  const tip = surface(t.accent, { rough: 0.12, metal: 0.9, coat: 1, flat: true });
  return {
    chunk: (rnd, p) => group(lump(rnd, { ...p, h: p.h * 0.6 }, bed, 10), at(lying(rnd, p, p.pick > 0.5 ? tip : shard, 4), 0, p.h * 0.35, 0)),
    spike: (rnd, p) => point(rnd, p, p.pick > 0.6 ? tip : shard, 4),
    grit: bed,
  };
}

function lead(t: Tones): Look {
  const cube = surface(t.color, { rough: 0.22, metal: 0.75, coat: 0.8 });
  const hi = surface(t.accent, { rough: 0.15, metal: 0.9, coat: 1 });
  const box = (s: number, h: number, mat: Material, tilt: number): Mesh => {
    const b = bevelBox(s, h, s, s * 0.12, mat, 2);
    b.rotation.z = tilt;
    return b;
  };
  return {
    chunk: (_rnd, p) => group(box(p.r * 1.3, p.r * 1.1, p.pick > 0.7 ? hi : cube, (p.pick - 0.5) * 0.3), ...(p.pick < 0.4 ? [at(turn(box(p.r * 0.7, p.r * 0.6, cube, 0.2), 0.6), p.r * 0.6, 0, p.r * 0.5)] : [])),
    spike: (_rnd, p) => group(box(p.r * 1.3, p.h * 0.6, cube, p.lean[0]), at(turn(box(p.r * 0.95, p.h * 0.4, hi, 0), 0.5), 0, p.h * 0.58, 0)),
    grit: cube,
  };
}

function tin(t: Tones): Look {
  const body = surface(t.color, { rough: 0.3, coat: 1, metal: 0.1 });
  const dark = surface(darker(t.color, 0.35), { rough: 0.4, coat: 0.6 });
  const cass = surface('#3a2c28', { rough: 0.15, metal: 0.4, coat: 1, flat: true });
  const pebble = (p: Part, mat: Material): Mesh => {
    const b = ball(p.r, mat);
    b.scale.set(1.1, p.h / p.r, 0.85);
    return at(b, 0, p.h * 0.85, 0);
  };
  return {
    chunk: (_rnd, p) => pebble(p, p.pick < 0.35 ? dark : body),
    spike: (rnd, p) => point(rnd, p, cass, 4),
    grit: body,
  };
}

function bauxite(t: Tones): Look {
  const body = stone(t.color, 0.7);
  const pea = surface(t.accent, { rough: 0.35, coat: 0.6 });
  const peas = (rnd: Rand, p: Part, n: number): Mesh[] =>
    Array.from({ length: n }, () => {
      const a = rnd() * 6.28;
      const d = rnd() * p.r * 0.6;
      return at(ball(p.r * (0.14 + rnd() * 0.1), pea), Math.cos(a) * d, p.h * 0.75, Math.sin(a) * d);
    });
  return {
    chunk: (rnd, p) => group(lump(rnd, p, body, 12, 0.4), ...peas(rnd, p, 3)),
    spike: (rnd, p) => group(lump(rnd, { ...p, r: p.r * 1.5, h: p.h * 0.7 }, body, 10, 0.3), ...peas(rnd, { ...p, h: p.h * 0.9 }, 2)),
    grit: pea,
  };
}

function lithium(t: Tones): Look {
  const body = surface(t.color, { rough: 0.16, coat: 1, metal: 0.05 });
  const tip = glowing(t.accent, 1.4);
  const prism = (r: number, h: number): Object3D => group(cylinder(r, h, body, 6, r * 0.12), at(cylinder(r * 0.82, h * 0.08, tip, 6, r * 0.05), 0, h * 0.95, 0));
  return {
    chunk: (_rnd, p) => {
      const g = prism(p.r * 0.5, p.r * 2.2);
      g.rotation.z = -Math.PI / 2;
      return at(group(g), -p.r * 1.1, p.r * 0.5, 0);
    },
    spike: (_rnd, p) => {
      const g = prism(p.r, p.h);
      g.rotation.set(p.lean[1], 0, -p.lean[0]);
      return group(g);
    },
    grit: body,
    spill: t.accent,
  };
}

function tungsten(t: Tones): Look {
  const dark = surface(t.color, { rough: 0.28, metal: 0.6, coat: 0.7, flat: true });
  const glint = surface(t.accent, { rough: 0.15, metal: 0.9, coat: 1 });
  const slab = (p: Part, mat: Material, stand: number): Mesh => {
    const s = bevelBox(p.r * 2, p.r * 0.45, p.r * 1.3, p.r * 0.12, mat, 1);
    s.rotation.z = stand;
    return s;
  };
  return {
    chunk: (_rnd, p) => group(slab(p, dark, 0.12), at(turn(slab({ ...p, r: p.r * 0.75 }, p.pick > 0.5 ? glint : dark, -0.2), 0.4), 0.02, p.r * 0.4, 0)),
    spike: (_rnd, p) => at(slab({ ...p, r: p.h * 0.5 }, p.pick > 0.5 ? glint : dark, 1.2), 0, p.h * 0.4, 0),
    grit: dark,
  };
}

/** Dark rock with a glowing crack and one small hot crystal (emberite). */
function emberite(t: Tones): Look {
  const rockM = stone('#2c2430', 0.75);
  const hot = glowing(t.color, 1.9);
  const gem = crystalMat(t.color, t.color, 1.4);
  return {
    chunk: (rnd, p) => {
      const crack = at(turn(bevelBox(p.r * 1.3, p.h * 0.12, p.r * 0.12, p.r * 0.05, hot, 1), rnd() * 3), 0, p.h * 0.72, 0);
      return group(lump(rnd, p, rockM, 11, 0.4), crack, ...(p.pick > 0.5 ? [at(point(rnd, { ...p, r: p.r * 0.3, h: p.h * 0.9 }, gem), p.r * 0.2, p.h * 0.5, 0)] : []));
    },
    spike: (rnd, p) => point(rnd, p, gem),
    grit: rockM,
    spill: t.color,
  };
}

function verdite(t: Tones): Look {
  const moss = stone('#3a5a3a', 0.8);
  const gem = crystalMat(t.color, t.accent, 0.9);
  const seed = glowing(t.accent, 2.2);
  return {
    chunk: (rnd, p) => group(lump(rnd, p, moss, 12, 0.36), fleck(p, seed, 0.2, 0.1), ...(p.pick > 0.5 ? [at(lying(rnd, p, gem, 5), 0, p.h * 0.4, 0)] : [])),
    spike: (rnd, p) => point(rnd, p, gem, 5),
    grit: moss,
    spill: t.color,
  };
}

function frostine(t: Tones): Look {
  const ice = crystalMat(t.color, t.accent, 0.5);
  const frost = surface('#dcecf6', { rough: 0.5, coat: 0.6, flat: true });
  return {
    chunk: (rnd, p) => (p.pick < 0.35 ? lump(rnd, p, frost, 10, 0.35) : group(lump(rnd, { ...p, h: p.h * 0.5 }, frost, 9), at(lying(rnd, p, ice), 0, p.h * 0.3, 0))),
    spike: (rnd, p) => point(rnd, p, ice),
    grit: frost,
    spill: t.accent,
  };
}

const HUES = ['#ff7aa8', '#ffd166', '#7ff0b0', '#7fd4ff', '#c78bff'];

function prismite(_t: Tones): Look {
  const bed = stone('#4a3f6e', 0.8);
  const gems = HUES.map((h) => crystalMat(h, lighter(h, 0.4), 1.0));
  const gem = (p: Part): Material => gems[Math.floor(p.pick * gems.length) % gems.length]!;
  return {
    chunk: (rnd, p) => group(lump(rnd, { ...p, h: p.h * 0.7 }, bed, 10), at(lying(rnd, p, gem(p)), 0, p.h * 0.45, 0)),
    spike: (rnd, p) => point(rnd, p, gem(p)),
    grit: bed,
    spill: '#d9a8ff',
  };
}

function scrap(t: Tones): Look {
  const plate = metal(t.color, 0.45);
  const rust = surface(t.accent, { rough: 0.7, metal: 0.3 });
  const piece = (p: Part): Object3D => {
    if (p.pick < 0.3) {
      const cog = cylinder(p.r * 0.9, p.r * 0.3, rust, 9, p.r * 0.06);
      cog.rotation.x = 0.35;
      return group(cog, at(cylinder(p.r * 0.3, p.r * 0.34, plate, 8, p.r * 0.04), 0, 0.01, 0));
    }
    if (p.pick < 0.65) {
      const pipe = new Mesh(new CylinderGeometry(p.r * 0.32, p.r * 0.32, p.r * 2.2, 12), plate);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.y = p.r * 0.32;
      return group(pipe);
    }
    const b = bevelBox(p.r * 2, p.r * 0.18, p.r * 1.4, p.r * 0.06, p.pick > 0.85 ? rust : plate, 1);
    b.rotation.z = 0.3;
    return at(group(b), 0, p.r * 0.25, 0);
  };
  return {
    chunk: (_rnd, p) => piece(p),
    spike: (_rnd, p) => {
      const b = bevelBox(p.r * 1.8, p.h, p.r * 0.3, p.r * 0.08, p.pick > 0.5 ? rust : plate, 1);
      b.rotation.set(p.lean[1], 0, -p.lean[0]);
      return group(b);
    },
    grit: rust,
  };
}

function obsidion(t: Tones): Look {
  const glass = surface(t.color, { rough: 0.04, metal: 0.4, coat: 1, flat: true });
  const core = crystalMat('#3a2a66', t.accent, 0.8);
  const bed = stone('#1a1428', 0.7);
  const shardOf = (rnd: Rand, p: Part): Mesh => {
    const r = p.r;
    const pts: V[] = [[-r, 0, -r * 0.6], [r, 0, -r * 0.5], [r * 0.8, 0, r * 0.7], [-r * 0.7, 0, r * 0.6], [(rnd() - 0.5) * r, p.h, 0], [r * 0.4, p.h * 0.6, r * 0.2]];
    return hull(pts, glass);
  };
  return {
    chunk: (rnd, p) => group(shardOf(rnd, p), ...(p.pick > 0.55 ? [at(lying(rnd, p, core, 5), 0, p.h * 0.3, 0)] : [])),
    spike: (rnd, p) => point(rnd, p, p.pick > 0.4 ? core : glass, 5),
    grit: bed,
    spill: t.accent,
  };
}

/** A plain nugget for an ore nobody modelled yet (a new ore never breaks the render; add its look here). */
function generic(t: Tones): Look {
  const body = stone(t.color, 0.55);
  const fl = surface(t.accent, { rough: 0.15, metal: 0.7, coat: 1 });
  return { chunk: (rnd, p) => group(lump(rnd, p, body), fleck(p, fl)), spike: (rnd, p) => point(rnd, p, fl, 5), grit: body };
}

/** The look of each ore material (`FloorDef.ore`). */
const LOOKS: Record<string, (t: Tones) => Look> = {
  'copper-ore': copper,
  'iron-ore': iron,
  coal,
  sand,
  'titanium-ore': titanium,
  'lead-ore': lead,
  'tin-ore': tin,
  bauxite,
  'lithium-salt': lithium,
  'tungsten-ore': tungsten,
  emberite,
  verdite,
  frostine,
  prismite,
  scrap,
  obsidion,
};

export function lookOf(ore: string, t: Tones): Look {
  return (LOOKS[ore] ?? generic)(t);
}
