import { PointLight, type Object3D } from 'three';
import { at, bevelBox, building, cable, COLORS, cylinder, emissive, group, Kit, lathe, MAT, pipe, ring, rivets, strut, turn, vents } from '../kit';
import { smallPad } from './pad';

/**
 * The smelter: a round white kiln on the pad with an orange band, a glowing arched furnace door facing the
 * player, a tall chimney bolted to the kiln wall and a feed funnel on top. Levels add a tank, risers, hoops,
 * a lit band, a control cabinet, a beacon, a second riser and a gold collar; the chimney grows.
 */

const EMBER = emissive('#ff8a3d', 2.8);
const HOT = emissive('#ffc27a', 3.4);
const STRIP = emissive(COLORS.tech, 2.4);
const CX = -0.2;
const CZ = -0.22;

const chimneyTop = (level: number): number => Math.min(1.36, 0.92 + level * 0.046);

function kiln(level: number): Object3D {
  const body = lathe([[0, 0.07], [0.3, 0.07], [0.345, 0.12], [0.35, 0.3], [0.31, 0.45], [0.21, 0.55], [0.14, 0.59], [0, 0.59]], 56, MAT.hull);
  const band = lathe([[0.351, 0.17], [0.357, 0.18], [0.357, 0.255], [0.351, 0.265]], 56, MAT.accent);
  const foot = lathe([[0.335, 0.07], [0.352, 0.075], [0.352, 0.1], [0.34, 0.11]], 56, MAT.trim);
  const seams = [0.33, 0.4].map((y) => lathe([[0.33 - (y - 0.33) * 0.9, y], [0.334 - (y - 0.33) * 0.9, y + 0.005], [0.33 - (y - 0.33) * 0.9, y + 0.01]], 56, MAT.trim));
  const bolts = at(rivets(0.355, 18, 0.011, MAT.steel), 0, 0.3, 0);
  const vent = turn(at(vents(4, 0.03, 0.07, 0.016, MAT.deep), 0.0, 0.4, 0.31), 0);
  const glow = level >= 6 ? [lathe([[0.349, 0.285], [0.355, 0.288], [0.355, 0.302], [0.349, 0.305]], 56, STRIP)] : [];
  return group(body, band, foot, ...seams, bolts, vent, ...glow);
}

/** Arched furnace door on the +x side with the molten glow behind a grate. */
function door(k: Kit): Object3D {
  const frame = at(bevelBox(0.1, 0.25, 0.27, 0.03, MAT.trim), 0.325, 0.09, 0);
  const arch = at(turn(cylinder(0.105, 0.1, MAT.trim, 24, 0.02), 0), 0.325, 0.34, 0);
  arch.rotation.z = Math.PI / 2;
  arch.position.set(0.375, 0.325, 0);
  const mouth = at(bevelBox(0.03, 0.17, 0.17, 0.02, EMBER, 2), 0.385, 0.13, 0);
  const mouthTop = at(bevelBox(0.03, 0.06, 0.12, 0.02, HOT, 2), 0.386, 0.25, 0);
  const bars = [-0.05, 0, 0.05].map((z) => at(bevelBox(0.014, 0.19, 0.012, 0.004, MAT.gunmetal, 1), 0.402, 0.12, z));
  const sill = at(bevelBox(0.14, 0.03, 0.3, 0.01, MAT.steel, 2), 0.37, 0.07, 0);
  const lamp = k.light(0.42, 0.22, 0, '#ff8a3d', { r: 22, work: true, lamp: false });
  const spill = new PointLight('#ff8a3d', 0.55, 0.9, 1.6);
  spill.position.set(0.5, 0.2, 0);
  return group(frame, arch, mouth, mouthTop, ...bars, sill, spill, ...(lamp ? [lamp] : []));
}

