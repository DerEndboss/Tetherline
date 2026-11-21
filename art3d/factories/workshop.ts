import type { Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, emissive, group, lathe, MAT, pipe, ring, rivets, strut, surface, taper, vents } from '../kit';
import { LOOP, machine } from './common';

/**
 * The mechanical machines: graphite press, wire mill, circuit assembler, slag separator. Each has one moving part
 * that stays honest: the plunger, the spool, the pick head, the drum.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;

/** A small hopper (square funnel) on legs: bevelled box tapering down. */
function bin(w: number, h: number, mat = MAT.hull): Object3D {
  const top = bevelBox(w, h * 0.55, w, 0.035, mat);
  const low = at(taper(w * 0.5, w * 0.22, h * 0.5, mat === MAT.hull ? MAT.trim : MAT.hull, 4), 0, 0, 0);
  low.rotation.y = Math.PI / 4;
  return group(at(low, 0, 0, 0), at(top, 0, h * 0.45, 0));
}

/** Graphite press: a hydraulic press with guide columns, the plunger pumps on the black coal. */
machine({
  id: 'graphite-press',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    const press = 0.5 * (0.5 - 0.5 * Math.cos(f.lap)); // 0 raised, 0.25 pressed
    // base block with the die
    parts.push(at(bevelBox(1.1, 0.34, 0.95, 0.07, MAT.hull), -0.05, Y0 - 0.02, -0.02));
    parts.push(at(bevelBox(1.12, 0.07, 0.97, 0.03, MAT.accent), -0.05, Y0 + 0.14, -0.02));
    parts.push(at(bevelBox(0.5, 0.05, 0.5, 0.02, MAT.deep, 2), -0.05, Y0 + 0.32, -0.02));
    // four guide columns and a crown
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(at(cylinder(0.05, 1.0, MAT.steel, 16, 0.01), -0.05 + sx * 0.47, Y0 + 0.32, -0.02 + sz * 0.4));
    parts.push(at(bevelBox(1.12, 0.17, 0.98, 0.06, MAT.trim), -0.05, Y0 + 1.3, -0.02));
    parts.push(at(cylinder(0.2, 0.2, MAT.gunmetal, 28, 0.03), -0.05, Y0 + 1.47, -0.02));
    // plunger on a rod, ram plate underneath
    const drop = press;
    parts.push(at(cylinder(0.075, 0.82, MAT.steel, 20, 0.012), -0.05, Y0 + 0.58 - drop, -0.02));
    parts.push(at(bevelBox(0.74, 0.1, 0.68, 0.035, MAT.gunmetal), -0.05, Y0 + 0.47 - drop, -0.02));
    parts.push(at(bevelBox(0.5, 0.04, 0.46, 0.02, MAT.steel, 2), -0.05, Y0 + 0.43 - drop, -0.02));
    // coal hopper to the back and a chute; graphite rods on a tray at the front
    parts.push(at(bin(0.42, 0.7), -0.6, Y0, -0.55));
    parts.push(pipe([[-0.55, Y0 + 0.5, -0.5], [-0.3, Y0 + 0.55, -0.3], [-0.2, Y0 + 0.38, -0.1]], 0.035, MAT.steel, 0.08));
    parts.push(at(bevelBox(0.42, 0.04, 0.3, 0.015, MAT.steel, 2), 0.7, Y0, 0.05));
    for (let r = 0; r < 4; r++) { const rod = cylinder(0.034, 0.26, surface('#4b5063', { rough: 0.3, metal: 0.2, coat: 0.7 }), 6, 0.006); rod.rotation.z = Math.PI / 2; parts.push(at(rod, 0.7, Y0 + 0.1 + (r % 2) * 0.05, -0.04 + r * 0.05)); }
    // hydraulic hoses and a lit control strip
    parts.push(pipe([[0.52, Y0 + 1.4, 0.42], [0.62, Y0 + 1.0, 0.5], [0.62, Y0 + 0.3, 0.55]], 0.03, MAT.rubber, 0.1));
    parts.push(at(bevelBox(0.36, 0.05, 0.02, 0.01, emissive(TEAL, 1.6 + 0.8 * f.wave), 1), -0.05, Y0 + 0.2, 0.465));
    parts.push(at(vents(4, 0.05, 0.1, 0.035, MAT.deep), 0.52, Y0 + 0.15, 0.47));
    k.vent(-0.05, Y0 + 1.7, -0.02);
    k.goods(0.7, Y0 + 0.2, 0.05);
    return group(...parts);
  },
});

