import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, hull, lathe, MAT, pipe, ring, surface, taper, vents, type V } from '../kit';
import { LOOP, machine } from './common';

/**
 * The alternative-path machines: alloy furnace, pulverizer, carbon synthesizer, atmospheric condenser. The last two
 * are the clean, futuristic ones (white pods, cyan or pale green light), the first two are heavy industry.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const EMBER = '#ff8a3d';

/** Alloy furnace: a wide block with three crucible lids; the lids glow in turn, three vents and a stack. */
machine({
  id: 'alloy-furnace',
  size: 3,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    parts.push(at(bevelBox(2.35, 0.7, 1.7, 0.12, MAT.hull), -0.15, Y0 - 0.02, 0.1));
    parts.push(at(bevelBox(2.37, 0.12, 1.72, 0.05, MAT.accent), -0.15, Y0 + 0.2, 0.1));
    parts.push(at(bevelBox(2.1, 0.1, 1.5, 0.05, MAT.trim), -0.15, Y0 + 0.66, 0.1));
    // three crucibles on top: a collar, a domed lid with a glowing seam
    for (let i = 0; i < 3; i++) {
      const x = -0.85 + i * 0.7;
      const hot = f.working ? 0.5 + 0.5 * Math.cos(f.lap - i * 2.094) : 0.35;
      parts.push(at(cylinder(0.3, 0.2, MAT.trim, 36, 0.04), x, Y0 + 0.74, 0.1));
      parts.push(at(dome(0.26, 0.2, MAT.hull, 32, 8), x, Y0 + 0.94, 0.1));
      parts.push(at(ring(0.3, 0.02, emissive(EMBER, 0.8 + 2.4 * hot), 36), x, Y0 + 0.92, 0.1));
      parts.push(at(cylinder(0.05, 0.12, MAT.steel, 12, 0.01), x, Y0 + 1.12, 0.1));
    }
    // three glowing slits on the +X... front doors on +Z, one per crucible
    for (let i = 0; i < 3; i++) {
      const x = -0.85 + i * 0.7;
      const hot = f.working ? 0.5 + 0.5 * Math.cos(f.lap - i * 2.094) : 0.35;
      parts.push(at(bevelBox(0.42, 0.34, 0.08, 0.03, MAT.deep, 2), x, Y0 + 0.14, 0.97));
      parts.push(at(bevelBox(0.3, 0.22, 0.04, 0.02, emissive(EMBER, 0.8 + 2.0 * hot), 1), x, Y0 + 0.2, 1.0));
    }
    // manifold pipe along the back and a tall stack
    parts.push(pipe([[-0.85, Y0 + 1.15, -0.45], [0.0, Y0 + 1.3, -0.5], [0.8, Y0 + 1.3, -0.5], [1.0, Y0 + 1.7, -0.6]], 0.06, MAT.steel, 0.18));
    parts.push(at(cylinder(0.12, 1.9, MAT.hull, 28), 1.0, Y0, -0.6));
    parts.push(at(ring(0.125, 0.014, MAT.accent, 28), 1.0, Y0 + 0.5, -0.6));
    parts.push(at(ring(0.125, 0.014, MAT.accent, 28), 1.0, Y0 + 1.6, -0.6));
    parts.push(at(lathe([[0.14, 1.89], [0.145, 1.93], [0.1, 1.95], [0.1, 1.92]], 28, MAT.deep), 1.0, Y0, -0.6));
    // control cabinet with lit strip on the +X side
    parts.push(at(bevelBox(0.2, 0.5, 0.6, 0.05, MAT.trim), 1.2, Y0, 0.5));
    parts.push(at(bevelBox(0.02, 0.06, 0.4, 0.01, emissive(TEAL, 1.8), 1), 1.31, Y0 + 0.34, 0.5));
    parts.push(at(vents(4, 0.05, 0.1, 0.04, MAT.deep), -0.1, Y0 + 0.5, 0.96));
    k.light(-0.15, Y0 + 0.8, 1.0, EMBER, { r: 30, work: true, lamp: false });
    k.vent(1.0, Y0 + 2.0, -0.6);
    k.goods(1.3, Y0 + 0.3, 0.5);
    return group(...parts);
  },
});

