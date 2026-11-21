import { type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, MAT, pipe, ring, rivets, strut, surface, taper, vents } from '../kit';
import { LOOP, machine } from './common';

/**
 * The liquid machines: refinery (distillation tower, flare) and coolant mixer (a vat with an agitator). Liquids
 * stay inside the model; the game draws pipes and flow on top.
 */

const Y0 = 0.07;
const TEAL = COLORS.tech;
const COOLANT = '#7ff0e8';

/** Horizontal tank on saddles (lies along x or z). */
function tankH(len: number, r: number, along: 'x' | 'z', mat = MAT.hull): Object3D {
  const body = lathe([[0, -len / 2], [r * 0.7, -len / 2], [r, -len / 2 + r * 0.25], [r, len / 2 - r * 0.25], [r * 0.7, len / 2], [0, len / 2]], 36, mat);
  const band = at(ring(r + 0.003, 0.014, MAT.accent, 36), 0, 0, 0);
  const g = group(body, band);
  g.children.forEach((c) => c.rotation.set(along === 'z' ? Math.PI / 2 : 0, 0, along === 'x' ? Math.PI / 2 : 0));
  g.children[1]!.rotation.set(along === 'z' ? 0 : 0, 0, 0);
  return g;
}

/** Refinery: distillation column with bands and ladder, a pipe rack, a spherical tank and a small flare. */
machine({
  id: 'refinery',
  size: 3,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    // main column
    const cx = -0.5;
    const cz = -0.45;
    const colH = 2.2;
    parts.push(at(cylinder(0.48, colH, MAT.hull, 40, 0.06), cx, Y0, cz));
    for (const y of [0.45, 0.95, 1.45, 1.95]) parts.push(at(ring(0.485, 0.025, y > 1.9 ? MAT.accent : MAT.trim, 40), cx, Y0 + y, cz));
    parts.push(at(dome(0.48, 0.28, MAT.hull, 40, 8), cx, Y0 + colH, cz));
    parts.push(at(cylinder(0.04, 0.3, MAT.steel, 12, 0.006), cx, Y0 + colH + 0.26, cz));
    parts.push(at(rivets(0.49, 28, 0.012, MAT.steel), cx, Y0 + 0.2, cz));
    parts.push(at(cylinder(0.56, 0.12, MAT.trim, 40, 0.03), cx, Y0, cz));
    // second, shorter column (the stabiliser) and a lit service tower strip
    const sx = 0.25;
    parts.push(at(cylinder(0.28, 1.4, MAT.hull, 32, 0.04), sx, Y0, -0.7));
    for (const y of [0.4, 0.9]) parts.push(at(ring(0.285, 0.018, MAT.accent, 32), sx, Y0 + y, -0.7));
    parts.push(at(dome(0.28, 0.2, MAT.hull, 32, 8), sx, Y0 + 1.4, -0.7));
    // pipe rack between the columns and the tanks
    parts.push(pipe([[cx + 0.46, Y0 + 1.7, cz], [-0.05, Y0 + 1.7, -0.55], [sx - 0.25, Y0 + 1.3, -0.7]], 0.045, MAT.steel, 0.12));
    parts.push(pipe([[cx + 0.46, Y0 + 0.9, cz + 0.1], [0.1, Y0 + 0.5, 0.0], [0.45, Y0 + 0.4, 0.3]], 0.05, MAT.accent, 0.14));
    parts.push(pipe([[cx + 0.4, Y0 + 0.35, cz + 0.4], [-0.1, Y0 + 0.3, 0.3], [0.2, Y0 + 0.3, 0.8]], 0.04, MAT.steel, 0.12));
    // storage: two horizontal tanks on saddles at the front, an orange-banded sphere
    const t1 = at(tankH(0.9, 0.24, 'z'), 0.75, Y0 + 0.26, 0.55);
    parts.push(t1);
    for (const dz of [-0.3, 0.3]) parts.push(at(bevelBox(0.3, 0.12, 0.08, 0.02, MAT.gunmetal), 0.75, Y0, 0.55 + dz));
    parts.push(at(bevelBox(0.5, 0.3, 0.3, 0.05, MAT.trim), -0.4, Y0, 1.05));
    parts.push(at(bevelBox(0.34, 0.05, 0.02, 0.01, emissive(TEAL, 1.6), 1), -0.4, Y0 + 0.2, 1.21));
    parts.push(at(vents(4, 0.05, 0.1, 0.04, MAT.deep), -0.4, Y0 + 0.06, 1.21));
    // ladder up the column
    for (const dz of [-0.04, 0.04]) parts.push(at(cylinder(0.01, 2.0, MAT.gunmetal, 6, 0.002), cx + 0.15, Y0 + 0.15, cz + 0.45 + dz));
    for (let y = 0.3; y < 2.0; y += 0.22) parts.push(at(bevelBox(0.015, 0.015, 0.1, 0.004, MAT.gunmetal, 1), cx + 0.15, Y0 + y, cz + 0.45));
    // flare stack at the back right with a flickering flame: the one animated part
    const fx = 0.95;
    const fz = -0.95;
    parts.push(at(cylinder(0.05, 1.7, MAT.steel, 14, 0.01), fx, Y0, fz));
    parts.push(at(cylinder(0.09, 0.1, MAT.accent, 14, 0.015), fx, Y0 + 1.7, fz));
    const flick = 1.0 + 0.18 * Math.sin(f.lap * 3) + 0.1 * Math.sin(f.lap * 5 + 1);
    const flame = taper(0.07, 0.0, 0.22 * flick, emissive('#ffa24a', 2.4 + 0.6 * f.wave), 10);
    parts.push(at(flame, fx, Y0 + 1.79, fz));
    parts.push(at(taper(0.04, 0.0, 0.14 * flick, emissive('#fff1c0', 3), 10), fx, Y0 + 1.8, fz));
    parts.push(strut([fx, Y0 + 0.4, fz], [fx - 0.25, Y0 + 1.2, fz + 0.1], 0.012, MAT.gunmetal, 6));
    parts.push(strut([fx, Y0 + 0.4, fz], [fx + 0.0, Y0 + 1.2, fz + 0.28], 0.012, MAT.gunmetal, 6));
    // beacon on the column top blinks with the work frames
    const lamp = k.light(cx, Y0 + colH + 0.58, cz, COLORS.beacon, { r: 14, phase: 0.3 });
    k.light(fx, Y0 + 1.85, fz, '#ffa24a', { r: 22, work: true, lamp: false });
    k.vent(cx, Y0 + colH + 0.58, cz);
    k.goods(0.75, Y0 + 0.55, 0.55);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});

