import { Group, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, lightPool, LOOP_FPS, MAT, ring, rivets, slab, strut, turn, vents, workLoop, WORLD, type Kit } from '../kit';

/**
 * Mass driver (3x3): a long rail launcher on a square deck. The barrel points up and out along +X. While powered it
 * plays a work loop (kit/loop.ts): a charge runs up the coils to the muzzle; the barrel itself stays still.
 */

const FRAMES = 12;

const DECK = 0.07;
const LIGHT = emissive(COLORS.tech, 2.2);
const WARM = emissive(COLORS.accent, 1.8);

function barrel(frame: number): Object3D {
  const g = new Group();
  const len = 1.9;
  // built along +X, then lifted by the pitch about the pivot
  const tube = turn(cylinder(0.17, len, MAT.hull, 32, 0.03), 0);
  tube.rotation.z = -Math.PI / 2;
  tube.position.set(-0.2, 0, 0);
  g.add(tube);
  for (const [i, x] of [0.15, 0.55, 0.95, 1.35].entries()) {
    const coil = ring(0.2, 0.035, MAT.steel, 32);
    coil.rotation.z = Math.PI / 2;
    coil.rotation.x = 0;
    coil.position.set(x, 0, 0);
    g.add(coil);
    const charge = Math.max(0, Math.cos(Math.PI * 2 * (frame / FRAMES - i / 5))) ** 3;
    const glow = ring(0.205, 0.012, frame < 0 ? LIGHT : emissive(COLORS.tech, 0.8 + 3 * charge), 32);
    glow.rotation.z = Math.PI / 2;
    glow.position.set(x + 0.07, 0, 0);
    g.add(glow);
  }
  const flash = frame < 0 ? 0 : Math.max(0, Math.cos(Math.PI * 2 * (frame / FRAMES - 4 / 5))) ** 3;
  const muzzle = cylinder(0.12, 0.06, flash > 0.3 ? emissive('#bff6ff', 1 + 2.5 * flash) : MAT.deep, 24, 0.01);
  muzzle.rotation.z = -Math.PI / 2;
  muzzle.position.set(len - 0.2, 0, 0);
  g.add(muzzle);
  g.rotation.z = 0.5;
  return g;
}

function massDriver(k: Kit, frame: number): Object3D {
  k.light(-0.2, 1.0, 0, COLORS.beacon, { r: 14, phase: 0.2, size: 0.03 });
  k.wire(-0.55, 0.95, -0.5);
  k.goods(0.2, 0.3, 0);
  const pad = [slab(3, 3, DECK, MAT.panel), at(bevelBox(2.7, 0.02, 2.7, 0.01, MAT.trim, 1), 0, DECK, 0), lightPool(1.2, WORLD.tech, 0.08)];
  const edge = [-1, 1].map((s) => at(bevelBox(0.2, 0.012, 2.4, 0.005, MAT.hazard, 1), s * 1.2, DECK + 0.02, 0));
  const base = at(lathe([[0, 0], [0.8, 0], [0.82, 0.03], [0.74, 0.16], [0.5, 0.28], [0, 0.3]], 40, MAT.hull), 0, DECK, 0);
  const band = at(cylinder(0.83, 0.03, MAT.accent, 40, 0.008), 0, DECK + 0.07, 0);
  const cradle = at(bevelBox(0.5, 0.42, 0.9, 0.06, MAT.trim), -0.25, DECK + 0.3, 0);
  const pivot = at(group(barrel(frame)), -0.25, DECK + 0.62, 0);
  const struts = [-1, 1].map((s) => strut([-0.5, DECK + 0.3, s * 0.4], [0.25, DECK + 0.78, s * 0.2], 0.03, MAT.gunmetal));
  const ventRow = at(vents(5, 0.1, 0.05, 0.04, MAT.deep), 0.9, DECK + 0.2, 1.1);
  const caps = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => group(at(cylinder(0.14, 0.2, MAT.gunmetal, 16, 0.03), a! * 1.2, DECK, b! * 1.2), at(dome(0.05, 0.03, WARM, 12, 3), a! * 1.2, DECK + 0.2, b! * 1.2)));
  return group(...pad, ...edge, base, band, cradle, pivot, ...struts, ventRow, ...caps, at(rivets(0.8, 24, 0.012, MAT.trim), 0, DECK + 0.1, 0), at(dome(0.14, 0.1, MAT.glass, 20, 5), 0.2, DECK + 0.3, 0.4));
}

workLoop({ key: 'building-mass-driver', count: FRAMES, fps: LOOP_FPS, build: massDriver }, {}, { idleSprite: true });