/** Wire mill: a drawing box and a big copper spool that turns (a spoked flange, three spokes). */
machine({
  id: 'wire-mill',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    // machine housing at the back left, with a die plate and a lit strip
    parts.push(at(bevelBox(0.9, 0.62, 0.9, 0.08, MAT.hull), -0.4, Y0 - 0.02, -0.15));
    parts.push(at(bevelBox(0.92, 0.1, 0.92, 0.04, MAT.accent), -0.4, Y0 + 0.14, -0.15));
    parts.push(at(bevelBox(0.7, 0.07, 0.7, 0.03, MAT.trim), -0.4, Y0 + 0.6, -0.15));
    parts.push(at(vents(4, 0.05, 0.14, 0.04, MAT.deep), -0.4, Y0 + 0.3, 0.31));
    parts.push(at(bevelBox(0.36, 0.05, 0.02, 0.01, emissive(TEAL, 1.8), 1), -0.4, Y0 + 0.48, 0.31));
    // the drawing head on the +X side of the housing and the wire strands leading to the spool
    parts.push(at(bevelBox(0.18, 0.28, 0.3, 0.04, MAT.gunmetal), 0.07, Y0 + 0.2, -0.15));
    const copper = emissive('#e0894e', 0.0);
    // spool at the front right: two flanges and a copper-wound barrel, spokes show the turn
    const sx = 0.45;
    const sz = 0.42;
    const base = at(cylinder(0.3, 0.06, MAT.trim, 36), sx, Y0, sz);
    const barrel = at(cylinder(0.2, 0.34, MAT.steel, 36, 0.01), sx, Y0 + 0.06, sz);
    const wound = at(cylinder(0.255, 0.26, copperMat(), 36, 0.015), sx, Y0 + 0.1, sz);
    const lower = at(cylinder(0.31, 0.04, MAT.gunmetal, 36, 0.008), sx, Y0 + 0.06, sz);
    const upper = at(cylinder(0.31, 0.04, MAT.gunmetal, 36, 0.008), sx, Y0 + 0.4, sz);
    parts.push(base, barrel, wound, lower, upper);
    const spin = f.working ? (f.t * Math.PI * 2) / 3 : 0;
    for (let s = 0; s < 3; s++) {
      const a = spin + (s * Math.PI * 2) / 3;
      const spoke = at(bevelBox(0.26, 0.03, 0.06, 0.012, MAT.accent, 1), sx + Math.cos(a) * 0.15, Y0 + 0.445, sz - Math.sin(a) * 0.15);
      spoke.rotation.y = a;
      parts.push(spoke);
    }
    parts.push(at(cylinder(0.05, 0.1, MAT.steel, 16, 0.01), sx, Y0 + 0.44, sz));
    // fine copper strands from the head to the spool
    parts.push(pipe([[0.16, Y0 + 0.32, -0.15], [0.3, Y0 + 0.3, 0.1], [0.36, Y0 + 0.28, 0.3]], 0.011, copperMat(), 0.08));
    parts.push(pipe([[0.16, Y0 + 0.28, -0.1], [0.3, Y0 + 0.26, 0.12], [0.38, Y0 + 0.26, 0.3]], 0.011, copperMat(), 0.08));
    // ore feed
    parts.push(at(bin(0.36, 0.6), -0.7, Y0 + 0.0, -0.62));
    void copper;
    k.vent(-0.4, Y0 + 0.75, -0.15);
    k.goods(0.45, Y0 + 0.5, 0.42);
    return group(...parts);
  },
});

