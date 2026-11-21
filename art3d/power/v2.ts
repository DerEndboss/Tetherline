import { PointLight, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, MAT, pipe, plate, ring, rivets, strut, surface, taper, turn, vents, type Kit } from '../kit';
import { lamp, register, STRIP, TAU, tri, WORK_FRAMES } from '../mining/common';
import { COAL, deck } from './common';

/**
 * The v2 power buildings (docs/art.md): combustion generator (1x1), solar panel (1x1), large solar (3x3), wind
 * turbine (2x2, rotor loop), oil generator (2x2, piston loop), battery (1x1), large battery (2x2), power node
 * (1x1) and large power node (2x2). Square decks, the player's hull and teal light; `k.wire` sits on real
 * insulators so the laser links hang from hardware.
 */

const EMBER = emissive('#ff8a3d', 2.6);
const COPPER = surface('#e39a62', { rough: 0.28, metal: 0.9, coat: 0.4 });
const CELL = (lit: boolean) => emissive(lit ? COLORS.tech : '#2a6f78', lit ? 2.4 : 0.9);

/** A glossy sphere (full lathe) of radius r, centred on y = r. */
function orb(r: number, mat: Parameters<typeof lathe>[2], sides = 24): Object3D {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  return lathe(pts, sides, mat);
}

/** A stack of insulator discs (alternating hull and accent) around a mast. */
function insulators(y: number, count: number, r: number): Object3D {
  const parts = Array.from({ length: count }, (_, i) => at(lathe([[r, 0], [r * 1.25, 0.012], [r * 1.25, 0.03], [r, 0.04]], 20, i % 2 ? MAT.accent : MAT.hull), 0, y + i * 0.05, 0));
  return group(...parts);
}

/* ---------- Combustion generator (1x1) ---------- */

/** A small cooling fan in a collar (4 blades, seen from above), turned by `a`. */
function blower(a: number): Object3D {
  const collar = group(cylinder(0.105, 0.05, MAT.gunmetal, 28, 0.01), at(cylinder(0.085, 0.012, MAT.deep, 28, 0.003), 0, 0.045, 0), at(ring(0.105, 0.007, MAT.accent, 28), 0, 0.05, 0));
  const blades = [0, 1, 2, 3].map((i) => turn(at(bevelBox(0.075, 0.008, 0.032, 0.003, MAT.steel, 1), 0.042, 0, 0), -(i * TAU) / 4 - 0.2));
  const rotor = turn(group(...blades, at(dome(0.022, 0.016, MAT.accent, 12, 3), 0, 0, 0)), a);
  return group(collar, at(rotor, 0, 0.055, 0));
}

/** Ember power of furnace slot `i` (of 3) in frame `frame`: a glow that rolls upwards through the slots. */
const emberAt = (frame: number, i: number): number => (frame < 0 ? 2.6 : 1.7 + 1.9 * tri(frame, (i * WORK_FRAMES) / 3));

