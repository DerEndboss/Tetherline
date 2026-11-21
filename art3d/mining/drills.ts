import { PointLight, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, lightPool, MAT, plate, ring, rivets, strut, taper, turn, vents, type Kit } from '../kit';
import { basePlate, foot, lamp, register, STRIP, TAU, tri, WORK_FRAMES } from './common';

/**
 * The four drills (docs/art.md): mechanical (2x2, gears and a belt drive), pneumatic (2x2, air pistons and a
 * fan), electric (3x3, a caged motor drum with a spinner) and laser (3x3, a gantry that fires a beam into the
 * ore). Each one idles in frame 0 and plays a 12-frame work loop (kit/loop.ts). Rotating parts repeat after one symmetry step
 * (gear 8 teeth, cross 4 arms, fan 3 blades, spinner 6 blades, beam ring 4 notches).
 */

const STEP = TAU / WORK_FRAMES;

/** A rotating part: `o` turned about Y by `a`, standing at (x, y, z). */
function spin(o: Object3D, a: number, x: number, y: number, z: number): Object3D {
  return at(turn(group(o), a), x, y, z);
}

/* ---------- Mechanical drill (2x2) ---------- */

/** A steel gear with 8 teeth, a hub and a cross of 4 arms (invariant under a quarter turn). */
function gear(r: number, h: number): Object3D {
  const parts: Object3D[] = [cylinder(r, h, MAT.steel, 40, 0.014), at(cylinder(r * 0.42, h * 1.6, MAT.gunmetal, 24, 0.01), 0, 0, 0), at(cylinder(r * 0.2, h * 2.2, MAT.accent, 20, 0.008), 0, 0, 0)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    parts.push(turn(at(bevelBox(r * 0.34, h, r * 0.26, 0.01, MAT.steel, 1), Math.cos(a) * (r + 0.035), 0, -Math.sin(a) * (r + 0.035)), a));
  }
  for (let i = 0; i < 4; i++) parts.push(turn(at(bevelBox(r * 1.5, h * 0.9, r * 0.16, 0.008, MAT.gunmetal, 1), 0, h, 0), (i * TAU) / 8));
  return group(...parts);
}

/** A spoked pulley wheel (4 spokes, a rubber rim). */
function pulley(r: number): Object3D {
  const rim = ring(r, 0.022, MAT.rubber, 28);
  const hub = cylinder(0.04, 0.05, MAT.accent, 16, 0.008);
  const spokes = [0, 1, 2, 3].map((i) => turn(bevelBox(r * 2, 0.02, 0.026, 0.006, MAT.steel, 1), (i * TAU) / 8));
  return group(at(rim, 0, 0.025, 0), at(hub, 0, 0, 0), ...spokes.map((s) => at(s, 0, 0.02, 0)));
}

function mechanical(k: Kit, frame: number): Object3D {
  const a = (frame * STEP) / 2;
  const housing = bevelBox(1.22, 0.32, 1.22, 0.06, MAT.hull);
  const band = at(bevelBox(1.236, 0.06, 1.236, 0.02, MAT.accent, 2), 0, 0.12, 0);
  const lid = at(plate(1.02, 1.02, 0.03, MAT.trim, 0.012), 0, 0.32, 0);
  const well = at(cylinder(0.4, 0.018, MAT.deep, 40, 0.004), 0, 0.35, 0);
  const wheel = spin(gear(0.3, 0.05), a, 0, 0.368, 0);
  const grille = at(vents(4, 0.07, 0.1, 0.03, MAT.deep), 0, 0.16, 0.612);
  const side = turn(at(vents(3, 0.07, 0.1, 0.03, MAT.deep), 0.612, 0.16, 0), Math.PI / 2);
  // back left: two posts and a cross shaft carry the belt pulley
  const px = -0.42;
  const pz = -0.42;
  const posts = [-0.12, 0.12].map((d) => strut([px + d, 0.34, pz - d], [px + d, 0.88, pz - d], 0.026, MAT.steel, 10));
  const beam = strut([px - 0.12, 0.88, pz + 0.12], [px + 0.12, 0.88, pz - 0.12], 0.032, MAT.gunmetal, 10);
  const feet = [-0.12, 0.12].map((d) => at(foot(0.07), px + d, 0.32, pz - d));
  const wheel2 = at(turn(group(spin(pulley(0.17), a * 2, 0, 0, 0)), 0), px, 0.88, pz);
  wheel2.rotation.x = Math.PI / 2;
  const belt = strut([px + 0.06, 0.8, pz + 0.04], [-0.1, 0.38, -0.12], 0.012, MAT.rubber, 8);
  const hopper = at(group(taper(0.15, 0.08, 0.16, MAT.steel, 4), at(taper(0.17, 0.15, 0.04, MAT.gunmetal, 4), 0, 0.16, 0)), 0.42, 0.34, 0.42);
  const lights = lamp(k, 0.44, 0.38, -0.44, COLORS.tech, { r: 9, work: true });
  k.vent(0, 0.4, 0);
  k.goods(0.5, 0.34, 0.5);
  k.top(0.95);
  return group(housing, band, lid, well, wheel, grille, side, ...posts, beam, ...feet, wheel2, belt, hopper, ...lights);
}

