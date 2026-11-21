import { PointLight, type Material, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, MAT, pipe, ring, rivets, taper, turn, vents } from '../kit';
import { LOOP, machine } from './common';

/**
 * The hot machines: smelter, silicon smelter, glass kiln, steel foundry. Heat is the one orange glow (the
 * smelter's door, the foundry's ladle); the silicon smelter's arc glows in the player's teal. Work animation is
 * small and honest: the furnace mouth breathes, a bar slides out, the electrodes dip, a pane rolls out, the
 * ladle tips and pours.
 */

const Y0 = 0.07;
const EMBER = '#ff8a3d';
const AMBER = '#ffb060';

/** Round kiln body with the orange band: straight wall, a shoulder and a flat lid. */
function kilnBody(r: number, h: number): Object3D {
  const body = lathe([[0, 0], [r - 0.07, 0], [r, 0.07], [r + 0.02, 0.2], [r + 0.02, h * 0.74], [r * 0.9, h * 0.9], [r * 0.62, h * 0.98], [r * 0.58, h], [0, h]], 56, MAT.hull);
  const band = lathe([[r + 0.022, 0.24], [r + 0.03, 0.26], [r + 0.03, 0.38], [r + 0.022, 0.4]], 56, MAT.accent);
  const foot = lathe([[r + 0.005, 0.0], [r + 0.03, 0.02], [r + 0.03, 0.13], [r + 0.015, 0.15]], 56, MAT.trim);
  const hoop = at(ring(r + 0.025, 0.012, MAT.steel, 56), 0, h * 0.6, 0);
  const bolts = at(rivets(r + 0.03, 24, 0.012, MAT.steel), 0, h * 0.5, 0);
  return group(body, band, foot, hoop, bolts);
}

function chimney(h: number, r = 0.1): Object3D {
  const stack = cylinder(r, h, MAT.hull, 28);
  const bands = [h * 0.3, h - 0.3].map((y) => at(ring(r + 0.003, 0.012, MAT.accent, 28), 0, y, 0));
  const lip = lathe([[r + 0.015, h - 0.01], [r + 0.018, h + 0.03], [r - 0.015, h + 0.04], [r - 0.015, h + 0.02]], 28, MAT.deep);
  const foot = cylinder(r + 0.04, 0.05, MAT.trim, 28);
  return group(stack, ...bands, lip, foot);
}

/** Arched furnace door on +X at (x, z): frame, glowing mouth, bars. */
function furnaceDoor(x: number, z: number, y: number, mouth: Material): Object3D {
  const frame = at(bevelBox(0.14, 0.44, 0.5, 0.045, MAT.trim), x, y, z);
  const arch = at(bevelBox(0.14, 0.1, 0.4, 0.04, MAT.trim), x, y + 0.4, z);
  const m = at(bevelBox(0.05, 0.3, 0.34, 0.03, mouth, 2), x + 0.07, y + 0.07, z);
  const bars = [-0.08, 0, 0.08].map((dz) => at(bevelBox(0.014, 0.3, 0.014, 0.004, MAT.gunmetal, 1), x + 0.1, y + 0.07, z + dz));
  const sill = at(bevelBox(0.18, 0.04, 0.4, 0.015, MAT.steel, 2), x + 0.08, y - 0.01, z);
  return group(frame, arch, m, ...bars, sill);
}

