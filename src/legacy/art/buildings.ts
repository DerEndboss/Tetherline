import type { BuildingArt, BuildingDef, WorldPalette } from '../content/types';
import { mix, shade } from './color';
import { fabricatorPart, mixerPart } from './crafting';
import { dish, GOLD, minePart, padPart, smelterPart, storagePart, type ModelKit, type BuildingModel } from './machines';
import { labPart } from './lab';
import { SKYFORGE_HEADROOM, skyforgePart } from './skyforge';
import { generatorPart, polePart, solarPart } from './power';
import {
  beam,
  box,
  circlePoints,
  cylinder,
  drawContact,
  drawShadow,
  drawSolids,
  lathe,
  overlay,
  project,
  type Material,
  type Rig,
  type Solid,
} from './solid';
import { circle, polyline, polyPts, type Pt, type SpriteArt, type SpriteLight, Svg } from './svg';
import { TECH } from './tech';

/**
 * Buildings, drawn from solids with the shared light rig. Every art kind is a model function: the solids of
 * its pad and body for a given level (levels add parts, docs/art-direction.md), lights, vents and the
 * goods spot. One composer turns a model into the finished sprite, into a construction stage (the body
 * clipped at a height, with scaffold poles and a glowing weld seam: it rises as build drones work) or into
 * the scaffold that stands around a building while it is upgraded.
 */

export const buildingId = (kind: string, level: number): string => `building-${kind}-${level}`;
export const buildingStageId = (kind: string, stage: number): string => `building-${kind}-stage-${stage}`;
export const scaffoldId = (w: number, h: number): string => `scaffold-${w}x${h}`;
export const hatchId = (side: 'l' | 'r'): string => `base-hatch-${side}`;
/** A level rising while build drones raise it (models that name their `fresh` parts). */
export const growthId = (kind: string, level: number, stage: number): string => `building-${kind}-${level}-grow-${stage}`;
/** The marking on a world's empty building site (the megastructure's foundation ring). */
export const siteMarkId = (kind: string): string => `site-${kind}`;

/** Construction stages a site shows while `build` runs from 0 to 1; each clips the body at a higher cut. */
export const BUILD_STAGES = 4;
const STAGE_CUTS = [0.16, 0.4, 0.64, 0.86];

/** Room above the footprint centre per art kind; everything else gets 200 px. */
const HEADROOM: Partial<Record<BuildingArt, number>> = { skyforge: SKYFORGE_HEADROOM };

/** Sprite box per footprint: the footprint centre sits at the origin, with room right for the shadow. */
function frame(fp: { w: number; h: number }, art?: BuildingArt): { w: number; h: number; origin: Pt } {
  const half = (fp.w + fp.h) * 32;
  const top = (art && HEADROOM[art]) ?? 200;
  // Tall art casts a long shadow to the right: give it room (shadows fall right by 0.42 px per px of height).
  const right = top > 200 ? Math.round(top * 0.3) : 0;
  return { w: half * 2 + 120 + right, h: half + top + 30, origin: { x: half + 24, y: top } };
}

function rigFor(palette: WorldPalette, origin: Pt): Rig {
  return { origin, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid };
}

/** The materials every building shares (the player's tech colours, docs/art-direction.md). */
function kitFor(palette: WorldPalette, rig: Rig, level: number): ModelKit {
  const steel = '#9aa6c4';
  return {
    rig,
    palette,
    level,
    hull: { main: TECH.hull, dark: mix(TECH.hullDark, palette.shadow, 0.25) },
    panel: { main: TECH.panel, dark: mix(TECH.panelDark, palette.shadow, 0.3) },
    steel: { main: steel, dark: mix(shade(steel, -0.55), palette.shadow, 0.3) },
    dark: { main: '#4a5276', dark: mix('#1c2140', palette.shadow, 0.3) },
    accent: { main: TECH.accent, dark: shade(TECH.accent, -0.5), bare: true },
    tech: { main: shade(palette.tech, 0.2), dark: shade(palette.tech, -0.45), emissive: true, bare: true },
    solar: { main: TECH.solar, dark: shade(TECH.solar, -0.6) },
    accentBody: { main: TECH.accent, dark: shade(TECH.accent, -0.5) },
    gold: { main: GOLD, dark: shade(GOLD, -0.45), bare: true },
    light: (x, y, z, color, r, phase) => {
      const p = project(rig, { x, y, z });
      return { x: p.x - rig.origin.x, y: p.y - rig.origin.y, color, r, phase };
    },
    at: (x, y, z) => {
      const p = project(rig, { x, y, z });
      return { x: p.x - rig.origin.x, y: p.y - rig.origin.y };
    },
  };
}

