import type { BuildingDef, WorldPalette } from '../content/types';
import { mix } from './color';
import { beam, box, cylinder, lathe, overlay, project, rotateX, transform, type Material, type Rig, type Solid } from './solid';
import { polyPts, type Pt, type SpriteLight, type Svg } from './svg';
import { TECH } from './tech';

/**
 * The machines of the core loop: mine, smelter, storage and landing pad. Each model builds its pad and body
 * from solids and adds one part per level (2 to 10), so every level reads differently in the world
 * (docs/art-direction.md: levels add parts, they do not recolour). Coordinates: x, y in tiles with the
 * footprint centred on 0; z in world px.
 */

export interface BuildingModel {
  pad: Solid[];
  /** Painted marks on the pad (drawn before the body). */
  marks?: (svg: Svg, rig: Rig) => void;
  body: Solid[];
  /**
   * The solids this level added (a subset of `body`). A model that names them can show a level rising on its
   * own while drones build it (`growthSprite`), instead of standing in a scaffold.
   */
  fresh?: Solid[];
  /** Painted details on the body (drawn last; only on the finished building). */
  details?: (svg: Svg, rig: Rig) => void;
  lights: SpriteLight[];
  hatch?: Pt;
  top: number;
  vents?: Pt[];
  goods?: Pt;
  /** Power nodes: where the power lines attach. */
  wire?: Pt;
}

/** Shared materials and helpers for one building at one level. */
export interface ModelKit {
  rig: Rig;
  palette: WorldPalette;
  level: number;
  hull: Material;
  panel: Material;
  steel: Material;
  dark: Material;
  accent: Material;
  tech: Material;
  solar: Material;
  /** A glow point relative to the sprite anchor. */
  light: (x: number, y: number, z: number, color: string, r: number, phase: number) => SpriteLight;
  /** A grid point relative to the sprite anchor. */
  at: (x: number, y: number, z: number) => Pt;
  /** The accent orange as a body colour (tanks), not just a band. */
  accentBody: Material;
  /** Gold trim: the top levels' crown. */
  gold: Material;
}

export const GOLD = '#ffd98a';
export const EMBER = '#ff8a3d';

/** Octagonal slate pad that fills a 1x1 footprint. */
export function smallPad(k: ModelKit): Solid {
  return lathe(0, 0, [[0.47, -6], [0.47, 3], [0.43, 6]], 8, k.panel, Math.PI / 8);
}

/** Small lights around a pad's rim (levels 9+ of the small machines). */
export function rimLights(k: ModelKit, r: number, count: number): SpriteLight[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    return k.light(Math.cos(a) * r, Math.sin(a) * r, 6, k.palette.tech, 8, i / count);
  });
}

/** An antenna mast with a beacon light on top. */
function mast(k: ModelKit, x: number, y: number, z: number, h: number): { solids: Solid[]; light: SpriteLight } {
  return { solids: [cylinder(x, y, 0.018, z, h, 6, { ...k.steel, bare: true })], light: k.light(x, y, z + h + 2, TECH.beacon, 12, 0.3) };
}

/** A part a building gains at some level: solids and lights. `h` is the model's main height. */
export type Part = (k: ModelKit, h: number) => { solids?: Solid[]; lights?: SpriteLight[] };

/** Adds every part whose level the building has reached. */
export function addParts(k: ModelKit, h: number, parts: readonly (readonly [number, Part])[], body: Solid[], lights: SpriteLight[]): void {
  for (const [level, part] of parts) {
    if (k.level < level) continue;
    const add = part(k, h);
    body.push(...(add.solids ?? []));
    lights.push(...(add.lights ?? []));
  }
}

/** A small radar dish on a stalk: a flat tilted disc. */
export function dish(k: ModelKit, x: number, y: number, z: number, r: number): Solid[] {
  const stalk = cylinder(x, y, 0.02, z - 14, 16, 6, { ...k.steel, bare: true });
  const plate = lathe(x, y, [[r, z], [r * 0.55, z + 6]], 12, k.hull);
  return [stalk, plate];
}

export const withMast = (x: number, y: number, z: number, h: number): Part => (k) => {
  const m = mast(k, x, y, z, h);
  return { solids: m.solids, lights: [m.light] };
};

