import { PointLight, type Group, type Material } from 'three';
import { at, crystal, crystalMat, group, Kit, lightPool, obstacleColors, rand, rock, rockMat, sprite, turn, WORLD } from '../kit';

/**
 * Crystal rubble (exemplar of the look, docs/art.md): a cluster of faceted cyan prisms fanning out of one
 * root, lit from inside, on a bed of dark violet rock with a few broken shards on the ground. Four variants
 * that differ in silhouette (tall spire, wide fan, twin, low bed), never mirrored (the light comes from the left).
 */

const C = obstacleColors('crystal-rubble');

/** Crystal finishes: the main cyan, a deeper blue-cyan for variety inside one cluster, pale tips. */
const CRYSTAL = {
  main: crystalMat(C.main, '#2fd8e8', 0.32),
  deep: crystalMat('#2b9fd0', '#1fb8e8', 0.3),
  pale: crystalMat('#a8f6f2', C.glow, 0.4),
};

const BED = [rockMat(WORLD.ground[1]!), rockMat(WORLD.ground[0]!), rockMat(WORLD.ground[2]!, 0.75)];

interface Prism {
  /** Root position on the ground. */
  x: number;
  z: number;
  r: number;
  h: number;
  tip: number;
  /** Lean direction (radians, 0 = +X) and amount (units per unit of height). */
  dir: number;
  lean: number;
  mat?: Material;
}

/** Hand-placed silhouettes; the rand only adds facet jitter and small offsets. */
const LAYOUTS: Prism[][] = [
  // 0: one tall spire with a fan of mid crystals on its left
  [
    { x: 0.02, z: -0.04, r: 0.12, h: 0.78, tip: 0.3, dir: -2.4, lean: 0.08 },
    { x: -0.1, z: 0.04, r: 0.085, h: 0.46, tip: 0.2, dir: 2.6, lean: 0.42, mat: CRYSTAL.deep },
    { x: 0.1, z: 0.06, r: 0.075, h: 0.36, tip: 0.17, dir: 0.5, lean: 0.5 },
    { x: -0.04, z: 0.14, r: 0.06, h: 0.26, tip: 0.14, dir: 1.6, lean: 0.62, mat: CRYSTAL.pale },
    { x: 0.08, z: -0.16, r: 0.055, h: 0.22, tip: 0.12, dir: -1.2, lean: 0.55, mat: CRYSTAL.deep },
    { x: -0.16, z: -0.1, r: 0.05, h: 0.18, tip: 0.1, dir: -2.8, lean: 0.7 },
  ],
  // 1: a wide fan, no single tall one
  [
    { x: 0, z: 0, r: 0.1, h: 0.52, tip: 0.24, dir: -2.1, lean: 0.22 },
    { x: 0.06, z: 0.04, r: 0.095, h: 0.48, tip: 0.22, dir: 0.3, lean: 0.48, mat: CRYSTAL.deep },
    { x: -0.06, z: 0.06, r: 0.09, h: 0.44, tip: 0.2, dir: 2.3, lean: 0.52 },
    { x: 0.02, z: -0.08, r: 0.07, h: 0.36, tip: 0.17, dir: -1.0, lean: 0.6, mat: CRYSTAL.pale },
    { x: 0.14, z: 0.12, r: 0.05, h: 0.2, tip: 0.11, dir: 0.9, lean: 0.7 },
    { x: -0.18, z: 0.0, r: 0.05, h: 0.16, tip: 0.1, dir: 3.0, lean: 0.75, mat: CRYSTAL.deep },
  ],
  // 2: twin spires leaning apart
  [
    { x: -0.07, z: 0.0, r: 0.105, h: 0.64, tip: 0.26, dir: 2.7, lean: 0.2 },
    { x: 0.08, z: -0.04, r: 0.095, h: 0.56, tip: 0.24, dir: -0.6, lean: 0.24, mat: CRYSTAL.deep },
    { x: 0.0, z: 0.12, r: 0.065, h: 0.3, tip: 0.15, dir: 1.5, lean: 0.55, mat: CRYSTAL.pale },
    { x: 0.16, z: 0.1, r: 0.05, h: 0.2, tip: 0.11, dir: 0.6, lean: 0.6 },
    { x: -0.18, z: -0.12, r: 0.048, h: 0.18, tip: 0.1, dir: -2.4, lean: 0.62 },
  ],
  // 3: a low bed of many short crystals with one leaning blade
  [
    { x: 0.04, z: 0.0, r: 0.09, h: 0.4, tip: 0.22, dir: 0.2, lean: 0.62 },
    { x: -0.08, z: -0.04, r: 0.085, h: 0.3, tip: 0.17, dir: -2.6, lean: 0.35, mat: CRYSTAL.deep },
    { x: -0.02, z: 0.12, r: 0.07, h: 0.24, tip: 0.14, dir: 1.8, lean: 0.4 },
    { x: 0.14, z: -0.12, r: 0.06, h: 0.22, tip: 0.13, dir: -0.9, lean: 0.5, mat: CRYSTAL.pale },
    { x: -0.17, z: 0.08, r: 0.055, h: 0.2, tip: 0.12, dir: 2.6, lean: 0.55 },
    { x: 0.16, z: 0.14, r: 0.045, h: 0.14, tip: 0.09, dir: 0.9, lean: 0.6, mat: CRYSTAL.deep },
    { x: -0.12, z: -0.18, r: 0.045, h: 0.13, tip: 0.09, dir: -1.8, lean: 0.6 },
  ],
];