function copperMat(): ReturnType<typeof emissive> {
  const m = emissive('#e0894e', 0.35);
  m.color.set('#b8683a');
  m.roughness = 0.3;
  m.metalness = 0.8;
  return m;
}

/** Circuit assembler: a cabinet with a glass cleanroom lid; a pick head slides on a rail over a green board. */
machine({
  id: 'circuit-assembler',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    parts.push(at(bevelBox(1.5, 0.42, 1.5, 0.08, MAT.hull), 0, Y0 - 0.02, 0));
    parts.push(at(bevelBox(1.52, 0.08, 1.52, 0.03, MAT.accent), 0, Y0 + 0.14, 0));
    // the open work bed: a green board with gold traces and chips, a low rim, the gantry rides over it
    parts.push(at(bevelBox(1.3, 0.05, 1.3, 0.02, MAT.trim), 0, Y0 + 0.4, 0));
    parts.push(at(bevelBox(1.16, 0.03, 1.16, 0.015, MAT.deep, 1), 0, Y0 + 0.44, 0));
    const green = surface('#3aa37b', { rough: 0.25, coat: 1 });
    const gold = surface('#ffd36b', { rough: 0.2, metal: 0.9 });
    parts.push(at(bevelBox(0.82, 0.03, 0.82, 0.012, green, 1), 0, Y0 + 0.47, 0));
    for (let i = -3; i <= 3; i++) {
      parts.push(at(bevelBox(0.7, 0.008, 0.012, 0.003, gold, 1), 0, Y0 + 0.5, i * 0.1));
      if (i % 2 === 0) parts.push(at(bevelBox(0.012, 0.008, 0.6, 0.003, gold, 1), i * 0.1, Y0 + 0.5, 0));
    }
    for (const [x, z, w, d] of [[-0.18, -0.15, 0.2, 0.2], [0.2, -0.2, 0.14, 0.14], [0.15, 0.2, 0.24, 0.16], [-0.25, 0.22, 0.12, 0.12]] as const) {
      parts.push(at(bevelBox(w, 0.05, d, 0.015, MAT.deep, 1), x, Y0 + 0.5, z));
      parts.push(at(bevelBox(w * 0.3, 0.006, d * 0.3, 0.002, gold, 1), x - w * 0.25, Y0 + 0.555, z - d * 0.25));
    }
    // gantry: two side rails, a cross beam along z carrying the pick head, which slides along x
    const hx = -0.34 + 0.68 * (0.5 - 0.5 * Math.cos(f.working ? f.lap : Math.PI * 0.9));
    const hz = 0.18 * Math.sin(f.lap * 2);
    for (const s of [-1, 1]) parts.push(at(bevelBox(0.08, 0.1, 1.3, 0.03, MAT.gunmetal), s * 0.62, Y0 + 0.43, 0));
    parts.push(at(bevelBox(0.07, 0.07, 1.22, 0.025, MAT.steel, 2), hx, Y0 + 0.64, 0));
    for (const s of [-1, 1]) parts.push(at(bevelBox(0.1, 0.22, 0.1, 0.03, MAT.accent, 2), hx, Y0 + 0.5, s * 0.6).translateX(0));
    parts.push(at(bevelBox(0.16, 0.1, 0.16, 0.04, MAT.gunmetal), hx, Y0 + 0.62, hz));
    parts.push(at(cylinder(0.02, 0.14, MAT.steel, 10, 0.004), hx, Y0 + 0.52, hz));
    // status lights and vents on the +Z / +X faces, a chip tray at the +X edge
    parts.push(at(bevelBox(0.7, 0.05, 0.02, 0.01, emissive(TEAL, 1.5 + 1.0 * f.wave), 1), -0.2, Y0 + 0.28, 0.755));
    parts.push(at(vents(5, 0.05, 0.1, 0.04, MAT.deep), 0.4, Y0 + 0.2, 0.756));
    parts.push(at(bevelBox(0.02, 0.05, 0.6, 0.01, emissive(TEAL, 1.2), 1), 0.755, Y0 + 0.28, 0));
    const lamp = k.light(hx, Y0 + 0.6, hz, TEAL, { r: 18, work: true, lamp: false });
    k.goods(0.3, Y0 + 0.5, 0.3);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});