function combustion(k: Kit, frame = -1): Object3D {
  const body = bevelBox(0.62, 0.42, 0.62, 0.06, MAT.hull);
  const band = at(bevelBox(0.636, 0.05, 0.636, 0.018, MAT.accent, 2), 0, 0.1, 0);
  const cap = at(bevelBox(0.66, 0.04, 0.66, 0.02, MAT.trim, 2), 0, 0.4, 0);
  // furnace doors on the two faces the camera sees: a frame with three glowing slots
  const door = (x: number, z: number, rot: number) => {
    const d = group(bevelBox(0.3, 0.26, 0.03, 0.01, MAT.gunmetal), ...[-1, 0, 1].map((i) => at(bevelBox(0.22, 0.036, 0.012, 0.004, frame < 0 ? EMBER : emissive('#ff8a3d', emberAt(frame, i + 1)), 1), 0, 0.045 + (i + 1) * 0.06, 0.016)));
    return at(turn(d, rot), x, 0.08, z);
  };
  const doors = [door(0, 0.31, 0), door(0.31, 0, Math.PI / 2)];
  const hopper = at(group(taper(0.16, 0.08, 0.14, MAT.steel, 8), at(taper(0.17, 0.16, 0.04, MAT.gunmetal, 8), 0, 0.14, 0), at(taper(0.15, 0.04, 0.05, COAL, 8), 0, 0.17, 0)), 0.12, 0.44, -0.1);
  const stack = at(group(taper(0.085, 0.065, 0.5, MAT.hull, 24), at(lathe([[0.07, 0.3], [0.073, 0.31], [0.073, 0.36], [0.07, 0.37]], 24, MAT.accent), 0, 0, 0), at(lathe([[0.066, 0.5], [0.078, 0.51], [0.078, 0.54], [0.052, 0.55]], 24, MAT.deep), 0, 0, 0)), -0.17, 0.44, -0.17);
  const pipeA = pipe([[0.0, 0.5, -0.1], [-0.1, 0.5, -0.17], [-0.17, 0.62, -0.17]], 0.014, MAT.steel, 0.05);
  const vent = at(vents(3, 0.05, 0.09, 0.02, MAT.deep), -0.15, 0.2, 0.312);
  const lamps = lamp(k, -0.24, 0.45, 0.22, COLORS.tech, { r: 7, work: true, size: 0.018 });
  const heat = k.light(0.33, 0.2, 0.0, '#ff8a3d', { r: 14, work: true, lamp: false });
  void heat;
  const spill = new PointLight('#ff8a3d', 0.3, 0.7, 1.6);
  spill.position.set(0.5, 0.2, 0.2);
  k.vent(-0.17, 1.0, -0.17);
  k.goods(0.3, 0.07, 0.34);
  k.wire(0.24, 0.5, -0.24);
  k.top(1.0);
  const wirePost = group(strut([0.24, 0.44, -0.24], [0.24, 0.5, -0.24], 0.016, MAT.steel, 8), at(lathe([[0.03, 0], [0.04, 0.02], [0.03, 0.05], [0.02, 0.07]], 12, MAT.hull), 0.24, 0.5, -0.24));
  // the cooling blower on the roof spins one quarter turn (its symmetry) every four frames while it burns
  const fan = at(blower(frame < 0 ? 0 : (frame * TAU) / 4 / 4), 0.14, 0.44, 0.15);
  return group(deck(0.92), body, band, cap, ...doors, hopper, stack, pipeA, vent, wirePost, fan, spill, ...lamps);
}

/* ---------- Solar panels ---------- */

/** A tilted panel (w x d) of cols x rows cells; its +Z edge is the low one, so it faces the camera's left. */
function panel(w: number, d: number, cols: number, rows: number, tilt: number): Object3D {
  const frame = bevelBox(w, 0.035, d, 0.012, MAT.hull);
  const cells: Object3D[] = [];
  const cw = (w - 0.07) / cols;
  const cd = (d - 0.07) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) cells.push(at(bevelBox(cw - 0.014, 0.012, cd - 0.014, 0.004, MAT.solar, 1), -w / 2 + 0.035 + cw * (i + 0.5), 0.03, -d / 2 + 0.035 + cd * (j + 0.5)));
  const edge = at(bevelBox(w - 0.02, 0.01, 0.014, 0.004, STRIP, 1), 0, 0.03, d / 2 - 0.012);
  const p = group(frame, ...cells, edge);
  p.rotation.x = tilt;
  return p;
}

