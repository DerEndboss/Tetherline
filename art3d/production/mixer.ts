import { PointLight, type Object3D } from 'three';
import { at, bevelBox, building, cable, COLORS, cylinder, emissive, group, Kit, lathe, MAT, pipe, plate, ring, rivets, strut, vents } from '../kit';
import { smallPad } from './pad';

/**
 * The mixer: a round vat with two funnel hoppers that pour into it and a stirrer motor over it. The liquid,
 * its swirl and the stirrer shaft are separate sprites the game draws at VAT (x/z 0.04, surface y 0.383,
 * radius 0.255), so the vat is open and its surface sits exactly there.
 */

const STRIP = emissive(COLORS.tech, 2.4);
export const VAT_X = 0.04;
export const VAT_Z = 0.04;
const VAT_Y = 0.383;
const H1: [number, number] = [-0.3, -0.02];
const H2: [number, number] = [-0.02, -0.3];
const HOPPER_Y = 0.5;
const MOTOR_Y = 0.8;

function vat(level: number): Object3D {
  const wall = lathe([[0, 0.07], [0.23, 0.07], [0.275, 0.1], [0.295, 0.16], [0.295, 0.36], [0.305, 0.375], [0.305, 0.39], [0.27, 0.39], [0.27, 0.36]], 56, MAT.hull);
  const floor = lathe([[0, 0.362], [0.27, 0.362], [0.27, 0.364], [0, 0.364]], 40, MAT.deep);
  const rim = ring(0.287, 0.014, MAT.steel, 56);
  rim.position.set(0, 0.385, 0);
  const band = lathe([[0.296, 0.14], [0.302, 0.15], [0.302, 0.21], [0.296, 0.22]], 56, MAT.accent);
  const bolts = at(rivets(0.299, 16, 0.01, MAT.trim), 0, 0.3, 0);
  const grille = at(vents(4, 0.03, 0.07, 0.016, MAT.deep), 0.01, 0.25, 0.294);
  const lit = level >= 6 ? [lathe([[0.296, 0.235], [0.302, 0.24], [0.302, 0.255], [0.296, 0.26]], 56, STRIP)] : [];
  const gold = level >= 10 ? [lathe([[0.296, 0.1], [0.307, 0.105], [0.307, 0.125], [0.296, 0.13]], 56, MAT.gold)] : [];
  const valve = group(at(cylinder(0.025, 0.06, MAT.steel, 14), 0, 0, 0), at(bevelBox(0.07, 0.03, 0.05, 0.01, MAT.accent, 2), 0, 0.06, 0));
  valve.rotation.z = -Math.PI / 2;
  valve.position.set(0.28, 0.125, 0.12);
  const shield = at(plate(0.1, 0.06, 0.01, MAT.trim, 0.004), 0.34, 0.07, 0.12);
  return at(group(wall, floor, rim, band, bolts, grille, ...lit, ...gold, valve, shield), VAT_X, 0, VAT_Z);
}

function hopper(x: number, z: number): Object3D {
  const stalk = at(cylinder(0.028, HOPPER_Y - 0.07, MAT.steel, 14), x, 0.07, z);
  const base = at(cylinder(0.07, 0.03, MAT.trim, 20), x, 0.07, z);
  const fun = at(lathe([[0.035, HOPPER_Y], [0.1, HOPPER_Y + 0.09], [0.115, HOPPER_Y + 0.19]], 36, MAT.hull), x, 0, z);
  const lip = at(ring(0.117, 0.01, MAT.accent, 36), x, HOPPER_Y + 0.19, z);
  const inner = at(lathe([[0, HOPPER_Y + 0.18], [0.105, HOPPER_Y + 0.18], [0.105, HOPPER_Y + 0.185], [0, HOPPER_Y + 0.185]], 24, MAT.deep), x, 0, z);
  const tx = VAT_X + (x - VAT_X) * 0.55;
  const tz = VAT_Z + (z - VAT_Z) * 0.55;
  const chute = pipe([[x, HOPPER_Y + 0.02, z], [x, 0.42, z], [tx, 0.42, tz], [tx, 0.4, tz]], 0.022, MAT.steel, 0.04, 14);
  return group(stalk, base, fun, lip, inner, chute);
}

