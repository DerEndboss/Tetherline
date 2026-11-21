import { PointLight, type Object3D } from 'three';
import { at, bevelBox, building, cable, COLORS, cylinder, emissive, group, Kit, lathe, MAT, pipe, plate, ring, rivets, strut, vents } from '../kit';

/**
 * The fabricator, a real 3D printer: an octagonal platform, a print bed on a plinth (top y 0.19, the game
 * puts the growing part there), two guide posts with a top gantry (the sliding bridge and nozzle are separate
 * sprites), a filament spool and a cabinet with a screen in the back corner. Levels add a second spool,
 * braces, a panel, tanks, a lit band, a crate, a mast, platform lights and gold collars.
 */

const STRIP = emissive(COLORS.tech, 2.4);
const SOFT = emissive(COLORS.tech, 1.4);
export const POST = 0.74;
export const RAIL_Y = 1.17;
const BED_Y = 0.19;
const CAB = -0.71;

function platform(): Object3D {
  const deck = plate(1.9, 1.9, 0.085, MAT.panel, 0.03);
  const inset = at(plate(1.7, 1.7, 0.012, MAT.trim, 0.006), 0, 0.085, 0);
  const edge: Object3D[] = [];
  const e = 0.9;
  for (const s of [-1, 1]) {
    edge.push(at(bevelBox(1.8, 0.012, 0.016, 0.004, STRIP, 1), 0, 0.085, s * e), at(bevelBox(0.016, 0.012, 1.8, 0.004, STRIP, 1), s * e, 0.085, 0));
  }
  const studs: Object3D[] = [];
  for (let i = 0; i < 17; i++) {
    const t = -0.8 + i * 0.1;
    const mat = i % 2 === 0 ? MAT.hazard : MAT.deep;
    studs.push(at(bevelBox(0.1, 0.012, 0.05, 0.004, mat, 1), t, 0.085, 0.85 + 0.03), at(bevelBox(0.05, 0.012, 0.1, 0.004, mat, 1), 0.88, 0.085, t));
  }
  return group(deck, inset, ...edge, ...studs);
}

function bed(): Object3D {
  const plinth = at(bevelBox(0.66, 0.09, 0.66, 0.02, MAT.deep), 0, 0.095, 0);
  const frame = at(bevelBox(0.78, 0.03, 0.78, 0.012, MAT.gunmetal, 2), 0, 0.15, 0);
  const plateTop = at(plate(0.7, 0.7, 0.012, MAT.panel, 0.006), 0, BED_Y - 0.012, 0);
  const lines: Object3D[] = [];
  for (const t of [-0.23, 0, 0.23]) {
    lines.push(at(bevelBox(0.66, 0.003, 0.008, 0.001, SOFT, 1), 0, BED_Y, t), at(bevelBox(0.008, 0.003, 0.66, 0.001, SOFT, 1), t, BED_Y, 0));
  }
  const edge = at(bevelBox(0.72, 0.004, 0.72, 0.002, STRIP, 1), 0, BED_Y - 0.014, 0);
  const clips = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => at(bevelBox(0.05, 0.035, 0.05, 0.01, MAT.accent, 2), sx! * 0.37, 0.15, sz! * 0.37));
  return group(plinth, frame, edge, plateTop, ...lines, ...clips);
}

function cabinet(level: number): Object3D {
  const body = at(bevelBox(0.48, 0.64, 0.48, 0.04, MAT.hull), CAB, 0.085, CAB);
  const band = at(bevelBox(0.495, 0.045, 0.495, 0.015, MAT.accent, 2), CAB, 0.36, CAB);
  const screenX = at(bevelBox(0.012, 0.2, 0.32, 0.006, STRIP, 2), CAB + 0.24, 0.17, CAB + 0.03);
  const screenZ = at(bevelBox(0.3, 0.14, 0.012, 0.006, SOFT, 2), CAB + 0.04, 0.2, CAB + 0.24);
  const grille = at(vents(5, 0.04, 0.1, 0.02, MAT.deep), CAB + 0.04, 0.5, CAB + 0.245);
  const bolts = at(rivets(0.22, 12, 0.01, MAT.steel), CAB, 0.72, CAB);
  const top = at(bevelBox(0.5, 0.035, 0.5, 0.012, MAT.trim, 2), CAB, 0.725, CAB);
  const lit = level >= 6 ? [at(bevelBox(0.5, 0.025, 0.5, 0.01, STRIP, 2), CAB, 0.49, CAB)] : [];
  return group(body, band, screenX, screenZ, grille, bolts, top, ...lit);
}