function solar(k: Kit): Object3D {
  const panelAt = at(panel(0.8, 0.74, 3, 3, 0.3), 0, 0.3, 0);
  const legs = [-1, 1].map((s) => strut([s * 0.3, 0.07, 0.3], [s * 0.3, 0.2, 0.2], 0.02, MAT.gunmetal, 10));
  const back = [-1, 1].map((s) => strut([s * 0.3, 0.07, -0.34], [s * 0.3, 0.42, -0.3], 0.02, MAT.gunmetal, 10));
  const box = at(group(bevelBox(0.16, 0.14, 0.12, 0.025, MAT.hull), at(bevelBox(0.17, 0.03, 0.13, 0.01, MAT.accent, 1), 0, 0.11, 0), at(bevelBox(0.005, 0.04, 0.07, 0.002, STRIP, 1), 0.083, 0.07, 0)), 0.3, 0.07, 0.3);
  const lamps = lamp(k, -0.38, 0.1, 0.38, COLORS.tech, { r: 6, phase: 0.2, size: 0.016 });
  k.wire(-0.34, 0.5, -0.34);
  k.top(0.56);
  const post = strut([-0.34, 0.07, -0.34], [-0.34, 0.48, -0.34], 0.016, MAT.steel, 8);
  const cap = at(lathe([[0.03, 0], [0.04, 0.02], [0.03, 0.05], [0.02, 0.07]], 12, MAT.hull), -0.34, 0.48, -0.34);
  return group(deck(0.92), panelAt, ...legs, ...back, box, post, cap, ...lamps);
}

function largeSolar(k: Kit): Object3D {
  const big = at(panel(2.5, 2.3, 6, 5, 0.22), 0, 0.62, 0);
  const pillars = [-0.9, 0, 0.9].flatMap((x) => [strut([x, 0.07, 0.95], [x, 0.4, 0.9], 0.04, MAT.gunmetal, 10), strut([x, 0.07, -1.0], [x, 0.82, -0.95], 0.04, MAT.gunmetal, 10), at(cylinder(0.08, 0.025, MAT.trim, 16, 0.008), x, 0.07, 0.95), at(cylinder(0.08, 0.025, MAT.trim, 16, 0.008), x, 0.07, -1.0)]);
  const rail = strut([-1.1, 0.5, 0.88], [1.1, 0.5, 0.88], 0.022, MAT.steel, 8);
  const inverter = at(group(bevelBox(0.4, 0.3, 0.28, 0.045, MAT.hull), at(bevelBox(0.41, 0.05, 0.29, 0.014, MAT.accent, 1), 0, 0.26, 0), at(bevelBox(0.006, 0.1, 0.16, 0.003, STRIP, 1), 0.203, 0.14, 0)), 1.05, 0.07, 1.05);
  const mastBase = at(cylinder(0.06, 0.04, MAT.gunmetal, 14, 0.008), -1.1, 0.07, -1.1);
  const mast = strut([-1.1, 0.07, -1.1], [-1.1, 0.95, -1.1], 0.026, MAT.steel, 10);
  const cap = at(lathe([[0.04, 0], [0.055, 0.025], [0.04, 0.06], [0.025, 0.09]], 12, MAT.hull), -1.1, 0.95, -1.1);
  const lamps = [...lamp(k, -1.1, 1.06, -1.1, COLORS.beacon, { r: 12, phase: 0.3, size: 0.026 }), ...lamp(k, 1.2, 0.1, 1.2, COLORS.tech, { r: 8, work: true, size: 0.02 }), ...lamp(k, -1.2, 0.1, 1.2, COLORS.tech, { r: 8, phase: 0.5, size: 0.02 })];
  k.wire(-1.1, 1.0, -1.1);
  k.top(1.2);
  return group(deck(2.92), big, ...pillars, rail, inverter, mastBase, mast, cap, ...lamps);
}

/* ---------- Wind turbine (2x2) ---------- */

const TOWER = 2.1;