/* ---------- The landing base ---------- */

/** The landing base: an octagonal pad, a capsule on four legs, a glowing window band, a dome with the drone hatch. */
function landerModel(k: ModelKit): BuildingModel {
  const { rig, palette, hull: h, accent, tech } = k;
  const pad = [lathe(0, 0, [[0.98, -6], [0.98, 4], [0.92, 8]], 8, k.panel, Math.PI / 8)];
  const legs = [0, 1, 2, 3].flatMap((i) => {
    const a = (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
      beam({ x: c * 0.42, y: s * 0.42, z: 44 }, { x: c * 0.68, y: s * 0.68, z: 10 }, 0.055, { ...h, bare: true }),
      lathe(c * 0.68, s * 0.68, [[0.085, 8], [0.065, 13]], 8, { ...h, bare: true }),
    ];
  });
  const module = box(0.3, -0.78, 8, 0.42, 0.3, 26, h);
  const solar = box(0.24, -0.86, 34, 0.56, 0.46, 3, k.solar);
  const tank = cylinder(-0.66, 0.2, 0.13, 8, 30, 10, { main: TECH.accent, dark: shade(TECH.accent, -0.5) });
  const body = lathe(0, 0, [[0.44, 12], [0.53, 24], [0.53, 72], [0.46, 90]], 16, h);
  const band = overlay(lathe(0, 0, [[0.536, 30], [0.536, 39]], 16, accent, 0, true));
  const windows = overlay(lathe(0, 0, [[0.54, 53], [0.54, 62]], 16, tech, 0, true));
  const dome = lathe(0, 0, [[0.46, 90], [0.4, 105], [0.27, 116], [0.11, 121]], 16, h);
  const mast = cylinder(-0.22, -0.26, 0.024, 98, 52, 6, { ...h, bare: true });
  const lights: SpriteLight[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return k.light(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 8, palette.tech, 14, i / 8);
  });
  lights.push(k.light(-0.22, -0.26, 152, TECH.beacon, 20, 0.5));
  const extras = landerExtras(k);
  return {
    pad,
    marks: (svg) => padMarkings(svg, rig, palette, 0.74, 8.2),
    body: [module, solar, tank, ...legs, body, band, windows, dome, mast, ...extras.solids],
    details: (svg) => {
      landerDetails(svg, rig);
      hatchHole(svg, rig);
    },
    lights: [...lights, ...extras.lights],
    hatch: k.at(0, 0, 121),
    top: 156,
    wire: k.at(-0.22, -0.26, 146),
  };
}

type LanderPart = (k: ModelKit) => { solids?: Solid[]; lights?: SpriteLight[] };