function gantry(level: number): Object3D {
  const parts: Object3D[] = [];
  for (const s of [-1, 1] as const) {
    const x = POST * s;
    const z = -POST * s;
    parts.push(at(bevelBox(0.2, 0.05, 0.2, 0.02, MAT.panel, 2), x, 0.085, z));
    parts.push(at(cylinder(0.075, 0.05, MAT.trim, 24), x, 0.13, z));
    parts.push(at(cylinder(0.05, RAIL_Y - 0.15, MAT.steel, 24), x, 0.15, z));
    parts.push(at(bevelBox(0.014, RAIL_Y - 0.35, 0.05, 0.004, STRIP, 1), x + 0.05 * s * 0 + (s === -1 ? 0.052 : -0.052), 0.25, z));
    parts.push(at(lathe([[0.09, RAIL_Y - 0.03], [0.09, RAIL_Y + 0.07], [0.055, RAIL_Y + 0.11]], 24, MAT.accent), x, 0, z));
    if (level >= 10) parts.push(at(ring(0.092, 0.012, MAT.gold, 28), x, RAIL_Y + 0.0, z));
    // brace to the cabinet
    const target: [number, number, number] = s === -1 ? [CAB + 0.02, 0.62, CAB + 0.24] : [CAB + 0.24, 0.62, CAB + 0.02];
    parts.push(strut([x, RAIL_Y - 0.2, z], target, 0.022, MAT.gunmetal, 10));
  }
  parts.push(strut([-POST, RAIL_Y + 0.02, POST], [POST, RAIL_Y + 0.02, -POST], 0.045, MAT.steel, 20));
  parts.push(strut([-POST, RAIL_Y - 0.08, POST], [POST, RAIL_Y - 0.08, -POST], 0.02, MAT.gunmetal, 12));
  return group(...parts);
}

function spool(x: number, z: number, color: typeof MAT.accent): Object3D {
  const s = lathe([[0.15, 0], [0.15, 0.03], [0.07, 0.035], [0.07, 0.17], [0.15, 0.175], [0.15, 0.205]], 28, color);
  const core = at(cylinder(0.075, 0.18, MAT.steel, 18), 0, 0.03, 0);
  const stand = at(cylinder(0.04, 0.03, MAT.trim, 16), 0, 0, 0);
  return at(group(core, s, stand), x, 0.095, z);
}

function fabricator(k: Kit, level: number): { pad: Object3D; body: Object3D } {
  const parts: Object3D[] = [];
  parts.push(spool(-0.55, 0.22, MAT.accent));
  parts.push(pipe([[-0.55, 0.3, 0.22], [-0.62, 0.45, 0.5], [-POST + 0.05, 0.72, POST - 0.05]], 0.012, MAT.rubber, 0.08, 10));
  if (level >= 2) parts.push(spool(-0.15, 0.66, MAT.trim));
  if (level >= 3) parts.push(strut([-POST + 0.03, 0.55, POST], [-0.62, 0.3, 0.45], 0.018, MAT.steel, 8));
  if (level >= 4) parts.push(at(bevelBox(0.3, 0.012, 0.22, 0.005, MAT.solar, 1), CAB, 0.78, CAB));
  if (level >= 5) {
    for (const [x, z] of [[0.62, -0.28], [0.4, -0.62]] as const) {
      parts.push(at(lathe([[0, 0], [0.085, 0], [0.095, 0.02], [0.095, 0.3], [0.07, 0.34], [0, 0.345]], 28, MAT.accent), x, 0.085, z));
      parts.push(at(ring(0.097, 0.007, MAT.steel, 28), x, 0.2, z));
    }
  }
  if (level >= 7) {
    parts.push(at(bevelBox(0.3, 0.2, 0.26, 0.03, MAT.hull), 0.38, 0.085, -0.8));
    parts.push(at(bevelBox(0.31, 0.025, 0.27, 0.01, MAT.accent, 1), 0.38, 0.285, -0.8));
  }
  if (level >= 8) {
    const lamp = k.light(CAB, 1.06, CAB, COLORS.beacon, { r: 14, phase: 0.4, size: 0.028 });
    parts.push(strut([CAB, 0.76, CAB], [CAB, 1.04, CAB], 0.014, MAT.steel, 8), ...(lamp ? [lamp] : []));
  }
  if (level >= 9) {
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785 + 0.39;
      const lamp = k.light(Math.cos(a) * 0.9, 0.11, Math.sin(a) * 0.9, COLORS.tech, { r: 9, phase: i / 8, size: 0.016 });
      if (lamp) parts.push(lamp);
    }
  }
  parts.push(cable([[0.4, 0.1, 0.1], [0.65, 0.09, 0.45], [0.35, 0.09, 0.6], [-0.05, 0.09, 0.45]], 0.011, MAT.rubber));
  const screen = k.light(CAB + 0.26, 0.17, CAB + 0.03, COLORS.tech, { r: 12, work: true, lamp: false });
  void screen;
  k.vent(CAB, 0.76, CAB);
  k.goods(0.56, 0.095, 0.56);
  const spill = new PointLight(COLORS.tech, 0.4, 1.2, 1.6);
  spill.position.set(0, 0.5, 0);
  return { pad: platform(), body: group(bed(), cabinet(level), gantry(level), ...parts, spill) };
}

building('fabricator', fabricator);
