import type { Object3D } from 'three';
import { at, bevelBox, group, MAT, plate } from '../kit';

/** The square pad with hazard-striped front edges (same as the mine). Top at y = 0.07. */
export function smallPad(): Object3D {
  const deck = plate(0.92, 0.92, 0.07, MAT.panel, 0.025);
  const inset = at(plate(0.74, 0.74, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const stripes: Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const t = -0.4 + i * 0.1;
    const mat = i % 2 === 0 ? MAT.hazard : MAT.deep;
    stripes.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.07, 0.43));
    stripes.push(at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), 0.43, 0.07, t));
  }
  return group(deck, inset, ...stripes);
}
