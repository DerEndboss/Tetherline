import { addParts, dish, rimLights, withMast, type BuildingModel, type ModelKit, type Part } from './machines';
import { mix } from './color';
import { box, circlePoints, cylinder, lathe, overlay, type Rig, type Solid } from './solid';
import { polyline, type SpriteLight, type Svg } from './svg';

/**
 * The Research Lab (docs/art-direction.md, "Research"): a round white lab with a teal window band under an
 * observatory dome, a lab annex with a radar dish at the front corner, tanks at the back. The window band is a
 * work light (it flickers while the lab studies) and a teal beacon sits on the dome. 2 x 2 footprint;
 * coordinates: x, y in tiles with the footprint centred on 0, z in world px.
 */

const LAB = { x: -0.18, y: -0.18 };
const WALL = 40;
const DOME = 86;

export function labPart(base: ModelKit): BuildingModel {
  const k = base;
  const { x, y } = LAB;
  const pad = lathe(0, 0, [[0.97, -6], [0.97, 4], [0.91, 8]], 8, k.panel, Math.PI / 8);
  const wall = lathe(x, y, [[0.58, 6], [0.6, 12], [0.6, WALL], [0.56, WALL + 4]], 16, k.hull);
  const band = overlay(lathe(x, y, [[0.604, 13], [0.604, 18]], 16, k.accent, 0, true));
  const windows = overlay(lathe(x, y, [[0.606, 24], [0.606, 32]], 16, k.tech, 0, true));
  // Observatory glass: tinted teal like the windows but not glowing, so the lab never reads as the lander.
  const glass = { main: mix(k.palette.tech, '#ffffff', 0.25), dark: mix('#2b4f86', k.palette.shadow, 0.3) };
  const dome = lathe(x, y, [[0.52, WALL + 4], [0.48, WALL + 20], [0.36, WALL + 34], [0.2, WALL + 42], [0.05, DOME]], 16, glass);
  const ring = overlay(lathe(x, y, [[0.5, WALL + 9], [0.495, WALL + 13]], 16, { ...k.steel, bare: true }, 0, true));
  const annex = box(0.22, 0.12, 4, 0.62, 0.62, 26, k.hull);
  const annexBand = overlay(box(0.22, 0.12, 16, 0.62, 0.62, 5, k.tech, true));
  const door = box(0.84, 0.32, 4, 0.03, 0.22, 16, k.accentBody);
  const tanks = [cylinder(-0.7, 0.42, 0.11, 6, 32, 10, k.accentBody), lathe(-0.7, 0.42, [[0.11, 38], [0.06, 44]], 10, k.hull)];
  const post = cylinder(-0.74, -0.74, 0.022, 6, 52, 6, { ...k.steel, bare: true });
  const insulator = lathe(-0.74, -0.74, [[0.026, 56], [0.032, 60], [0.022, 64]], 8, k.hull);
  const body: Solid[] = [wall, band, windows, dome, ring, annex, annexBand, door, ...tanks, ...dish(k, 0.56, 0.42, 44, 0.16).map(overlay), post, insulator];
  const lights: SpriteLight[] = [
    { ...k.light(x + 0.42, y + 0.42, 28, k.palette.tech, 22, 0), work: true },
    k.light(x, y, DOME + 6, k.palette.tech, 14, 0.5),
  ];
  addParts(k, DOME, LAB_PARTS, body, lights);
  return {
    pad: [pad],
    marks: (svg, rig) => padRing(svg, rig, k.palette.tech),
    body,
    lights,
    top: DOME + 12,
    vents: [k.at(x, y, DOME + 2)],
    goods: k.at(0.5, -0.56, 7),
    wire: k.at(-0.74, -0.74, 62),
  };
}

const LAB_PARTS: (readonly [number, Part])[] = [
  [2, (k) => ({ solids: dish(k, -0.62, -0.1, 58, 0.13) })],
  [3, (k) => ({ solids: [cylinder(-0.42, 0.66, 0.09, 6, 26, 10, k.accentBody)] })],
  [4, (k) => ({ solids: [overlay(lathe(LAB.x, LAB.y, [[0.43, WALL + 26], [0.4, WALL + 29]], 16, k.tech, 0, true))] })],
  [5, withMast(0.7, -0.7, 4, 66)],
  [6, (k) => ({ solids: [box(0.3, -0.84, 4, 0.36, 0.3, 20, k.hull), overlay(box(0.3, -0.84, 20, 0.36, 0.3, 3, k.accent, true))] })],
  [7, (k) => ({ lights: rimLights(k, 0.9, 8) })],
  [8, (k) => ({ solids: [box(-0.86, 0.04, 4, 0.3, 0.3, 18, k.hull), overlay(box(-0.86, 0.04, 12, 0.3, 0.3, 4, k.tech, true))] })],
  [9, (k) => ({ solids: [box(0.28, 0.18, 30, 0.5, 0.4, 2.5, k.solar)] })],
  [10, (k) => ({ solids: [overlay(lathe(LAB.x, LAB.y, [[0.12, WALL + 40], [0.1, WALL + 43]], 16, k.gold, 0, true))] })],
];

/** A faint teal ring on the pad around the lab, like a landing pad's: the lab reads as part of the base. */
function padRing(svg: Svg, rig: Rig, color: string): void {
  const ring = circlePoints(rig, 0, 0, 0.86, 8.2, 48);
  svg.add(polyline([...ring, ring[0]!], color, 1.8, 'opacity="0.35" stroke-dasharray="8 7"'));
}