/** Parts the base gains with its levels: modules, tanks, dishes, more lights, a gold crown. */
const LANDER_PARTS: (readonly [number, LanderPart])[] = [
  [2, (k) => ({ solids: [box(0.5, -0.36, 8, 0.26, 0.3, 14, k.hull), box(0.46, -0.4, 22, 0.34, 0.38, 3, k.solar)] })],
  [3, (k) => ({ solids: [cylinder(0.5, 0.52, 0.09, 8, 34, 10, k.accentBody), cylinder(0.66, 0.34, 0.09, 8, 28, 10, k.accentBody)] })],
  [4, (k) => ({ solids: dish(k, 0.36, -0.32, 92, 0.16) })],
  [5, (k) => ({ solids: [overlay(lathe(0, 0, [[0.538, 78], [0.538, 82]], 16, k.tech, 0, true))] })],
  [6, (k) => ({ solids: [cylinder(0.24, 0.2, 0.02, 100, 40, 6, { ...k.hull, bare: true })], lights: [k.light(0.24, 0.2, 142, TECH.beacon, 14, 0.1)] })],
  [7, (k) => ({ solids: [box(-0.3, 0.62, 8, 0.5, 0.24, 18, k.hull), overlay(box(-0.3, 0.62, 18, 0.5, 0.24, 3, k.accent, true))] })],
  [8, (k) => ({ lights: Array.from({ length: 8 }, (_, i) => ringLight(k, i, 0.62, 9, k.palette.tech)) })],
  [9, (k) => ({ solids: dish(k, -0.42, 0.3, 64, 0.13) })],
  [10, (k) => ({ solids: [overlay(lathe(0, 0, [[0.47, 86], [0.47, 90]], 16, k.gold, 0, true))] })],
];

function landerExtras(k: ModelKit): { solids: Solid[]; lights: SpriteLight[] } {
  const solids: Solid[] = [];
  const lights: SpriteLight[] = [];
  for (const [level, part] of LANDER_PARTS) {
    if (k.level < level) continue;
    const add = part(k);
    solids.push(...(add.solids ?? []));
    lights.push(...(add.lights ?? []));
  }
  return { solids, lights };
}

export function ringLight(k: ModelKit, i: number, r: number, z: number, color: string): SpriteLight {
  const a = (i / 8) * Math.PI * 2;
  return k.light(Math.cos(a) * r, Math.sin(a) * r, z, color, 10, i / 8);
}

/** Pad markings: a landing ring and four chevrons pointing in. */
export function padMarkings(svg: Svg, rig: Rig, palette: WorldPalette, r: number, z: number): void {
  const ring = circlePoints(rig, 0, 0, r, z);
  svg.add(polyline([...ring, ring[0]!], palette.tech, 2.2, 'opacity="0.55"'));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tip = project(rig, { x: c * (r - 0.14), y: s * (r - 0.14), z });
    const l = project(rig, { x: c * (r - 0.02) - s * 0.08, y: s * (r - 0.02) + c * 0.08, z });
    const rr = project(rig, { x: c * (r - 0.02) + s * 0.08, y: s * (r - 0.02) - c * 0.08, z });
    svg.add(polyPts([l, tip, rr], 'none', `stroke="${TECH.accent}" stroke-width="2.4" stroke-linejoin="round" opacity="0.85"`));
  }
}

/** Cell lines on the solar panel and the beacon lamp on the mast. */
function landerDetails(svg: Svg, rig: Rig): void {
  for (let i = 1; i < 4; i++) {
    const x = 0.24 + (0.56 * i) / 4;
    svg.add(polyline([project(rig, { x, y: -0.86, z: 37.2 }), project(rig, { x, y: -0.4, z: 37.2 })], TECH.solarLine, 1, 'opacity="0.7"'));
  }
  const y = -0.86 + 0.23;
  svg.add(polyline([project(rig, { x: 0.24, y, z: 37.2 }), project(rig, { x: 0.8, y, z: 37.2 })], TECH.solarLine, 1, 'opacity="0.7"'));
  const lamp = project(rig, { x: -0.22, y: -0.26, z: 152 });
  svg.add(circle(lamp.x, lamp.y, 3.6, shade(TECH.beacon, 0.35), `stroke="${shade(TECH.beacon, -0.6)}" stroke-width="1.3"`));
}

/** Dark hatch opening on the dome; the lid halves are separate sprites that slide apart. */
function hatchHole(svg: Svg, rig: Rig): void {
  const hole = circlePoints(rig, 0, 0, 0.13, 121.4, 20);
  svg.add(polyPts(hole, TECH.hatchHole, `stroke="${shade(TECH.hullDark, -0.5)}" stroke-width="1.5"`));
}