/* ---------- Mine ---------- */

/** A drilling rig: a squat housing on the vein, a lattice derrick over it, a drill shaft down the middle. */
export function minePart(base: ModelKit): BuildingModel {
  const k = base;
  const L = k.level;
  const H = Math.min(96, 62 + L * 3.4);
  const housing = lathe(0, 0, [[0.27, 5], [0.28, 17], [0.25, 25]], 12, k.hull);
  const band = overlay(lathe(0, 0, [[0.283, 9], [0.283, 14]], 12, k.accent, 0, true));
  const legs = [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return beam({ x: Math.cos(a) * 0.27, y: Math.sin(a) * 0.27, z: 22 }, { x: Math.cos(a) * 0.07, y: Math.sin(a) * 0.07, z: H }, 0.04, { ...k.steel, bare: true });
  });
  const shaft = cylinder(0, 0, 0.04, 20, H - 22, 8, { ...k.dark, bare: true });
  const cap = lathe(0, 0, [[0.1, H - 2], [0.11, H + 4], [0.07, H + 9]], 8, k.accentBody);
  const body: Solid[] = [housing, band, shaft, ...legs, cap];
  const lights: SpriteLight[] = [{ ...k.light(0, 0, H + 11, k.palette.tech, 10, 0), work: true }];
  addParts(k, H, MINE_PARTS, body, lights);
  return {
    pad: [smallPad(k)],
    marks: (svg, rig) => hazardRing(svg, rig, 0.36, 6.2),
    body,
    lights,
    top: H + 12,
    vents: [k.at(0, 0, 26)],
    goods: k.at(0.3, 0.3, 6),
  };
}

const MINE_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [box(-0.42, 0.1, 5, 0.18, 0.26, 15, k.hull), overlay(box(-0.42, 0.1, 15, 0.18, 0.26, 3, k.accent, true))] })],
  [3, (k, H) => ({ solids: braces(k, H) })],
  [4, (k) => ({ solids: [panelPlate(k, -0.33, 0.23, 21)] })],
  [5, (k) => ({ solids: [cylinder(0.3, -0.3, 0.055, 5, 40, 8, k.hull), lathe(0.3, -0.3, [[0.062, 45], [0.062, 50]], 8, k.accent)] })],
  [6, (k) => ({ solids: [overlay(lathe(0, 0, [[0.262, 19], [0.262, 23]], 12, k.tech, 0, true))] })],
  [7, (k) => ({ solids: [cylinder(0.34, 0.06, 0.07, 5, 18, 10, k.accentBody), cylinder(0.06, 0.34, 0.07, 5, 14, 10, k.accentBody)] })],
  [8, withMast(-0.3, -0.3, 4, 56)],
  [9, (k) => ({ lights: rimLights(k, 0.42, 6) })],
  [10, (k, H) => ({ solids: [overlay(lathe(0, 0, [[0.115, H + 1], [0.115, H + 5]], 8, k.gold, 0, true))] })],
];

/** Cross braces halfway up the derrick. */
function braces(k: ModelKit, H: number): Solid[] {
  const z = 22 + (H - 22) * 0.45;
  const r = 0.27 - 0.2 * 0.45;
  return [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const b = a + Math.PI / 2;
    return beam({ x: Math.cos(a) * r, y: Math.sin(a) * r, z }, { x: Math.cos(b) * r, y: Math.sin(b) * r, z }, 0.025, { ...k.steel, bare: true });
  });
}

/** A small tilted solar plate. */
export function panelPlate(k: ModelKit, x: number, y: number, z: number): Solid {
  return transform(box(x - 0.14, y - 0.1, z, 0.28, 0.2, 2.5, k.solar), rotateX(y, z, 0.35));
}

/** Yellow-and-dark hazard dashes around the drill hole. */
function hazardRing(svg: Svg, rig: Rig, r: number, z: number): void {
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / 24;
    const pts = [a0, a1].flatMap((a) => [project(rig, { x: Math.cos(a) * r, y: Math.sin(a) * r, z })]);
    const inner = [a1, a0].map((a) => project(rig, { x: Math.cos(a) * (r - 0.05), y: Math.sin(a) * (r - 0.05), z }));
    svg.add(polyPts([...pts, ...inner], '#ffd166', 'opacity="0.75"'));
  }
}

