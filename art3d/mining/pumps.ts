import { PointLight, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, lathe, lightPool, MAT, pipe, ring, rivets, strut, surface, taper, turn, vents, type Kit } from '../kit';
import { basePlate, foot, lamp, register, STRIP, TAU, tri, WORK_FRAMES } from './common';

/**
 * Pumps and extractors (docs/art.md): the water pump (1x1, an impeller under a glass dome), the ground pump
 * (1x1, a stand pipe with a rocking arm), the oil derrick (2x2, a nodding pumpjack) and the slag tap (2x2, a
 * crucible with bubbling slag). Each idles in frame 0 and plays a 12-frame work loop (kit/loop.ts).
 */

const WATER = emissive('#7fdcff', 1.5);
const SLAG = (power: number) => emissive('#ff7a2e', power);
const OIL = surface('#15121f', { rough: 0.25, metal: 0.4, coat: 1 });

/** A pipe stub with a bolted flange at its end (a conduit meets it); runs along +X or +Z. */
function stub(from: [number, number, number], to: [number, number, number], r = 0.045): Object3D {
  const alongX = to[0] !== from[0];
  const flange = cylinder(r * 1.5, 0.03, MAT.gunmetal, 16, 0.008);
  if (alongX) {
    flange.rotation.z = Math.PI / 2;
    flange.position.set(to[0], to[1], to[2]);
  } else {
    flange.rotation.x = Math.PI / 2;
    flange.position.set(to[0], to[1], to[2] - 0.03);
  }
  return group(strut(from, to, r, MAT.steel, 14), flange);
}

/* ---------- Water pump (1x1) ---------- */

function impeller(rot: number): Object3D {
  const blades = [0, 1, 2].map((i) => turn(at(bevelBox(0.17, 0.035, 0.07, 0.012, i === 0 ? MAT.accent : MAT.steel, 1), 0.09, 0, 0), -(i * TAU) / 3));
  return turn(group(...blades, cylinder(0.03, 0.06, MAT.accent, 14, 0.008)), rot);
}

function waterPump(k: Kit, frame: number): Object3D {
  const body = lathe([[0, 0.07], [0.3, 0.07], [0.33, 0.11], [0.33, 0.3], [0.3, 0.34], [0.2, 0.36], [0, 0.36]], 40, MAT.hull);
  const band = lathe([[0.332, 0.13], [0.337, 0.14], [0.337, 0.2], [0.332, 0.21]], 40, MAT.accent);
  const strip = lathe([[0.332, 0.25], [0.336, 0.255], [0.336, 0.27], [0.332, 0.275]], 40, STRIP);
  const bolts = at(rivets(0.28, 10, 0.011, MAT.trim), 0, 0.345, 0);
  const seat = at(cylinder(0.2, 0.02, MAT.deep, 32, 0.004), 0, 0.355, 0);
  const water = at(cylinder(0.19, 0.02, WATER, 32, 0.004), 0, 0.37, 0);
  const rotor = at(impeller((frame * TAU * 2) / 3 / WORK_FRAMES), 0, 0.395, 0);
  const lens = at(dome(0.04, 0.03, MAT.accent, 16, 4), 0, 0.43, 0);
  const rimRing = at(ring(0.2, 0.014, MAT.steel, 32), 0, 0.37, 0);
  const outA = stub([0.2, 0.2, 0], [0.4, 0.2, 0]);
  const outB = stub([0, 0.2, 0.2], [0, 0.2, 0.4]);
  const lamps = lamp(k, -0.22, 0.3, -0.22, COLORS.tech, { r: 8, work: true, size: 0.02 });
  k.vent(0, 0.5, 0);
  k.top(0.52);
  return group(basePlate(1), body, band, strip, bolts, seat, water, rotor, lens, rimRing, outA, outB, ...lamps);
}

/* ---------- Ground pump (1x1) ---------- */