/** Three blades in the local XY plane (axis +Z), rolled by `roll`. */
function rotor(roll: number): Object3D {
  const blades = [0, 1, 2].map((i) => {
    const blade = group(
      at(bevelBox(0.13, 0.92, 0.035, 0.014, MAT.hull), 0, 0.1, 0),
      at(bevelBox(0.135, 0.18, 0.04, 0.014, MAT.accent, 2), 0, 0.84, 0),
      at(bevelBox(0.03, 0.62, 0.042, 0.01, STRIP, 1), 0.0, 0.2, 0.002),
    );
    blade.rotation.z = (i * TAU) / 3;
    blade.rotation.x = 0;
    return blade;
  });
  const hub = group(at(dome(0.14, 0.14, MAT.accent, 24, 6), 0, 0, 0.0), at(ring(0.14, 0.012, MAT.steel, 24), 0, 0, 0));
  hub.rotation.x = Math.PI / 2;
  const inner = group(...blades, at(hub, 0, 0, 0.02));
  inner.rotation.z = roll;
  return inner;
}

function windTurbine(k: Kit, frame: number): Object3D {
  const base = at(group(cylinder(0.3, 0.16, MAT.hull, 32, 0.02), at(ring(0.3, 0.01, MAT.accent, 32), 0, 0.1, 0), at(rivets(0.24, 10, 0.012, MAT.trim), 0, 0.16, 0)), 0, 0.07, 0);
  const tower = at(taper(0.14, 0.075, TOWER - 0.1, MAT.hull, 32), 0, 0.2, 0);
  const bands = [0.6, 1.3].map((y) => at(cylinder(0.12 - y * 0.025, 0.05, MAT.accent, 28, 0.01), 0, 0.2 + y, 0));
  const strip = at(lathe([[0.1, 0.75], [0.103, 0.76], [0.103, 0.78], [0.1, 0.79]], 28, STRIP), 0, 0.2, 0);
  const door = at(bevelBox(0.07, 0.2, 0.012, 0.006, MAT.deep, 1), 0.0, 0.3, 0.14);
  const nacelle = group(
    at(bevelBox(0.24, 0.22, 0.52, 0.06, MAT.hull), 0, -0.11, 0),
    at(bevelBox(0.25, 0.04, 0.28, 0.014, MAT.accent, 2), 0, 0.09, -0.04),
    at(vents(3, 0.04, 0.06, 0.02, MAT.deep), 0, -0.08, -0.27),
    at(bevelBox(0.03, 0.2, 0.26, 0.01, MAT.trim), 0, -0.1, -0.4),
  );
  const rot = at(rotor((frame * TAU) / 3 / WORK_FRAMES), 0, 0, 0.32);
  const head = at(turn(group(nacelle, rot), Math.PI / 4), 0, TOWER + 0.1, 0);
  const lamps = [...lamp(k, 0, TOWER + 0.3, 0, COLORS.beacon, { r: 12, phase: 0.2, size: 0.024 }), ...lamp(k, 0.3, 0.2, 0.3, COLORS.tech, { r: 8, work: true, size: 0.018 })];
  const box = at(group(bevelBox(0.2, 0.2, 0.2, 0.035, MAT.hull), at(bevelBox(0.21, 0.03, 0.21, 0.01, MAT.accent, 1), 0, 0.17, 0), at(bevelBox(0.005, 0.07, 0.1, 0.002, STRIP, 1), 0.103, 0.1, 0)), 0.58, 0.07, 0.5);
  k.wire(0.58, 0.32, 0.5);
  k.top(TOWER + 1.1);
  return group(deck(1.92), base, tower, ...bands, strip, door, head, box, ...lamps);
}

/* ---------- Oil generator (2x2) ---------- */

/** A flywheel in the Y-Z plane (axis +X): rim, hub and 4 spokes, turned by `a`. */
function flywheel(a: number): Object3D {
  const rim = ring(0.2, 0.035, MAT.steel, 28);
  const hub = cylinder(0.06, 0.09, MAT.accent, 16, 0.01);
  const spokes = [0, 1, 2, 3].map((i) => turn(at(bevelBox(0.38, 0.02, 0.035, 0.008, MAT.gunmetal, 1), 0, 0.04, 0), (i * TAU) / 8));
  const wheel = group(at(rim, 0, 0.04, 0), hub, ...spokes);
  const spun = turn(group(wheel), a);
  const out = group(spun);
  out.rotation.z = -Math.PI / 2;
  return out;
}

