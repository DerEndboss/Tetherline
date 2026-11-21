import type { BuildingDef } from '../content/types';
import { pumpInfo } from './blocks/fluid';
import type { Ctx, Memory } from './bot-build';
import { ensurePower } from './bot-hub';
import type { Tile } from './bot-space';
import type { Command, PlanSpec } from './commands';
import { DX, DY, edgeTiles } from './grid';
import { netOfMember } from './liquids';
import type { Building, Dir } from './state';
import type { World } from './world';

/**
 * Late-game annexes: buildings that must stand in a fixed shape beside a crafter. Liquids only flow along a
 * conduit's axis, and crafters are not members of a liquid network, so a machine that makes a liquid reaches its
 * consumer through one straight conduit between them:
 *   refinery | conduit | atmospheric condenser                          (gas for plastic)
 *   accelerator | conduit | coolant mixer | tank | ground pumps          (coolant for singularities)
 * The tank keeps the mixer's water network from running dry: a network that is empty for a tick would take the
 * mixer's coolant and never hold water again. For the same reason nothing that can put a liquid into a network
 * may touch the annex's pipes, pumps or tank, now or later: a smelter beside a pump filled the water with slag
 * (S8 ice: the crown once waited an hour for coolant). The tiles around them are kept clear (`mem.keep`),
 * and a network that holds the wrong liquid anyway is taken down and built again (`coolantRefit`).
 */

interface Piece {
  kind: string;
  /** Along the side's outward way, from the conduit (0) on. */
  a: number;
  /** Across it, the first column. */
  p: number;
  size: number;
  config?: number;
  power?: boolean;
}

/** The tile outside the middle of side `d` of a footprint. */
export function sideMiddle(spot: Tile, size: number, d: Dir): Tile {
  const mid = Math.floor((size - 1) / 2);
  if (d === 0) return { x: spot.x + size, y: spot.y + mid };
  if (d === 1) return { x: spot.x + mid, y: spot.y + size };
  if (d === 2) return { x: spot.x - 1, y: spot.y + mid };
  return { x: spot.x + mid, y: spot.y - 1 };
}

/** Top-left of a square piece placed `a` along and `p` across from the conduit tile `c` (side way `d`). */
function placeOf(c: Tile, d: Dir, piece: Piece): Tile {
  const ux = DX[d]!;
  const uy = DY[d]!;
  const px = DX[(d + 1) & 3]!;
  const py = DY[(d + 1) & 3]!;
  const n = piece.size - 1;
  const xs = [0, n].flatMap((i) => [0, n].map((j) => c.x + ux * (piece.a + i) + px * (piece.p + j)));
  const ys = [0, n].flatMap((i) => [0, n].map((j) => c.y + uy * (piece.a + i) + py * (piece.p + j)));
  return { x: Math.min(...xs), y: Math.min(...ys) };
}

const LIQUID_PARTS = new Set(['conduit', 'liquid-junction', 'liquid-router', 'tank', 'liquid-bridge', 'pump']);

/** Whether a building could put a liquid into a network it touches (a member joins it, a crafter vents into it). */
function pushesLiquid(world: World, def: BuildingDef): boolean {
  if (LIQUID_PARTS.has(def.behaviour)) return true;
  return (def.recipes ?? []).some((id) => (world.content.recipes.get(id).liquidOut?.length ?? 0) > 0);
}

/** What stands (or is planned) on a tile. */
function defAt(world: World, x: number, y: number): BuildingDef | undefined {
  const b = world.at(x, y);
  if (b) return world.def(b);
  const p = world.state.plans.find((q) => x >= q.x && y >= q.y && x < q.x + world.defs[q.kind]!.size && y < q.y + world.defs[q.kind]!.size);
  return p ? world.defs[p.kind] : undefined;
}

interface Rect {
  x: number;
  y: number;
  size: number;
}

const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && y >= r.y && x < r.x + r.size && y < r.y + r.size;

