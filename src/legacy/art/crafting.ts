import { mix } from './color';
import { addParts, panelPlate, rimLights, smallPad, withMast, type BuildingModel, type ModelKit, type Part } from './machines';
import { beam, box, circlePoints, cylinder, lathe, overlay, project, type Rig, type Solid } from './solid';
import { line, polyline, polyPts, type SpriteLight, type Svg } from './svg';
import { TECH } from './tech';

/**
 * The crafting machines (docs/art-direction.md, "Machines"): the Mixer, a round vat with two hoppers that
 * pour into it and a stirrer over it; the Fabricator, a 3D printer with a print bed between two posts and a
 * cabinet at the back. What moves (the liquid in the vat, the print bridge, the nozzle and the part growing
 * layer by layer) is drawn on top by `render/craft-view.ts` from `printing.ts`; these models are the still
 * parts. Coordinates: x, y in tiles with the footprint centred on 0; z in world px.
 */

/** Where the liquid surface of the mixer's vat sits (grid offset and height). */
export const VAT = { x: 0.04, y: 0.04, z: 30, r: 0.255 };
/** The two hoppers (first and second input), at the back of the vat. */
export const HOPPERS = [
  { x: -0.3, y: -0.02 },
  { x: -0.02, y: -0.3 },
] as const;
const HOPPER_Z = 38;
const STIRRER_Z = 70;

/** The fabricator's print bed top, its two posts (left and right corner) and the height of the top rail. */
export const FAB = { bedZ: 15, bed: 0.36, post: 0.74, railZ: 92 };

/* ---------- Mixer ---------- */

export function mixerPart(base: ModelKit): BuildingModel {
  const k = base;
  const { x: vx, y: vy } = VAT;
  const vat = lathe(vx, vy, [[0.2, 3], [0.27, 8], [0.29, 22], [0.285, VAT.z]], 14, k.hull);
  const rim = overlay(lathe(vx, vy, [[0.292, VAT.z - 4], [0.292, VAT.z]], 14, { ...k.steel, bare: true }, 0, true));
  const band = overlay(lathe(vx, vy, [[0.293, 11], [0.293, 16]], 14, k.accent, 0, true));
  const spout = box(0.3, -0.04, 20, 0.12, 0.12, 6, k.steel);
  const hoppers = HOPPERS.flatMap((h) => hopper(k, h.x, h.y));
  const post = cylinder(0.34, -0.34, 0.032, 3, STIRRER_Z + 2, 8, { ...k.steel, bare: true });
  const arm = beam({ x: 0.34, y: -0.34, z: STIRRER_Z + 2 }, { x: vx, y: vy, z: STIRRER_Z + 2 }, 0.05, k.steel);
  const motor = lathe(vx, vy, [[0.075, STIRRER_Z - 9], [0.085, STIRRER_Z - 4], [0.085, STIRRER_Z + 6], [0.06, STIRRER_Z + 9]], 10, k.accentBody);
  const shaft = cylinder(vx, vy, 0.022, VAT.z - 3, STIRRER_Z - VAT.z - 5, 6, { ...k.dark, bare: true });
  const body = [vat, rim, band, spout, post, ...hoppers, arm, shaft, motor];
  const lights: SpriteLight[] = HOPPERS.map((h, i) => k.light(h.x, h.y, HOPPER_Z + 17, k.palette.tech, 7, i * 0.5));
  addParts(k, VAT.z, MIXER_PARTS, body, lights);
  return {
    pad: [smallPad(k)],
    body,
    details: (svg, rig) => vatSurface(svg, rig),
    lights,
    top: STIRRER_Z + 10,
    vents: [k.at(vx, vy, VAT.z + 4)],
    goods: k.at(0.32, 0.3, 6),
  };
}

/** A funnel on a stalk with a chute down to the vat's rim. */
function hopper(k: ModelKit, x: number, y: number): Solid[] {
  const stalk = cylinder(x, y, 0.028, 3, HOPPER_Z - 3, 6, { ...k.steel, bare: true });
  const funnel = lathe(x, y, [[0.035, HOPPER_Z], [0.11, HOPPER_Z + 8], [0.12, HOPPER_Z + 15]], 10, k.hull);
  const lip = overlay(lathe(x, y, [[0.123, HOPPER_Z + 11], [0.123, HOPPER_Z + 15]], 10, k.accent, 0, true));
  const toward = { x: VAT.x + (x - VAT.x) * 0.55, y: VAT.y + (y - VAT.y) * 0.55 };
  const chute = beam({ x, y, z: HOPPER_Z + 1 }, { x: toward.x, y: toward.y, z: VAT.z + 2 }, 0.04, { ...k.steel, bare: true });
  return [stalk, funnel, lip, chute];
}

