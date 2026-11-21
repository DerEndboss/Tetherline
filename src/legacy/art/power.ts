import { mix, shade } from './color';
import { EMBER, addParts, rimLights, smallPad, withMast, type BuildingModel, type ModelKit, type Part } from './machines';
import { beam, box, cylinder, lathe, overlay, project, rotateX, transform, type Rig, type Solid, type V3 } from './solid';
import { polyPts, polyline, type SpriteLight, type Svg } from './svg';
import { TECH } from './tech';

/**
 * The power buildings (docs/art-direction.md, "Power"): a slim Power Pole with a crossarm and two insulators,
 * the Coal Generator (a round engine housing with a glowing grille, an exhaust stack and a coal hopper) and
 * the Solar Array (a tilted blue panel on a post over a small inverter). Every node has a `wire` point where
 * the power lines attach. Coordinates: x, y in tiles with the footprint centred on 0; z in world px.
 */

/* ---------- Power pole ---------- */

const POLE_H = 92;

export function polePart(base: ModelKit): BuildingModel {
  const k = base;
  const footing = lathe(0, 0, [[0.17, -3], [0.17, 4], [0.12, 8]], 8, k.panel, Math.PI / 8);
  const mast = lathe(0, 0, [[0.05, 6], [0.034, POLE_H]], 8, k.steel);
  const band = overlay(lathe(0, 0, [[0.052, 16], [0.049, 22]], 8, k.accent, 0, true));
  const arm = beam({ x: -0.19, y: 0.19, z: POLE_H - 8 }, { x: 0.19, y: -0.19, z: POLE_H - 8 }, 0.032, k.steel);
  const struts = [-1, 1].map((s) => beam({ x: 0, y: 0, z: POLE_H - 26 }, { x: s * 0.13, y: -s * 0.13, z: POLE_H - 9 }, 0.016, { ...k.steel, bare: true }));
  const insulators = [-1, 1].map((s) => lathe(s * 0.17, -s * 0.17, [[0.026, POLE_H - 6], [0.032, POLE_H - 2], [0.022, POLE_H + 3]], 8, k.hull));
  const cap = lathe(0, 0, [[0.045, POLE_H], [0.03, POLE_H + 7]], 8, k.accentBody);
  const lights: SpriteLight[] = [k.light(0, 0, POLE_H + 10, k.palette.tech, 9, 0.3)];
  return {
    pad: [footing],
    body: [mast, band, ...struts, arm, ...insulators, cap],
    lights,
    top: POLE_H + 12,
    wire: k.at(0, 0, POLE_H - 4),
  };
}

/* ---------- Coal generator ---------- */

const GEN_STACK = 84;

export function generatorPart(base: ModelKit): BuildingModel {
  const k = base;
  const housing = lathe(-0.04, 0.04, [[0.28, 4], [0.31, 11], [0.31, 26], [0.25, 34], [0.12, 38]], 14, k.hull);
  const band = overlay(lathe(-0.04, 0.04, [[0.313, 13], [0.313, 18]], 14, k.accent, 0, true));
  const grille = box(0.2, -0.12, 6, 0.14, 0.24, 18, k.dark);
  const stack = cylinder(-0.24, -0.22, 0.065, 26, GEN_STACK - 26, 10, k.hull);
  const stackBand = overlay(lathe(-0.24, -0.22, [[0.068, GEN_STACK - 18], [0.068, GEN_STACK - 13]], 10, k.accent, 0, true));
  const lip = lathe(-0.24, -0.22, [[0.078, GEN_STACK], [0.078, GEN_STACK + 3], [0.058, GEN_STACK + 4]], 10, k.dark);
  const hopper = lathe(0.08, -0.14, [[0.06, 34], [0.13, 44], [0.14, 48]], 8, k.steel, Math.PI / 8);
  const coal = lathe(0.08, -0.14, [[0.12, 46], [0.07, 50]], 7, { main: '#3d3a45', dark: '#17151d' });
  const post = cylinder(0.24, 0.24, 0.022, 6, 44, 6, { ...k.steel, bare: true });
  const insulator = lathe(0.24, 0.24, [[0.026, 48], [0.032, 52], [0.022, 56]], 8, k.hull);
  const body = [housing, band, grille, stack, stackBand, lip, hopper, coal, post, insulator];
  const lights: SpriteLight[] = [{ ...k.at(0.345, 0, 15), color: EMBER, r: 16, phase: 0, work: true }];
  addParts(k, GEN_STACK, GENERATOR_PARTS, body, lights);
  return {
    pad: [smallPad(k)],
    body,
    details: (svg, rig) => grilleSlots(svg, rig),
    lights,
    top: GEN_STACK + 6,
    vents: [k.at(-0.24, -0.22, GEN_STACK + 4)],
    goods: k.at(0.3, 0.32, 6),
    wire: k.at(0.24, 0.24, 54),
  };
}