function oilGenerator(k: Kit, frame: number): Object3D {
  const block = at(bevelBox(1.2, 0.36, 0.64, 0.08, MAT.hull), 0, 0.07, -0.12);
  const skirt = at(bevelBox(1.22, 0.05, 0.66, 0.02, MAT.accent, 2), 0, 0.12, -0.12);
  const heads = [-0.4, 0, 0.4].map((x, i) => {
    const lift = 0.11 * tri(frame, (i * WORK_FRAMES) / 3);
    return group(
      at(cylinder(0.12, 0.2, MAT.trim, 24, 0.014), x, 0.43, -0.12),
      at(ring(0.122, 0.008, MAT.steel, 24), x, 0.52, -0.12),
      at(cylinder(0.03, 0.2, MAT.steel, 14, 0.006), x, 0.63 + lift - 0.1, -0.12),
      at(dome(0.07, 0.05, MAT.steel, 16, 4), x, 0.73 + lift - 0.1, -0.12),
    );
  });
  const manifold = pipe([[-0.55, 0.55, -0.36], [0.5, 0.55, -0.36]], 0.03, MAT.gunmetal, 0.05);
  const stack = at(group(taper(0.07, 0.055, 0.72, MAT.hull, 20), at(cylinder(0.065, 0.05, MAT.accent, 20, 0.008), 0, 0.4, 0), at(lathe([[0.055, 0.72], [0.07, 0.73], [0.07, 0.76], [0.045, 0.77]], 20, MAT.deep), 0, 0, 0)), -0.55, 0.43, -0.36);
  const tank = at(group(lathe([[0, 0], [0.13, 0], [0.145, 0.02], [0.145, 0.5], [0.13, 0.54], [0, 0.55]], 28, MAT.accent), at(ring(0.147, 0.01, MAT.steel, 28), 0, 0.14, 0), at(ring(0.147, 0.01, MAT.steel, 28), 0, 0.4, 0), at(cylinder(0.05, 0.03, MAT.hull, 14, 0.006), 0, 0.54, 0)), 0, 0, 0);
  tank.rotation.z = Math.PI / 2;
  const tankAt = at(group(tank), -0.34, 0.24, 0.5);
  const cradle = [-0.5, -0.18].map((x) => at(bevelBox(0.06, 0.1, 0.3, 0.015, MAT.gunmetal), x, 0.07, 0.5));
  const feed = pipe([[-0.1, 0.24, 0.5], [0.05, 0.24, 0.5], [0.12, 0.3, 0.2], [0.12, 0.4, 0.0]], 0.022, MAT.steel, 0.06);
  const wheelAt = at(flywheel((frame * TAU) / 2 / WORK_FRAMES), 0.72, 0.3, -0.12);
  const box = at(group(bevelBox(0.3, 0.3, 0.26, 0.04, MAT.hull), at(bevelBox(0.31, 0.04, 0.27, 0.012, MAT.accent, 1), 0, 0.26, 0), at(bevelBox(0.006, 0.1, 0.15, 0.003, STRIP, 1), 0.153, 0.14, 0)), 0.5, 0.07, 0.52);
  const heat = k.light(0.2, 0.5, -0.12, '#ffb347', { r: 12, work: true, lamp: false });
  void heat;
  const lamps = lamp(k, -0.5, 0.5, 0.0, COLORS.tech, { r: 8, work: true, size: 0.018 });
  k.vent(-0.55, 1.2, -0.36);
  k.wire(0.5, 0.42, 0.52);
  k.top(1.2);
  return group(deck(1.92), block, skirt, ...heads, manifold, stack, tankAt, ...cradle, feed, wheelAt, box, ...lamps);
}

/* ---------- Batteries ---------- */