machine({
  id: 'smelter',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const kx = -0.12;
    const kz = -0.08;
    const parts: Object3D[] = [at(kilnBody(0.6, 0.95), kx, Y0, kz)];
    parts.push(furnaceDoor(kx + 0.55, kz, Y0 + 0.08, emissive(EMBER, 1.9 + 1.5 * f.wave)));
    // output tray: a steel trough with rails; the finished bar slides along it (frames), not in the idle picture
    parts.push(at(bevelBox(0.3, 0.05, 0.3, 0.02, MAT.steel, 2), kx + 0.86, Y0 + 0.07, kz));
    for (const dz of [-0.15, 0.15]) parts.push(at(bevelBox(0.3, 0.06, 0.03, 0.01, MAT.trim, 1), kx + 0.86, Y0 + 0.12, kz + dz));
    if (f.working) {
      const x = kx + 0.76 + f.t * 0.2;
      parts.push(at(bevelBox(0.18, 0.07, 0.12, 0.025, MAT.steel, 2), x, Y0 + 0.12, kz));
      parts.push(at(bevelBox(0.13, 0.012, 0.07, 0.005, emissive(EMBER, 2.2 * (1 - f.t)), 1), x, Y0 + 0.19, kz));
    }
    // feed hopper on the lid
    const hopper = group(lathe([[0.07, 0], [0.24, 0.2], [0.26, 0.25]], 36, MAT.steel), at(ring(0.26, 0.014, MAT.accent, 36), 0, 0.25, 0));
    parts.push(at(hopper, kx, Y0 + 0.95, kz));
    // chimney and a duct from the lid
    parts.push(at(chimney(1.5), 0.5, Y0, -0.72));
    parts.push(pipe([[kx + 0.15, Y0 + 0.97, kz - 0.15], [0.3, Y0 + 1.15, -0.5], [0.5, Y0 + 1.15, -0.72]], 0.035, MAT.steel, 0.1));
    // control box and gauge on the +Z side
    parts.push(at(bevelBox(0.3, 0.26, 0.14, 0.03, MAT.trim), 0.42, Y0, 0.78));
    parts.push(at(bevelBox(0.2, 0.05, 0.02, 0.01, emissive(COLORS.tech, 1.8), 1), 0.42, Y0 + 0.15, 0.86));
    parts.push(at(turn(vents(3, 0.05, 0.06, 0.03, MAT.deep), 0), 0.42, Y0 + 0.05, 0.86));
    const lamp = k.light(kx + 0.7, Y0 + 0.3, kz, EMBER, { r: 26, work: true, lamp: false });
    const spill = new PointLight(EMBER, 0.5, 1.0, 1.6);
    spill.position.set(kx + 0.9, Y0 + 0.3, kz);
    k.vent(0.5, Y0 + 1.58, -0.72);
    k.goods(kx + 0.86, Y0 + 0.25, kz);
    return group(...parts, spill, ...(lamp ? [lamp] : []));
  },
});

/** A tall storage silo with an orange band and a cone cap. */
function silo(h: number, r: number): Object3D {
  const body = cylinder(r, h, MAT.hull, 24, 0.02);
  const band = at(ring(r + 0.003, 0.014, MAT.accent, 24), 0, h * 0.35, 0);
  const cap = at(taper(r, r * 0.35, 0.18, MAT.trim, 24), 0, h, 0);
  const top = at(cylinder(r * 0.3, 0.06, MAT.steel, 16), 0, h + 0.18, 0);
  return group(body, band, cap, top);
}

/** Silicon smelter: an arc furnace; three electrodes dip through the lid and the arcs glow teal. */
machine({
  id: 'silicon-smelter',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const vessel = lathe([[0, 0], [0.62, 0], [0.7, 0.08], [0.7, 0.5], [0.62, 0.62], [0.55, 0.66], [0, 0.66]], 56, MAT.hull);
    const band = lathe([[0.702, 0.18], [0.71, 0.2], [0.71, 0.3], [0.702, 0.32]], 56, MAT.accent);
    const lid = at(cylinder(0.46, 0.1, MAT.trim, 48), 0, 0.66, 0);
    const bolts = at(rivets(0.71, 24, 0.012, MAT.steel), 0, 0.42, 0);
    const arc = emissive(COLORS.tech, 1.4 + 1.8 * f.wave);
    const parts: Object3D[] = [vessel, band, lid, bolts];
    for (let e = 0; e < 3; e++) {
      const a = (e / 3) * Math.PI * 2 + 0.5;
      const x = Math.cos(a) * 0.24;
      const z = Math.sin(a) * 0.24;
      const lift = 0.14 * (0.5 + 0.5 * Math.sin(f.lap + e * 2.094));
      parts.push(at(cylinder(0.045, 0.95, MAT.steel, 20, 0.01), x, 0.76 + lift, z));
      parts.push(at(cylinder(0.065, 0.05, MAT.accent, 20), x, 1.71 + lift, z));
      parts.push(at(bevelBox(0.12, 0.025, 0.12, 0.01, arc, 1), x, 0.77, z));
    }
    // portal over the lid: four posts and a square top frame the electrodes run through
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(at(cylinder(0.035, 1.3, MAT.gunmetal, 14, 0.008), sx * 0.46, 0.7, sz * 0.46));
    for (const s of [-1, 1]) {
      parts.push(at(bevelBox(1.0, 0.06, 0.07, 0.02, MAT.gunmetal), 0, 1.96, s * 0.46));
      parts.push(at(bevelBox(0.07, 0.06, 1.0, 0.02, MAT.gunmetal), s * 0.46, 1.96, 0));
    }
    // two silos behind, with feed pipes to the lid
    parts.push(at(silo(1.1, 0.13), -0.74, Y0 - 0.07, -0.5), at(silo(1.1, 0.13), -0.5, Y0 - 0.07, -0.74));
    parts.push(pipe([[-0.74, 0.4, -0.44], [-0.6, 0.55, -0.3], [-0.38, 0.72, -0.2]], 0.03, MAT.steel, 0.08));
    parts.push(pipe([[-0.5, 0.4, -0.68], [-0.4, 0.55, -0.5], [-0.2, 0.72, -0.38]], 0.03, MAT.steel, 0.08));
    // tap hole and vents on the +X/+Z faces
    parts.push(at(bevelBox(0.3, 0.14, 0.04, 0.02, MAT.deep, 2), 0.0, 0.2, 0.7));
    parts.push(at(vents(4, 0.04, 0.12, 0.03, MAT.deep), 0.5, 0.42, 0.5));
    parts.push(at(bevelBox(0.04, 0.12, 0.26, 0.02, MAT.deep, 2), 0.7, 0.2, 0.0));
    const lamp = k.light(0.0, 0.85, 0.0, COLORS.tech, { r: 24, work: true, lamp: false });
    k.vent(0, 2.1, 0);
    k.goods(0.62, 0.3, 0.1);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});