const GENERATOR_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [cylinder(-0.34, 0.2, 0.08, 5, 26, 10, k.accentBody)] })],
  [3, (k) => ({ solids: [0, 1, 2].map((i) => box(-0.3 + i * 0.1, 0.3, 6, 0.04, 0.1, 22, { ...k.steel, bare: true })) })],
  [4, (k) => ({ solids: [beam({ x: -0.24, y: -0.22, z: 40 }, { x: 0.02, y: -0.06, z: 32 }, 0.03, { ...k.steel, bare: true })] })],
  [5, (k) => ({ solids: [overlay(lathe(-0.04, 0.04, [[0.3, 22], [0.3, 25]], 14, k.tech, 0, true))] })],
  [6, (k) => ({ solids: [cylinder(-0.38, -0.02, 0.05, 20, 34, 8, k.hull), lathe(-0.38, -0.02, [[0.06, 54], [0.045, 57]], 8, k.dark)] })],
  [7, (k) => ({ solids: [box(0.14, 0.2, 4, 0.22, 0.2, 16, k.hull), overlay(box(0.14, 0.2, 16, 0.22, 0.2, 3, k.accent, true))] })],
  [8, withMast(-0.36, -0.36, 4, 52)],
  [9, (k) => ({ lights: rimLights(k, 0.42, 6) })],
  [10, (k) => ({ solids: [overlay(lathe(-0.24, -0.22, [[0.07, GEN_STACK - 30], [0.07, GEN_STACK - 26]], 10, k.gold, 0, true))] })],
];

/** Three glowing slots in the grille on the housing's front (+x face). */
function grilleSlots(svg: Svg, rig: Rig): void {
  const x = 0.341;
  for (let i = 0; i < 3; i++) {
    const y0 = -0.08 + i * 0.06;
    const pts = [
      { y: y0, z: 9 },
      { y: y0 + 0.035, z: 9 },
      { y: y0 + 0.035, z: 21 },
      { y: y0, z: 21 },
    ].map((p) => project(rig, { x, y: p.y, z: p.z }));
    const top = Math.min(...pts.map((p) => p.y));
    const bottom = Math.max(...pts.map((p) => p.y));
    const fill = svg.linear(0, top, 0, bottom, [
      [0, '#ffe2a0'],
      [0.5, EMBER],
      [1, '#c2410c'],
    ]);
    svg.add(polyPts(pts, fill, `stroke="${mix(TECH.panelDark, '#000000', 0.3)}" stroke-width="1" stroke-linejoin="round"`));
  }
}

/* ---------- Solar array ---------- */

const PANEL_Z = 36;
const PANEL_TILT = 0.5;

/** The panel's tilt about grid x through its centre: the back edge rises, the face turns to the camera. */
const tilt = (z: number): ((v: V3) => V3) => rotateX(0, z, PANEL_TILT);

