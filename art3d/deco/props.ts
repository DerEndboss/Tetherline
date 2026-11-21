import { ExtrudeGeometry, Mesh, Shape, TorusGeometry, type Material, type Object3D } from 'three';
import { at, bevelBox, COLORS, cylinder, dome, emissive, group, Kit, lathe, lightPool, MAT, plate, ring, rivets, sprite, strut, surface, taper, turn, vents } from '../kit';
import { BOARD_BUILDERS } from './boards';
import { BOLLARD_ID, DECO_PROPS, decoId, JUNCTION_ID } from '../../src/render/deco/ids';

/**
 * Decoration: small props the game scatters next to buildings and wires up with purely visual cables
 * (src/render/deco/). Server racks, terminals, a wifi mast, a satellite dish, transformers, street lamps and the
 * junction box that sits where cables branch. Each stands inside one tile (x, z within about -0.36..0.36),
 * smaller than any building, and faces the camera with its lit side.
 */

/** Softer teal for screens (big lit areas), full teal for LEDs. */
const SCREEN = emissive(COLORS.tech, 1.35);
const LED = emissive(COLORS.tech, 2.6);
const LED_AMBER = emissive('#ffb347', 2.4);
const LED_GREEN = emissive('#7dffa8', 2.2);
const WARM = emissive('#ffb35c', 1.9);
const STRIPE = emissive(COLORS.tech, 2.2);
const CERAMIC = surface('#e9ecf5', { rough: 0.22, coat: 0.9 });
const COPPER = surface('#e39a62', { rough: 0.28, metal: 0.9, coat: 0.4 });

/** The faces the camera sees: +X (screen right-down) and +Z (screen left-down); diagonal = both. */
const FACE_DIAG = -Math.PI / 4;

/** A small navy plinth with a bevelled edge, a trim inset and lit teal edges on the two visible sides. */
function plinth(w: number, d: number, lit = true): Object3D {
  const parts: Object3D[] = [plate(w, d, 0.05, MAT.panel, 0.018), at(plate(w - 0.08, d - 0.08, 0.008, MAT.trim, 0.004), 0, 0.05, 0)];
  if (lit) {
    parts.push(at(bevelBox(w - 0.1, 0.01, 0.012, 0.003, STRIPE, 1), 0, 0.036, d / 2 - 0.008));
    parts.push(at(bevelBox(0.012, 0.01, d - 0.1, 0.003, STRIPE, 1), w / 2 - 0.008, 0.036, 0));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) parts.push(at(rivets(0, 1, 0.01, MAT.steel), x * (w / 2 - 0.03), 0.05, z * (d / 2 - 0.03)));
  return group(...parts);
}

/** Hazard stripes along the +X edge of a plinth: short yellow bars. */
function hazardEdge(len: number, x: number, y: number): Object3D {
  const n = Math.max(2, Math.round(len / 0.1));
  const bars = Array.from({ length: n }, (_, i) => at(bevelBox(0.016, 0.012, 0.045, 0.004, MAT.hazard, 1), x, y, -len / 2 + (i + 0.5) * (len / n)));
  return group(...bars);
}

/* ---------- Server racks ---------- */

/** One cabinet: white hull, slate door on +X with LED rows and a vent grille, orange cap band. */
function cabinet(h: number, seed: number): Object3D {
  const w = 0.2;
  const d = 0.24;
  const body = bevelBox(w, h, d, 0.018, MAT.hull);
  const door = at(bevelBox(0.012, h - 0.08, d - 0.05, 0.004, MAT.panel, 2), w / 2, 0.04, 0);
  const cap = at(bevelBox(w + 0.006, 0.022, d + 0.006, 0.006, MAT.accent, 2), 0, h - 0.04, 0);
  const rows = Math.floor((h - 0.16) / 0.055);
  const leds: Object3D[] = [];
  for (let i = 0; i < rows; i++) {
    const y = 0.09 + i * 0.055;
    leds.push(at(bevelBox(0.008, 0.012, 0.11, 0.003, MAT.deep, 1), w / 2 + 0.008, y, -0.02));
    const mat: Material = (i + seed) % 4 === 1 ? LED_AMBER : (i + seed) % 3 === 0 ? LED_GREEN : LED;
    leds.push(at(bevelBox(0.008, 0.01, 0.024, 0.003, mat, 1), w / 2 + 0.012, y + 0.001, -0.06 + ((i * 37 + seed * 11) % 5) * 0.02));
    leds.push(at(bevelBox(0.008, 0.008, 0.012, 0.002, LED, 1), w / 2 + 0.012, y + 0.002, 0.07));
  }
  const grille = at(turn(vents(3, 0.05, 0.012, 0.012, MAT.deep), Math.PI / 2), w / 2 + 0.008, 0.05, 0);
  const side = at(vents(2, 0.07, 0.1, 0.02, MAT.trim), 0, h * 0.45, d / 2 + 0.002);
  return group(body, door, cap, ...leds, grille, side);
}