/* ---------- Smelter ---------- */

/** A round kiln with a glowing furnace door, a tall chimney and a feed funnel on top. */
export function smelterPart(base: ModelKit): BuildingModel {
  const k = base;
  const L = k.level;
  const C = Math.min(110, 74 + L * 3.6);
  const kiln = lathe(0, 0, [[0.33, 4], [0.36, 14], [0.34, 28], [0.25, 40], [0.15, 45]], 14, k.hull);
  const band = overlay(lathe(0, 0, [[0.363, 15], [0.363, 20]], 14, k.accent, 0, true));
  const door = box(0.2, -0.11, 5, 0.2, 0.22, 20, k.hull);
  const chimney = cylinder(-0.2, -0.22, 0.08, 24, C - 24, 10, k.hull);
  const chimneyBand = overlay(lathe(-0.2, -0.22, [[0.084, C - 16], [0.084, C - 11]], 10, k.accent, 0, true));
  const lip = lathe(-0.2, -0.22, [[0.095, C], [0.095, C + 3], [0.07, C + 4]], 10, k.dark);
  const funnel = lathe(0.02, 0.02, [[0.07, 43], [0.15, 52], [0.16, 55]], 10, k.steel);
  const body = [kiln, band, door, chimney, chimneyBand, lip, funnel];
  const mouth = k.at(0.402, 0, 13);
  const lights: SpriteLight[] = [{ ...mouth, color: EMBER, r: 18, phase: 0, work: true }];
  addParts(k, C, SMELTER_PARTS, body, lights);
  return {
    pad: [smallPad(k)],
    body,
    details: (svg, rig) => furnaceMouth(svg, rig),
    lights,
    top: C + 6,
    vents: [k.at(-0.2, -0.22, C + 6)],
    goods: k.at(0.32, 0.32, 6),
  };
}

const SMELTER_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [cylinder(-0.34, 0.16, 0.085, 5, 28, 10, k.accentBody)] })],
  [3, (k, C) => ({ solids: [cylinder(0.14, -0.3, 0.05, 30, C * 0.55, 8, k.hull), lathe(0.14, -0.3, [[0.06, 30 + C * 0.55], [0.045, 33 + C * 0.55]], 8, k.dark)] })],
  [4, (k) => ({ solids: [24, 29, 34].map((z) => overlay(lathe(0, 0, [[0.352 - (z - 24) * 0.006, z], [0.352 - (z - 24) * 0.006, z + 1.6]], 14, { ...k.steel, bare: true }, 0, true))) })],
  [5, (k) => ({ solids: [beam({ x: -0.34, y: 0.16, z: 26 }, { x: -0.18, y: 0.1, z: 30 }, 0.035, { ...k.steel, bare: true })] })],
  [6, (k) => ({ solids: [overlay(lathe(0, 0, [[0.345, 23], [0.345, 26]], 14, k.tech, 0, true))] })],
  [7, (k) => ({ solids: [box(-0.42, -0.36, 4, 0.2, 0.24, 24, k.hull), overlay(box(-0.42, -0.36, 24, 0.2, 0.24, 3, k.accent, true))] })],
  [8, (k, C) => ({ lights: [k.light(-0.2, -0.22, C + 10, TECH.beacon, 12, 0.6)] })],
  [9, (k) => ({ solids: [cylinder(0.16, 0.34, 0.075, 5, 22, 10, k.accentBody)] })],
  [10, (k, C) => ({ solids: [overlay(lathe(-0.2, -0.22, [[0.086, C - 26], [0.086, C - 22]], 10, k.gold, 0, true))] })],
];

/** The furnace door: an arched glowing opening on the door box's front face (+x). */
function furnaceMouth(svg: Svg, rig: Rig): void {
  const x = 0.401;
  const pts = [
    { y: -0.07, z: 7 },
    { y: 0.07, z: 7 },
    { y: 0.07, z: 16 },
    { y: 0.04, z: 19 },
    { y: -0.04, z: 19 },
    { y: -0.07, z: 16 },
  ].map((p) => project(rig, { x, y: p.y, z: p.z }));
  const top = Math.min(...pts.map((p) => p.y));
  const bottom = Math.max(...pts.map((p) => p.y));
  const fill = svg.linear(0, top, 0, bottom, [
    [0, '#ffe2a0'],
    [0.5, EMBER],
    [1, '#c2410c'],
  ]);
  svg.add(polyPts(pts, fill, `stroke="${mix(TECH.panelDark, '#000000', 0.3)}" stroke-width="1.4" stroke-linejoin="round"`));
}