export function solarPart(base: ModelKit): BuildingModel {
  const k = base;
  const post = cylinder(0, 0, 0.045, 4, PANEL_Z - 4, 8, k.steel);
  const yoke = box(-0.08, -0.05, PANEL_Z - 6, 0.16, 0.1, 6, k.dark);
  const frame: Solid = transform(box(-0.4, -0.33, PANEL_Z, 0.8, 0.66, 3, { main: shade(TECH.hull, -0.1), dark: k.hull.dark }), tilt(PANEL_Z));
  const cells: Solid = transform(box(-0.37, -0.3, PANEL_Z + 3, 0.74, 0.6, 1.2, { ...k.solar, bare: true }), tilt(PANEL_Z));
  const inverter = box(0.12, 0.16, 4, 0.2, 0.16, 15, k.hull);
  const stripe = overlay(box(0.12, 0.16, 12, 0.2, 0.16, 3, k.accent, true));
  const insulator = lathe(0.22, 0.24, [[0.024, 19], [0.03, 23], [0.02, 27]], 8, k.hull);
  const body = [post, yoke, inverter, stripe, insulator, frame, cells];
  const lights: SpriteLight[] = [k.light(0.32, 0.24, 13, k.palette.tech, 7, 0.2)];
  addParts(k, PANEL_Z, SOLAR_PARTS, body, lights);
  return {
    pad: [smallPad(k)],
    body,
    details: (svg, rig) => cellGrid(svg, rig, 0.37, 0.3, PANEL_Z + 4.4, 0, 0),
    lights,
    top: PANEL_Z + 30,
    wire: k.at(0.22, 0.24, 25),
  };
}

const SOLAR_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [transform(overlay(box(-0.4, 0.3, PANEL_Z + 0.5, 0.8, 0.04, 3, k.accent, true)), tilt(PANEL_Z))] })],
  [3, (k) => ({ solids: [cylinder(-0.3, 0.26, 0.07, 4, 20, 10, k.accentBody)] })],
  [4, (k) => ({ solids: [overlay(lathe(0, 0, [[0.048, 14], [0.048, 18]], 8, k.tech, 0, true))] })],
  [5, (k) => ({ solids: [box(-0.36, -0.36, 4, 0.16, 0.14, 12, k.hull)] })],
  [6, (k) => ({ solids: [cylinder(-0.14, 0.32, 0.06, 4, 16, 10, k.accentBody)] })],
  [7, (k) => ({ solids: [beam({ x: 0, y: 0, z: 10 }, { x: -0.28, y: -0.28, z: 6 }, 0.02, { ...k.steel, bare: true })] })],
  [8, withMast(0.34, -0.34, 4, 44)],
  [9, (k) => ({ lights: rimLights(k, 0.42, 6) })],
  [10, (k) => ({ solids: [transform(overlay(box(-0.4, -0.33, PANEL_Z + 0.5, 0.04, 0.66, 3, k.gold, true)), tilt(PANEL_Z))] })],
];

/** Light cell lines on the tilted panel: four columns, three rows. */
function cellGrid(svg: Svg, rig: Rig, hx: number, hy: number, z: number, cx: number, cy: number): void {
  const at = (x: number, y: number): ReturnType<typeof project> => project(rig, tilt(PANEL_Z)({ x: cx + x, y: cy + y, z }));
  const stroke = `opacity="0.55"`;
  for (let i = 1; i < 4; i++) {
    const x = -hx + (2 * hx * i) / 4;
    svg.add(polyline([at(x, -hy), at(x, hy)], TECH.solarLine, 1, stroke));
  }
  for (let j = 1; j < 3; j++) {
    const y = -hy + (2 * hy * j) / 3;
    svg.add(polyline([at(-hx, y), at(hx, y)], TECH.solarLine, 1, stroke));
  }
  const glare = [at(-hx * 0.9, -hy * 0.85), at(-hx * 0.2, -hy * 0.85), at(-hx * 0.6, -hy * 0.1), at(-hx * 0.9, -hy * 0.1)];
  svg.add(polyPts(glare, '#ffffff', 'opacity="0.12"'));
}