/** Coolant mixer: a round vat with a cyan surface and an agitator; blades and the swirl streaks turn. */
machine({
  id: 'coolant-mixer',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const parts: Object3D[] = [];
    const vx = -0.1;
    const vz = -0.05;
    const r = 0.62;
    // vat: a hull cylinder with an open top, a cyan liquid disc below the rim
    const wall = lathe([[0.5, 0], [r - 0.05, 0], [r, 0.05], [r + 0.02, 0.15], [r + 0.02, 0.78], [r - 0.02, 0.82], [r - 0.07, 0.8], [r - 0.07, 0.2], [0.5, 0.2]], 56, MAT.hull);
    parts.push(at(wall, vx, Y0, vz));
    parts.push(at(ring(r + 0.025, 0.016, MAT.accent, 56), vx, Y0 + 0.3, vz));
    parts.push(at(ring(r + 0.025, 0.014, MAT.steel, 56), vx, Y0 + 0.62, vz));
    parts.push(at(rivets(r + 0.025, 24, 0.012, MAT.steel), vx, Y0 + 0.46, vz));
    const level = 0.7 - 0.02 * f.wave;
    parts.push(at(cylinder(r - 0.075, level - 0.2, emissive(COOLANT, 0.9 + 0.4 * f.wave), 56, 0.005), vx, Y0 + 0.2, vz));
    // swirl streaks on the surface turning one step per frame
    for (let s = 0; s < 3; s++) {
      const a = f.lap + (s * Math.PI * 2) / 3;
      const streak = bevelBox(0.3, 0.006, 0.035, 0.003, emissive('#e6fffc', 1.6), 1);
      streak.rotation.y = -a - 0.6;
      parts.push(at(streak, vx + Math.cos(a) * 0.32, Y0 + level + 0.003, vz + Math.sin(a) * 0.32));
    }
    // agitator: a motor on a bridge, a shaft and two blades turning with the frames
    parts.push(at(bevelBox(1.4, 0.07, 0.14, 0.03, MAT.gunmetal), vx, Y0 + 0.87, vz));
    parts.push(at(cylinder(0.16, 0.26, MAT.trim, 28, 0.03), vx, Y0 + 0.94, vz));
    parts.push(at(cylinder(0.1, 0.06, MAT.accent, 28), vx, Y0 + 1.2, vz));
    parts.push(at(cylinder(0.025, 0.55, MAT.steel, 10, 0.004), vx, Y0 + 0.4, vz));
    for (let b = 0; b < 2; b++) {
      const a = f.lap * 0.5 + b * Math.PI;
      const blade = bevelBox(0.3, 0.025, 0.07, 0.01, MAT.steel, 1);
      blade.rotation.y = -a;
      parts.push(at(blade, vx + Math.cos(a) * 0.15, Y0 + 0.5, vz + Math.sin(a) * 0.15));
    }
    // inlets: water pipe from the front, titanium chute on the back, outlet pipe on the +X face
    parts.push(pipe([[vx + 0.45, Y0 + 0.7, vz + 0.45], [vx + 0.45, Y0 + 1.0, vz + 0.3], [vx + 0.2, Y0 + 1.02, vz + 0.1]], 0.05, MAT.steel, 0.14));
    parts.push(at(bevelBox(0.3, 0.12, 0.28, 0.03, MAT.trim), vx - 0.4, Y0 + 0.84, vz - 0.5));
    parts.push(strut([vx - 0.4, Y0 + 0.95, vz - 0.5], [vx - 0.2, Y0 + 0.74, vz - 0.3], 0.07, MAT.steel, 10));
    parts.push(pipe([[vx + r + 0.02, Y0 + 0.3, vz], [0.78, Y0 + 0.3, vz], [0.78, Y0 + 0.1, vz + 0.1]], 0.06, MAT.accent, 0.12));
    parts.push(at(bevelBox(0.4, 0.3, 0.14, 0.04, MAT.trim), 0.4, Y0, 0.78));
    parts.push(at(bevelBox(0.26, 0.05, 0.02, 0.01, emissive(TEAL, 1.8), 1), 0.4, Y0 + 0.2, 0.86));
    parts.push(at(vents(3, 0.05, 0.08, 0.03, MAT.deep), 0.4, Y0 + 0.08, 0.86));
    k.light(vx, Y0 + 0.95, vz, COOLANT, { r: 24, work: true, lamp: false });
    k.vent(vx, Y0 + 1.3, vz);
    k.goods(0.78, Y0 + 0.3, vz);
    void surface;
    return group(...parts);
  },
});
