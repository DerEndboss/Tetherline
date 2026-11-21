import type { Material, Object3D } from 'three';
import { RIDGE_VARIANTS, ridgeId, ridgeIds } from '../../src/render/world/ore-art';
import { at, group, hull, plan, rand, rock, rockMat, sprite, type V } from '../kit';

/**
 * Ridge rock: the unbuildable rock tiles of the map, as a block of faceted stone that fills its whole tile (so a
 * ridge of many tiles reads as one rock mass with seams), a jagged top with a few boulders and a strata band.
 * Neutral light grey: the game tints it with the theme's ridge colour (rust, moss, ice). Clearly taller and
 * bigger than any ore chunk, so coal or obsidion never pass for rock.
 */

const STONE: Material[] = [rockMat('#cfc8c2', 0.8), rockMat('#bdb5ae', 0.82), rockMat('#e0dad4', 0.78)];

/**
 * The block: a hull of a full-tile square at the bottom, nearly vertical cliff sides (so neighbouring blocks join
 * into one plateau instead of a row of cushions) and an uneven, faceted top.
 */
function block(rnd: () => number, h: number): Object3D {
  const pts: V[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    pts.push([sx * 0.5, 0, sz * 0.5]);
    pts.push([sx * (0.5 - rnd() * 0.03), h * (0.62 + rnd() * 0.12), sz * (0.5 - rnd() * 0.03)]);
  }
  for (const [ex, ez] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) pts.push([ex * 0.5, h * (0.7 + rnd() * 0.15), ez * 0.5]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd() * 0.3;
    const r = 0.36 + rnd() * 0.1;
    pts.push([Math.max(-0.47, Math.min(0.47, Math.cos(a) * r * 1.25)), h * (0.86 + rnd() * 0.22), Math.max(-0.47, Math.min(0.47, Math.sin(a) * r * 1.25))]);
  }
  return hull(pts, STONE[Math.floor(rnd() * STONE.length)]!);
}

/** [x, z, r, h] of the boulders on top of each variant (hand placed, the rand only jitters). */
const TOPS: (readonly [number, number, number, number])[][] = [
  [[-0.12, -0.1, 0.22, 0.2], [0.18, 0.12, 0.13, 0.12]],
  [[0.06, -0.14, 0.18, 0.24], [-0.2, 0.14, 0.14, 0.1], [0.22, 0.2, 0.1, 0.08]],
  [[-0.04, 0.02, 0.26, 0.16]],
  [[-0.18, -0.16, 0.16, 0.18], [0.14, -0.02, 0.2, 0.14], [-0.06, 0.24, 0.1, 0.08]],
];

function ridge(variant: number): Object3D {
  const rnd = rand(5300 + variant * 41);
  const h = 0.22 + variant * 0.012;
  const parts: Object3D[] = [block(rnd, h)];
  for (const [x, z, r, bh] of TOPS[variant]!) parts.push(at(rock(rnd, r, bh, STONE[Math.floor(rnd() * STONE.length)]!, 12, 0.4), x, h * 0.75, z));
  return group(...parts);
}

for (let v = 0; v < RIDGE_VARIANTS; v++) sprite({ id: ridgeId(v), build: () => ridge(v), scale: 4, shadow: 0.5, bloom: 0 });
plan(ridgeIds());