function groundBody(k: Kit, frame: number): Object3D {
  const swing = 0.26 * Math.sin((frame / WORK_FRAMES) * TAU);
  const well = group(
    cylinder(0.27, 0.16, MAT.hull, 36, 0.022),
    at(ring(0.272, 0.01, MAT.accent, 36), 0, 0.1, 0),
    at(cylinder(0.19, 0.02, MAT.gunmetal, 28, 0.006), 0, 0.16, 0),
    at(ring(0.27, 0.007, STRIP, 36), 0, 0.15, 0),
    at(rivets(0.22, 8, 0.01, MAT.trim), 0, 0.16, 0),
  );
  const column = at(taper(0.075, 0.055, 0.7, MAT.hull, 24), 0, 0.2, 0);
  const collars = [0.36, 0.7].map((y) => at(cylinder(0.09, 0.035, MAT.accent, 20, 0.008), 0, y, 0));
  const tee = at(group(cylinder(0.1, 0.06, MAT.gunmetal, 20, 0.01)), 0, 0.84, 0);
  // the rocking arm pivots on a pin at the top of the column
  const pivotY = 0.92;
  const arm = group(bevelBox(0.58, 0.05, 0.07, 0.015, MAT.steel), at(bevelBox(0.1, 0.1, 0.1, 0.02, MAT.accent), 0.3, -0.025, 0), at(dome(0.045, 0.04, MAT.steel, 14, 4), -0.22, 0.025, 0));
  arm.children[0]!.position.x = 0.08;
  arm.rotation.z = swing;
  const armTurn = at(turn(group(arm), Math.PI / 4), 0, pivotY, 0);
  const pin = at(cylinder(0.03, 0.12, MAT.gunmetal, 14, 0.006), 0, pivotY, 0.06);
  pin.rotation.x = -Math.PI / 2;
  const rx = -0.19 * Math.cos(swing) * Math.SQRT1_2;
  const rz = 0.19 * Math.cos(swing) * Math.SQRT1_2;
  const rod = strut([rx, pivotY - 0.19 * Math.sin(swing) - 0.02, rz], [rx, 0.17, rz], 0.012, MAT.steel, 8);
  const gauge = at(group(cylinder(0.055, 0.03, MAT.hull, 20, 0.006), at(cylinder(0.042, 0.012, MAT.deep, 20, 0.004), 0, 0.02, 0), at(bevelBox(0.004, 0.006, 0.034, 0.002, STRIP, 1), 0, 0.03, 0.01)), 0.18, 0.22, 0.12);
  gauge.rotation.x = Math.PI / 2 - 0.3;
  const lamps = lamp(k, 0, 1.04, 0, COLORS.tech, { r: 9, work: true, size: 0.024 });
  k.vent(0, 0.2, 0);
  k.top(1.05);
  return group(well, column, ...collars, tee, pin, armTurn, rod, gauge, ...lamps);
}

/** The 2x2 ground pump: the stand-pipe rig scaled up in the middle, a pump box, a buffer tank and outlet stubs. */
function groundPump(k: Kit, frame: number, n: number): Object3D {
  const rig = group(groundBody(k, frame));
  rig.scale.setScalar(1.3);
  rig.position.set(-0.15 * (n - 1), 0, -0.15 * (n - 1));
  const box = at(group(bevelBox(0.34, 0.3, 0.3, 0.045, MAT.hull), at(bevelBox(0.35, 0.04, 0.31, 0.012, MAT.accent, 1), 0, 0.26, 0), at(bevelBox(0.006, 0.1, 0.18, 0.003, STRIP, 1), 0.173, 0.12, 0), at(vents(3, 0.05, 0.1, 0.02, MAT.deep), 0, 0.08, 0.152)), 0.52, 0.07, -0.5);
  const tank = at(group(lathe([[0, 0], [0.17, 0], [0.19, 0.02], [0.19, 0.4], [0.17, 0.44], [0, 0.46]], 28, MAT.hull), at(ring(0.192, 0.01, MAT.accent, 28), 0, 0.12, 0), at(lathe([[0.192, 0.28], [0.196, 0.285], [0.196, 0.3], [0.192, 0.305]], 28, WATER), 0, 0, 0)), 0.5, 0.07, 0.48);
  const link = pipe([[0.5, 0.2, 0.3], [0.4, 0.2, 0.0], [0.2, 0.2, -0.2]], 0.026, MAT.steel, 0.08);
  const outA = stub([0.7, 0.2, 0.1], [0.92, 0.2, 0.1]);
  const outB = stub([-0.1, 0.2, 0.7], [-0.1, 0.2, 0.92]);
  k.top(1.4);
  return group(basePlate(n), rig, box, tank, link, outA, outB);
}

