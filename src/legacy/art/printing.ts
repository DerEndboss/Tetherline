import type { ContentRegistry } from '../content/registry';
import type { WorldPalette } from '../content/types';
import { clip } from './buildings';
import { mix, shade } from './color';
import { FAB, VAT } from './crafting';
import { iconLook, type IconLook } from './icons';
import { beam, box, circlePoints, cylinder, drawSolids, hull, lathe, overlay, project, type Material, type Rig, type Solid } from './solid';
import { circle, polyline, polyPts, type Pt, type SpriteArt, Svg } from './svg';
import { TECH } from './tech';

/**
 * The moving parts of the crafting machines, as sprites the view moves every frame:
 *  - a part on the fabricator's bed at each of PRINT_STAGES heights (the solids clipped at a rising cut,
 *    with a hot seam at the newest layer): the part grows layer by layer,
 *  - the print bridge between the posts and the nozzle head that slides along it,
 *  - the liquid in the mixer's vat (white, tinted in game with the mix of its inputs), swirl frames and the
 *    stirrer shaft above it.
 * What a part looks like comes from its icon family (truss, coil, board, orb), so a new part in the data
 * prints with a fitting model in its own colours.
 */

export const PRINT_STAGES = 10;
export const SWIRL_FRAMES = 4;
export const printId = (material: string, stage: number): string => `print-${material}-${stage}`;
export const PRINT_BRIDGE = 'print-bridge';
export const PRINT_HEAD = 'print-head';
export const VAT_SURFACE = 'vat-surface';
export const VAT_SHAFT = 'vat-shaft';
export const swirlId = (frame: number): string => `vat-swirl-${frame}`;
/** Height of the nozzle carriage's centre above the nozzle tip (the bridge runs through it). */
export const HEAD_LIFT = 13;

const rigAt = (palette: WorldPalette, origin: Pt): Rig => ({ origin, light: palette.light, shadow: palette.shadow, sky: palette.sky.mid });
const matOf = (c: string, palette: WorldPalette, extra: Partial<Material> = {}): Material => ({ main: c, dark: mix(shade(c, -0.55), palette.shadow, 0.25), ...extra });

/** A printed part: its solids (base on z = 0) and its height. */
interface PrintModel {
  solids: Solid[];
  h: number;
}

type ModelFn = (look: IconLook, palette: WorldPalette) => PrintModel;

function trussModel(look: IconLook, palette: WorldPalette): PrintModel {
  const s = 0.19;
  const h = 40;
  const m = matOf(look.color, palette, { bare: false });
  const corners = [[-s, -s], [s, -s], [s, s], [-s, s]] as const;
  const solids: Solid[] = [];
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4]!;
    solids.push(beam({ x, y, z: 0 }, { x, y, z: h }, 0.05, m));
    solids.push(beam({ x, y, z: 1.5 }, { x: nx, y: ny, z: 1.5 }, 0.045, m), beam({ x, y, z: h }, { x: nx, y: ny, z: h }, 0.045, m));
  });
  solids.push(beam({ x: s, y: -s, z: 2 }, { x: s, y: s, z: h - 2 }, 0.035, m), beam({ x: -s, y: s, z: 2 }, { x: s, y: s, z: h - 2 }, 0.035, m));
  return { solids, h: h + 2 };
}

function coilModel(look: IconLook, palette: WorldPalette): PrintModel {
  const flange = matOf(look.accent ?? '#5d6a94', palette);
  const copper = matOf(look.color, palette);
  const solids = [
    lathe(0, 0, [[0.2, 0], [0.2, 4]], 14, flange),
    lathe(0, 0, [[0.15, 4], [0.16, 8], [0.16, 26], [0.15, 29]], 14, copper),
    ...[10, 15, 20, 25].map((z) => overlay(lathe(0, 0, [[0.162, z], [0.162, z + 1]], 14, { ...matOf(shade(look.color, -0.35), palette), bare: true }, 0, true))),
    lathe(0, 0, [[0.2, 29], [0.2, 33]], 14, flange),
  ];
  return { solids, h: 33 };
}

function boardModel(look: IconLook, palette: WorldPalette): PrintModel {
  const green = matOf(look.color, palette);
  const chip = matOf('#2c3246', palette);
  const gold = matOf(look.accent ?? '#ffd98a', palette, { bare: true });
  const solids: Solid[] = [];
  for (let i = 0; i < 3; i++) {
    const z = i * 11;
    solids.push(box(-0.22, -0.22, z, 0.44, 0.44, 3, green), box(-0.09, -0.09, z + 3, 0.18, 0.18, 3.5, chip));
    if (i < 2) for (const [x, y] of [[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]] as const) solids.push(cylinder(x, y, 0.016, z + 3, 8, 6, gold));
  }
  return { solids, h: 28.5 };
}