function rack(k: Kit, variant: number): Object3D {
  const tall = variant === 0 ? [0.56, 0.5] : [0.62, 0.36];
  const base = plinth(0.6, 0.46);
  const a = at(cabinet(tall[0]!, 1 + variant), -0.06, 0.05, -0.12);
  const b = at(cabinet(tall[1]!, 3 + variant), 0.08, 0.05, 0.12);
  const parts: Object3D[] = [base, a, b, hazardEdge(0.36, 0.29, 0.05)];
  if (variant === 1) {
    // a small status screen on the low cabinet's top, tilted to the camera
    const scr = group(bevelBox(0.16, 0.11, 0.02, 0.008, MAT.gunmetal), at(bevelBox(0.13, 0.08, 0.004, 0.003, SCREEN, 1), 0, 0.015, 0.011));
    scr.rotation.x = -0.35;
    parts.push(at(turn(scr, FACE_DIAG + Math.PI / 2), 0.08, 0.05 + tall[1]! + 0.005, 0.12));
  } else {
    // a cable bundle from the back cabinet's top into the ground behind
    parts.push(at(strut([0, 0, 0], [0, 0.12, 0], 0.014, MAT.rubber, 8), -0.2, 0.05, -0.2));
  }
  const top = k.light(-0.06, 0.05 + tall[0]! + 0.04, -0.12, COLORS.tech, { r: 7, phase: variant * 0.4, size: 0.016 });
  if (top) parts.push(top, at(strut([0, 0, 0], [0, 0.03, 0], 0.006, MAT.steel, 6), -0.06, 0.05 + tall[0]!, -0.12));
  return group(...parts);
}

/* ---------- Terminal ---------- */

/** The screen picture: a framed teal display with a bar chart and a line, as a slab facing +Z. */
function display(w: number, h: number, chart: 'bars' | 'net'): Object3D {
  const frame = bevelBox(w, h, 0.03, 0.012, MAT.gunmetal);
  const glass = at(bevelBox(w - 0.03, h - 0.03, 0.006, 0.004, MAT.glass, 1), 0, 0.015, 0.016);
  const glow = at(bevelBox(w - 0.05, h - 0.05, 0.004, 0.003, emissive(COLORS.tech, 0.5), 1), 0, 0.025, 0.02);
  const marks: Object3D[] = [];
  if (chart === 'bars') {
    const hs = [0.35, 0.6, 0.45, 0.8, 0.55];
    hs.forEach((s, i) => marks.push(at(bevelBox(0.018, (h - 0.1) * s, 0.004, 0.002, SCREEN, 1), -w / 2 + 0.05 + i * ((w - 0.1) / 4), 0.04, 0.024)));
  } else {
    const pts: [number, number][] = [[-0.05, 0.02], [0.05, 0.05], [0.0, -0.04]];
    pts.forEach(([x, y]) => marks.push(at(dome(0.014, 0.006, SCREEN, 12, 3), x, h / 2 + y, 0.024)));
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % 3]!;
      marks.push(strut([x1, h / 2 + y1, 0.026], [x2, h / 2 + y2, 0.026], 0.004, SCREEN, 6));
    }
    // each dot rotated so its dome faces the viewer
    for (const m of marks.slice(0, 3)) m.rotation.x = Math.PI / 2;
  }
  return group(frame, glass, glow, ...marks);
}

