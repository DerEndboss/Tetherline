import { Mesh, TorusGeometry, type Material, type Object3D } from 'three';
import { at, bevelBox, group, MAT, plate } from '../kit';

/** Helpers of the mega machines (v2): a stepped plinth and a torus with all the segments the pipeline needs. */

/** A torus lying flat around Y: major radius `r`, tube radius `tube`, optional arc (radians) starting at angle 0 on +X. */
export function torus(r: number, tube: number, mat: Material, arc = Math.PI * 2, tubular = 64, radial = 20): Mesh {
  const geo = new TorusGeometry(r, tube, radial, tubular, arc);
  geo.rotateX(Math.PI / 2);
  // TorusGeometry runs counter-clockwise in XY; after the turn the arc runs from +X towards +Z (positive angle = towards +Z)
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A vertical hoop (a torus standing on its edge) whose plane contains Y and the direction at angle `a` from +X. */
export function hoop(r: number, tube: number, mat: Material, a: number, sides = 32): Mesh {
  const geo = new TorusGeometry(r, tube, 12, sides);
  const m = new Mesh(geo, mat);
  // the geometry's ring lies in XY; turn it so it lies in the plane spanned by Y and the tangent at `a`
  m.rotation.y = -a;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The mega plinth: the square pad of a big building with a raised inner platform. Top of the edge is y = 0.07. */
export function megaPad(n: number): Object3D {
  const w = n - 0.08;
  const deck = plate(w, w, 0.07, MAT.panel, 0.03);
  const inset = at(plate(w - 0.2, w - 0.2, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const stripes: Object3D[] = [];
  const edge = w / 2 - 0.05;
  const count = Math.floor((w - 0.1) / 0.1);
  for (let i = 0; i < count; i++) {
    const t = -((count - 1) * 0.1) / 2 + i * 0.1;
    const mat = i % 2 === 0 ? MAT.hazard : MAT.deep;
    stripes.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.07, edge));
    stripes.push(at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), edge, 0.07, t));
  }
  // raised platform: leaves the outer 0.45 free for belt gates
  const inner = at(plate(w - 0.9, w - 0.9, 0.06, MAT.hull, 0.03), 0, 0.07, 0);
  const rim = at(plate(w - 0.84, w - 0.84, 0.02, MAT.accent, 0.01), 0, 0.07, 0);
  return group(deck, inset, ...stripes, rim, inner);
}

/** Smoothly peaked weight for a segment at angle `a` when the bright head sits at `head` (0..1 plus a 0.5 floor). */
export function headGlow(a: number, head: number, sharp = 5): number {
  const d = Math.cos(a - head);
  return Math.max(0, d) ** sharp;
}