/** The still liquid in the vat (in game a tinted, stirred surface is drawn over it). */
function vatSurface(svg: Svg, rig: Rig): void {
  const ring = circlePoints(rig, VAT.x, VAT.y, VAT.r, VAT.z + 0.2, 28);
  const c = project(rig, { x: VAT.x, y: VAT.y, z: VAT.z });
  const fill = svg.radial(c.x - 6, c.y - 3, 20, [[0, '#ffe2b0'], [0.5, '#ffb066'], [1, '#d9692f']]);
  svg.add(polyPts(ring, fill, `stroke="${mix(TECH.panelDark, '#000000', 0.3)}" stroke-width="1.2"`));
}

const MIXER_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [box(-0.44, 0.16, 3, 0.16, 0.24, 16, k.hull), overlay(box(-0.44, 0.16, 16, 0.16, 0.24, 3, k.accent, true))] })],
  [3, (k) => ({ solids: [beam({ x: HOPPERS[0].x, y: HOPPERS[0].y, z: 22 }, { x: HOPPERS[1].x, y: HOPPERS[1].y, z: 22 }, 0.025, { ...k.steel, bare: true })] })],
  [4, (k) => ({ solids: [panelPlate(k, -0.3, 0.3, 21)] })],
  [5, (k) => ({ solids: [cylinder(0.36, -0.06, 0.065, 3, 20, 8, k.accentBody)] })],
  [6, (k) => ({ solids: [overlay(lathe(VAT.x, VAT.y, [[0.293, 19], [0.293, 22]], 14, k.tech, 0, true))] })],
  [7, (k) => ({ solids: [lathe(0.34, -0.34, [[0.07, STIRRER_Z + 4], [0.04, STIRRER_Z + 9]], 10, k.hull)] })],
  [8, withMast(-0.38, -0.38, 3, 58)],
  [9, (k) => ({ lights: rimLights(k, 0.42, 6) })],
  [10, (k) => ({ solids: [overlay(lathe(VAT.x, VAT.y, [[0.294, 4], [0.294, 7]], 14, k.gold, 0, true))] })],
];

/* ---------- Fabricator ---------- */

export function fabricatorPart(base: ModelKit): BuildingModel {
  const k = base;
  const { post: p, railZ } = FAB;
  const platform = lathe(0, 0, [[0.97, -6], [0.97, 3], [0.93, 6]], 8, k.panel, Math.PI / 8);
  const b = FAB.bed;
  const bed = lathe(0, 0, [[b * 1.32, 6], [b * 1.32, FAB.bedZ - 3], [b * 1.26, FAB.bedZ]], 4, k.dark, Math.PI / 4);
  const cabinet = box(-0.95, -0.95, 6, 0.48, 0.48, 50, k.hull);
  const cabBand = overlay(box(-0.95, -0.95, 34, 0.48, 0.48, 4, k.accent, true));
  const screen = overlay(box(-0.86, -0.47, 16, 0.3, 0.012, 13, k.tech));
  const feet = [box(-p - 0.09, p - 0.09, 6, 0.18, 0.18, 8, k.panel), box(p - 0.09, -p - 0.09, 6, 0.18, 0.18, 8, k.panel)];
  const posts = [cylinder(-p, p, 0.06, 14, railZ - 14, 10, k.steel), cylinder(p, -p, 0.06, 14, railZ - 14, 10, k.steel)];
  const caps = [-1, 1].map((s) => lathe(-p * s, p * s, [[0.085, railZ - 3], [0.085, railZ + 6], [0.055, railZ + 9]], 10, k.accentBody));
  const rail = beam({ x: -p, y: p, z: railZ + 2 }, { x: p, y: -p, z: railZ + 2 }, 0.055, k.steel);
  const backs = [-1, 1].map((s) => beam({ x: -p * s, y: p * s, z: railZ - 10 }, { x: s < 0 ? -0.72 : -0.48, y: s < 0 ? -0.48 : -0.72, z: 52 }, 0.03, { ...k.steel, bare: true }));
  const spool = lathe(-0.55, 0.22, [[0.15, 6], [0.15, 9], [0.07, 9.5], [0.07, 19], [0.15, 19.5], [0.15, 22.5]], 14, k.accentBody);
  const tube = beam({ x: -0.55, y: 0.22, z: 22 }, { x: -p, y: p, z: 62 }, 0.022, { ...k.dark, bare: true });
  const body = [bed, cabinet, cabBand, screen, spool, tube, ...feet, ...posts, ...backs, rail, ...caps];
  const lights: SpriteLight[] = [{ ...k.light(-0.71, -0.47, 22, k.palette.tech, 12, 0), work: true }, k.light(-0.71, -0.71, 60, TECH.beacon, 14, 0.4)];
  addParts(k, railZ, FAB_PARTS, body, lights);
  return {
    pad: [platform],
    marks: (svg, rig) => bedMarks(svg, rig, k.palette.tech),
    body,
    details: (svg, rig) => screenLines(svg, rig, k.palette.tech),
    lights,
    top: railZ + 12,
    vents: [k.at(-0.72, -0.72, 58)],
    goods: k.at(0.56, 0.56, 6),
  };
}