/* ---------- Oil derrick (2x2 art, scaled up for 3x3) ---------- */

/** The wellhead: a "Christmas tree" of stacked valves and a side outlet. */
function wellhead(): Object3D {
  const side = at(cylinder(0.045, 0.2, MAT.steel, 14, 0.008), -0.02, 0.42, 0);
  side.rotation.z = -Math.PI / 2;
  const wheel = at(ring(0.06, 0.012, MAT.accent, 18), 0.2, 0.42, 0);
  wheel.rotation.z = Math.PI / 2;
  return group(
    at(bevelBox(0.5, 0.14, 0.5, 0.04, MAT.gunmetal), 0, 0, 0),
    at(cylinder(0.11, 0.3, MAT.hull, 24, 0.012), 0, 0.14, 0),
    at(cylinder(0.14, 0.05, MAT.accent, 24, 0.01), 0, 0.22, 0),
    at(cylinder(0.075, 0.2, MAT.steel, 20, 0.01), 0, 0.44, 0),
    at(dome(0.08, 0.06, MAT.accent, 20, 4), 0, 0.64, 0),
    side,
    wheel,
  );
}

function derrickBody(k: Kit, frame: number): Object3D {
  const phi = (frame * TAU) / WORK_FRAMES;
  const theta = 0.17 * Math.sin(phi);
  // local frame: the beam runs along local +X; turned so it lies along the screen's horizontal
  const pivotX = -0.1;
  const pivotY = 1.02;
  const tower = [-1, 1].flatMap((s) => [strut([pivotX - 0.12, 0.07, s * 0.22], [pivotX, pivotY - 0.05, s * 0.1], 0.03, MAT.steel, 10), strut([pivotX + 0.2, 0.07, s * 0.22], [pivotX, pivotY - 0.05, s * 0.1], 0.03, MAT.steel, 10)]);
  const brace = strut([pivotX - 0.1, 0.5, 0.18], [pivotX + 0.1, 0.5, 0.18], 0.016, MAT.gunmetal, 8);
  const brace2 = strut([pivotX - 0.1, 0.5, -0.18], [pivotX + 0.1, 0.5, -0.18], 0.016, MAT.gunmetal, 8);
  const feet = [-1, 1].flatMap((s) => [at(foot(0.07), pivotX - 0.12, 0.07, s * 0.22), at(foot(0.07), pivotX + 0.2, 0.07, s * 0.22)]);
  const saddle = at(bevelBox(0.14, 0.12, 0.3, 0.03, MAT.accent), pivotX, pivotY - 0.09, 0);
  // the walking beam pivots on the saddle; horsehead at the wellhead end
  const beam = group(
    bevelBox(1.5, 0.1, 0.1, 0.03, MAT.hull),
    at(bevelBox(1.52, 0.03, 0.115, 0.01, MAT.accent, 2), 0, 0.07, 0),
    at(lathe([[0.0, 0], [0.16, 0], [0.16, 0.2], [0.08, 0.3], [0, 0.3]], 14, MAT.accent), 0.7, -0.1, 0),
    at(bevelBox(0.3, 0.26, 0.16, 0.04, MAT.hull), 0.7, -0.22, 0),
    at(bevelBox(0.26, 0.2, 0.16, 0.03, MAT.gunmetal), -0.66, -0.06, 0),
  );
  beam.rotation.z = -theta;
  const beamAt = at(group(beam), pivotX, pivotY, 0);
  const rear = [-0.66 * Math.cos(theta) + pivotX, pivotY + 0.66 * Math.sin(theta) - 0.18] as const;
  // crank disc with a counterweight, driven by a motor through a belt; the pitman links its pin to the beam
  const crankX = -0.62;
  const crankY = 0.3;
  const disc = group(cylinder(0.24, 0.05, MAT.gunmetal, 32, 0.01), at(cylinder(0.06, 0.09, MAT.accent, 16, 0.01), 0, 0, 0), at(bevelBox(0.18, 0.04, 0.12, 0.02, MAT.accent), 0.12, 0.045, 0));
  disc.rotation.x = Math.PI / 2;
  const crank = at(group(disc), crankX, crankY, 0.16);
  disc.rotation.z = -phi + Math.PI / 2;
  const pinX = crankX + 0.18 * Math.cos(phi - Math.PI / 2);
  const pinY = crankY + 0.18 * Math.sin(phi - Math.PI / 2);
  const pitman = strut([pinX, pinY, 0.2], [rear[0], rear[1], 0.1], 0.016, MAT.steel, 8);
  const motor = at(group(bevelBox(0.3, 0.2, 0.22, 0.04, MAT.hull), at(bevelBox(0.31, 0.03, 0.23, 0.01, MAT.accent, 1), 0, 0.17, 0), at(vents(3, 0.05, 0.08, 0.02, MAT.deep), 0, 0.06, 0.112)), -0.2, 0.07, -0.42);
  const bridle = strut([0.7 * Math.cos(theta) + pivotX - 0.02, pivotY - 0.7 * Math.sin(theta) - 0.1, 0], [0.5, 0.74, 0], 0.014, MAT.rubber, 8);
  const slab = at(bevelBox(1.3, 0.04, 0.84, 0.014, MAT.trim, 2), 0.0, 0.07, 0);
  const rig = group(slab, ...tower, brace, brace2, ...feet, saddle, beamAt, crank, pitman, motor, bridle, at(wellhead(), 0.5, 0.07, 0));
  const turned = turn(rig, Math.PI / 4);
  const tank = at(group(lathe([[0, 0], [0.14, 0], [0.15, 0.02], [0.15, 0.26], [0.13, 0.3], [0, 0.32]], 24, MAT.hull), at(ring(0.152, 0.008, MAT.accent, 24), 0, 0.08, 0), at(ring(0.152, 0.008, MAT.accent, 24), 0, 0.2, 0)), -0.62, 0.07, 0.62);
  const lamps = lamp(k, 0.0, 1.22, 0, COLORS.beacon, { r: 11, phase: 0.2, size: 0.024 });
  const spill = new PointLight('#ffb347', 0.25, 0.9, 1.6);
  spill.position.set(0.6, 0.4, 0.6);
  void OIL;
  k.vent(0.35, 0.78, 0.35);
  k.goods(0.55, 0.1, 0.55);
  k.top(1.3);
  return group(turned, tank, ...lamps, spill);
}