function terminal(k: Kit, variant: number): Object3D {
  const base = plinth(0.5, 0.44);
  const desk = group(
    bevelBox(0.34, 0.2, 0.22, 0.03, MAT.hull),
    at(bevelBox(0.35, 0.03, 0.23, 0.01, MAT.trim, 2), 0, 0.2, 0),
    at(bevelBox(0.352, 0.022, 0.012, 0.005, MAT.accent, 2), 0, 0.15, 0.11),
    at(bevelBox(0.26, 0.012, 0.12, 0.005, MAT.panel, 2), 0, 0.23, 0.03),
    ...[0, 1, 2, 3].map((i) => at(bevelBox(0.04, 0.008, 0.025, 0.003, i === 1 ? LED_AMBER : LED, 1), -0.09 + i * 0.06, 0.24, 0.06)),
    at(vents(4, 0.04, 0.08, 0.02, MAT.trim), 0, 0.04, 0.112),
  );
  const screen = display(0.32, 0.22, variant === 0 ? 'bars' : 'net');
  screen.rotation.x = -0.32;
  const mount = group(at(strut([0, 0, 0], [0, 0.1, 0], 0.016, MAT.steel, 10), 0, 0, 0), at(screen, 0, 0.08, -0.02));
  const unit = group(at(desk, 0, 0, 0), at(mount, 0, 0.21, -0.07));
  // built facing +Z; a quarter turn more than FACE_DIAG faces the camera diagonal
  const parts: Object3D[] = [base, at(turn(unit, Math.PI / 4), 0, 0.05, 0)];
  if (variant === 1) {
    parts.push(at(group(cylinder(0.035, 0.08, MAT.gunmetal, 16), at(strut([0, 0.08, 0], [0, 0.3, 0], 0.006, MAT.steel, 6), 0, 0, 0)), -0.17, 0.05, -0.15));
    const l = k.light(-0.17, 0.4, -0.15, COLORS.beacon, { r: 6, phase: 0.7, size: 0.014 });
    if (l) parts.push(l);
  }
  return group(...parts);
}

/* ---------- Wifi mast ---------- */

/** A partial torus (wifi arc) standing upright, facing the camera diagonal. */
function arc(r: number, mat: Material): Mesh {
  const geo = new TorusGeometry(r, 0.008, 8, 24, Math.PI * 0.5);
  geo.rotateZ(Math.PI * 0.25);
  return new Mesh(geo, mat);
}

function antenna(k: Kit): Object3D {
  const base = plinth(0.34, 0.34);
  const box = group(
    bevelBox(0.22, 0.14, 0.2, 0.02, MAT.hull),
    at(bevelBox(0.225, 0.025, 0.205, 0.008, MAT.accent, 2), 0, 0.09, 0),
    at(bevelBox(0.006, 0.05, 0.08, 0.003, LED, 1), 0.112, 0.03, 0.03),
  );
  const mast = at(taper(0.022, 0.012, 0.52, MAT.steel, 16), 0, 0.19, 0);
  const band = at(cylinder(0.024, 0.03, MAT.accent, 16), 0, 0.42, 0);
  const tip = at(dome(0.022, 0.03, MAT.hull, 16, 4), 0, 0.71, 0);
  const waves = group(...[0.07, 0.11, 0.15].map((r) => arc(r, emissive(COLORS.tech, 2.2 - r * 6))));
  waves.position.set(0, 0.64, 0);
  waves.rotation.y = FACE_DIAG + Math.PI / 2;
  const dot = at(dome(0.018, 0.018, LED, 12, 3), 0, 0.64, 0);
  const lamp = k.light(0, 0.75, 0, COLORS.beacon, { r: 7, phase: 0.2, size: 0.015 });
  k.top(0.8);
  return group(base, at(box, 0, 0.05, 0), mast, band, tip, waves, dot, ...(lamp ? [lamp] : []));
}

/* ---------- Satellite dish ---------- */

function dish(k: Kit): Object3D {
  const base = plinth(0.4, 0.4);
  const box = group(
    bevelBox(0.26, 0.12, 0.24, 0.02, MAT.hull),
    at(bevelBox(0.265, 0.02, 0.245, 0.006, MAT.trim, 2), 0, 0.12, 0),
    at(turn(vents(3, 0.04, 0.06, 0.015, MAT.deep), Math.PI / 2), 0.132, 0.03, 0),
  );
  const yoke = at(cylinder(0.04, 0.12, MAT.gunmetal, 20), 0, 0.19, 0);
  const bowl = lathe([[0.005, 0], [0.05, 0.004], [0.1, 0.018], [0.14, 0.04], [0.15, 0.048], [0.143, 0.05], [0.09, 0.026], [0.005, 0.014]], 40, MAT.hull);
  const rim = at(ring(0.146, 0.007, MAT.accent, 40), 0, 0.046, 0);
  const feed = group(strut([0, 0.02, 0], [0, 0.15, 0], 0.006, MAT.steel, 6), at(cylinder(0.016, 0.03, MAT.gunmetal, 12), 0, 0.15, 0), at(dome(0.011, 0.01, LED, 10, 3), 0, 0.18, 0));
  const head = group(bowl, rim, feed);
  // tilted up and out to +X, a little turned: seen from the side the bowl reads as a dish, not a clock face
  head.rotation.set(0, Math.PI / 7, -0.8, 'YXZ');
  const lamp = k.light(0.14, 0.17, 0.14, COLORS.tech, { r: 5, phase: 0.5, size: 0.012 });
  return group(base, at(box, 0, 0.05, 0), yoke, at(head, 0, 0.33, 0), ...(lamp ? [lamp] : []));
}