function orbModel(look: IconLook, palette: WorldPalette): PrintModel {
  const steel = matOf('#9aa6c4', palette);
  const glow = matOf(mix(look.color, '#ffffff', 0.2), palette, { emissive: true });
  const r = 0.17;
  const zr = 13;
  const rings: [number, number][] = Array.from({ length: 9 }, (_, a) => [Math.max(0.01, r * Math.sin((Math.PI * a) / 8)), 6 + zr - zr * Math.cos((Math.PI * a) / 8)]);
  const solids = [
    lathe(0, 0, [[0.14, 0], [0.13, 3], [0.08, 6]], 10, steel),
    lathe(0, 0, rings, 12, glow),
    overlay(lathe(0, 0, [[0.185, 6 + zr - 1.5], [0.185, 6 + zr + 1.5]], 14, { ...steel, bare: true }, 0, true)),
  ];
  return { solids, h: 6 + zr * 2 };
}

function blockModel(look: IconLook, palette: WorldPalette): PrintModel {
  return { solids: [box(-0.16, -0.12, 0, 0.32, 0.24, 16, matOf(look.color, palette))], h: 16 };
}

const MODELS: Partial<Record<IconLook['icon'], ModelFn>> = { truss: trussModel, coil: coilModel, board: boardModel, orb: orbModel };

/** The part at print stage `stage` (0..PRINT_STAGES-1): clipped at (stage + 1) / PRINT_STAGES of its height. */
export function printStageSprite(material: string, look: IconLook, palette: WorldPalette, stage: number): SpriteArt {
  const model = (MODELS[look.icon] ?? blockModel)(look, palette);
  const w = 96;
  const h = 96;
  const rig = rigAt(palette, { x: 48, y: 76 });
  const cut = (model.h * (stage + 1)) / PRINT_STAGES;
  const solids = model.solids.map((s) => clip(s, cut)).filter((s): s is Solid => s !== null);
  const svg = new Svg(w, h);
  drawSolids(svg, rig, solids, { outline: 1.6, rim: 0.5 });
  if (stage < PRINT_STAGES - 1) layerGlow(svg, rig, solids, cut, mix(look.color, '#ffffff', 0.65));
  return { id: printId(material, stage), w, h, ax: 0.5, ay: 76 / h, svg: svg.doc(), meta: { top: cut } };
}

/** The newest layer glows: the outline of every solid's cut face, blurred and bright. */
function layerGlow(svg: Svg, rig: Rig, solids: readonly Solid[], cut: number, color: string): void {
  for (const s of solids) {
    const top = s.verts.filter((v) => Math.abs(v.z - cut) < 0.5).map((v) => project(rig, v));
    if (top.length < 3) continue;
    const ring = hull(top);
    svg.add(`<g ${svg.blur(1.6)}>${polyline([...ring, ring[0]!], color, 3.2, 'opacity="0.75"')}</g>`);
    svg.add(polyline([...ring, ring[0]!], '#fff6dc', 1, 'opacity="0.9"'));
  }
}