/* ---------- Slag tap (2x2) ---------- */

function bubble(x: number, z: number, r: number, power: number): Object3D {
  return at(dome(r, r * 0.8, SLAG(power), 14, 4), x, 0.42, z);
}

function slagTap(k: Kit, frame: number): Object3D {
  const glow = 2.1 + 0.8 * tri(frame);
  const tub = bevelBox(1.12, 0.36, 1.12, 0.06, MAT.gunmetal);
  const skirt = at(bevelBox(1.14, 0.06, 1.14, 0.02, MAT.accent, 2), 0, 0.06, 0);
  const rim = at(bevelBox(1.0, 0.07, 1.0, 0.03, MAT.deep, 2), 0, 0.34, 0);
  const bath = at(bevelBox(0.84, 0.03, 0.84, 0.02, SLAG(glow), 1), 0, 0.4, 0);
  const crust = [
    [-0.28, 0.22, 0.2],
    [0.3, -0.26, 0.16],
    [0.05, 0.3, 0.12],
  ].map(([x, z, r]) => at(dome(r!, r! * 0.35, MAT.deep, 12, 3), x!, 0.42, z!));
  // bubbles swell and pop where they stand, each on its own beat (a size of zero is a popped bubble)
  const swell = (shift: number) => Math.max(0, Math.sin(((frame / WORK_FRAMES + shift) % 1) * Math.PI));
  const bubbles = (
    [
      [-0.12, 0.1, 0.06, 0],
      [0.22, -0.22, 0.045, 0.33],
      [-0.3, 0.3, 0.05, 0.66],
      [0.12, 0.2, 0.035, 0.5],
      [-0.05, -0.3, 0.04, 0.15],
    ] as const
  )
    .filter(([, , , s]) => swell(s) > 0.08)
    .map(([x, z, r, s]) => bubble(x, z, r * swell(s), 3 + 0.5 * swell(s)));
  // a hood and chimney catch the fumes; a pump block with a spout draws the slag out to the side
  const hood = at(group(taper(0.5, 0.2, 0.34, MAT.hull, 4), at(cylinder(0.2, 0.06, MAT.accent, 20, 0.01), 0, 0.34, 0)), 0, 0.6, 0);
  hood.rotation.y = Math.PI / 4;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => strut([x! * 0.44, 0.38, z! * 0.44], [x! * 0.4, 0.6, z! * 0.4], 0.028, MAT.steel, 10));
  const stack = at(group(cylinder(0.13, 0.5, MAT.hull, 24, 0.012), at(ring(0.132, 0.008, MAT.accent, 24), 0, 0.3, 0), at(lathe([[0.12, 0.5], [0.14, 0.52], [0.14, 0.55], [0.1, 0.56]], 24, MAT.deep), 0, 0, 0)), 0, 0.94, 0);
  const pump = at(group(bevelBox(0.3, 0.26, 0.34, 0.05, MAT.hull), at(bevelBox(0.31, 0.04, 0.35, 0.012, MAT.accent, 1), 0, 0.22, 0), at(bevelBox(0.006, 0.08, 0.2, 0.003, STRIP, 1), 0.153, 0.1, 0)), 0.58, 0.38, -0.5);
  const spout = pipe([[0.58, 0.5, -0.4], [0.58, 0.5, -0.1], [0.34, 0.46, 0.06]], 0.035, MAT.steel, 0.09);
  const outA = stub([0.4, 0.2, 0.0], [0.6, 0.2, 0.0]);
  const pool = at(lightPool(0.9, '#ff7a2e', 0.4), 0, 0.0, 0);
  const spill = new PointLight('#ff7a2e', 0.9, 1.4, 1.6);
  spill.position.set(0, 0.6, 0);
  const lamps = [...lamp(k, 0.0, 0.5, 0.52, '#ff8a3d', { r: 18, work: true, size: 0.02 }), ...lamp(k, -0.5, 0.22, 0.5, COLORS.tech, { r: 8, work: true, size: 0.02 })];
  k.vent(0, 1.5, 0);
  k.goods(0.5, 0.1, 0.5);
  k.top(1.5);
  return group(basePlate(2), tub, skirt, rim, bath, ...crust, ...bubbles, hood, ...legs, stack, pump, spout, outA, pool, spill, ...lamps);
}