/** Glass kiln: a tunnel kiln with an amber slit; a pale pane rolls out on the roller bed in front. */
machine({
  id: 'glass-kiln',
  size: 2,
  frames: LOOP,
  body: (k, f) => {
    const hx = -0.2;
    const parts: Object3D[] = [];
    parts.push(at(bevelBox(1.05, 0.62, 1.45, 0.09, MAT.hull), hx, 0, 0));
    parts.push(at(bevelBox(0.9, 0.16, 1.3, 0.07, MAT.trim), hx, 0.58, 0));
    parts.push(at(bevelBox(1.07, 0.1, 1.47, 0.04, MAT.accent), hx, 0.16, 0));
    // roof ridge vents and a service hatch
    for (const z of [-0.45, 0, 0.45]) parts.push(at(bevelBox(0.5, 0.07, 0.16, 0.03, MAT.gunmetal), hx, 0.74, z));
    parts.push(at(bevelBox(0.3, 0.03, 0.3, 0.012, MAT.steel, 2), hx - 0.2, 0.74, 0.5));
    // glowing slit and arched mouth on +X
    parts.push(at(bevelBox(0.03, 0.1, 1.05, 0.012, emissive(AMBER, 1.5 + 1.2 * f.wave), 1), hx + 0.53, 0.42, 0));
    parts.push(at(bevelBox(0.1, 0.36, 0.5, 0.03, MAT.deep), hx + 0.52, 0.12, 0));
    parts.push(at(bevelBox(0.04, 0.22, 0.36, 0.02, emissive(AMBER, 1.2 + f.wave), 1), hx + 0.59, 0.19, 0));
    // rivet rows on the +Z face
    for (const x of [-0.3, 0, 0.3]) parts.push(at(bevelBox(0.12, 0.2, 0.03, 0.01, MAT.trim, 1), hx + x, 0.24, 0.735));
    parts.push(at(bevelBox(0.5, 0.04, 0.02, 0.01, emissive(COLORS.tech, 1.6), 1), hx - 0.1, 0.5, 0.74));
    // roller bed in front of the mouth along x
    const bedX = 0.5;
    parts.push(at(bevelBox(0.55, 0.05, 0.4, 0.02, MAT.gunmetal, 2), bedX + 0.1, Y0 - 0.02, 0));
    for (let r = 0; r < 5; r++) {
      const roll = cylinder(0.028, 0.34, MAT.steel, 12, 0.006);
      roll.rotation.x = Math.PI / 2;
      parts.push(at(roll, bedX - 0.1 + r * 0.1, 0.11, 0.17));
    }
    if (f.working) {
      const x = bedX - 0.08 + f.t * 0.32;
      parts.push(at(bevelBox(0.3, 0.02, 0.3, 0.01, MAT.glass, 1), x, 0.145, 0));
      parts.push(at(bevelBox(0.27, 0.018, 0.27, 0.01, emissive('#bff4ff', 0.5 + 0.8 * (1 - f.t)), 1), x, 0.16, 0));
    }
    // tall chimney on the back
    parts.push(at(chimney(1.25, 0.09), -0.55, 0.62, -0.5));
    parts.push(pipe([[-0.5, 0.74, -0.2], [-0.5, 0.9, -0.4], [-0.55, 1.0, -0.5]], 0.03, MAT.steel, 0.07));
    const lamp = k.light(hx + 0.62, 0.32, 0, AMBER, { r: 24, work: true, lamp: false });
    k.vent(-0.55, 1.95, -0.5);
    k.goods(bedX + 0.15, 0.22, 0);
    return group(...parts, ...(lamp ? [lamp] : []));
  },
});

