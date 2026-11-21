import { Mesh, SphereGeometry, type Material, type Object3D } from 'three';
import { at, bendArc, bevelBox, bends, cable, COLORS, cylinder, emissive, group, heading, MAT, model, rotating, slab, type Kit } from '../kit';

/**
 * Conduits and their pieces: a ceramic pipe on a square slab, open at the middle of every edge, with a lit window
 * that shows the liquid (the game tints it per liquid). Built heading +X, turned by the heading.
 */

const SLAB = 0.045;
/** Pipe axis height and radius. */
const AXIS = 0.17;
const R = 0.11;
const LIQUID = emissive('#7cc8ee', 1.5);
const GLASS = MAT.glass;

/** A cylinder lying along X from x0 to x1 at height `y` (z offset `z`). */
function xCyl(x0: number, x1: number, r: number, mat: Material, y = AXIS, z = 0, sides = 24): Object3D {
  const c = cylinder(r, x1 - x0, mat, sides, Math.min(0.01, r * 0.2));
  c.rotation.z = -Math.PI / 2;
  c.position.set(x0, y, z);
  return c;
}

/** The collar that closes a pipe end at a tile edge: a steel ring that the next tile's collar meets. */
function collar(x: number, accent = false): Object3D {
  return group(xCyl(x - 0.035, x + 0.035, R + 0.028, accent ? MAT.accent : MAT.steel), xCyl(x - 0.01, x + 0.01, R + 0.036, MAT.gunmetal));
}

function straight(): Object3D {
  const pipe = xCyl(-0.5, 0.5, R, MAT.hull);
  const window = group(xCyl(-0.17, 0.17, R + 0.006, GLASS), xCyl(-0.15, 0.15, R * 0.62, LIQUID));
  const bands = [-0.3, 0.3].map((x) => xCyl(x - 0.02, x + 0.02, R + 0.012, MAT.accent));
  const saddle = [-0.3, 0, 0.3].map((x) => at(bevelBox(0.07, AXIS - SLAB, 0.16, 0.015, MAT.trim, 2), x, SLAB, 0));
  return group(slab(1, 1, SLAB, MAT.panel), ...saddle, pipe, window, ...bands, collar(-0.465), collar(0.465));
}

/** A quarter-circle pipe from the middle of a side edge to the front edge. */
function elbow(side: 'l' | 'r'): Object3D {
  const { cx, cz, a0, a1 } = bendArc(side);
  const arc = (r: number, n = 14): [number, number, number][] => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), AXIS, cz + r * Math.sin(a)];
  });
  const pipe = cable(arc(0.5), R, MAT.hull, 24);
  const mid = arc(0.5, 10).slice(3, 8);
  const window = group(cable(mid, R + 0.006, GLASS, 20), cable(mid, R * 0.62, LIQUID, 14));
  const sideCollar = heading(group(collar(-0.465)), side === 'r' ? 3 : 1);
  // the side collar sits at the side edge, pointing along z
  const edge = at(sideCollar, 0, 0, 0);
  const posts = [0.3, 0.7].map((f) => {
    const a = a0 + (a1 - a0) * f;
    return at(bevelBox(0.14, AXIS - SLAB, 0.14, 0.02, MAT.trim, 2), cx + 0.5 * Math.cos(a), SLAB, cz + 0.5 * Math.sin(a));
  });
  return group(slab(1, 1, SLAB, MAT.panel), ...posts, pipe, window, edge, collar(0.465));
}

rotating('conduit', (_k: Kit, rot: number) => heading(straight(), rot), { bloom: 0.25 });
bends('conduit', (_k: Kit, side, rot) => heading(elbow(side), rot), { bloom: 0.25 });

model('conduit-junction', () => {
  const hub = at(bevelBox(0.4, 0.26, 0.4, 0.06, MAT.hull), 0, SLAB, 0);
  const band = at(bevelBox(0.41, 0.03, 0.41, 0.012, MAT.accent, 1), 0, SLAB + 0.11, 0);
  const stubs = [0, 1, 2, 3].map((q) => heading(group(xCyl(0.15, 0.5, R, MAT.hull), collar(0.465)), q));
  const cross = [at(bevelBox(0.24, 0.012, 0.03, 0.004, LIQUID, 1), 0, SLAB + 0.265, 0), at(bevelBox(0.03, 0.012, 0.24, 0.004, LIQUID, 1), 0, SLAB + 0.265, 0)];
  return group(slab(1, 1, SLAB, MAT.panel), hub, band, ...stubs, ...cross);
}, { bloom: 0.25 });

model('liquid-router', (k: Kit) => {
  k.light(0, 0.42, 0, '#7cc8ee', { r: 9, phase: 0.3, size: 0.018 });
  const ball = new Mesh(new SphereGeometry(0.22, 32, 20), MAT.hull);
  ball.castShadow = true;
  ball.receiveShadow = true;
  ball.position.set(0, AXIS + 0.04, 0);
  const band = at(cylinder(0.225, 0.03, MAT.accent, 32, 0.008), 0, AXIS + 0.02, 0);
  const eye = new Mesh(new SphereGeometry(0.07, 16, 10), LIQUID);
  eye.position.set(0, AXIS + 0.25, 0);
  const stubs = [0, 1, 2, 3].map((q) => heading(group(xCyl(0.15, 0.5, R, MAT.hull), collar(0.465)), q));
  return group(slab(1, 1, SLAB, MAT.panel), ...stubs, ball, band, eye);
}, { bloom: 0.25 });

rotating('conduit-bridge', (k: Kit, rot: number) => {
  k.light(0.12, 0.5, 0.12, COLORS.beacon, { r: 9, phase: 0.2, size: 0.018 });
  const tower = at(bevelBox(0.5, 0.28, 0.5, 0.06, MAT.hull), 0, SLAB, 0);
  const band = at(bevelBox(0.51, 0.03, 0.51, 0.012, MAT.accent, 1), 0, SLAB + 0.2, 0);
  const inlet = group(xCyl(-0.5, -0.2, R, MAT.hull), collar(-0.465));
  const coil = [0.07, 0.15].map((y) => at(cylinder(0.17, 0.035, MAT.steel, 28, 0.008), 0, SLAB + 0.28 + y - 0.07, 0));
  const emit = xCyl(0.2, 0.3, R * 0.85, LIQUID, SLAB + 0.15);
  const mast = at(cylinder(0.014, 0.2, MAT.steel, 10, 0.004), 0.12, SLAB + 0.28, 0.12);
  return heading(group(slab(1, 1, SLAB, MAT.panel), tower, band, inlet, ...coil, emit, mast), rot);
}, { bloom: 0.25 });