/** Slag separator: a centrifuge; a drum turns under a lit ring, slag in on one side, metal and waste out. */
machine({
  id: 'slag-separator',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    // housing and drum
    parts.push(at(cylinder(0.72, 0.34, MAT.hull, 48, 0.05), 0, Y0 - 0.02, 0));
    parts.push(at(ring(0.725, 0.03, MAT.accent, 48), 0, Y0 + 0.2, 0));
    parts.push(at(cylinder(0.56, 0.12, MAT.trim, 48, 0.02), 0, Y0 + 0.32, 0));
    // rotor with 4 vanes, turning a quarter-step per frame cycle (4 vanes: a quarter turn loops)
    const spin = f.working ? f.t * (Math.PI / 2) : 0.3;
    parts.push(at(cylinder(0.12, 0.28, MAT.steel, 24, 0.02), 0, Y0 + 0.44, 0));
    for (let v = 0; v < 4; v++) {
      const a = spin + (v * Math.PI) / 2;
      const vane = bevelBox(0.5, 0.18, 0.05, 0.015, MAT.gunmetal, 1);
      vane.rotation.y = -a;
      parts.push(at(vane, Math.cos(a) * 0.27, Y0 + 0.44, Math.sin(a) * 0.27));
    }
    parts.push(at(ring(0.54, 0.02, emissive('#ff9a4d', 1.2 + 1.2 * f.wave), 48), 0, Y0 + 0.46, 0));
    // inlet pipe (hot slag) from the back, two outlet chutes on the front faces
    parts.push(pipe([[-0.9, Y0 + 0.5, -0.5], [-0.5, Y0 + 0.8, -0.4], [-0.1, Y0 + 0.8, -0.1], [-0.1, Y0 + 0.62, -0.05]], 0.07, MAT.steel, 0.22));
    parts.push(at(ring(0.075, 0.012, MAT.accent, 20), -0.9, Y0 + 0.5, -0.5));
    parts.push(at(bevelBox(0.3, 0.1, 0.22, 0.03, MAT.steel, 2), 0.78, Y0 + 0.08, 0.2));
    parts.push(at(bevelBox(0.22, 0.1, 0.3, 0.03, MAT.steel, 2), 0.2, Y0 + 0.08, 0.78));
    parts.push(at(bevelBox(0.14, 0.03, 0.12, 0.01, emissive('#ff9a4d', 1.4), 1), 0.82, Y0 + 0.17, 0.2));
    // motor pod and status strip
    parts.push(at(bevelBox(0.36, 0.34, 0.28, 0.05, MAT.trim), -0.55, Y0, 0.55));
    parts.push(at(bevelBox(0.22, 0.05, 0.02, 0.01, emissive(TEAL, 1.8), 1), -0.55, Y0 + 0.22, 0.7));
    parts.push(at(rivets(0.72, 18, 0.012, MAT.steel), 0, Y0 + 0.1, 0));
    for (const a of [0.8, 2.2, 3.7, 5.2]) parts.push(strut([Math.cos(a) * 0.6, Y0 + 0.34, Math.sin(a) * 0.6], [Math.cos(a) * 0.3, Y0 + 0.56, Math.sin(a) * 0.3], 0.012, MAT.steel, 6));
    parts.push(at(lathe([[0.1, 0], [0.12, 0.04], [0.1, 0.08]], 16, MAT.accent), 0, Y0 + 0.72, 0));
    const lamp = k.light(0, Y0 + 0.5, 0, '#ff9a4d', { r: 22, work: true, lamp: false });
    k.vent(0, Y0 + 0.9, 0);
    k.goods(0.78, Y0 + 0.2, 0.2);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});
