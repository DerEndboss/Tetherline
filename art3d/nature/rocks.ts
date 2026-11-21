import { PointLight, type Group, type Material, type Mesh } from 'three';
import { at, bevelBox, crystal, crystalMat, group, hull, lightPool, obstacleColors, rand, rock, rockMat, sprite, turn, WORLD, type V } from '../kit';

/** Boulders: chunky faceted stone clusters with strata bands, chipped edges and tiny mineral flecks. */
const C = obstacleColors('boulder');
const STONE = [rockMat(C.main, 0.78), rockMat('#9d5a4e', 0.8), rockMat('#7a4258', 0.82), rockMat(C.shade, 0.85)];
const GRIT = [rockMat(WORLD.ground[1]!), rockMat(WORLD.ground[2]!, 0.8)];
const FLECK = crystalMat('#e9c9a8', '#ffcf9a', 0.35);

/** [x, z, r, h, material] */
const LAYOUTS: (readonly [number, number, number, number, number])[][] = [
  [[0.02, -0.02, 0.4, 0.62, 0], [0.3, 0.26, 0.17, 0.2, 1], [-0.3, 0.22, 0.14, 0.14, 2]],
  [[-0.14, -0.1, 0.34, 0.56, 1], [0.2, 0.12, 0.3, 0.4, 0], [-0.1, 0.34, 0.13, 0.14, 3]],
  [[0.0, -0.06, 0.32, 0.84, 2], [0.3, 0.12, 0.2, 0.3, 0], [-0.28, 0.2, 0.16, 0.2, 1], [0.06, 0.34, 0.1, 0.1, 3]],
  [[0.0, 0.0, 0.46, 0.38, 0], [-0.12, -0.1, 0.26, 0.62, 1], [0.34, 0.24, 0.14, 0.15, 3]],
];

function boulder(variant: number): Group {
  const rnd = rand(4100 + variant * 17);
  const parts: Mesh[] = [];
  const flecks: Mesh[] = [];
  for (const [x, z, r, h, m] of LAYOUTS[variant]!) {
    const body = rock(rnd, r, h, STONE[m]!, 22, 0.34);
    parts.push(at(body, x, -0.02, z));
    // a lighter cap facet and a dark strata band so big stones read as layered rock
    if (r > 0.25) {
      parts.push(at(rock(rnd, r * 0.62, h * 0.32, STONE[(m + 1) % 4]!, 14, 0.3), x - r * 0.12, h * 0.8, z - r * 0.05));
      parts.push(at(rock(rnd, r * 1.04, h * 0.1, GRIT[0]!, 16, 0.2), x, h * 0.34, z));
      for (let i = 0; i < 3; i++) {
        const a = rnd() * 6.28;
        flecks.push(at(crystal(rnd, { r: 0.018, h: 0.05, tip: 0.04, lean: [0.2, 0.1], jitter: 0.3 }, FLECK), x + Math.cos(a) * r * 0.55, h * (0.3 + rnd() * 0.3), z + Math.sin(a) * r * 0.55));
      }
    }
  }
  const pebbles: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 6.28;
    const d = 0.42 + rnd() * 0.12;
    pebbles.push(at(rock(rnd, 0.03 + rnd() * 0.04, 0.03 + rnd() * 0.03, GRIT[i % 2]!, 9, 0.3), Math.cos(a) * d, -0.005, Math.sin(a) * d * 0.9));
  }
  return group(...parts, ...flecks, ...pebbles);
}

for (let v = 0; v < 4; v++) sprite({ id: `obstacle-boulder-${v}`, build: () => boulder(v) });

/** keep unused helpers referenced for lint */
export const _unused: [typeof PointLight, typeof bevelBox, typeof hull, typeof lightPool, typeof turn, V?, Material?] | undefined = undefined;
