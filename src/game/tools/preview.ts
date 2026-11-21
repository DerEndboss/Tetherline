import type { BuildingDef } from '../../content/types';
import { placementProblem, topLeftFor } from '../../sim/placement';
import { DX, DY } from '../../sim/grid';
import type { Dir } from '../../sim/state';
import type { World } from '../../sim/world';
import { aimFacing, firstAxis, linePath, routePath, type Feeds } from '../line';
import { blueprintPlans, pasteCorner, type Blueprint } from './blueprint';
import { copiesAlong, fillRegion, MAX_TILES, normBox, spacedNodes, type Tile } from './geometry';
import { crossBehaviour, feedsAt, isThrough, routeTerrain } from './line-terrain';
import { Region } from './region';
import { nodeLine } from './power-line';

/** A ghost the renderer draws under the cursor or along a drag (`ok` = it can be placed there). */
export interface PreviewGhost {
  kind: number;
  x: number;
  y: number;
  rot: Dir;
  ok: boolean;
  /** An existing belt of the same kind that is only turned (its building id): no new ghost, a `rotate` command. */
  replace?: number;
}

/** What a placing drag looks like: where it began, which axis a line starts along, the held modifiers. */
export interface PlaceDrag {
  from: Tile;
  /** True = start along x. null = not decided yet (the longer axis wins). */
  xFirst: boolean | null;
  /** The area a Shift-drag fills (a screen rectangle in iso); without it, the box of tiles between `from` and the hover. */
  area?: Region | null;
}

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
}

/** 1x1 rotating blocks (conveyors, conduits) are laid as routed lines. */
export function isLineDef(def: BuildingDef): boolean {
  return def.size === 1 && def.rotates === true;
}

/** A line piece (belt or pipe of the same behaviour) at a tile, finished or rising. */
function lineAt(w: World, def: BuildingDef, x: number, y: number): { rot: Dir; x: number; y: number } | undefined {
  const b = w.at(x, y);
  return b && !b.removing && w.def(b).behaviour === def.behaviour ? b : undefined;
}

/** The ways the belts (or pipes) around `t` that point at it run: what feeds a piece put down on `t`. */
function leadsInto(w: World, def: BuildingDef, t: Tile): Dir[] {
  const out: Dir[] = [];
  for (let d = 0; d < 4; d++) {
    const n = lineAt(w, def, t.x + DX[d]!, t.y + DY[d]!);
    if (n && n.x + DX[n.rot]! === t.x && n.y + DY[n.rot]! === t.y) out.push(n.rot);
  }
  return out;
}

/**
 * The way a single clicked belt faces while the player has not turned it (R). It continues the belt that leads
 * into it, but turns into a better target beside it when the tile ahead takes nothing (or less): the core, a store,
 * a factory. Without a belt leading in it does the same from the way the tool is held, and it feeds the back of a
 * belt next to it that runs away from here (closing a gap between a drill and its line). A drag that stays on one
 * tile and the hover ghost use the same facing, so a click never differs from a tiny drag. Pipes only continue.
 */
export function autoRot(w: World, def: BuildingDef, t: Tile, rot: Dir): Dir {
  const into = leadsInto(w, def, t);
  if (def.behaviour !== 'conveyor') return into[0] ?? runningAway(w, def, t) ?? rot;
  const feeds: Feeds = (x, y, d, straight) => feedsAt(w, x, y, d, straight);
  const hands = into.find((r) => feedsAt(w, t.x, t.y, r, true) > 0);
  const lead = hands ?? into[0];
  return lead !== undefined ? aimFacing(feeds, t.x, t.y, lead, true) : aimFacing(feeds, t.x, t.y, rot, false);
}

/** The direction of a neighbouring belt (or pipe) that runs away from `t`, if there is one. */
function runningAway(w: World, def: BuildingDef, t: Tile): Dir | undefined {
  for (let d = 0; d < 4; d++) {
    if (lineAt(w, def, t.x + DX[d]!, t.y + DY[d]!)?.rot === d) return d as Dir;
  }
  return undefined;
}

/** Which axis the drag's line starts along once it has left the first tile; Ctrl flips it. */
export function lineAxis(drag: PlaceDrag, hover: Tile, ctrl: boolean): boolean {
  const x = drag.xFirst ?? firstAxis(drag.from, hover);
  return ctrl ? !x : x;
}

function ghostAt(w: World, def: BuildingDef, kind: number, t: Tile, rot: Dir): PreviewGhost {
  if (isLineDef(def)) {
    const b = w.at(t.x, t.y);
    if (b && b.kind === kind && !b.removing) return { kind, x: t.x, y: t.y, rot, ok: true, replace: b.id };
  }
  return { kind, x: t.x, y: t.y, rot, ok: placementProblem(w, def, t.x, t.y) === null };
}

function rectGhosts(w: World, def: BuildingDef, kind: number, area: Region, rot: Dir): PreviewGhost[] {
  if (area.tooBig) return [];
  const spots = isLineDef(def) ? area.tiles() : fillRegion(def, area);
  return spots.map((t) => ghostAt(w, def, kind, t, rot));
}

/**
 * The ghosts of the placing tool: one under the cursor, or for a drag: a routed belt line (turns by itself,
 * goes around obstacles), poles along a line, a filled rectangle with Shift, otherwise a row of copies.
 */