/** One half of the hatch lid (left or right), anchored at the hatch centre. */
export function hatchSprite(side: 'l' | 'r', palette: WorldPalette): SpriteArt {
  const w = 48;
  const h = 32;
  const rig = rigFor(palette, { x: 24, y: 16 });
  const sign = side === 'l' ? -1 : 1;
  const pts = circlePoints(rig, 0, 0, 0.135, 0, 24).filter((p) => (p.x - 24) * sign >= -0.5);
  const svg = new Svg(w, h);
  const fill = svg.linear(0, 8, 0, 24, [
    [0, shade(TECH.hull, 0.1)],
    [1, mix(TECH.hullDark, palette.shadow, 0.2)],
  ]);
  svg.add(polyPts(pts, fill, `stroke="${shade(TECH.hullDark, -0.45)}" stroke-width="1.4" stroke-linejoin="round"`));
  svg.add(polyline([{ x: 24 + sign * 3, y: 12 }, { x: 24 + sign * 8, y: 15 }], TECH.accent, 1.6));
  return { id: hatchId(side), w, h, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

/* ---------- Placeholder ---------- */

/** For buildings that get their own art in later steps: a clean block on a pad, same light. */
function blockModel(k: ModelKit, def: BuildingDef): BuildingModel {
  const hw = def.footprint.w / 2;
  const hd = def.footprint.h / 2;
  const pad = box(-hw + 0.05, -hd + 0.05, -4, hw * 2 - 0.1, hd * 2 - 0.1, 8, k.panel);
  const body = box(-hw + 0.2, -hd + 0.2, 4, hw * 2 - 0.4, hd * 2 - 0.4, 40 + k.level * 4, k.hull);
  return { pad: [pad], body: [body], lights: [], top: 48 + k.level * 4 };
}

/* ---------- Composer ---------- */

type ModelFn = (k: ModelKit, def: BuildingDef) => BuildingModel;

const MODELS: Record<BuildingArt, ModelFn> = {
  lander: landerModel,
  mine: minePart,
  smelter: smelterPart,
  storage: storagePart,
  pad: padPart,
  mixer: mixerPart,
  fabricator: fabricatorPart,
  pole: polePart,
  generator: generatorPart,
  solar: solarPart,
  lab: labPart,
  skyforge: skyforgePart,
  block: blockModel,
};

function modelOf(def: BuildingDef, palette: WorldPalette, level: number): { model: BuildingModel; rig: Rig; f: ReturnType<typeof frame> } {
  const f = frame(def.footprint, def.art);
  const rig = rigFor(palette, f.origin);
  return { model: MODELS[def.art](kitFor(palette, rig, level), def), rig, f };
}

function sprite(id: string, f: ReturnType<typeof frame>, svg: Svg, model: BuildingModel, cut?: number): SpriteArt {
  return {
    id,
    w: f.w,
    h: f.h,
    ax: f.origin.x / f.w,
    ay: f.origin.y / f.h,
    svg: svg.doc(),
    meta: { lights: cut === undefined ? model.lights : [], hatch: model.hatch, top: cut ?? model.top, vents: model.vents, goods: model.goods, wire: model.wire },
  };
}

/** The finished building at a level. */
export function buildingSprite(def: BuildingDef, palette: WorldPalette, level: number): SpriteArt {
  const { model, rig, f } = modelOf(def, palette, level);
  const svg = new Svg(f.w, f.h);
  const reach = Math.max(def.footprint.w, def.footprint.h) * 0.52;
  drawShadow(svg, rig, model.body, 0.42, 3);
  drawContact(svg, rig, 0, 0, reach, 0.4);
  drawSolids(svg, rig, model.pad);
  model.marks?.(svg, rig);
  drawSolids(svg, rig, model.body, { rim: 0.7 });
  model.details?.(svg, rig);
  return sprite(buildingId(def.id, level), f, svg, model);
}

/** Clips a solid at height `z`: vertices above it drop onto the cut (faces that collapse vanish). */
export function clip(s: Solid, z: number): Solid | null {
  if (Math.min(...s.verts.map((v) => v.z)) >= z) return null;
  return { ...s, verts: s.verts.map((v) => ({ ...v, z: Math.min(v.z, z) })) };
}

/** A building site at construction stage `stage` (0..BUILD_STAGES-1): pad, the body up to a cut, scaffold, seam. */
export function buildingStageSprite(def: BuildingDef, palette: WorldPalette, stage: number): SpriteArt {
  const { model, rig, f } = modelOf(def, palette, 1);
  const cut = Math.round(model.top * STAGE_CUTS[stage]!);
  const body = model.body.map((s) => clip(s, cut)).filter((s): s is Solid => s !== null);
  const svg = new Svg(f.w, f.h);
  drawShadow(svg, rig, body, 0.32, 3);
  drawSolids(svg, rig, model.pad);
  model.marks?.(svg, rig);
  const kit = kitFor(palette, rig, 1);
  const [back, front] = scaffold(kit, def.footprint, cut + 10);
  drawSolids(svg, rig, back, { outline: 1.4, rim: 0 });
  drawSolids(svg, rig, body, { rim: 0.5 });
  seam(svg, rig, body, cut);
  drawSolids(svg, rig, front, { outline: 1.4, rim: 0 });
  return sprite(buildingStageId(def.id, stage), f, svg, model, cut);
}

/** Whether a building kind's levels rise on their own while drones build them (its model names `fresh` parts). */
export function grows(def: BuildingDef, palette: WorldPalette): boolean {
  return (modelOf(def, palette, 2).model.fresh?.length ?? 0) > 0;
}

/**
 * Level `level` rising at construction stage `stage` (0..BUILD_STAGES-1): everything of the level below stands,
 * the level's own parts are clipped at a cut that climbs from their foot to their top, with a glowing seam.
 * `meta.top` is the cut (where the drones weld).
 */
export function growthSprite(def: BuildingDef, palette: WorldPalette, level: number, stage: number): SpriteArt {
  const { model, rig, f } = modelOf(def, palette, level);
  const fresh = new Set(model.fresh ?? []);
  const zs = [...fresh].flatMap((s) => s.verts.map((v) => v.z));
  const low = Math.min(...zs);
  const cut = Math.round(low + (Math.max(...zs) - low) * STAGE_CUTS[stage]!);
  const old = model.body.filter((s) => !fresh.has(s));
  const rising = [...fresh].map((s) => clip(s, cut)).filter((s): s is Solid => s !== null);
  const body = [...old, ...rising];
  const svg = new Svg(f.w, f.h);
  drawShadow(svg, rig, body, 0.42, 3);
  drawContact(svg, rig, 0, 0, Math.max(def.footprint.w, def.footprint.h) * 0.52, 0.4);
  drawSolids(svg, rig, model.pad);
  model.marks?.(svg, rig);
  drawSolids(svg, rig, body, { rim: 0.6 });
  seam(svg, rig, rising, cut);
  const prev = modelOf(def, palette, level - 1).model;
  return { ...sprite(growthId(def.id, level, stage), f, svg, { ...model, lights: prev.lights }), meta: { lights: prev.lights, top: cut, vents: model.vents } };
}

/** Survey marks on an empty site: a dashed teal ring, corner stakes with orange flags (the foundation waits here). */
export function siteMarkSprite(def: BuildingDef, palette: WorldPalette): SpriteArt {
  const f = frame(def.footprint);
  const rig = rigFor(palette, f.origin);
  const kit = kitFor(palette, rig, 1);
  const svg = new Svg(f.w, f.h);
  const r = Math.min(def.footprint.w, def.footprint.h) * 0.46;
  const ring = circlePoints(rig, 0, 0, r, 0, 64);
  svg.add(polyline([...ring, ring[0]!], palette.tech, 3, 'opacity="0.55" stroke-dasharray="14 10"'));
  const inner = circlePoints(rig, 0, 0, r * 0.34, 0, 32);
  svg.add(polyline([...inner, inner[0]!], palette.tech, 2, 'opacity="0.35"'));
  const hx = def.footprint.w / 2 - 0.12;
  const hy = def.footprint.h / 2 - 0.12;
  const stakes = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].flatMap(([x, y]) => [cylinder(x!, y!, 0.03, 0, 34, 6, { ...kit.steel, bare: true }), box(x! + 0.02, y! - 0.01, 22, 0.16, 0.02, 11, { ...kit.accentBody, bare: true })]);
  drawSolids(svg, rig, stakes, { outline: 1.2, rim: 0 });
  return { id: siteMarkId(def.id), w: f.w, h: f.h, ax: f.origin.x / f.w, ay: f.origin.y / f.h, svg: svg.doc() };
}

/** The scaffold that stands around a building while drones upgrade it. */
export function scaffoldSprite(fp: { w: number; h: number }, palette: WorldPalette, height: number): SpriteArt {
  const f = frame(fp);
  const rig = rigFor(palette, f.origin);
  const [back, front] = scaffold(kitFor(palette, rig, 1), fp, height);
  const svg = new Svg(f.w, f.h);
  drawSolids(svg, rig, back, { outline: 1.4, rim: 0 });
  drawSolids(svg, rig, front, { outline: 1.4, rim: 0 });
  return { id: scaffoldId(fp.w, fp.h), w: f.w, h: f.h, ax: f.origin.x / f.w, ay: f.origin.y / f.h, svg: svg.doc() };
}

/** Corner poles and two rails: [behind the body, in front of it]. */
function scaffold(k: ModelKit, fp: { w: number; h: number }, height: number): [Solid[], Solid[]] {
  const hx = fp.w / 2 - 0.06;
  const hy = fp.h / 2 - 0.06;
  const pole: Material = { ...k.steel, bare: true };
  const rail: Material = { main: '#ffd166', dark: shade('#ffd166', -0.5), bare: true };
  const mid: Material = { ...k.steel, bare: true };
  const corners = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ] as const;
  const back: Solid[] = [];
  const front: Solid[] = [];
  corners.forEach(([x, y], i) => {
    const solids = [beam({ x, y, z: 0 }, { x, y, z: height }, 0.026, pole)];
    const [nx, ny] = corners[(i + 1) % 4]!;
    solids.push(beam({ x, y, z: height * 0.5 }, { x: nx, y: ny, z: height * 0.5 }, 0.02, mid));
    solids.push(beam({ x, y, z: height }, { x: nx, y: ny, z: height }, 0.028, rail));
    (x + y + nx + ny > 0 ? front : back).push(...solids);
  });
  return [back, front];
}