/** A toothed crusher roller lying along z. */
function roller(len: number, r: number, teeth: number, angle: number): Object3D {
  const g = group();
  const core = cylinder(r, len, MAT.steel, 24, 0.01);
  core.rotation.x = Math.PI / 2;
  core.position.z = -len / 2;
  g.add(core);
  for (let i = 0; i < teeth; i++) {
    const a = angle + (i / teeth) * Math.PI * 2;
    for (const z of [-len * 0.2, -len * 0.5, -len * 0.8]) {
      const t = bevelBox(0.07, 0.07, 0.12, 0.015, MAT.gunmetal, 1);
      t.rotation.z = a;
      g.add(at(t, Math.cos(a) * r, Math.sin(a) * r, z));
    }
  }
  return g;
}

/** Pulverizer: a hopper over a crusher box; two toothed rollers turn; ground sand heaps in the chute. */
machine({
  id: 'pulverizer',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    parts.push(at(bevelBox(1.2, 0.5, 1.2, 0.08, MAT.hull), -0.1, Y0 - 0.02, -0.1));
    parts.push(at(bevelBox(1.22, 0.08, 1.22, 0.03, MAT.accent), -0.1, Y0 + 0.14, -0.1));
    // open top with two rollers
    parts.push(at(bevelBox(1.0, 0.07, 1.0, 0.03, MAT.deep), -0.1, Y0 + 0.46, -0.1));
    const step = f.working ? (f.t * Math.PI * 2) / 6 : 0;
    const r1 = roller(0.8, 0.17, 6, step);
    r1.position.set(-0.28, Y0 + 0.58, 0.3);
    const r2 = roller(0.8, 0.17, 6, -step + 0.5);
    r2.position.set(0.04, Y0 + 0.58, 0.3);
    parts.push(r1, r2);
    // hopper rising over the rollers on posts
    parts.push(at(taper(0.55, 0.26, 0.55, MAT.trim, 4), -0.1, Y0 + 0.95, -0.1).rotateY(Math.PI / 4));
    parts.push(at(bevelBox(0.9, 0.08, 0.9, 0.03, MAT.accent, 2), -0.1, Y0 + 1.4, -0.1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(at(cylinder(0.04, 0.5, MAT.gunmetal, 10, 0.006), -0.1 + sx * 0.46, Y0 + 0.5, -0.1 + sz * 0.46));
    // chute and a heap of sand on the +X side
    parts.push(at(bevelBox(0.35, 0.05, 0.4, 0.02, MAT.steel, 2), 0.72, Y0 + 0.1, -0.1));
    parts.push(at(lathe([[0.2, 0], [0.12, 0.08], [0.0, 0.14]], 9, surface('#e3c88f', { rough: 0.9 })), 0.75, Y0 + 0.14, -0.1));
    // motor and lit strip on the +Z face
    parts.push(at(cylinder(0.14, 0.34, MAT.trim, 20, 0.03), 0.5, Y0, 0.62).rotateX(0));
    parts.push(at(bevelBox(0.5, 0.05, 0.02, 0.01, emissive(TEAL, 1.5 + 0.8 * f.wave), 1), -0.3, Y0 + 0.3, 0.505));
    k.vent(-0.1, Y0 + 1.5, -0.1);
    k.goods(0.75, Y0 + 0.25, -0.1);
    k.light(-0.1, Y0 + 0.6, 0.0, TEAL, { r: 16, work: true, lamp: false });
    return group(...parts);
  },
});

/** Carbon synthesizer: clean and futuristic: a white pod, a cyan core ring and a diamond that spins above it. */
machine({
  id: 'carbon-synthesizer',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    parts.push(at(cylinder(0.75, 0.3, MAT.hull, 56, 0.06), 0, Y0 - 0.02, 0));
    parts.push(at(ring(0.755, 0.025, MAT.accent, 56), 0, Y0 + 0.2, 0));
    parts.push(at(ring(0.755, 0.02, emissive('#7fe3ff', 1.4 + 0.8 * f.wave), 56), 0, Y0 + 0.28, 0));
    parts.push(at(cylinder(0.5, 0.1, MAT.trim, 48, 0.03), 0, Y0 + 0.28, 0));
    // pylon with a glass-dark sleeve; the diamond floats above it
    parts.push(at(cylinder(0.22, 0.5, MAT.hull, 32, 0.04), 0, Y0 + 0.38, 0));
    parts.push(at(cylinder(0.24, 0.12, MAT.glass, 32, 0.02), 0, Y0 + 0.6, 0));
    parts.push(at(ring(0.26, 0.015, emissive('#7fe3ff', 2.0), 32), 0, Y0 + 0.66, 0));
    // the diamond: an octahedron-ish crystal turning on Y
    const dia: V[] = [[0, 0.5, 0], [0.18, 0.28, 0], [0, 0.28, 0.18], [-0.18, 0.28, 0], [0, 0.28, -0.18], [0, 0, 0]];
    const gem = hull(dia, surface('#bfeaff', { rough: 0.05, coat: 1, metal: 0.1 }));
    gem.rotation.y = f.working ? f.lap / 4 : 0.4;
    parts.push(at(gem, 0, Y0 + 0.95, 0));
    parts.push(at(ring(0.34, 0.012, emissive('#7fe3ff', 1.2), 40), 0, Y0 + 1.1, 0));
    // water inlet pipe and graphite chute, a clean lit strip
    parts.push(pipe([[-0.9, Y0 + 0.35, -0.3], [-0.5, Y0 + 0.4, -0.2], [-0.3, Y0 + 0.4, 0.0]], 0.07, MAT.accent, 0.16));
    parts.push(at(bevelBox(0.3, 0.08, 0.22, 0.03, MAT.steel, 2), 0.78, Y0 + 0.08, 0.3));
    parts.push(at(bevelBox(0.5, 0.05, 0.02, 0.01, emissive('#7fe3ff', 1.6), 1), 0.1, Y0 + 0.15, 0.75));
    k.light(0, Y0 + 1.05, 0, '#7fe3ff', { r: 26, work: true, lamp: false });
    k.vent(0, Y0 + 1.3, 0);
    k.goods(0.8, Y0 + 0.2, 0.3);
    return group(...parts);
  },
});