/** The 3x3 derrick: the pumpjack scaled up on a bigger pad, with a tank farm, a pipeline stub and a control box. */
function derrick(k: Kit, frame: number, n: number): Object3D {
  const rig = group(derrickBody(k, frame));
  rig.scale.setScalar(1.25);
  rig.position.set(0.1, 0, -0.1);
  const tanks = [-0.55, 0.0].map((z, i) => at(group(lathe([[0, 0], [0.2, 0], [0.22, 0.02], [0.22, 0.42], [0.2, 0.46], [0, 0.48]], 28, MAT.hull), at(ring(0.222, 0.01, MAT.accent, 28), 0, 0.12, 0), at(ring(0.222, 0.01, MAT.accent, 28), 0, 0.32, 0), at(cylinder(0.06, 0.04, MAT.accent, 14, 0.008), 0, 0.46, 0)), -1.0, 0.07, z - 0.35 + i * 0.1));
  const header = pipe([[-1.0, 0.3, -0.9], [-1.0, 0.3, -0.25]], 0.03, MAT.steel, 0.06);
  const box = at(group(bevelBox(0.36, 0.3, 0.3, 0.045, MAT.hull), at(bevelBox(0.37, 0.04, 0.31, 0.012, MAT.accent, 1), 0, 0.26, 0), at(bevelBox(0.006, 0.1, 0.18, 0.003, STRIP, 1), 0.183, 0.12, 0)), 0.95, 0.07, -0.95);
  const outA = stub([1.1, 0.2, 0.4], [1.3, 0.2, 0.4]);
  const outB = stub([-0.4, 0.2, 1.1], [-0.4, 0.2, 1.3]);
  const oilPool = at(group(bevelBox(0.5, 0.012, 0.5, 0.01, OIL, 1)), 0.4, 0.07, 0.45);
  k.top(1.8);
  return group(basePlate(n), rig, ...tanks, header, box, outA, outB, oilPool);
}

/* ---------- Water extractor (3x3) ---------- */

