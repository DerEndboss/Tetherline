import type { ContentRegistry } from '../../content/registry';
import type { BuildCategory, BuildingDef, ThemeDef } from '../../content/types';
import type { ArtManifest } from '../art-manifest';
import { mix, shade } from '../art/color';
import { fxSprites } from '../art/fx';
import type { SpriteArt } from '../art/svg';
import { footprintExtent, gridToWorld, heightScale } from '../iso';

/**
 * The rendering adapter's sprite list: which sprite id draws what, and plain placeholders for anything
 * without finished art. Convention (docs/architecture.md): a building's sprite is
 * `building-<id>`; while it is missing, `art.placeholder` (an existing 3D sprite, scaled to the footprint) or a
 * generated block stands in. Items use their material's `icon`, else a generated chip.
 */

export const buildingSpriteId = (def: BuildingDef): string => `building-${def.id}`;
export const blockId = (def: BuildingDef): string => `block-${def.id}`;
export const chipId = (item: string): string => `chip-${item}`;
export const DRONE_FRAMES = ['drone-build-drone-0', 'drone-build-drone-1'];

const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/** A manifest-only sprite (the PNG is used; the SVG is a blank stand-in). */
export function fromManifest(id: string, art: ArtManifest): SpriteArt | null {
  const a = art.get(id);
  return a ? { id, w: a.w, h: a.h, ax: a.ax, ay: a.ay, svg: BLANK, meta: a.meta } : null;
}

/** The sprite id that draws a building now: its own art, its placeholder, or the generated block. */
export function spriteFor(def: BuildingDef, art: ArtManifest): string {
  if (art.has(buildingSpriteId(def))) return buildingSpriteId(def);
  if (def.art.placeholder && art.has(def.art.placeholder)) return def.art.placeholder;
  return blockId(def);
}

const CATEGORY_TONE: Record<BuildCategory, string> = {
  core: '#e8eef6',
  mining: '#d9a066',
  logistics: '#8fa3c4',
  power: '#f2d06b',
  factories: '#c48a6a',
  liquids: '#6fb6e0',
  mega: '#c9a0f0',
};

/** Block height in tiles by size: small logistics blocks are flat, machines taller. */
function blockHeight(def: BuildingDef): number {
  if (def.size === 1 && def.category === 'logistics') return 0.18;
  if (def.size === 1 && def.category === 'liquids') return 0.16;
  return 0.25 + def.size * 0.18;
}