/* ---------- Pneumatic drill (2x2) ---------- */

function piston(x: number, z: number, lift: number): Object3D {
  const casing = cylinder(0.1, 0.34, MAT.hull, 28, 0.016);
  const cap = at(cylinder(0.104, 0.04, MAT.accent, 28, 0.012), 0, 0.3, 0);
  const rod = at(cylinder(0.03, 0.26, MAT.steel, 14, 0.006), 0, 0.32 + lift, 0);
  const knob = at(dome(0.055, 0.04, MAT.steel, 16, 4), 0, 0.58 + lift, 0);
  const band = at(ring(0.102, 0.008, MAT.steel, 24), 0, 0.12, 0);
  return at(group(casing, cap, rod, knob, band), x, 0.07, z);
}

function fan(r: number, rot: number): Object3D {
  const blades = [0, 1, 2].map((i) => turn(at(bevelBox(r, 0.012, 0.09, 0.005, MAT.steel, 1), r / 2, 0, 0), -(i * TAU) / 3));
  const hub = dome(0.06, 0.05, MAT.accent, 20, 4);
  return turn(group(...blades, hub), rot);
}

function pneumatic(k: Kit, frame: number): Object3D {
  const housing = bevelBox(1.24, 0.3, 1.24, 0.06, MAT.hull);
  const band = at(bevelBox(1.256, 0.05, 1.256, 0.02, MAT.accent, 2), 0, 0.1, 0);
  const lid = at(plate(1.04, 1.04, 0.03, MAT.trim, 0.012), 0, 0.3, 0);
  const motor = at(group(cylinder(0.3, 0.46, MAT.hull, 40, 0.03), at(ring(0.3, 0.012, MAT.trim, 40), 0, 0.2, 0), at(ring(0.3, 0.012, MAT.accent, 40), 0, 0.34, 0)), 0, 0.33, 0);
  const cowl = at(lathe([[0.26, 0], [0.26, 0.03], [0.2, 0.07], [0.0, 0.07]], 36, MAT.glass), 0, 0.79, 0);
  const rotor = at(fan(0.2, (frame * TAU * 2) / 3 / WORK_FRAMES), 0, 0.77, 0);
  const glow = at(lathe([[0.302, 0.55], [0.306, 0.56], [0.306, 0.58], [0.302, 0.59]], 40, STRIP), 0, 0, 0);
  const p1 = piston(-0.4, 0.4, 0.13 * tri(frame));
  const p2 = piston(0.4, -0.4, 0.13 * tri(frame, WORK_FRAMES / 2));
  const tank = at(turn(group(lathe([[0, 0], [0.09, 0], [0.1, 0.02], [0.1, 0.34], [0.09, 0.36], [0, 0.36]], 28, MAT.accent), at(ring(0.102, 0.008, MAT.steel, 24), 0, 0.1, 0), at(ring(0.102, 0.008, MAT.steel, 24), 0, 0.26, 0)), 0), -0.38, 0.38, -0.4);
  tank.rotation.z = Math.PI / 2;
  const hose = strut([-0.4, 0.5, -0.3], [-0.4, 0.5, 0.3], 0.016, MAT.rubber, 8);
  const hose2 = strut([-0.3, 0.5, -0.4], [0.4, 0.5, -0.4], 0.016, MAT.rubber, 8);
  const lights = lamp(k, 0.42, 0.34, -0.44, COLORS.tech, { r: 9, work: true });
  k.vent(0, 0.86, 0);
  k.goods(0.5, 0.3, 0.5);
  k.top(0.95);
  return group(housing, band, lid, motor, cowl, rotor, glow, p1, p2, tank, hose, hose2, ...lights);
}

/* ---------- Electric drill (3x3) ---------- */

function spinner(rot: number): Object3D {
  const blades = Array.from({ length: 6 }, (_, i) => turn(at(bevelBox(0.3, 0.014, 0.075, 0.006, i % 2 === 0 ? MAT.steel : MAT.gunmetal, 1), 0.17, 0, 0), -(i * TAU) / 6));
  const hub = dome(0.1, 0.07, MAT.accent, 24, 5);
  return turn(group(...blades, hub), rot);
}