/** Atmospheric condenser: a slim tower of cooling fins under a big fan; pale green gas collects in a tank. */
machine({
  id: 'atmospheric-condenser',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    const gas = '#c9e6a8';
    parts.push(at(cylinder(0.62, 0.3, MAT.hull, 48, 0.05), -0.1, Y0 - 0.02, -0.1));
    parts.push(at(ring(0.625, 0.022, MAT.accent, 48), -0.1, Y0 + 0.2, -0.1));
    // fin stack: alternating discs
    for (let i = 0; i < 8; i++) parts.push(at(cylinder(i % 2 ? 0.46 : 0.5, 0.05, i % 2 ? MAT.trim : MAT.hull, 40, 0.01), -0.1, Y0 + 0.3 + i * 0.1, -0.1));
    parts.push(at(cylinder(0.2, 1.1, MAT.steel, 24, 0.02), -0.1, Y0 + 0.3, -0.1));
    // fan ring on top with four blades turning
    parts.push(at(ring(0.52, 0.04, MAT.hull, 48), -0.1, Y0 + 1.15, -0.1));
    parts.push(at(ring(0.52, 0.022, emissive(gas, 1.3), 48), -0.1, Y0 + 1.19, -0.1));
    const step = f.working ? f.t * (Math.PI / 2) : 0.3;
    for (let b = 0; b < 4; b++) {
      const a = step + (b * Math.PI) / 2;
      const blade = bevelBox(0.4, 0.025, 0.14, 0.01, MAT.steel, 1);
      blade.rotation.set(0.25, -a, 0);
      parts.push(at(blade, -0.1 + Math.cos(a) * 0.26, Y0 + 1.17, -0.1 + Math.sin(a) * 0.26));
    }
    parts.push(at(cylinder(0.1, 0.1, MAT.accent, 20, 0.02), -0.1, Y0 + 1.16, -0.1));
    // collection tank and compressor on the front
    parts.push(at(cylinder(0.22, 0.6, MAT.hull, 28, 0.04), 0.6, Y0, 0.45));
    parts.push(at(cylinder(0.225, 0.14, emissive(gas, 0.7 + 0.5 * f.wave), 28, 0.01), 0.6, Y0 + 0.2, 0.45));
    parts.push(at(dome(0.22, 0.14, MAT.hull, 28, 6), 0.6, Y0 + 0.6, 0.45));
    parts.push(pipe([[0.32, Y0 + 0.9, -0.1], [0.55, Y0 + 0.85, 0.2], [0.6, Y0 + 0.72, 0.4]], 0.04, MAT.steel, 0.1));
    parts.push(at(bevelBox(0.4, 0.28, 0.16, 0.04, MAT.trim), -0.35, Y0, 0.7));
    parts.push(at(bevelBox(0.26, 0.05, 0.02, 0.01, emissive(TEAL, 1.8), 1), -0.35, Y0 + 0.18, 0.78));
    k.light(-0.1, Y0 + 1.3, -0.1, gas, { r: 26, work: true, lamp: false });
    k.vent(-0.1, Y0 + 1.5, -0.1);
    k.goods(0.6, Y0 + 0.4, 0.45);
    return group(...parts);
  },
});