/** A plain bevelled box on the footprint (iso or top view): the placeholder until real art exists. */
export function blockSprite(def: BuildingDef, tech: string): SpriteArt {
  const s = def.size;
  const inset = 0.08;
  const hPx = blockHeight(def) * 78.4 * heightScale();
  const corners = [gridToWorld(inset, inset), gridToWorld(s - inset, inset), gridToWorld(s - inset, s - inset), gridToWorld(inset, s - inset)];
  const c = gridToWorld(s / 2, s / 2);
  const ext = footprintExtent(s, s);
  const pad = 4;
  const w = ext.halfW * 2 + pad * 2;
  const top = hPx + (c.y - Math.min(...corners.map((p) => p.y))) + pad;
  const h = top + ext.below + pad;
  const ox = ext.halfW + pad - c.x;
  const oy = top - c.y;
  const P = (p: { x: number; y: number }, up: number) => `${(p.x + ox).toFixed(1)},${(p.y + oy - up).toFixed(1)}`;
  const tone = CATEGORY_TONE[def.category];
  const [a, b, cc, d] = corners as [typeof c, typeof c, typeof c, typeof c];
  const faces = [
    `<polygon points="${P(d, 0)} ${P(cc, 0)} ${P(cc, hPx)} ${P(d, hPx)}" fill="${shade(tone, -0.28)}"/>`,
    `<polygon points="${P(b, 0)} ${P(cc, 0)} ${P(cc, hPx)} ${P(b, hPx)}" fill="${shade(tone, -0.12)}"/>`,
    `<polygon points="${P(a, hPx)} ${P(b, hPx)} ${P(cc, hPx)} ${P(d, hPx)}" fill="${tone}" stroke="${mix(tone, '#ffffff', 0.5)}" stroke-width="1.5"/>`,
    `<circle cx="${(c.x + ox).toFixed(1)}" cy="${(c.y + oy - hPx).toFixed(1)}" r="${Math.max(3, s * 4)}" fill="${tech}" opacity="0.85"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}">${faces.join('')}</svg>`;
  return { id: blockId(def), w: Math.ceil(w), h: Math.ceil(h), ax: (c.x + ox) / Math.ceil(w), ay: (c.y + oy) / Math.ceil(h), svg };
}

/** A round chip in the material's colours (items without a 3D icon). */
function chipSprite(id: string, color: string, accent: string): SpriteArt {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="17" r="12" fill="${shade(color, -0.35)}"/><circle cx="16" cy="15" r="12" fill="${color}"/><circle cx="12" cy="11" r="4" fill="${accent}" opacity="0.8"/></svg>`;
  return { id: chipId(id), w: 32, h: 32, ax: 0.5, ay: 0.5, svg };
}

/** Everything the world bakes at boot (deco props bake in their own layer). */
export function worldSprites(content: ContentRegistry, theme: ThemeDef, art: ArtManifest): SpriteArt[] {
  const out: SpriteArt[] = [...fxSprites(theme.palette)];
  const ids = new Set(out.map((s) => s.id));
  const add = (s: SpriteArt | null) => {
    if (s && !ids.has(s.id)) {
      ids.add(s.id);
      out.push(s);
    }
  };
  for (const def of content.buildings.list) {
    const id = spriteFor(def, art);
    add(id === blockId(def) ? blockSprite(def, theme.palette.tech) : fromManifest(id, art));
  }
  for (const m of content.materials.list) add(art.has(m.icon) ? fromManifest(m.icon, art) : chipSprite(m.id, m.color, m.accent ?? '#ffffff'));
  for (const id of [...theme.boulders, ...DRONE_FRAMES, 'sky-planet', 'sky-moon']) add(fromManifest(id, art));
  return out;
}

/** Sprite id of an item (material index). */
export function itemSpriteId(content: ContentRegistry, art: ArtManifest, item: number): string {
  const m = content.materials.list[item];
  if (!m) return '';
  return art.has(m.icon) ? m.icon : chipId(m.id);
}

/** A building's work-loop frames (`building-<id>-w0..`), in order; empty when its art has none. */
export function workFrames(def: BuildingDef, art: ArtManifest): string[] {
  const out: string[] = [];
  for (let i = 0; art.has(`${buildingSpriteId(def)}-w${i}`); i++) out.push(`${buildingSpriteId(def)}-w${i}`);
  return out;
}

/** Frame time of loops that carry no rate (the first, 4-frame full-picture loops). */
export const LEGACY_FRAME_MS = 240;

/**
 * A building's work loop (docs/art.md, "Work loops"): its frames, the still work base they overlay
 * (`building-<id>-wb`; null for an old loop of whole pictures) and the time per frame (the frames' `fps`).
 */
export interface WorkLoop {
  frames: string[];
  base: string | null;
  frameMs: number;
}

export function workLoop(def: BuildingDef, art: ArtManifest): WorkLoop | null {
  const frames = workFrames(def, art);
  if (!frames.length) return null;
  const base = `${buildingSpriteId(def)}-wb`;
  const fps = art.get(frames[0]!)?.meta?.fps;
  return { frames, base: art.has(base) ? base : null, frameMs: fps ? 1000 / fps : LEGACY_FRAME_MS };
}

/**
 * The sprite of a staged mega building (Space Elevator) after `done` stages: the foundation first, then the
 * tower growing (`-s1..-s3`), the finished art once every stage is done. Null when the art has no stage sprite.
 */
export function stageSprite(def: BuildingDef, art: ArtManifest, done: number): string | null {
  const id = `${buildingSpriteId(def)}-s${done + 1}`;
  return art.has(id) ? id : null;
}