/* ---------- Transformer ---------- */

/** A lightning bolt badge, extruded, lying in the YZ plane facing +X. */
function bolt(size: number, mat: Material): Mesh {
  const s = new Shape();
  const p: [number, number][] = [[0.1, 1], [-0.35, -0.05], [0.0, -0.05], [-0.15, -1], [0.38, 0.15], [0.02, 0.15], [0.25, 1]];
  s.moveTo(p[0]![0] * size, p[0]![1] * size);
  for (const [x, y] of p.slice(1)) s.lineTo(x * size, y * size);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  geo.rotateY(Math.PI / 2);
  return new Mesh(geo, mat);
}

function insulator(): Object3D {
  const discs = [0, 1, 2].map((i) => at(lathe([[0.03, 0], [0.034, 0.008], [0.02, 0.018]], 20, CERAMIC), 0, i * 0.022, 0));
  return group(at(cylinder(0.012, 0.075, CERAMIC, 12), 0, 0, 0), ...discs, at(cylinder(0.014, 0.02, COPPER, 12), 0, 0.072, 0));
}

function transformer(k: Kit, variant: number): Object3D {
  const base = plinth(0.56, 0.48);
  const w = 0.3;
  const d = 0.3;
  const h = 0.3;
  const body = group(
    bevelBox(w, h, d, 0.025, MAT.trim),
    at(bevelBox(w + 0.01, 0.03, d + 0.01, 0.01, MAT.gunmetal, 2), 0, h - 0.02, 0),
    // the orange warning plate with a lightning bolt on the +X face
    at(bevelBox(0.012, 0.16, 0.16, 0.012, MAT.accent, 2), w / 2 + 0.002, 0.07, 0),
    at(bolt(0.06, MAT.deep), w / 2 + 0.008, 0.15, 0),
    // cooling fins on the +Z face
    ...Array.from({ length: 6 }, (_, i) => at(bevelBox(0.014, h - 0.08, 0.05, 0.004, MAT.gunmetal, 1), -w / 2 + 0.05 + i * 0.04, 0.03, d / 2 + 0.02)),
    ...[-1, 0, 1].map((i) => at(insulator(), i * 0.09, h + 0.01, -0.04)),
  );
  const parts: Object3D[] = [base, at(body, -0.04, 0.05, -0.02), hazardEdge(0.4, 0.27, 0.05)];
  if (variant === 1) {
    parts.push(at(group(cylinder(0.06, 0.2, MAT.hull, 24), at(cylinder(0.062, 0.025, MAT.accent, 24), 0, 0.12, 0), at(dome(0.05, 0.03, MAT.steel, 16, 4), 0, 0.2, 0)), 0.18, 0.05, 0.16));
  } else {
    parts.push(at(group(bevelBox(0.1, 0.1, 0.08, 0.012, MAT.hull), at(bevelBox(0.006, 0.03, 0.04, 0.003, LED_GREEN, 1), 0.051, 0.05, 0)), 0.2, 0.05, 0.16));
  }
  const lamp = k.light(w / 2 - 0.04, 0.05 + h + 0.02, d / 2 - 0.06, '#ffb347', { r: 7, phase: 0.1, size: 0.014 });
  return group(...parts, ...(lamp ? [lamp] : []));
}

/* ---------- Street lamp ---------- */

function lamp(k: Kit): Object3D {
  const H = 0.62;
  const foot = group(cylinder(0.085, 0.04, MAT.gunmetal, 24, 0.01), at(rivets(0.062, 6, 0.008, MAT.steel), 0, 0.04, 0));
  const pole = at(taper(0.024, 0.017, H - 0.04, MAT.hull, 20), 0, 0.04, 0);
  const band = at(cylinder(0.026, 0.035, MAT.accent, 20), 0, 0.2, 0);
  const band2 = at(cylinder(0.022, 0.02, MAT.accent, 20), 0, H - 0.12, 0);
  const box = at(bevelBox(0.05, 0.08, 0.05, 0.01, MAT.trim), 0.03, 0.08, 0.03);
  const boxLed = at(bevelBox(0.004, 0.02, 0.02, 0.002, LED, 1), 0.057, 0.12, 0.03);
  // the lamp head: a gunmetal collar, a warm glowing globe, a hull cap
  const collar = at(lathe([[0.018, 0], [0.04, 0.012], [0.042, 0.022], [0.03, 0.026]], 24, MAT.gunmetal), 0, H, 0);
  const globe = at(dome(0.036, 0.06, WARM, 24, 8), 0, H + 0.02, 0);
  const cap = at(lathe([[0.044, 0], [0.046, 0.008], [0.03, 0.022], [0, 0.026]], 24, MAT.hull), 0, H + 0.075, 0);
  const light = k.light(0, H + 0.05, 0, '#ffd59a', { r: 13, phase: 0.6, lamp: false });
  void light;
  const pool = lightPool(0.32, '#ffcf8a', 0.2);
  k.top(H + 0.11);
  return group(foot, pole, band, band2, box, boxLed, collar, globe, cap, pool);
}