/* ---------- Storage ---------- */

/** A domed silo with ribbed walls and a door; more silos join it with its levels. */
export function storagePart(base: ModelKit): BuildingModel {
  const k = base;
  const L = k.level;
  const S = 26 + L * 3.5;
  const silo = lathe(0, 0, [[0.34, 4], [0.36, 9], [0.36, 9 + S], [0.32, 13 + S], [0.2, 19 + S], [0.06, 22 + S]], 14, k.hull);
  const bands = [0.35, 0.7].map((t) => overlay(lathe(0, 0, [[0.364, 9 + S * t], [0.364, 11 + S * t]], 14, { ...k.steel, bare: true }, 0, true)));
  const stripe = overlay(lathe(0, 0, [[0.364, 12], [0.364, 17]], 14, k.accent, 0, true));
  const glass = overlay(lathe(0, 0, [[0.364, 2 + S], [0.364, 6 + S]], 14, k.tech, 0, true));
  const door = box(0.28, -0.1, 4, 0.12, 0.2, 18, k.panel);
  const body = [silo, ...bands, stripe, glass, door];
  const lights: SpriteLight[] = [];
  addParts(k, S, STORAGE_PARTS, body, lights);
  return { pad: [smallPad(k)], body, lights, top: S + 24, goods: k.at(0.3, 0.3, 6) };
}

const STORAGE_PARTS: (readonly [number, Part])[] = [
  [2, (k, S) => ({ solids: [lathe(0, 0, [[0.07, 22 + S], [0.07, 26 + S], [0.04, 28 + S]], 8, k.accentBody)] })],
  [3, (k) => ({ solids: [lathe(-0.28, 0.3, [[0.14, 4], [0.15, 8], [0.15, 30], [0.08, 37]], 10, k.hull)] })],
  [4, (k, S) => ({ solids: [beam({ x: 0, y: 0, z: 24 + S }, { x: 0.34, y: 0.28, z: 18 + S }, 0.03, { ...k.steel, bare: true })] })],
  [5, (k) => ({ solids: [lathe(0.3, -0.3, [[0.12, 4], [0.13, 8], [0.13, 24], [0.07, 30]], 10, k.hull)] })],
  [6, (k, S) => ({ solids: [overlay(lathe(0, 0, [[0.364, S * 0.5], [0.364, S * 0.5 + 3]], 14, k.tech, 0, true))] })],
  [7, (k) => ({ solids: [cylinder(-0.34, -0.16, 0.08, 4, 16, 10, k.accentBody)] })],
  [8, (k, S) => withMast(0, 0, 28 + S, 22)(k, S)],
  [9, (k) => ({ lights: rimLights(k, 0.42, 6) })],
  [10, (k, S) => ({ solids: [overlay(lathe(0, 0, [[0.326, 12 + S], [0.326, 15 + S]], 14, k.gold, 0, true))] })],
];

/* ---------- Landing pad ---------- */

/** A wide octagonal platform with landing marks, a control tower at the back corner and edge lights. */
export function padPart(base: ModelKit, def: BuildingDef): BuildingModel {
  const k = base;
  const r = Math.min(def.footprint.w, def.footprint.h) / 2 - 0.02;
  const platform = lathe(0, 0, [[r, -6], [r, 3], [r - 0.04, 7]], 8, k.panel, Math.PI / 8);
  const T = 38 + k.level * 2.4;
  const tower = cylinder(-0.66, -0.62, 0.13, 6, T, 12, k.hull);
  const towerBand = overlay(lathe(-0.66, -0.62, [[0.134, 14], [0.134, 19]], 12, k.accent, 0, true));
  const cab = lathe(-0.66, -0.62, [[0.16, 6 + T], [0.17, 12 + T], [0.12, 18 + T]], 12, k.tech);
  const roof = lathe(-0.66, -0.62, [[0.13, 18 + T], [0.06, 22 + T]], 12, k.hull);
  const body = [tower, towerBand, cab, roof];
  const lights: SpriteLight[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return k.light(Math.cos(a) * (r - 0.1), Math.sin(a) * (r - 0.1), 8, k.palette.tech, 12, i / 8);
  });
  lights.push(k.light(-0.66, -0.62, 24 + T, TECH.beacon, 16, 0.5));
  addParts(k, T, PAD_PARTS, body, lights);
  return {
    pad: [platform],
    marks: (svg, rig) => landingMarks(svg, rig, k.palette, r),
    body,
    lights,
    top: 30 + T,
    goods: k.at(-0.42, 0.56, 7),
  };
}

