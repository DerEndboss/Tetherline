import { PointLight, type Object3D } from 'three';
import { at, bevelBox, building, cable, COLORS, cylinder, dome, emissive, group, Kit, lathe, MAT, pipe, plate, ring, rivets, strut, turn, vents, type V } from '../kit';

/**
 * The mine (exemplar of the look, docs/art.md): a drilling rig on its vein. A white drum houses the drill
 * motor, a steel lattice derrick rises over it with the orange drive head on top, the drill shaft runs down
 * the middle, a chute drops ore onto the corner where the game piles it (`goods`). Levels add a control box,
 * braces, a coolant tank, barrels, a beacon mast, pad lights and a gold collar; the derrick grows with them.
 */

const STRIP = emissive(COLORS.tech, 2.4);
const HAZARD_DARK = MAT.deep;

/** Derrick height for a level (model units). */
const heightOf = (level: number): number => Math.min(1.26, 0.82 + level * 0.044);

/** The square pad with hazard-striped front edges. */
function pad(): Object3D {
  const deck = plate(0.92, 0.92, 0.07, MAT.panel, 0.025);
  const inset = at(plate(0.74, 0.74, 0.012, MAT.trim, 0.006), 0, 0.07, 0);
  const stripes: Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const t = -0.4 + i * 0.1;
    const mat = i % 2 === 0 ? MAT.hazard : HAZARD_DARK;
    stripes.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.07, 0.43));
    stripes.push(at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), 0.43, 0.07, t));
  }
  return group(deck, inset, ...stripes);
}

/** The drill drum: a white housing with an orange band, a vent grille and bolts. */
function drum(level: number): Object3D {
  const body = lathe([[0, 0.07], [0.27, 0.07], [0.29, 0.1], [0.29, 0.28], [0.27, 0.31], [0.2, 0.33], [0, 0.33]], 48, MAT.hull);
  const band = lathe([[0.292, 0.13], [0.297, 0.14], [0.297, 0.19], [0.292, 0.2]], 48, MAT.accent);
  const grille = turn(at(vents(5, 0.035, 0.06, 0.018, MAT.deep), 0.21, 0.21, 0.21), Math.PI / 4);
  const bolts = at(rivets(0.245, 12, 0.012, MAT.trim), 0, 0.31, 0);
  const glow = level >= 6 ? [lathe([[0.292, 0.235], [0.296, 0.24], [0.296, 0.255], [0.292, 0.26]], 48, STRIP)] : [];
  return group(body, band, grille, bolts, ...glow);
}

/** The lattice derrick: four tapered legs, X braces per side, rings, and the drill shaft down the middle. */
function derrick(h: number, level: number): Object3D {
  const base = 0.23;
  const tip = 0.075;
  const y0 = 0.3;
  const corner = (i: number, y: number): V => {
    const s = base + ((tip - base) * (y - y0)) / (h - y0);
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return [Math.cos(a) * s * Math.SQRT2, y, Math.sin(a) * s * Math.SQRT2];
  };
  const parts: Object3D[] = [];
  const levels = level >= 3 ? [0.38, 0.62, 0.84] : [0.45, 0.8];
  // Legs run all the way down to the pad and stand on bolted foot plates (nothing may float).
  const foot = 0.07;
  for (let i = 0; i < 4; i++) {
    parts.push(strut(corner(i, foot), corner(i, h), 0.02, MAT.steel, 10));
    const [fx, , fz] = corner(i, foot);
    parts.push(at(bevelBox(0.075, 0.022, 0.075, 0.008, MAT.gunmetal), fx, foot, fz));
    parts.push(strut(corner(i, 0.16), corner((i + 1) % 4, 0.16), 0.011, MAT.steel, 6));
    let prev = y0;
    for (const f of levels) {
      const y = y0 + (h - y0) * f;
      parts.push(strut(corner(i, y), corner((i + 1) % 4, y), 0.011, MAT.steel, 6));
      parts.push(strut(corner(i, prev), corner((i + 1) % 4, y), 0.008, MAT.gunmetal, 6));
      prev = y;
    }
  }
  const shaft = at(cylinder(0.035, h - 0.2, MAT.gunmetal, 16), 0, 0.2, 0);
  const collars = [0.45, 0.7].map((f) => at(cylinder(0.05, 0.03, MAT.steel, 16), 0, 0.3 + (h - 0.3) * f, 0));
  return group(...parts, shaft, ...collars);
}

/** The orange drive head on top with a white cap and the work light. */
function head(k: Kit, h: number, level: number): Object3D {
  const motor = at(bevelBox(0.2, 0.12, 0.2, 0.03, MAT.accent), 0, h - 0.02, 0);
  const cap = at(dome(0.1, 0.06, MAT.hull, 24, 5), 0, h + 0.1, 0);
  const fins = at(vents(3, 0.03, 0.06, 0.02, MAT.deep), 0, h + 0.01, 0.101);
  const lamp = k.light(0, h + 0.175, 0, COLORS.tech, { r: 11, work: true, size: 0.026 });
  const collar = level >= 10 ? [at(ring(0.105, 0.012, MAT.gold, 32), 0, h + 0.1, 0)] : [];
  return group(motor, cap, fins, ...(lamp ? [lamp] : []), ...collar);
}