/** Vertical charge bars on one face (x faces +X when `rot` = 0). */
function chargeBars(n: number, lit: number, h: number, w: number): Object3D {
  const gap = w / n;
  return group(...Array.from({ length: n }, (_, i) => at(bevelBox(0.008, h, gap * 0.62, 0.003, CELL(i < lit), 1), 0, 0, -w / 2 + gap * (i + 0.5))));
}

/** Lit bars of a charge display in frame `frame`: `base` stay lit, one more runs up to the top over the loop. */
const chargeLit = (frame: number, base: number, n: number): number => (frame < 0 ? base : base + Math.floor((frame / WORK_FRAMES) * (n - base + 1)));

function battery(k: Kit, frame = -1): Object3D {
  const body = bevelBox(0.64, 0.46, 0.64, 0.07, MAT.hull);
  const band = at(bevelBox(0.656, 0.05, 0.656, 0.02, MAT.accent, 2), 0, 0.3, 0);
  const faceX = at(chargeBars(5, chargeLit(frame, 2, 5), 0.2, 0.44), 0.322, 0.08, 0);
  const faceZ = at(turn(chargeBars(5, chargeLit(frame, 2, 5), 0.2, 0.44), -Math.PI / 2), 0, 0.08, 0.322);
  const terminals = [-0.17, 0.17].map((x) => group(at(cylinder(0.06, 0.05, MAT.gunmetal, 16, 0.01), x, 0.0, 0), at(cylinder(0.04, 0.05, MAT.gold, 16, 0.01), x, 0.05, 0), at(cylinder(0.025, 0.03, MAT.steel, 12, 0.006), x, 0.1, 0)));
  const caps = at(group(...terminals), 0, 0.46, 0);
  const rail = at(bevelBox(0.5, 0.012, 0.014, 0.004, STRIP, 1), 0, 0.455, 0.25);
  k.wire(0.17, 0.62, 0);
  k.top(0.62);
  const lamps = lamp(k, -0.25, 0.5, -0.25, COLORS.tech, { r: 7, phase: 0.4, size: 0.016 });
  return group(deck(0.92), at(group(body, band, faceX, faceZ, caps, rail), 0, 0.07, 0), ...lamps);
}

function largeBattery(k: Kit, frame = -1): Object3D {
  const frameBox = at(bevelBox(1.5, 0.2, 1.5, 0.06, MAT.trim), 0, 0.07, 0);
  const lip = at(bevelBox(1.52, 0.03, 1.52, 0.012, MAT.accent, 2), 0, 0.2, 0);
  const cells: Object3D[] = [];
  for (const [i, [x, z]] of ([[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]] as const).entries()) {
    const cell = group(
      cylinder(0.3, 0.6, MAT.hull, 40, 0.04),
      at(lathe([[0.302, 0.18], [0.308, 0.19], [0.308, 0.25], [0.302, 0.26]], 40, MAT.accent), 0, 0, 0),
      at(lathe([[0.302, 0.4], [0.306, 0.405], [0.306, 0.425], [0.302, 0.43]], 40, frame < 0 ? CELL(i < 3) : emissive(COLORS.tech, 1 + 2 * tri(frame, (i * WORK_FRAMES) / 4))), 0, 0, 0),
      at(cylinder(0.12, 0.06, MAT.gunmetal, 20, 0.012), 0, 0.6, 0),
      at(cylinder(0.07, 0.06, MAT.gold, 20, 0.012), 0, 0.66, 0),
      at(dome(0.05, 0.03, MAT.steel, 14, 3), 0, 0.72, 0),
    );
    cells.push(at(cell, x, 0.27, z));
  }
  const bus = [strut([-0.36, 0.95, -0.36], [0.36, 0.95, -0.36], 0.02, MAT.steel, 8), strut([-0.36, 0.95, 0.36], [0.36, 0.95, 0.36], 0.02, MAT.steel, 8), strut([-0.36, 0.95, -0.36], [-0.36, 0.95, 0.36], 0.02, MAT.steel, 8), strut([0.36, 0.95, -0.36], [0.36, 0.95, 0.36], 0.02, MAT.steel, 8)];
  const brace = [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]].map(([x, z]) => strut([x!, 0.93, z!], [x!, 0.99, z!], 0.014, MAT.steel, 8));
  const panelBox = at(group(bevelBox(0.42, 0.34, 0.2, 0.045, MAT.hull), at(bevelBox(0.43, 0.04, 0.21, 0.012, MAT.accent, 1), 0, 0.3, 0), at(chargeBars(6, 4, 0.18, 0.3), 0.211, 0.08, 0)), 0, 0.07, 0);
  void panelBox;
  const lamps = [...lamp(k, -0.7, 0.28, 0.7, COLORS.tech, { r: 8, phase: 0.3, size: 0.018 }), ...lamp(k, 0.7, 0.28, 0.7, COLORS.tech, { r: 8, phase: 0.6, size: 0.018 })];
  const face = at(group(bevelBox(0.05, 0.34, 0.5, 0.012, MAT.panel, 1), at(chargeBars(8, chargeLit(frame, 3, 8), 0.22, 0.4), 0.03, 0.06, 0)), 0.76, 0.2, 0);
  k.wire(0, 1.0, 0);
  k.top(1.0);
  return group(deck(1.92), frameBox, lip, ...cells, ...bus, ...brace, face, ...lamps);
}