export function placePreview(w: World, def: BuildingDef, kind: number, hover: Tile, drag: PlaceDrag | null, rot: Dir, mods: Modifiers, auto = false): PreviewGhost[] {
  if (!drag) {
    const at = topLeftFor(def.size, hover.x, hover.y);
    return [ghostAt(w, def, kind, at, auto && isLineDef(def) ? autoRot(w, def, at, rot) : rot)];
  }
  if (mods.shift) return rectGhosts(w, def, kind, drag.area ?? Region.ofBox(normBox(drag.from, hover)), rot);
  if (def.behaviour === 'power-node') return nodeLine(w, def, drag.from, hover).map((t) => ghostAt(w, def, kind, t, 0));
  if (isBridgeDef(def)) return bridgeGhosts(w, def, kind, drag, hover, rot, mods.ctrl);
  if (isLineDef(def)) return lineGhosts(w, def, kind, drag, hover, rot, mods, auto);
  return copiesAlong(def, drag.from, hover).map((t) => ghostAt(w, def, kind, t, rot));
}

/** The ghosts of a dragged belt or pipe line (see `routeTerrain` for the rules the route follows). */
function lineGhosts(w: World, def: BuildingDef, kind: number, drag: PlaceDrag, hover: Tile, rot: Dir, mods: Modifiers, auto: boolean): PreviewGhost[] {
  const terrain = routeTerrain(w, def, kind, auto, mods.ctrl);
  const single = drag.from.x === hover.x && drag.from.y === hover.y;
  // one tile (a click, or a drag that never left it) is faced exactly as the hover ghost shows it (autoRot)
  const path = single ? [{ ...hover, rot: auto ? autoRot(w, def, hover, rot) : rot }] : routePath(drag.from, hover, rot, terrain, lineAxis(drag, hover, mods.ctrl)).slice(0, MAX_TILES);
  const ghosts = path.flatMap((t, i) => {
    // an existing junction the line runs straight through stays as it is: no ghost
    if (isThrough(w, def, t.x, t.y) && i > 0 && i < path.length - 1 && path[i - 1]!.rot === t.rot) return [];
    const ghost = ghostAt(w, def, kind, t, t.rot);
    const prev = path[i - 1];
    const next = path[i + 1];
    // a belt that would be cut (not an end the player dragged to, not turned the way it runs) shows red
    return [prev && next && terrain.pass && !terrain.pass(t.x, t.y, prev.rot, t.rot, true) ? { ...ghost, ok: false } : ghost];
  });
  return crossBehaviour(def) ? junctionsAcross(w, ghosts, def.behaviour) : ghosts;
}

/**
 * Mindustry: a line laid straight across a line that runs the other way puts a junction on that tile instead of
 * turning the belt (which would cut its line). Only where the line goes on at both sides. Belts cross with a
 * junction, pipes with a conduit junction.
 */
export function junctionsAcross(w: World, ghosts: PreviewGhost[], behaviour = 'conveyor'): PreviewGhost[] {
  const cross = behaviour === 'conduit' ? 'liquid-junction' : 'junction';
  const junction = w.defs.findIndex((d) => d.behaviour === cross);
  const jdef = w.defs[junction];
  if (!jdef) return ghosts;
  return ghosts.map((g, i) => {
    const prev = ghosts[i - 1];
    if (!prev || !ghosts[i + 1] || prev.rot !== g.rot) return g;
    const b = w.at(g.x, g.y);
    if (!b || b.removing || w.def(b).behaviour !== behaviour || ((b.rot - g.rot) & 1) === 0) return g;
    return { kind: junction, x: g.x, y: g.y, rot: 0, ok: placementProblem(w, jdef, g.x, g.y) === null };
  });
}

/** Bridges (item and conduit) are not laid on every tile: they are set a reach apart and link up by themselves. */
export function isBridgeDef(def: BuildingDef): boolean {
  return def.size === 1 && !!def.bridge && (def.behaviour === 'bridge' || def.behaviour === 'liquid-bridge');
}

/**
 * Mindustry: a straight drag puts a bridge at the start, then one every `range` tiles at most (on tiles where it
 * fits, so rocks and water are jumped), and one at the end. They all face along the line, which is how a finished
 * bridge finds its partner (sim/blocks/transport.ts autoLinkInLine). Where a gap is wider than the range the run
 * stops with a red bridge on the far side.
 */
function bridgeGhosts(w: World, def: BuildingDef, kind: number, drag: PlaceDrag, hover: Tile, rot: Dir, ctrl: boolean): PreviewGhost[] {
  const alongX = lineAxis(drag, hover, ctrl);
  const end = alongX ? { x: hover.x, y: drag.from.y } : { x: drag.from.x, y: hover.y };
  const run = linePath(drag.from, end, rot, alongX).slice(0, MAX_TILES);
  const fits = (t: Tile): boolean => placementProblem(w, def, t.x, t.y) === null;
  // a gap wider than the range ends the run with one red bridge (out of reach: it would never link up)
  return spacedNodes(run, def.bridge?.range ?? 1, fits).map((t) => {
    const ghost = ghostAt(w, def, kind, t, run[0]?.rot ?? rot);
    return t.linked ? ghost : { ...ghost, ok: false };
  });
}

/** A blueprint in hand: every building as a ghost, red where it does not fit. */
export function pastePreview(w: World, bp: Blueprint, hover: Tile): PreviewGhost[] {
  const at = pasteCorner(bp, hover.x, hover.y);
  const out: PreviewGhost[] = [];
  for (const p of blueprintPlans(bp, at.x, at.y)) {
    const kind = w.content.buildings.indexOf(p.kind);
    const def = w.defs[kind];
    if (def) out.push({ kind, x: p.x, y: p.y, rot: p.rot, ok: placementProblem(w, def, p.x, p.y) === null });
  }
  return out;
}