/** Steel foundry: a furnace tower, a ladle on a crane arm that tips and pours into the mould. */
machine({
  id: 'steel-foundry',
  size: 3,
  frames: LOOP,
  body: (k, f) => {
    const fx = -0.55;
    const fz = -0.5;
    const parts: Object3D[] = [at(kilnBody(0.72, 1.2), fx, Y0, fz)];
    parts.push(furnaceDoor(fx + 0.68, fz, Y0 + 0.1, emissive(EMBER, 1.8 + 1.3 * f.wave)));
    // charging neck on the lid with a hopper, and the stack with a duct
    parts.push(at(cylinder(0.26, 0.22, MAT.trim, 32), fx, Y0 + 1.2, fz), at(dome(0.22, 0.12, MAT.steel, 24, 6), fx, Y0 + 1.42, fz));
    parts.push(at(chimney(2.3, 0.11), -1.2, Y0, -1.15));
    parts.push(pipe([[fx - 0.25, Y0 + 1.3, fz - 0.25], [-1.0, Y0 + 1.5, -0.9], [-1.2, Y0 + 1.5, -1.15]], 0.045, MAT.steel, 0.14));
    // crane post at the front right and its arm along +z; the cup hangs from the arm's end
    const px = 0.85;
    const postZ = -0.7;
    parts.push(at(cylinder(0.1, 1.15, MAT.gunmetal, 20), px, Y0, postZ), at(cylinder(0.14, 0.07, MAT.trim, 20), px, Y0, postZ));
    parts.push(at(bevelBox(0.1, 0.09, 0.95, 0.03, MAT.accent), px, Y0 + 1.1, postZ + 0.42));
    parts.push(at(cylinder(0.06, 0.12, MAT.steel, 16, 0.01), px, Y0 + 1.19, postZ));
    const tip = f.working ? 0.9 * Math.sin(Math.min(1, f.t * 1.5) * Math.PI * 0.7) : 0.0;
    const cup = group(
      lathe([[0.0, 0.0], [0.1, 0.0], [0.16, 0.12], [0.18, 0.22], [0.0, 0.22]], 24, MAT.steel),
      lathe([[0.0, 0.19], [0.16, 0.19], [0.17, 0.22], [0.0, 0.22]], 24, emissive(EMBER, 2.2)),
      at(ring(0.18, 0.015, MAT.accent, 24), 0, 0.2, 0),
    );
    cup.rotation.x = tip;
    const cz = postZ + 0.85;
    parts.push(at(cup, px, Y0 + 0.68, cz));
    parts.push(at(cylinder(0.025, 0.4, MAT.steel, 8, 0.004), px, Y0 + 0.9, cz));
    // mould row on the ground under the pour
    const mz = cz + 0.38;
    parts.push(at(bevelBox(0.46, 0.2, 0.62, 0.04, MAT.gunmetal), px, Y0, mz));
    const level = f.working ? 0.03 + 0.04 * f.t : 0.07;
    parts.push(at(bevelBox(0.36, level, 0.52, 0.02, f.working ? emissive(EMBER, 1.2 + 1.4 * (1 - f.t)) : MAT.steel, 1), px, Y0 + 0.2 - 0.0, mz));
    if (f.working && tip > 0.35) parts.push(at(bevelBox(0.045, 0.34, 0.045, 0.02, emissive(EMBER, 2.4), 1), px, Y0 + 0.24, cz + 0.18));
    // control cabinet with lit strip on the +Z side
    parts.push(at(bevelBox(0.5, 0.42, 0.2, 0.04, MAT.trim), -0.55, Y0, 1.1));
    parts.push(at(bevelBox(0.34, 0.06, 0.02, 0.01, emissive(COLORS.tech, 1.8), 1), -0.55, Y0 + 0.28, 1.21));
    parts.push(at(vents(4, 0.05, 0.1, 0.04, MAT.deep), -0.55, Y0 + 0.08, 1.21));
    const lamp = k.light(fx + 0.8, Y0 + 0.35, fz, EMBER, { r: 34, work: true, lamp: false });
    const spill = new PointLight(EMBER, 0.6, 1.4, 1.6);
    spill.position.set(fx + 1.0, 0.5, fz);
    k.vent(-1.2, Y0 + 2.42, -1.15);
    k.goods(px, 0.35, mz);
    return group(...parts, spill, ...(lamp ? [lamp] : []));
  },
});