/**
 * The tiles around the annex's liquid parts, or null when something there could spoil its water. `own` are the
 * annex's pieces and the host machine: they may touch.
 */
function margin(local: Ctx, own: Rect[], parts: Rect[]): number[] | null {
  const out: number[] = [];
  for (const r of parts) {
    for (const [x, y] of edgeTiles(r)) {
      if (own.some((o) => inside(o, x, y)) || !local.space.in(x, y)) continue;
      const def = defAt(local.world, x, y);
      if (def && pushesLiquid(local.world, def)) return null;
      out.push(y * local.space.W + x);
    }
  }
  return out;
}

/** One way to lay an annex: its pieces and how many conduit tiles lead to them (the pieces start after them). */
interface Layout {
  pieces: readonly Piece[];
  gap: number;
}

/** The conduit tiles from the host's side outwards. */
function conduitTiles(c: Tile, d: Dir, gap: number): Tile[] {
  return Array.from({ length: gap }, (_, k) => ({ x: c.x + DX[d]! * k, y: c.y + DY[d]! * k }));
}

/** Power nodes for the pieces that need power, or null when one cannot be reached. */
function powerFor(ctx: Ctx, pieces: readonly Piece[], plans: PlanSpec[]): PlanSpec[] | null {
  const power: PlanSpec[] = [];
  for (const [i, piece] of pieces.entries()) {
    if (!piece.power) continue;
    const p = plans[i]!;
    const nodes = ensurePower(ctx, { x: p.x, y: p.y, size: piece.size }, 6, power.map((n) => ({ x: n.x, y: n.y, size: 1 })));
    if (!nodes) return null;
    power.push(...nodes);
  }
  return power;
}

/** Lays the conduit and the pieces on one side, or null when they do not fit (nothing is claimed then). */
function chainOn(local: Ctx, spot: Tile, size: number, d: Dir, layout: Layout): PlanSpec[] | null {
  const pipe = conduitTiles(sideMiddle(spot, size, d), d, layout.gap);
  const c = pipe[pipe.length - 1]!;
  const space = local.space.clone();
  if (!pipe.every((t) => space.free(t.x, t.y))) return null;
  for (const t of pipe) space.claim(t.x, t.y, 1, 'conduit');
  const plans: PlanSpec[] = [];
  for (const piece of layout.pieces) {
    const at = placeOf(c, d, piece);
    if (!space.freeRect(at.x, at.y, piece.size)) return null;
    space.claim(at.x, at.y, piece.size, 'crafter');
    plans.push({ kind: piece.kind, x: at.x, y: at.y, rot: 0, config: piece.config ?? -1 });
  }
  const power = powerFor({ ...local, space }, layout.pieces, plans);
  if (!power) return null;
  const sizeOf = (p: PlanSpec): number => local.world.content.buildings.get(p.kind).size;
  const pipes: Rect[] = pipe.map((t) => ({ ...t, size: 1 }));
  const own: Rect[] = [{ ...spot, size }, ...pipes, ...plans.map((p) => ({ x: p.x, y: p.y, size: sizeOf(p) }))];
  const wet = plans.filter((p) => LIQUID_PARTS.has(local.world.content.buildings.get(p.kind).behaviour)).map((p) => ({ x: p.x, y: p.y, size: sizeOf(p) }));
  if (!margin(local, own, [...pipes, ...wet])) return null;
  // commit: the conduit last, so it is built after both ends stand
  for (const p of [...plans, ...power]) local.space.claim(p.x, p.y, sizeOf(p), local.world.content.buildings.get(p.kind).behaviour);
  for (const t of pipe) local.space.claim(t.x, t.y, 1, 'conduit');
  return [...plans, ...power, ...pipe.map((t) => ({ kind: 'conduit', x: t.x, y: t.y, rot: d }))];
}

function annexOf(layouts: readonly Layout[]): (local: Ctx, spot: Tile, size: number) => PlanSpec[] | null {
  return (local, spot, size) => {
    for (const layout of layouts) {
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const out = chainOn(local, spot, size, d, layout);
        if (out) return out;
      }
    }
    return null;
  };
}