function electric(k: Kit, frame: number): Object3D {
  const plinth = at(bevelBox(2.0, 0.24, 2.0, 0.07, MAT.trim), 0, 0.07, 0);
  const lip = at(bevelBox(2.03, 0.04, 2.03, 0.016, MAT.accent, 2), 0, 0.2, 0);
  const lid = at(plate(1.74, 1.74, 0.03, MAT.hull, 0.012), 0, 0.31, 0);
  const drum = at(group(cylinder(0.62, 0.62, MAT.hull, 56, 0.05), at(ring(0.622, 0.014, MAT.accent, 56), 0, 0.14, 0), at(lathe([[0.624, 0.34], [0.629, 0.35], [0.629, 0.4], [0.624, 0.41]], 56, STRIP), 0, 0, 0), at(rivets(0.55, 14, 0.014, MAT.trim), 0, 0.6, 0)), 0, 0.34, 0);
  const crown = at(cylinder(0.48, 0.06, MAT.gunmetal, 40, 0.014), 0, 0.96, 0);
  const sp = at(spinner((frame * TAU) / 3 / WORK_FRAMES), 0, 1.02, 0);
  const posts: Object3D[] = [];
  const lights: Object3D[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const px = x * 0.8;
    const pz = z * 0.8;
    posts.push(at(foot(0.1), px, 0.31, pz), strut([px, 0.31, pz], [px, 1.04, pz], 0.032, MAT.steel, 12), at(cylinder(0.05, 0.05, MAT.accent, 16, 0.012), px, 1.04, pz));
    posts.push(strut([px, 1.04, pz], [x * 0.4, 1.0, z * 0.4], 0.014, MAT.gunmetal, 8));
    lights.push(...lamp(k, px, 1.12, pz, COLORS.tech, { r: 9, work: true, phase: (x + 1) / 4 + (z + 1) / 8, size: 0.02 }));
  }
  const frameBars = [
    [-0.8, -0.8, 0.8, -0.8],
    [0.8, -0.8, 0.8, 0.8],
    [0.8, 0.8, -0.8, 0.8],
    [-0.8, 0.8, -0.8, -0.8],
  ].map(([a, b, c, d]) => strut([a!, 0.98, b!], [c!, 0.98, d!], 0.018, MAT.steel, 8));
  const box = at(group(bevelBox(0.3, 0.3, 0.4, 0.04, MAT.hull), at(bevelBox(0.31, 0.04, 0.41, 0.012, MAT.accent, 1), 0, 0.26, 0), at(bevelBox(0.006, 0.1, 0.22, 0.003, STRIP, 1), 0.153, 0.12, 0)), 0.72, 0.31, -0.34);
  const cable = strut([0.62, 0.4, -0.3], [0.45, 0.45, -0.1], 0.016, MAT.rubber, 8);
  const spill = new PointLight(COLORS.tech, 0.35, 1.2, 1.6);
  spill.position.set(0, 1.2, 0);
  k.vent(0, 1.1, 0);
  k.goods(1.0, 0.31, 1.0);
  k.wire(0.72, 0.62, -0.34);
  k.top(1.15);
  return group(plinth, lip, lid, drum, crown, sp, ...posts, ...frameBars, box, cable, spill, ...lights);
}

/* ---------- Laser drill (3x3) ---------- */

/** A ring with 4 notches that turns a quarter step over the loop. */
function emitterRing(rot: number): Object3D {
  const r = ring(0.3, 0.03, MAT.gold, 40);
  const notches = [0, 1, 2, 3].map((i) => turn(at(bevelBox(0.07, 0.05, 0.09, 0.012, STRIP, 1), 0.3, -0.025, 0), -(i * TAU) / 4));
  return turn(group(r, ...notches), rot);
}