function extractorFan(rot: number): Object3D {
  const blades = Array.from({ length: 6 }, (_, i) => turn(at(bevelBox(0.3, 0.014, 0.1, 0.006, i % 2 ? MAT.steel : MAT.hull, 1), 0.2, 0, 0), -(i * TAU) / 6));
  return turn(group(...blades, dome(0.1, 0.06, MAT.accent, 20, 5)), rot);
}

function waterExtractor(k: Kit, frame: number, n: number): Object3D {
  const pulse = 1.4 + 0.5 * tri(frame);
  const tower = lathe([[0, 0.07], [0.78, 0.07], [0.84, 0.12], [0.84, 0.75], [0.76, 0.86], [0.64, 0.9], [0, 0.9]], 56, MAT.hull);
  const band = lathe([[0.842, 0.16], [0.85, 0.17], [0.85, 0.27], [0.842, 0.28]], 56, MAT.accent);
  const window = lathe([[0.842, 0.4], [0.852, 0.41], [0.852, 0.6], [0.842, 0.61]], 56, emissive('#7fdcff', pulse));
  const strip = lathe([[0.842, 0.68], [0.848, 0.685], [0.848, 0.7], [0.842, 0.705]], 56, STRIP);
  const bolts = at(rivets(0.8, 18, 0.014, MAT.trim), 0, 0.85, 0);
  // the intake crown: louvre slats around an open top with the fan inside
  const slats = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * TAU;
    return turn(at(bevelBox(0.05, 0.34, 0.2, 0.012, i % 4 === 0 ? MAT.accent : MAT.trim, 1), Math.cos(a) * 0.6, 0.9, -Math.sin(a) * 0.6), a);
  });
  const crown = at(ring(0.62, 0.03, MAT.steel, 48), 0, 1.25, 0);
  const wellFloor = at(cylinder(0.52, 0.02, MAT.deep, 32, 0.004), 0, 0.9, 0);
  const fan = at(extractorFan((frame * TAU) / 3 / WORK_FRAMES), 0, 1.0, 0);
  const hub = at(cylinder(0.06, 0.12, MAT.gunmetal, 16, 0.01), 0, 0.9, 0);
  const corners: Object3D[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = x * 1.0;
    const cz = z * 1.0;
    corners.push(at(group(cylinder(0.2, 0.62, MAT.hull, 28, 0.02), at(ring(0.202, 0.009, MAT.accent, 28), 0, 0.14, 0), at(lathe([[0.202, 0.3], [0.206, 0.305], [0.206, 0.4], [0.202, 0.405]], 28, emissive('#7fdcff', pulse * 0.8)), 0, 0, 0), at(dome(0.15, 0.08, MAT.steel, 20, 4), 0, 0.62, 0)), cx, 0.07, cz));
    corners.push(pipe([[cx * 0.8, 0.25, cz * 0.8], [cx * 0.6, 0.25, cz * 0.6], [cx * 0.82, 0.25, cz * 0.4]], 0.03, MAT.steel, 0.08));
  }
  const lamps = [...lamp(k, 0, 1.4, 0, COLORS.tech, { r: 12, work: true, size: 0.022 }), ...lamp(k, 0.6, 0.45, 1.0, '#7fdcff', { r: 9, phase: 0.5, size: 0.02 })];
  const spill = new PointLight('#7fdcff', 0.4, 1.4, 1.6);
  spill.position.set(0.5, 0.5, 0.5);
  k.vent(0, 1.3, 0);
  k.wire(1.0, 0.8, 1.0);
  k.top(1.5);
  return group(basePlate(n), tower, band, window, strip, bolts, ...slats, crown, wellFloor, hub, fan, ...corners, spill, ...lamps);
}

/* ---------- Salvage drill (2x2) ---------- */

/** A shredder roller lying along X: a drum with 8 chunky teeth, turned about its own axis by `a`. */
function roller(a: number): Object3D {
  const drum = cylinder(0.1, 0.62, MAT.gunmetal, 20, 0.01);
  drum.rotation.z = Math.PI / 2;
  drum.position.x = 0.31;
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const t = at(bevelBox(0.56, 0.07, 0.07, 0.012, MAT.steel, 1), 0, 0.1, 0);
    const g = group(t);
    g.rotation.x = (i * TAU) / 8;
    return g;
  });
  const hub = at(cylinder(0.06, 0.04, MAT.accent, 14, 0.008), 0, 0, 0);
  hub.rotation.z = Math.PI / 2;
  const spin = group(drum, ...teeth.map((t) => at(t, 0.3, 0, 0)), hub);
  spin.rotation.x = a;
  return at(spin, -0.3, 0, 0);
}