/** The rock bed: chunky dark stones the crystals grow out of, kept inside the tile. */
const BEDS: (readonly [x: number, z: number, r: number, h: number])[][] = [
  [[0.0, 0.0, 0.3, 0.16], [0.22, 0.16, 0.16, 0.1], [-0.24, 0.12, 0.13, 0.08]],
  [[0.0, 0.02, 0.34, 0.12], [-0.22, -0.18, 0.14, 0.09], [0.24, -0.08, 0.12, 0.07]],
  [[0.0, -0.02, 0.28, 0.15], [0.2, 0.2, 0.14, 0.08], [-0.26, 0.04, 0.12, 0.1], [0.12, -0.24, 0.1, 0.06]],
  [[0.0, 0.0, 0.36, 0.1], [0.26, 0.04, 0.13, 0.08], [-0.2, 0.22, 0.12, 0.07]],
];

/** Broken shards lying on the ground around the bed: [x, z, length, turn]. */
const SHARDS: (readonly [x: number, z: number, len: number, turn: number])[][] = [
  [[0.3, 0.3, 0.14, 0.6], [-0.32, 0.22, 0.1, 2.2]],
  [[0.3, 0.22, 0.12, 1.1], [-0.12, 0.36, 0.1, -0.4], [0.36, -0.2, 0.08, 2.6]],
  [[0.32, 0.12, 0.12, 0.2], [-0.3, 0.3, 0.09, 1.9]],
  [[0.34, 0.26, 0.11, 0.8], [-0.34, -0.06, 0.1, 2.9], [0.06, 0.38, 0.08, -1.2]],
];

function prism(k: Kit, rnd: () => number, p: Prism, rootY: number): Group {
  const lean: readonly [number, number] = [Math.cos(p.dir) * p.lean, Math.sin(p.dir) * p.lean];
  const mesh = crystal(rnd, { r: p.r, h: p.h, tip: p.tip, lean, phase: rnd() * Math.PI, jitter: 0.22 }, p.mat ?? CRYSTAL.main);
  const tipY = p.h + p.tip;
  k.glint(p.x + lean[0] * tipY, rootY + tipY, p.z + lean[1] * tipY);
  return group(at(mesh, p.x, rootY, p.z));
}

function shard(rnd: () => number, s: readonly [number, number, number, number]): Group {
  const [x, z, len, t] = s;
  const m = crystal(rnd, { r: len * 0.28, h: len * 0.6, tip: len * 0.4, jitter: 0.3 }, CRYSTAL.deep);
  m.rotation.z = -Math.PI / 2 + 0.25;
  m.position.set(0, len * 0.22, 0);
  return turn(at(group(m), x, 0, z), t);
}

function cluster(k: Kit, variant: number): Group {
  const rnd = rand(9100 + variant * 31);
  const bed = BEDS[variant]!.map(([x, z, r, h], i) => at(rock(rnd, r, h, BED[i % BED.length]!, 16, 0.32), x, -0.02, z));
  const crystals = LAYOUTS[variant]!.map((p) => prism(k, rnd, p, 0.04));
  const shards = SHARDS[variant]!.map((s) => shard(rnd, s));
  // The crystals light their own bed and the ground around them.
  const spill = new PointLight(C.glow, 1.6, 0.9, 1.6);
  spill.position.set(0.05, 0.3, 0.12);
  return group(lightPool(0.6, C.glow, 0.3), ...bed, ...crystals, ...shards, spill);
}

for (let v = 0; v < 4; v++) sprite({ id: `obstacle-crystal-rubble-${v}`, glow: true, bloom: 0.5, build: (k) => cluster(k, v) });