/** The bridge between the fabricator's posts, with a slider on each post; anchored on its centre line. */
export function printBridgeSprite(palette: WorldPalette): SpriteArt {
  const p = FAB.post;
  const w = 240;
  const h = 48;
  const rig = rigAt(palette, { x: 120, y: 24 });
  const steel = matOf('#9aa6c4', palette);
  const slider = matOf(TECH.accent, palette);
  const solids = [
    beam({ x: -p, y: p, z: 0 }, { x: p, y: -p, z: 0 }, 0.045, steel),
    box(-p - 0.08, p - 0.08, -5, 0.16, 0.16, 10, slider),
    box(p - 0.08, -p - 0.08, -5, 0.16, 0.16, 10, slider),
  ];
  const svg = new Svg(w, h);
  drawSolids(svg, rig, solids, { outline: 1.6, rim: 0.5 });
  return { id: PRINT_BRIDGE, w, h, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

/** The print head: a carriage on the bridge and a nozzle with a hot tip; anchored at the tip. */
export function printHeadSprite(palette: WorldPalette): SpriteArt {
  const w = 48;
  const h = 56;
  const rig = rigAt(palette, { x: 24, y: 46 });
  const hullMat = matOf(TECH.hull, palette);
  const solids = [
    box(-0.07, -0.07, HEAD_LIFT - 6, 0.14, 0.14, 13, hullMat),
    overlay(box(-0.07, -0.07, HEAD_LIFT + 2, 0.14, 0.14, 3, { ...matOf(TECH.accent, palette), bare: true }, true)),
    lathe(0, 0, [[0.016, 0], [0.04, 4], [0.055, HEAD_LIFT - 6]], 10, matOf('#c9d2e4', palette)),
  ];
  const svg = new Svg(w, h);
  drawSolids(svg, rig, solids, { outline: 1.5, rim: 0.5 });
  svg.add(`<g ${svg.blur(1.4)}>${circle(24, 46, 3, '#ffd9a0')}</g>`, circle(24, 46, 1.4, '#fff6dc'));
  return { id: PRINT_HEAD, w, h, ax: 0.5, ay: 46 / h, svg: svg.doc() };
}

/** The liquid in the vat: white with soft shading (the view tints it), anchored at the surface centre. */
export function vatSurfaceSprite(palette: WorldPalette): SpriteArt {
  const w = 64;
  const h = 40;
  const rig = rigAt(palette, { x: 32, y: 20 });
  const ring = circlePoints(rig, 0, 0, VAT.r, 0, 28);
  const svg = new Svg(w, h);
  const fill = svg.radial(27, 17, 30, [[0, '#ffffff'], [0.45, '#d9d9d9'], [1, '#6e6e6e']], { x: 24, y: 15 }, 0.6);
  svg.add(polyPts(ring, fill, `stroke="${mix(TECH.panelDark, '#000000', 0.3)}" stroke-width="1.2"`));
  // The vat wall's shadow on the back of the liquid, and a soft sheen where the light hits it.
  const back = circlePoints(rig, 0.03, 0.03, VAT.r * 0.94, 0, 28).filter((p) => p.y < 20.5);
  svg.add(polyline(back, '#4a4a4a', 3, 'opacity="0.45"'));
  svg.add(`<g ${svg.blur(1.2)}><ellipse cx="25" cy="18" rx="7" ry="2.6" fill="#ffffff" opacity="0.9"/></g>`);
  return { id: VAT_SURFACE, w, h, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

/** Light streaks on the liquid, turned a quarter further each frame: the stirred surface. */
export function vatSwirlSprite(palette: WorldPalette, frame: number): SpriteArt {
  const w = 64;
  const h = 40;
  const rig = rigAt(palette, { x: 32, y: 20 });
  const svg = new Svg(w, h);
  for (let arm = 0; arm < 2; arm++) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = (frame / SWIRL_FRAMES) * Math.PI + arm * Math.PI + t * 2.4;
      const r = VAT.r * (0.2 + 0.65 * t);
      pts.push(project(rig, { x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 }));
    }
    svg.add(polyline(pts, '#ffffff', 1.6, 'opacity="0.8"'));
  }
  return { id: swirlId(frame), w, h, ax: 0.5, ay: 0.5, svg: svg.doc() };
}

/** The stirrer shaft from the liquid up to the motor, with a paddle hub at the surface. */
export function vatShaftSprite(palette: WorldPalette): SpriteArt {
  const w = 24;
  const h = 56;
  const rig = rigAt(palette, { x: 12, y: 48 });
  const dark = matOf('#4a5276', palette);
  const solids = [cylinder(0, 0, 0.022, 0, 33, 6, { ...dark, bare: true }), lathe(0, 0, [[0.05, -1], [0.05, 2], [0.03, 3]], 8, matOf('#9aa6c4', palette))];
  const svg = new Svg(w, h);
  drawSolids(svg, rig, solids, { outline: 1.2, rim: 0.4 });
  return { id: VAT_SHAFT, w, h, ax: 0.5, ay: 48 / h, svg: svg.doc() };
}

/** Materials a fabricator can print (outputs of recipes run by buildings drawn as a fabricator). */
export function printables(content: ContentRegistry): string[] {
  const printers = new Set(content.buildings.list.filter((b) => b.art === 'fabricator').map((b) => b.id));
  const ids = content.recipes.list.filter((r) => printers.has(r.building)).flatMap((r) => r.outputs.map((a) => a.id));
  return [...new Set(ids)];
}

/** Every crafting sprite baked up front: the bridge, head, vat parts. Print stages bake on first use. */
export function craftingSprites(palette: WorldPalette): SpriteArt[] {
  return [
    printBridgeSprite(palette),
    printHeadSprite(palette),
    vatSurfaceSprite(palette),
    vatShaftSprite(palette),
    ...Array.from({ length: SWIRL_FRAMES }, (_, i) => vatSwirlSprite(palette, i)),
  ];
}

/** All print stages of every printable part (for the art sheet; the game bakes them lazily). */
export function printSprites(content: ContentRegistry, palette: WorldPalette): SpriteArt[] {
  return printables(content).flatMap((id) => {
    const look = iconLook(content, id);
    return look ? Array.from({ length: PRINT_STAGES }, (_, s) => printStageSprite(id, look, palette, s)) : [];
  });
}