/* ---------- Junction box ---------- */

/** The cable hub where lines branch: a low box with a lit network glyph on its lid. */
function junction(): Object3D {
  const w = 0.34;
  const base = group(
    bevelBox(w, 0.13, w, 0.025, MAT.trim),
    at(bevelBox(w + 0.012, 0.02, w + 0.012, 0.008, MAT.gunmetal, 2), 0, 0, 0),
    at(bevelBox(w - 0.04, 0.03, w - 0.04, 0.012, MAT.panel), 0, 0.12, 0),
    at(bevelBox(w - 0.06, 0.012, 0.012, 0.004, STRIPE, 1), 0, 0.05, w / 2),
    at(bevelBox(0.012, 0.012, w - 0.06, 0.004, STRIPE, 1), w / 2, 0.05, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => at(bevelBox(0.045, 0.014, 0.045, 0.006, MAT.accent, 2), x! * (w / 2 - 0.035), 0.145, z! * (w / 2 - 0.035))),
    // cable glands on the visible sides
    at(turn(cylinder(0.022, 0.03, MAT.gunmetal, 12), 0), w / 2 - 0.01, 0.0, -0.08),
  );
  // the "share" glyph: a hub on the left, two branches to the right, lying on the lid and read from the camera
  const nodes: [number, number][] = [[-0.075, 0], [0.06, -0.07], [0.06, 0.07]];
  const glyph = group(
    ...nodes.map(([x, z]) => at(cylinder(0.026, 0.008, LED, 18, 0.003), x, 0, z)),
    strut([nodes[0]![0], 0.004, nodes[0]![1]], [nodes[1]![0], 0.004, nodes[1]![1]], 0.007, LED, 6),
    strut([nodes[0]![0], 0.004, nodes[0]![1]], [nodes[2]![0], 0.004, nodes[2]![1]], 0.007, LED, 6),
  );
  // turned so the glyph's "left" points to screen left
  glyph.rotation.y = Math.PI / 4;
  return group(base, at(glyph, 0, 0.15, 0));
}

/* ---------- Belt bollard ---------- */

/** A knee-high post with an orange light that stands beside belts every few tiles. */
function bollard(k: Kit): Object3D {
  const foot = cylinder(0.045, 0.02, MAT.gunmetal, 16, 0.006);
  const post = at(cylinder(0.026, 0.16, MAT.hull, 16, 0.006), 0, 0.02, 0);
  const band = at(cylinder(0.028, 0.025, MAT.accent, 16, 0.004), 0, 0.09, 0);
  const lens = at(cylinder(0.022, 0.03, emissive('#ffa040', 2.4), 16, 0.004), 0, 0.18, 0);
  const cap = at(dome(0.028, 0.02, MAT.gunmetal, 16, 4), 0, 0.21, 0);
  const l = k.light(0, 0.195, 0, '#ffa040', { r: 6, phase: 0.4, lamp: false });
  void l;
  return group(foot, post, band, lens, cap);
}

/* ---------- Registration ---------- */

const BUILDERS: Record<string, (k: Kit, variant: number) => Object3D> = {
  rack,
  terminal,
  antenna: (k) => antenna(k),
  dish: (k) => dish(k),
  transformer,
  lamp: (k) => lamp(k),
  ...BOARD_BUILDERS,
};

for (const p of DECO_PROPS) {
  for (let v = 0; v < p.variants; v++) sprite({ id: decoId(p.kind, v), build: (k) => BUILDERS[p.kind]!(k, v), shadow: 0.45 });
}
sprite({ id: JUNCTION_ID, build: () => junction(), shadow: 0.4 });
sprite({ id: BOLLARD_ID, build: bollard, shadow: 0.35 });