function laser(k: Kit, frame: number, n: number): Object3D {
  const f = n / 3;
  const plinth = at(bevelBox(2.0 * f, 0.2, 2.0 * f, 0.07, MAT.trim), 0, 0.07, 0);
  const lip = at(bevelBox(2.03 * f, 0.034, 2.03 * f, 0.014, MAT.accent, 2), 0, 0.2, 0);
  const sunk = at(cylinder(0.62, 0.02, MAT.deep, 44, 0.004), 0, 0.27, 0);
  const rim = at(ring(0.62, 0.022, MAT.gunmetal, 44), 0, 0.28, 0);
  const pulse = 0.85 + 0.3 * tri(frame);
  const beamLen = 1.3;
  const beam = at(taper(0.055 * pulse, 0.028 * pulse, beamLen, emissive('#9ff2ff', 3.2), 24), 0, 0.28, 0);
  const core = at(taper(0.024 * pulse, 0.013, beamLen, emissive('#ffffff', 3.8), 16), 0, 0.28, 0);
  const splash = at(lightPool(0.65, COLORS.tech, 0.5), 0, 0.28, 0);
  const hot = at(dome(0.11 * pulse, 0.03, emissive('#e9fdff', 3.4), 20, 4), 0, 0.28, 0);
  // the gantry: two legs with arched braces, a crossbeam, and the lens housing hanging in the middle
  const lx = 0.95 * f;
  const legs: Object3D[] = [];
  for (const sx of [-lx, lx]) {
    legs.push(at(foot(0.16), sx, 0.27, 0), at(bevelBox(0.22, 1.42, 0.38, 0.05, MAT.hull), sx, 0.29, 0));
    legs.push(at(bevelBox(0.23, 0.07, 0.39, 0.02, MAT.accent, 2), sx, 0.5, 0));
    legs.push(at(bevelBox(0.008, 0.62, 0.12, 0.004, STRIP, 1), sx + (sx > 0 ? -0.114 : 0.114), 0.74, 0));
    legs.push(strut([sx, 0.6, 0.32], [sx * 0.55, 1.62, 0.32], 0.022, MAT.steel, 10), strut([sx, 0.6, -0.32], [sx * 0.55, 1.62, -0.32], 0.022, MAT.steel, 10));
  }
  const cross = at(bevelBox(2.1 * f + 0.1, 0.15, 0.42, 0.04, MAT.hull), 0, 1.62, 0);
  const crossBand = at(bevelBox(2.12 * f + 0.1, 0.03, 0.44, 0.012, MAT.accent, 2), 0, 1.68, 0);
  const housing = at(group(cylinder(0.3, 0.24, MAT.hull, 40, 0.03), at(cylinder(0.21, 0.1, MAT.gunmetal, 32, 0.02), 0, -0.1, 0), at(cylinder(0.13, 0.04, MAT.glass, 24, 0.01), 0, -0.14, 0)), 0, 1.46, 0);
  const ringTurn = at(emitterRing((frame * TAU) / 4 / WORK_FRAMES), 0, 1.42, 0);
  const crown = at(group(dome(0.22, 0.13, MAT.hull, 32, 6), at(ring(0.22, 0.012, MAT.gold, 32), 0, 0.01, 0)), 0, 1.69, 0);
  const lights = [...lamp(k, 0, 1.86, 0, COLORS.beacon, { r: 12, phase: 0.3, size: 0.026 }), ...lamp(k, -lx, 1.78, 0, COLORS.tech, { r: 9, work: true }), ...lamp(k, lx, 1.78, 0, COLORS.tech, { r: 9, work: true, phase: 0.5 })];
  const spill = new PointLight('#9ff2ff', 0.7, 1.8, 1.6);
  spill.position.set(0, 0.5, 0);
  const bx = 0.62 * f;
  const box = at(group(bevelBox(0.38, 0.28, 0.38, 0.04, MAT.hull), at(bevelBox(0.39, 0.04, 0.39, 0.012, MAT.accent, 1), 0, 0.24, 0), at(bevelBox(0.006, 0.08, 0.22, 0.003, STRIP, 1), 0.193, 0.11, 0)), bx, 0.27, 0.9 * f);
  // four pillar lamps on the plinth corners and a second, smaller control box
  const pillars = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).flatMap(([x, z], i) => [at(cylinder(0.05, 0.1, MAT.gunmetal, 12, 0.01), x * 0.9 * f, 0.27, z * 0.9 * f), ...lamp(k, x * 0.9 * f, 0.4, z * 0.9 * f, COLORS.tech, { r: 8, work: true, phase: i / 4, size: 0.02 })]);
  k.vent(0, 0.6, 0);
  k.goods(1.1 * f, 0.27, 1.15 * f);
  k.wire(bx, 0.55, 0.9 * f);
  k.top(1.9);
  return group(plinth, lip, sunk, rim, beam, core, splash, hot, ...legs, cross, crossBand, housing, ringTurn, crown, box, ...pillars, spill, ...lights);
}

/** Registers the drills. */
export function registerDrills(): void {
  register(['mechanical-drill'], 2, (k, f) => withBase(2, mechanical(k, f)), true);
  register(['pneumatic-drill'], 2, (k, f) => withBase(2, pneumatic(k, f)), true);
  register(['electric-drill'], 3, (k, f) => withBase(3, electric(k, f)), true);
  register(['laser-drill'], 4, (k, f, n) => withBase(n, laser(k, f, n)), true, { own: true });
}

function withBase(n: number, body: Object3D): Object3D {
  return group(basePlate(n), body);
}