/** A teal grid on the bed top: the print area. */
function bedMarks(svg: Svg, rig: Rig, tech: string): void {
  const z = FAB.bedZ + 0.3;
  const b = FAB.bed;
  const at = (x: number, y: number): ReturnType<typeof project> => project(rig, { x, y, z });
  svg.add(polyPts([at(-b, -b), at(b, -b), at(b, b), at(-b, b)], 'none', `stroke="${tech}" stroke-width="1.6" opacity="0.75"`));
  for (const t of [-b / 2, 0, b / 2]) {
    svg.add(line(at(t, -b), at(t, b), tech, 0.9, 'opacity="0.35"'), line(at(-b, t), at(b, t), tech, 0.9, 'opacity="0.35"'));
  }
}

/** Two lit lines of text on the cabinet's screen. */
function screenLines(svg: Svg, rig: Rig, tech: string): void {
  for (const [z, w] of [[22, 0.18], [18.5, 0.12]] as const) {
    svg.add(polyline([project(rig, { x: -0.8, y: -0.48, z }), project(rig, { x: -0.8 + w, y: -0.48, z })], mix(tech, '#ffffff', 0.5), 1.2, 'opacity="0.8"'));
  }
}

const FAB_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: [lathe(-0.15, 0.62, [[0.13, 6], [0.13, 9], [0.06, 9.5], [0.06, 17], [0.13, 17.5], [0.13, 20.5]], 14, { main: '#7fd1c7', dark: mix('#2c5f5a', k.palette.shadow, 0.3) })] })],
  [3, (k) => ({ solids: [beam({ x: -FAB.post, y: FAB.post, z: 40 }, { x: -0.72, y: -0.5, z: 30 }, 0.025, { ...k.steel, bare: true }), beam({ x: FAB.post, y: -FAB.post, z: 40 }, { x: -0.5, y: -0.72, z: 30 }, 0.025, { ...k.steel, bare: true })] })],
  [4, (k) => ({ solids: [panelPlate(k, -0.72, -0.72, 57)] })],
  [5, (k) => ({ solids: [cylinder(0.62, -0.28, 0.09, 6, 30, 10, k.accentBody), cylinder(0.4, -0.62, 0.09, 6, 24, 10, k.accentBody)] })],
  [6, (k) => ({ solids: [overlay(box(-0.95, -0.95, 42, 0.48, 0.48, 3, k.tech, true))] })],
  [7, (k) => ({ solids: [box(0.36, -0.94, 6, 0.3, 0.26, 16, k.hull), overlay(box(0.36, -0.94, 22, 0.3, 0.26, 3, k.accent, true))] })],
  [8, withMast(-0.85, -0.85, 56, 40)],
  [9, (k) => ({ lights: Array.from({ length: 8 }, (_, i) => k.light(Math.cos(i * 0.785 + 0.39) * 0.9, Math.sin(i * 0.785 + 0.39) * 0.9, 6, k.palette.tech, 9, i / 8)) })],
  [10, (k) => ({ solids: [-1, 1].map((s) => overlay(lathe(-FAB.post * s, FAB.post * s, [[0.088, FAB.railZ + 1], [0.088, FAB.railZ + 4]], 10, k.gold, 0, true))) })],
];
