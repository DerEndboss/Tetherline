import type { FreighterDef, WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { beam, box, drawContact, drawShadow, drawSolids, lathe, overlay, project, rotateY, transform, type Material, type Rig, type Solid } from './solid';
import { ellipse, polyline, type Pt, type SpriteArt, Svg } from './svg';
import { TECH } from './tech';

/**
 * Cargo: the crate transport drones carry (and that waits on landing pads) and the freighter that lands at
 * pads. Same solids and light rig as everything else.
 */

export const CRATE = 'cargo-crate';
export const freighterId = (kind: string): string => `freighter-${kind}`;
export const FREIGHTER_SHADOW = 'freighter-shadow';

/** A small cargo crate: off-white box with orange straps; anchor at its bottom centre. */
export function crateSprite(palette: WorldPalette): SpriteArt {
  const W = 40;
  const H = 40;
  const rig: Rig = { origin: { x: 20, y: 30 }, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
  const hull: Material = { main: TECH.hull, dark: mix(TECH.hullDark, palette.shadow, 0.25) };
  const strap: Material = { main: TECH.accent, dark: shade(TECH.accent, -0.5), bare: true };
  const s = 0.13;
  const h = 15;
  const body = box(-s, -s, 0, s * 2, s * 2, h, hull);
  const svg = new Svg(W, H);
  drawSolids(svg, rig, [body], { outline: 1.4, rim: 0.6 });
  // Straps: across the lid and down the two faces turned to the camera.
  const p = (x: number, y: number, z: number): Pt => project(rig, { x, y, z });
  const strapLines: Pt[][] = [
    [p(-s, 0, h), p(s, 0, h), p(s, 0, 0)],
    [p(0, -s, h), p(0, s, h), p(0, s, 0)],
  ];
  for (const pts of strapLines) svg.add(polyline(pts, strap.main, 2.6));
  return { id: CRATE, w: W, h: H, ax: 0.5, ay: 30 / H, svg: svg.doc() };
}

const SHIP_W = 300;
const SHIP_H = 230;
const SHIP_ORIGIN: Pt = { x: 150, y: 170 };
/** Hull centre height above the ground (world px) when landed. */
const HULL_Z = 46;

/** Lathe rings (radius, distance from the tail in tiles) -> a horizontal body along +x whose tail sits at cx - length/2, axis at height z. */
function fuselage(cx: number, cy: number, length: number, rings: [number, number][], mat: Material, open = false, z = HULL_Z): Solid {
  const zRings = rings.map(([r, d]) => [r, z + d * 78.4] as [number, number]);
  return transform(lathe(cx - length / 2, cy, zRings, 14, mat, 0, open), rotateY(cx - length / 2, z, Math.PI / 2));
}

export interface FreighterArt {
  sprite: SpriteArt;
  /** Engine nozzles relative to the anchor (glows and flames). */
  engines: Pt[];
}

/**
 * The hauler: a stubby cargo fuselage lying along grid x, cockpit glass at the nose, an orange stripe, two
 * engine nacelles at the tail, a tail fin and four landing legs. Anchor = the point under its centre.
 */
export function freighterSprite(def: FreighterDef, palette: WorldPalette): FreighterArt {
  const rig: Rig = { origin: SHIP_ORIGIN, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
  const hull: Material = { main: def.colors.hull, dark: mix(TECH.hullDark, palette.shadow, 0.25) };
  const accent: Material = { main: def.colors.accent, dark: shade(def.colors.accent, -0.5), bare: true };
  const glass: Material = { main: shade(palette.tech, 0.2), dark: shade(palette.tech, -0.45), emissive: true, bare: true };
  const dark: Material = { main: '#4a5276', dark: mix('#1c2140', palette.shadow, 0.3) };
  const body = fuselage(0, 0, 1.5, [[0.16, 0], [0.27, 0.12], [0.31, 0.38], [0.31, 1.0], [0.25, 1.32], [0.1, 1.5]], hull);
  const stripe = overlay(fuselage(0, 0, 1.5, [[0.318, 0.55], [0.318, 0.7]], accent, true));
  const cockpit = overlay(fuselage(0, 0, 1.5, [[0.268, 1.16], [0.228, 1.3]], glass, true));
  const NZ = HULL_Z - 6;
  const nacelles = [-0.5, 0.5].flatMap((y) => [
    fuselage(-0.42, y, 0.62, [[0.08, 0], [0.14, 0.08], [0.14, 0.5], [0.09, 0.62]], hull, false, NZ),
    overlay(fuselage(-0.42, y, 0.62, [[0.144, 0.2], [0.144, 0.28]], accent, true, NZ)),
  ]);
  const pylons = [-1, 1].map((sgn) => beam({ x: -0.4, y: sgn * 0.2, z: HULL_Z - 2 }, { x: -0.4, y: sgn * 0.42, z: NZ }, 0.07, { ...hull, bare: true }));
  const fin = box(-0.74, -0.025, HULL_Z + 16, 0.3, 0.05, 30, hull);
  const legs = [
    [-0.4, -0.2],
    [-0.4, 0.2],
    [0.4, -0.2],
    [0.4, 0.2],
  ].flatMap(([x, y]) => [
    beam({ x: x!, y: y! * 0.6, z: HULL_Z - 18 }, { x: x!, y: y!, z: 4 }, 0.035, { ...dark, bare: true }),
    lathe(x!, y!, [[0.06, 0], [0.05, 4]], 8, { ...dark, bare: true }),
  ]);
  const nozzles = [-0.5, 0.5].map((y) => fuselage(-0.73, y, 0, [[0.075, -0.08], [0.105, 0]], dark, false, NZ));
  const solids = [...legs, ...nozzles, ...nacelles, ...pylons, body, stripe, cockpit, fin];
  const svg = new Svg(SHIP_W, SHIP_H);
  drawShadow(svg, rig, solids, 0.36, 3);
  drawContact(svg, rig, 0, 0, 0.7, 0.3);
  drawSolids(svg, rig, solids, { rim: 0.7 });
  const engines = [-0.5, 0.5].map((y) => {
    const p = project(rig, { x: -0.42 - 0.31 - 0.08, y, z: NZ });
    return { x: p.x - SHIP_ORIGIN.x, y: p.y - SHIP_ORIGIN.y };
  });
  const sprite: SpriteArt = {
    id: freighterId(def.id),
    w: SHIP_W,
    h: SHIP_H,
    ax: SHIP_ORIGIN.x / SHIP_W,
    ay: SHIP_ORIGIN.y / SHIP_H,
    svg: svg.doc(),
    meta: { vents: engines, top: HULL_Z + 40 },
  };
  return { sprite, engines };
}

/** Soft elongated ground shadow for a freighter in flight. */
export function freighterShadowSprite(palette: WorldPalette): SpriteArt {
  const svg = new Svg(220, 110);
  const fill = svg.radial(110, 55, 100, [
    [0, palette.shadow, 0.5],
    [0.6, palette.shadow, 0.22],
    [1, palette.shadow, 0],
  ], undefined, 0.5);
  svg.add(ellipse(110, 55, 100, 50, fill));
  return { id: FREIGHTER_SHADOW, w: 220, h: 110, ax: 0.5, ay: 0.5, svg: svg.doc() };
}