/** The ore chute from the drum down to the front corner where ore piles up. */
function chute(): Object3D {
  const trough = bevelBox(0.09, 0.035, 0.26, 0.012, MAT.trim, 2);
  trough.rotation.x = -0.42;
  const sideL = at(bevelBox(0.012, 0.05, 0.26, 0.004, MAT.accent, 1), -0.045, 0.02, 0);
  const sideR = at(bevelBox(0.012, 0.05, 0.26, 0.004, MAT.accent, 1), 0.045, 0.02, 0);
  sideL.rotation.x = -0.42;
  sideR.rotation.x = -0.42;
  const unit = group(trough, sideL, sideR);
  unit.position.set(0.23, 0.17, 0.23);
  unit.rotation.y = Math.PI / 4;
  const post = strut([0.3, 0.07, 0.3], [0.3, 0.13, 0.3], 0.012, MAT.steel, 8);
  return group(unit, post);
}

type Part = (k: Kit, h: number) => Object3D[];

const PARTS: (readonly [number, Part])[] = [
  [2, () => [controlBox()]],
  [4, () => [at(plate(0.16, 0.2, 0.012, MAT.solar, 0.004), -0.34, 0.26, 0.12)]],
  [5, () => [coolant()]],
  [7, () => [barrel(0.3, -0.06), barrel(0.36, 0.08)]],
  [8, (k) => [beaconMast(k)]],
  [9, (k) => cornerLights(k)],
];

function controlBox(): Object3D {
  const box = bevelBox(0.16, 0.18, 0.22, 0.025, MAT.hull);
  const screen = at(bevelBox(0.005, 0.07, 0.12, 0.003, STRIP, 1), 0.082, 0.08, 0);
  const lid = at(bevelBox(0.17, 0.02, 0.23, 0.008, MAT.accent, 1), 0, 0.18, 0);
  const wire = cable([[0.06, 0.04, 0], [0.12, 0.08, 0.04], [0.2, 0.12, 0.02]], 0.01, MAT.rubber);
  return at(group(box, screen, lid, wire), -0.34, 0.07, 0.12);
}

function coolant(): Object3D {
  const tank = lathe([[0, 0], [0.06, 0], [0.07, 0.02], [0.07, 0.34], [0.05, 0.37], [0, 0.375]], 32, MAT.hull);
  const cap = at(cylinder(0.072, 0.03, MAT.accent, 32), 0, 0.3, 0);
  const feed = pipe([[0, 0.2, 0], [-0.08, 0.2, 0.08], [-0.12, 0.16, 0.12]], 0.012, MAT.steel, 0.03);
  return at(group(tank, cap, feed), 0.3, 0.07, -0.3);
}

function barrel(x: number, z: number): Object3D {
  const body = lathe([[0, 0], [0.05, 0], [0.055, 0.01], [0.055, 0.12], [0.05, 0.13], [0, 0.13]], 24, MAT.accent);
  const hoops = [0.035, 0.095].map((y) => at(ring(0.056, 0.005, MAT.steel, 24), 0, y, 0));
  return at(group(body, ...hoops), x, 0.07, z);
}

function beaconMast(k: Kit): Object3D {
  const pole = strut([-0.33, 0.07, -0.33], [-0.33, 0.78, -0.33], 0.014, MAT.steel, 8);
  const lamp = k.light(-0.33, 0.8, -0.33, COLORS.beacon, { r: 14, phase: 0.3, size: 0.026 });
  return group(pole, ...(lamp ? [lamp] : []));
}

function cornerLights(k: Kit): Object3D[] {
  return [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
  ].map(([x, z], i) => {
    const lamp = k.light(x!, 0.1, z!, COLORS.tech, { r: 10, phase: i / 3, size: 0.018 });
    return group(at(cylinder(0.02, 0.025, MAT.gunmetal, 10), x!, 0.07, z!), ...(lamp ? [lamp] : []));
  });
}

function mine(k: Kit, level: number): { pad: Object3D; body: Object3D } {
  const h = heightOf(level);
  const parts = PARTS.filter(([l]) => level >= l).flatMap(([, part]) => part(k, h));
  k.vent(0, 0.34, 0);
  k.goods(0.32, 0.07, 0.32);
  const spill = new PointLight(COLORS.tech, 0.35, 0.8, 1.6);
  spill.position.set(0.2, h + 0.1, 0.2);
  return { pad: pad(), body: group(drum(level), derrick(h, level), head(k, h, level), chute(), ...parts, spill) };
}

building('mine', mine);