/* ---------- Power nodes ---------- */

/** Beads of light orbiting a node's core (`n` of them, radius `r`), turned by `a`. */
function orbit(n: number, r: number, a: number, size: number): Object3D {
  const beads = Array.from({ length: n }, (_, i) => {
    const t = a + (i / n) * TAU;
    return at(orb(size, emissive(COLORS.tech, 3)), Math.cos(t) * r, -size, -Math.sin(t) * r);
  });
  const track = ring(r, 0.005, MAT.steel, 40);
  return group(track, ...beads);
}

function powerNode(k: Kit, frame = 0): Object3D {
  const plinth = group(cylinder(0.26, 0.07, MAT.trim, 32, 0.016), at(ring(0.25, 0.008, STRIP, 32), 0, 0.055, 0), at(rivets(0.2, 8, 0.01, MAT.steel), 0, 0.07, 0));
  const mast = at(taper(0.065, 0.04, 0.55, MAT.hull, 20), 0, 0.14, 0);
  const band = at(cylinder(0.07, 0.04, MAT.accent, 20, 0.008), 0, 0.22, 0);
  const ins = at(insulators(0.62, 3, 0.05), 0, 0, 0);
  const core = at(orb(0.07, emissive(COLORS.tech, 2.2 + 1.1 * tri(frame))), 0, 0.77, 0);
  const prongs = [0, 1, 2].map((i) => {
    const a = (i / 3) * TAU;
    return strut([Math.cos(a) * 0.06, 0.74, Math.sin(a) * 0.06], [Math.cos(a) * 0.1, 0.9, Math.sin(a) * 0.1], 0.011, MAT.steel, 8);
  });
  // three beads orbit the core: a third of a lap per loop (their symmetry), so the loop closes
  const ringOf = at(orbit(3, 0.15, (frame * TAU) / 3 / WORK_FRAMES, 0.018), 0, 0.84, 0);
  const lamps = lamp(k, 0, 0.98, 0, COLORS.tech, { r: 10, phase: 0.1, size: 0.02 });
  k.wire(0, 0.82, 0);
  k.top(1.0);
  return group(deck(0.92), at(plinth, 0, 0.07, 0), at(group(mast, band, ins, core, ...prongs, ringOf), 0, 0.07, 0), ...lamps);
}