/** A hot seam around each body part the cut goes through (the widest three): where drones weld the next layer on. */
function seam(svg: Svg, rig: Rig, body: readonly Solid[], cut: number): void {
  const rings = body
    .map((s) => s.verts.filter((v) => Math.abs(v.z - cut) < 0.5))
    .filter((top) => top.length >= 6)
    .map((top) => {
      const cx = top.reduce((a, v) => a + v.x, 0) / top.length;
      const cy = top.reduce((a, v) => a + v.y, 0) / top.length;
      const r = Math.max(...top.map((v) => Math.sqrt((v.x - cx) ** 2 + (v.y - cy) ** 2)));
      return { cx, cy, r };
    })
    .filter((c) => c.r > 0.05)
    .sort((a, b) => b.r - a.r)
    .slice(0, 3);
  for (const c of rings) {
    const ring = circlePoints(rig, c.cx, c.cy, c.r + 0.01, cut, 32);
    svg.add(`<g ${svg.blur(2.2)}>${polyline([...ring, ring[0]!], '#ffe9a8', 5, 'opacity="0.7"')}</g>`);
    svg.add(polyline([...ring, ring[0]!], '#fff6dc', 1.6, 'opacity="0.95"'));
  }
}

/** Every sprite of one building kind the world bakes up front: level 1, its construction stages. */
export function buildingStartSprites(def: BuildingDef, palette: WorldPalette): SpriteArt[] {
  const stages = Array.from({ length: BUILD_STAGES }, (_, i) => buildingStageSprite(def, palette, i));
  return [buildingSprite(def, palette, 1), ...stages];
}