/** A gas condenser beside a refinery (cook-gas: graphite and gas into plastic). */
export const condenserAnnex = annexOf([{ pieces: [{ kind: 'atmospheric-condenser', a: 1, p: 0, size: 2, power: true }], gap: 1 }]);

/**
 * Coolant for the accelerator: pumps fill a tank, the mixer (titanium or frostine) feeds the conduit. Three shapes,
 * the long one first, then pumps beside the tank (shorter, wider), then either after a longer pipe that reaches
 * past whatever stands beside the accelerator (on a crowded small map no side had room: S2 ice never built one).
 */
export function coolantAnnex(mixRecipe: number): (local: Ctx, spot: Tile, size: number) => PlanSpec[] | null {
  const mixer: Piece = { kind: 'coolant-mixer', a: 1, p: 0, size: 2, config: mixRecipe, power: true };
  const tank: Piece = { kind: 'tank', a: 3, p: -1, size: 3 };
  const pump = (a: number, p: number): Piece => ({ kind: 'ground-pump', a, p, size: 2, power: true });
  const long = [pump(6, -1), pump(6, 1), tank, mixer];
  const wide = [pump(3, -3), pump(3, 2), tank, mixer];
  return annexOf([
    { pieces: long, gap: 1 },
    { pieces: wide, gap: 1 },
    { pieces: long, gap: 4 },
    { pieces: wide, gap: 4 },
  ]);
}

/**
 * Keeps the tiles around a batch's liquid parts clear for good (called once the batch goes out): nothing built
 * later may touch them.
 */
export function keepClear(ctx: Ctx, plans: readonly PlanSpec[]): void {
  const sizeOf = (p: PlanSpec): number => ctx.world.content.buildings.get(p.kind).size;
  const own = plans.map((p) => ({ x: p.x, y: p.y, size: sizeOf(p) }));
  const wet = plans.filter((p) => LIQUID_PARTS.has(ctx.world.content.buildings.get(p.kind).behaviour)).map((p) => ({ x: p.x, y: p.y, size: sizeOf(p) }));
  for (const t of margin(ctx, own, wet) ?? []) {
    ctx.mem.keep.add(t);
    ctx.mem.reserved.add(t);
  }
}

/**
 * A pump's network that holds another liquid than the pump gives (slag from a smelter beside it, or the mixer's
 * coolant pushed into a tank that ran dry) never takes water again: its members are taken down and placed again,
 * empty. One network at a time; the ghosts go out once the old parts are gone.
 */
export function coolantRefit(w: World, mem: Memory): Command[] {
  if (mem.refit.length) return refitBack(w, mem);
  const spoilt = w.state.buildings.find((b) => spoiltPump(w, b));
  const net = spoilt ? netOfMember(w, spoilt) : undefined;
  if (!net) return [];
  const members = net.members.filter((b: Building) => w.ready(b) && !b.removing);
  mem.refit = members.map((b: Building) => ({ kind: w.def(b).id, x: b.x, y: b.y, rot: b.rot, config: b.config }));
  return members.map((b: Building) => ({ type: 'remove', x0: b.x, y0: b.y, x1: b.x + w.def(b).size - 1, y1: b.y + w.def(b).size - 1 }));
}

/** A finished pump whose network holds something else than it pumps (a pump alone holds nothing, its tank does). */
function spoiltPump(w: World, b: Building): boolean {
  if (w.def(b).behaviour !== 'pump' || !w.ready(b) || b.liquidId < 0) return false;
  const net = netOfMember(w, b);
  const [liquid] = pumpInfo(w, b);
  return net !== undefined && net.amount >= 1 && liquid >= 0 && liquid !== net.liquid;
}

function refitBack(w: World, mem: Memory): Command[] {
  if (mem.refit.some((p) => w.at(p.x, p.y) !== undefined)) return [];
  const plans = mem.refit;
  mem.refit = [];
  return [{ type: 'place-many', plans }];
}