function chimney(k: Kit, level: number): Object3D {
  const top = chimneyTop(level);
  const stack = at(cylinder(0.08, top - 0.3, MAT.hull, 28), CX, 0.3, CZ);
  const band = at(ring(0.082, 0.012, MAT.accent, 28), CX, top - 0.2, CZ);
  const lip = lathe([[0.095, top - 0.01], [0.097, top + 0.03], [0.07, top + 0.04], [0.07, top + 0.02]], 28, MAT.deep);
  const lipPos = at(lip, CX, 0, CZ);
  const brackets = [0.42, 0.7].map((y) => at(ring(0.088, 0.008, MAT.steel, 28), CX, y, CZ));
  const stay = strut([CX + 0.08, 0.7, CZ + 0.05], [0.1, 0.5, -0.06], 0.012, MAT.steel, 8);
  const foot = at(cylinder(0.11, 0.05, MAT.trim, 28), CX, 0.07, CZ);
  const lamp = level >= 8 ? [k.light(CX, top + 0.07, CZ, COLORS.beacon, { r: 14, phase: 0.6, size: 0.026 })].filter(Boolean) as Object3D[] : [];
  const mast = level >= 8 ? [strut([CX, top, CZ], [CX, top + 0.06, CZ], 0.01, MAT.steel, 8)] : [];
  const gold = level >= 10 ? [at(ring(0.088, 0.01, MAT.gold, 28), CX, top - 0.28, CZ)] : [];
  return group(stack, band, lipPos, ...brackets, stay, foot, ...lamp, ...mast, ...gold);
}

function funnel(): Object3D {
  const cone = lathe([[0.055, 0.57], [0.13, 0.7], [0.135, 0.74]], 32, MAT.steel);
  const rim = at(ring(0.136, 0.012, MAT.accent, 32), 0.03, 0.74, 0.03);
  const throat = at(cylinder(0.04, 0.05, MAT.trim, 16), 0.03, 0.55, 0.03);
  const dark = at(lathe([[0, 0.72], [0.12, 0.72], [0.12, 0.735], [0, 0.735]], 24, MAT.deep), 0.03, 0.0, 0.03);
  return group(at(cone, 0.03, 0, 0.03), rim, throat, dark);
}

function tank(): Object3D {
  const t = lathe([[0, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.3], [0.06, 0.34], [0, 0.35]], 32, MAT.accent);
  const cap = at(cylinder(0.05, 0.03, MAT.hull, 24), 0, 0.34, 0);
  const hoops = [0.06, 0.24].map((y) => at(ring(0.087, 0.006, MAT.steel, 28), 0, y, 0));
  return at(group(t, cap, ...hoops), -0.38, 0.07, 0.1);
}

function riser(x: number, z: number, h: number): Object3D {
  const p = at(cylinder(0.045, h, MAT.hull, 20), x, 0.07, z);
  const cap = at(cylinder(0.055, 0.025, MAT.accent, 20), x, 0.07 + h, z);
  const lug = at(cylinder(0.065, 0.03, MAT.trim, 20), x, 0.07, z);
  return group(p, cap, lug);
}

function cabinet(): Object3D {
  const box = bevelBox(0.16, 0.22, 0.2, 0.025, MAT.hull);
  const screen = at(bevelBox(0.005, 0.08, 0.12, 0.003, STRIP, 1), 0.082, 0.09, 0);
  const lid = at(bevelBox(0.17, 0.02, 0.21, 0.008, MAT.accent, 1), 0, 0.22, 0);
  const wire = cable([[0.04, 0.05, 0.1], [0.04, 0.02, 0.2], [0.1, 0.03, 0.28]], 0.01, MAT.rubber);
  return at(group(box, screen, lid, wire), -0.3, 0.07, 0.34);
}

function hoops(): Object3D[] {
  return [0.36, 0.41, 0.46].map((y, i) => lathe([[0.34 - i * 0.03 + 0.012, y], [0.34 - i * 0.03 + 0.02, y + 0.005], [0.34 - i * 0.03 + 0.012, y + 0.018]], 56, MAT.steel));
}

function smelter(k: Kit, level: number): { pad: Object3D; body: Object3D } {
  const parts: Object3D[] = [];
  if (level >= 2) parts.push(tank());
  if (level >= 3) parts.push(riser(0.3, -0.26, 0.5));
  if (level >= 4) parts.push(...hoops());
  if (level >= 5) parts.push(pipe([[-0.38, 0.3, 0.1], [-0.3, 0.3, 0.1], [-0.25, 0.28, 0.0]], 0.013, MAT.steel, 0.03));
  if (level >= 7) parts.push(cabinet());
  if (level >= 9) parts.push(riser(0.1, -0.38, 0.36));
  k.vent(CX, chimneyTop(level) + 0.03, CZ);
  k.goods(0.32, 0.07, 0.32);
  const glow = new PointLight('#ff8a3d', 0.3, 0.9, 1.6);
  glow.position.set(0.45, 0.2, 0.05);
  return { pad: smallPad(), body: group(kiln(level), door(k), chimney(k, level), funnel(), ...parts, glow) };
}

building('smelter', smelter);
