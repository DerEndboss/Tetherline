import type { Id } from '../../content/types';
import type { PlanSpec, TileBox } from '../../sim/commands';
import { asDir } from '../../sim/grid';
import type { Dir } from '../../sim/state';
import type { World } from '../../sim/world';
import type { FootprintArea } from './region';

/** One building of a blueprint: its top-left relative to the blueprint's corner. */
export interface BlueprintItem {
  kind: Id;
  x: number;
  y: number;
  size: number;
  rot: Dir;
  config?: number;
}

/** A copied area: buildings with relative positions, `w` x `h` tiles. Pure data (saved as JSON). */
export interface Blueprint {
  name: string;
  w: number;
  h: number;
  items: BlueprintItem[];
}

/**
 * Copies the buildings an area covers (the core stays where it is): the ones that touch a tile box, or those whose
 * footprint centre a screen-aligned rectangle holds (`Region`). The area may be any shape: the blueprint is the
 * buildings with relative positions inside the tight box around them (`w` x `h`), so turning, mirroring, pasting and
 * the saved library never assume a full rectangle. Its corner is the top-left of that box; null when the area holds
 * nothing copyable.
 */
export function captureBlueprint(w: World, area: TileBox | FootprintArea, name = ''): Blueprint | null {
  const covers = 'hasFootprint' in area ? area.hasFootprint.bind(area) : (x: number, y: number, size: number): boolean => x <= area.x1 && y <= area.y1 && x + size > area.x0 && y + size > area.y0;
  const found = w.state.buildings.filter((b) => w.def(b).behaviour !== 'core' && !b.removing && covers(b.x, b.y, w.def(b).size));
  if (!found.length) return null;
  const x0 = Math.min(...found.map((b) => b.x));
  const y0 = Math.min(...found.map((b) => b.y));
  const x1 = Math.max(...found.map((b) => b.x + w.def(b).size));
  const y1 = Math.max(...found.map((b) => b.y + w.def(b).size));
  const items = found.map((b): BlueprintItem => {
    const item: BlueprintItem = { kind: w.def(b).id, x: b.x - x0, y: b.y - y0, size: w.def(b).size, rot: b.rot };
    if (b.config >= 0) item.config = b.config;
    return item;
  });
  return { name, w: x1 - x0, h: y1 - y0, items };
}

/** The same blueprint turned 90 degrees clockwise `steps` times (belts turn with it). */
export function rotateBlueprint(bp: Blueprint, steps = 1): Blueprint {
  let out = bp;
  for (let i = 0; i < ((steps % 4) + 4) % 4; i++) out = turnOnce(out);
  return out;
}

function turnOnce(bp: Blueprint): Blueprint {
  return {
    name: bp.name,
    w: bp.h,
    h: bp.w,
    items: bp.items.map((it) => ({ ...it, x: bp.h - it.y - it.size, y: it.x, rot: asDir(it.rot + 1) })),
  };
}

/** Mirrors left to right (belts facing east and west swap). */
export function flipBlueprint(bp: Blueprint): Blueprint {
  return {
    name: bp.name,
    w: bp.w,
    h: bp.h,
    items: bp.items.map((it) => ({ ...it, x: bp.w - it.x - it.size, rot: it.rot === 0 ? 2 : it.rot === 2 ? 0 : it.rot })),
  };
}

/** The ghosts that paste a blueprint with its corner at (ox, oy). */
export function blueprintPlans(bp: Blueprint, ox: number, oy: number): PlanSpec[] {
  return bp.items.map((it) => {
    const plan: PlanSpec = { kind: it.kind, x: ox + it.x, y: oy + it.y, rot: it.rot };
    if (it.config !== undefined) plan.config = it.config;
    return plan;
  });
}

/** The corner that centres a blueprint on a tile (what the cursor points at). */
export function pasteCorner(bp: Blueprint, tx: number, ty: number): { x: number; y: number } {
  return { x: tx - Math.floor(bp.w / 2), y: ty - Math.floor(bp.h / 2) };
}

function parseItem(it: Partial<BlueprintItem>, sizeOf: (id: Id) => number): BlueprintItem | null {
  const size = typeof it.kind === 'string' ? sizeOf(it.kind) : 0;
  if (!size || !Number.isInteger(it.x) || !Number.isInteger(it.y) || !Number.isInteger(it.rot)) return null;
  const item: BlueprintItem = { kind: it.kind!, x: it.x!, y: it.y!, size, rot: asDir(it.rot!) };
  if (Number.isInteger(it.config)) item.config = it.config;
  return item;
}

/** Reads a saved blueprint; null when it is broken or uses buildings this game does not know (`sizeOf` returns 0). */
export function parseBlueprint(raw: unknown, sizeOf: (id: Id) => number): Blueprint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Blueprint>;
  if (typeof r.name !== 'string' || !Array.isArray(r.items) || !r.items.length) return null;
  const items = (r.items as Partial<BlueprintItem>[]).map((it) => parseItem(it, sizeOf));
  if (items.some((i) => i === null)) return null;
  const ok = items as BlueprintItem[];
  return { name: r.name.slice(0, 40), w: Math.max(...ok.map((i) => i.x + i.size)), h: Math.max(...ok.map((i) => i.y + i.size)), items: ok };
}