function stirrer(k: Kit): Object3D {
  const post = at(cylinder(0.032, 0.93 - 0.07, MAT.steel, 16), 0.34, 0.07, -0.34);
  const base = at(cylinder(0.075, 0.03, MAT.trim, 20), 0.34, 0.07, -0.34);
  const arm = strut([0.34, 0.9, -0.34], [VAT_X, 0.9, VAT_Z], 0.028, MAT.steel, 14);
  const brace = strut([0.34, 0.6, -0.34], [0.2, 0.88, -0.16], 0.012, MAT.gunmetal, 8);
  const motor = at(lathe([[0.075, MOTOR_Y], [0.088, MOTOR_Y + 0.025], [0.088, MOTOR_Y + 0.14], [0.06, MOTOR_Y + 0.17], [0, MOTOR_Y + 0.17]], 32, MAT.accent), VAT_X, 0, VAT_Z);
  const cap = at(cylinder(0.04, 0.03, MAT.hull, 20), VAT_X, MOTOR_Y + 0.17, VAT_Z);
  const hub = at(cylinder(0.05, 0.04, MAT.steel, 20), VAT_X, MOTOR_Y - 0.035, VAT_Z);
  const lamp = k.light(VAT_X, MOTOR_Y + 0.23, VAT_Z, COLORS.tech, { r: 11, work: true, size: 0.022 });
  return group(post, base, arm, brace, motor, cap, hub, ...(lamp ? [lamp] : []));
}

function cabinet(): Object3D {
  const box = bevelBox(0.13, 0.2, 0.2, 0.022, MAT.hull);
  const screen = at(bevelBox(0.005, 0.07, 0.11, 0.003, STRIP, 1), 0.067, 0.08, 0);
  const lid = at(bevelBox(0.14, 0.02, 0.21, 0.008, MAT.accent, 1), 0, 0.2, 0);
  return at(group(box, screen, lid), -0.38, 0.07, 0.3);
}

function tank(): Object3D {
  const t = lathe([[0, 0], [0.055, 0], [0.065, 0.02], [0.065, 0.24], [0.045, 0.27], [0, 0.275]], 28, MAT.hull);
  const cap = at(cylinder(0.067, 0.03, MAT.accent, 28), 0, 0.2, 0);
  const feed = pipe([[0.03, 0.2, 0], [0.0, 0.2, -0.05], [-0.07, 0.24, -0.1]], 0.012, MAT.steel, 0.03);
  return at(group(t, cap, feed), 0.36, 0.07, -0.08);
}

function cornerLamps(k: Kit): Object3D[] {
  return [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4]].map(([x, z], i) => {
    const lamp = k.light(x!, 0.1, z!, COLORS.tech, { r: 10, phase: i / 3, size: 0.018 });
    return group(at(cylinder(0.02, 0.025, MAT.gunmetal, 10), x!, 0.07, z!), ...(lamp ? [lamp] : []));
  });
}

function mixer(k: Kit, level: number): { pad: Object3D; body: Object3D } {
  const parts: Object3D[] = [];
  if (level >= 2) parts.push(cabinet());
  if (level >= 3) parts.push(pipe([[H1[0], HOPPER_Y + 0.15, H1[1] - 0.1], [H1[0], HOPPER_Y + 0.15, -0.38], [H2[0] - 0.1, HOPPER_Y + 0.15, -0.38], [H2[0] - 0.1, HOPPER_Y + 0.15, H2[1]]], 0.013, MAT.steel, 0.05));
  if (level >= 4) parts.push(at(group(bevelBox(0.14, 0.012, 0.1, 0.004, MAT.solar, 1)), -0.38, 0.29, 0.3));
  if (level >= 5) parts.push(tank());
  if (level >= 7) parts.push(at(cylinder(0.05, 0.04, MAT.trim, 20), VAT_X, MOTOR_Y + 0.2, VAT_Z));
  if (level >= 8) {
    const lamp = k.light(-0.38, 0.8, -0.38, COLORS.beacon, { r: 14, phase: 0.3, size: 0.026 });
    parts.push(strut([-0.38, 0.07, -0.38], [-0.38, 0.78, -0.38], 0.014, MAT.steel, 8), ...(lamp ? [lamp] : []));
  }
  if (level >= 9) parts.push(...cornerLamps(k));
  if (level >= 4) parts.push(cable([[-0.34, 0.3, 0.3], [-0.3, 0.14, 0.4], [-0.1, 0.08, 0.42]], 0.008, MAT.rubber));
  k.vent(VAT_X, 0.45, VAT_Z);
  k.goods(0.32, 0.07, 0.3);
  const spill = new PointLight(COLORS.tech, 0.3, 0.8, 1.6);
  spill.position.set(0.1, 0.6, 0.1);
  return { pad: smallPad(), body: group(vat(level), hopper(...H1), hopper(...H2), stirrer(k), ...parts, spill) };
}

building('mixer', mixer);