function scrap(x: number, z: number, y: number, rot: number, w: number, mat: typeof MAT.steel): Object3D {
  const piece = bevelBox(w, 0.03, w * 0.7, 0.008, mat, 1);
  piece.rotation.set(0.25 * Math.sin(rot * 3), rot, 0.3 * Math.cos(rot * 2));
  return at(piece, x, y, z);
}

function salvageDrill(k: Kit, frame: number): Object3D {
  const a = (frame * TAU) / 4 / WORK_FRAMES;
  const body = bevelBox(1.26, 0.34, 1.26, 0.06, MAT.hull);
  const band = at(bevelBox(1.276, 0.05, 1.276, 0.02, MAT.accent, 2), 0, 0.1, 0);
  const lid = at(bevelBox(1.1, 0.03, 1.1, 0.012, MAT.trim, 1), 0, 0.34, 0);
  const pit = at(bevelBox(0.86, 0.02, 0.7, 0.008, MAT.deep, 1), 0, 0.36, 0.05);
  const rollA = at(roller(a), 0, 0.46, 0.2);
  const rollB = at(roller(-a + TAU / 16), 0, 0.46, -0.1);
  const guards = [-0.44, 0.44].map((x) => at(bevelBox(0.05, 0.2, 0.74, 0.012, MAT.accent, 1), x, 0.36, 0.05));
  const heap = [scrap(0.3, 0.5, 0.38, 0.4, 0.2, MAT.steel), scrap(0.1, 0.52, 0.4, 1.7, 0.16, MAT.gunmetal), scrap(0.4, 0.4, 0.42, 2.5, 0.14, MAT.accent), scrap(-0.35, 0.48, 0.38, 0.9, 0.18, MAT.steel)];
  // the magnet crane: a post, a boom, a cable and a magnet that bobs over the pit
  const post = group(at(foot(0.08), -0.5, 0.36, -0.5), strut([-0.5, 0.36, -0.5], [-0.5, 1.1, -0.5], 0.04, MAT.steel, 12), at(bevelBox(0.14, 0.12, 0.14, 0.03, MAT.accent), -0.5, 0.64, -0.5));
  const boom = strut([-0.5, 1.08, -0.5], [0.12, 1.0, 0.08], 0.032, MAT.hull, 12);
  const brace = strut([-0.5, 0.7, -0.5], [-0.14, 1.03, -0.2], 0.016, MAT.gunmetal, 8);
  const drop = 0.07 * tri(frame);
  const cableLen = 0.42 + drop;
  const cableLine = strut([0.12, 1.0, 0.08], [0.12, 1.0 - cableLen, 0.08], 0.01, MAT.rubber, 8);
  const magnet = at(group(cylinder(0.12, 0.07, MAT.accent, 24, 0.012), at(cylinder(0.1, 0.03, MAT.steel, 24, 0.006), 0, -0.03, 0), at(ring(0.1, 0.008, STRIP, 24), 0, 0.035, 0)), 0.12, 1.0 - cableLen - 0.07, 0.08);
  const lamps = [...lamp(k, 0.5, 0.4, -0.5, COLORS.tech, { r: 9, work: true }), ...lamp(k, -0.5, 1.16, -0.5, COLORS.beacon, { r: 10, phase: 0.2, size: 0.022 })];
  k.vent(0, 0.5, 0.05);
  k.goods(0.5, 0.34, 0.5);
  k.top(1.15);
  return group(basePlate(2), body, band, lid, pit, rollA, rollB, ...guards, ...heap, post, boom, brace, cableLine, magnet, ...lamps);
}

/** Registers the pumps and extractors. */
export function registerPumps(): void {
  register(['mechanical-pump'], 1, waterPump, true);
  register(['ground-pump'], 2, groundPump, true, { own: true });
  register(['oil-derrick'], 3, derrick, true, { own: true });
  register(['slag-tap'], 2, slagTap, true);
  register(['water-extractor'], 3, waterExtractor, true, { own: true });
  register(['salvage-drill'], 2, salvageDrill, true);
}