const PAD_R = 0.98;

const PAD_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [cylinder(0.56, -0.66, 0.1, 6, 26, 10, k.accentBody), cylinder(0.32, -0.74, 0.1, 6, 22, 10, k.accentBody)] })],
  [3, (k) => ({ solids: [beam({ x: -0.72, y: 0.4, z: 6 }, { x: -0.72, y: 0.4, z: 52 }, 0.04, { ...k.steel, bare: true }), beam({ x: -0.72, y: 0.4, z: 52 }, { x: -0.4, y: 0.52, z: 50 }, 0.035, k.accent)] })],
  [4, (k, T) => ({ solids: [lathe(-0.66, -0.62, [[0.1, 24 + T], [0.05, 28 + T]], 10, k.hull)] })],
  [5, (k) => ({ lights: [0, 1, 2, 3].map((i) => k.light(Math.cos(i * 1.57) * 0.45, Math.sin(i * 1.57) * 0.45, 8, GOLD, 9, i / 4 + 0.12)) })],
  [6, (k) => ({ solids: [box(0.2, -PAD_R + 0.06, 6, 0.5, 0.24, 20, k.hull), overlay(box(0.2, -PAD_R + 0.06, 20, 0.5, 0.24, 3, k.accent, true))] })],
  [7, (k) => ({ solids: [cylinder(0.66, 0.62, 0.08, 6, 30, 10, k.hull), lathe(0.66, 0.62, [[0.1, 36], [0.06, 42]], 10, k.tech)] })],
  [8, withMast(0.7, -0.3, 6, 50)],
  [9, (k) => ({ lights: Array.from({ length: 8 }, (_, i) => k.light(Math.cos(i * 0.785) * (PAD_R - 0.02), Math.sin(i * 0.785) * (PAD_R - 0.02), 6, GOLD, 8, i / 8 + 0.5)) })],
  [10, (k) => ({ solids: [overlay(lathe(-0.66, -0.62, [[0.136, 24], [0.136, 28]], 12, k.gold, 0, true))] })],
];

/** Landing circle with an inner ring, a dashed outer ring and four chevrons. */
function landingMarks(svg: Svg, rig: Rig, palette: WorldPalette, r: number): void {
  const ring = (rr: number, z: number): Pt[] => Array.from({ length: 48 }, (_, i) => project(rig, { x: Math.cos((i / 48) * Math.PI * 2) * rr, y: Math.sin((i / 48) * Math.PI * 2) * rr, z }));
  const inner = ring(0.5, 7.2);
  svg.add(polyPts(inner, 'none', `stroke="${palette.tech}" stroke-width="2.4" opacity="0.6"`));
  const outer = ring(r - 0.18, 7.2);
  svg.add(polyPts(outer, 'none', `stroke="${palette.tech}" stroke-width="1.6" stroke-dasharray="7 6" opacity="0.45"`));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tip = project(rig, { x: c * 0.58, y: s * 0.58, z: 7.2 });
    const l = project(rig, { x: c * 0.72 - s * 0.1, y: s * 0.72 + c * 0.1, z: 7.2 });
    const rr = project(rig, { x: c * 0.72 + s * 0.1, y: s * 0.72 - c * 0.1, z: 7.2 });
    svg.add(polyPts([l, tip, rr], 'none', `stroke="${TECH.accent}" stroke-width="3" stroke-linejoin="round" opacity="0.85"`));
  }
}