function largePowerNode(k: Kit, frame = 0): Object3D {
  const plinth = group(bevelBox(0.8, 0.14, 0.8, 0.05, MAT.trim), at(bevelBox(0.82, 0.03, 0.82, 0.012, MAT.accent, 2), 0, 0.03, 0), at(rivets(0.34, 8, 0.012, MAT.steel), 0, 0.14, 0));
  const mast = at(taper(0.12, 0.06, 1.15, MAT.hull, 28), 0, 0.14, 0);
  const bands = [0.25, 0.7].map((y) => at(cylinder(0.11 - y * 0.05, 0.05, MAT.accent, 24, 0.01), 0, 0.14 + y, 0));
  const strip = at(lathe([[0.085, 0.5], [0.088, 0.51], [0.088, 0.53], [0.085, 0.54]], 24, STRIP), 0, 0.14, 0);
  const arm = strut([-0.3, 1.08, 0.3], [0.3, 1.08, -0.3], 0.028, MAT.steel, 12);
  const armIns = [-1, 1].map((s) => at(insulators(1.1, 3, 0.04), s * 0.3, 0, -s * 0.3));
  const braces = [-1, 1].map((s) => strut([0, 0.85, 0], [s * 0.22, 1.05, -s * 0.22], 0.016, MAT.gunmetal, 8));
  const core = at(orb(0.12, emissive(COLORS.tech, 2.4 + 1.2 * tri(frame))), 0, 1.3, 0);
  const beads = at(orbit(4, 0.26, (frame * TAU) / 4 / WORK_FRAMES, 0.022), 0, 1.38, 0);
  const beadsLow = at(orbit(4, 0.2, -(frame * TAU) / 4 / WORK_FRAMES + TAU / 8, 0.016), 0, 1.2, 0);
  const prongs = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * TAU + 0.4;
    return strut([Math.cos(a) * 0.1, 1.24, Math.sin(a) * 0.1], [Math.cos(a) * 0.17, 1.48, Math.sin(a) * 0.17], 0.014, MAT.steel, 8);
  });
  const ringHalo = at(ring(0.2, 0.012, MAT.gold, 36), 0, 1.42, 0);
  const box = at(group(bevelBox(0.2, 0.2, 0.2, 0.035, MAT.hull), at(bevelBox(0.21, 0.03, 0.21, 0.01, MAT.accent, 1), 0, 0.17, 0), at(bevelBox(0.005, 0.07, 0.1, 0.002, STRIP, 1), 0.103, 0.1, 0)), 0.58, 0.07, 0.5);
  const lamps = [...lamp(k, 0, 1.64, 0, COLORS.tech, { r: 12, phase: 0.1, size: 0.024 }), ...lamp(k, 0.3, 1.18, -0.3, COLORS.tech, { r: 6, phase: 0.5, size: 0.016 }), ...lamp(k, -0.3, 1.18, 0.3, COLORS.tech, { r: 6, phase: 0.8, size: 0.016 })];
  k.wire(0.3, 1.2, -0.3);
  k.top(1.65);
  return group(deck(1.92), at(plinth, 0, 0.07, 0), at(group(mast, ...bands, strip, arm, ...armIns, ...braces, core, ...prongs, ringHalo, beads, beadsLow), 0, 0.07, 0), box, ...lamps);
}

/** Registers every power building. */
export function registerPower(): void {
  register(['combustion-generator'], 1, (k, f) => combustion(k, f), true);
  register(['solar-panel'], 1, (k) => solar(k));
  register(['large-solar'], 3, (k) => largeSolar(k));
  register(['wind-turbine'], 2, windTurbine, true);
  register(['oil-generator'], 2, oilGenerator, true);
  register(['battery'], 1, (k, f) => battery(k, f), true);
  register(['large-battery'], 2, (k, f) => largeBattery(k, f), true);
  register(['power-node'], 1, (k, f) => powerNode(k, f), true);
  register(['large-power-node'], 2, (k, f) => largePowerNode(k, f), true);
}

void plate; void COPPER;
