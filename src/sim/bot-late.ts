import type { Ctx } from './bot-build';
import { ensurePower } from './bot-hub';
import type { Tile } from './bot-space';
import type { PlanSpec } from './commands';
import { DX, DY } from './grid';
import type { Dir } from './state';

/**
 * Late-game annexes: buildings that must stand in a fixed shape beside a crafter. Liquids only flow along a
 * conduit's axis, and crafters are not members of a liquid network, so a machine that makes a liquid reaches its
 * consumer through one straight conduit between them:
 *   refinery | conduit | atmospheric condenser                          (gas for plastic)
 *   accelerator | conduit | coolant mixer | tank | ground pumps          (coolant for singularities)
 * The tank keeps the mixer's water network from running dry: a network that is empty for a tick would take the
 * mixer's coolant and never hold water again.
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

/** Lays the conduit and the pieces on one side, or null when they do not fit (nothing is claimed then). */
function chainOn(local: Ctx, spot: Tile, size: number, d: Dir, pieces: readonly Piece[]): PlanSpec[] | null {
  const c = sideMiddle(spot, size, d);
  const space = local.space.clone();
  if (!space.free(c.x, c.y)) return null;
  space.claim(c.x, c.y, 1, 'conduit');
  const plans: PlanSpec[] = [];
  for (const piece of pieces) {
    const at = placeOf(c, d, piece);
    if (!space.freeRect(at.x, at.y, piece.size)) return null;
    space.claim(at.x, at.y, piece.size, 'crafter');
    plans.push({ kind: piece.kind, x: at.x, y: at.y, rot: 0, config: piece.config ?? -1 });
  }
  const ctx: Ctx = { ...local, space };
  const power: PlanSpec[] = [];
  for (const [i, piece] of pieces.entries()) {
    if (!piece.power) continue;
    const p = plans[i]!;
    const nodes = ensurePower(ctx, { x: p.x, y: p.y, size: piece.size }, 6, power.map((n) => ({ x: n.x, y: n.y, size: 1 })));
    if (!nodes) return null;
    power.push(...nodes);
  }
  // commit: the conduit last, so it is built after both ends stand
  for (const p of [...plans, ...power]) local.space.claim(p.x, p.y, local.world.content.buildings.get(p.kind).size, local.world.content.buildings.get(p.kind).behaviour);
  local.space.claim(c.x, c.y, 1, 'conduit');
  return [...plans, ...power, { kind: 'conduit', x: c.x, y: c.y, rot: d }];
}

function annexOf(pieces: readonly Piece[]): (local: Ctx, spot: Tile, size: number) => PlanSpec[] | null {
  return (local, spot, size) => {
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const out = chainOn(local, spot, size, d, pieces);
      if (out) return out;
    }
    return null;
  };
}

/** A gas condenser beside a refinery (cook-gas: graphite and gas into plastic). */
export const condenserAnnex = annexOf([{ kind: 'atmospheric-condenser', a: 1, p: 0, size: 2, power: true }]);

/** Coolant for the accelerator: pumps fill a tank, the mixer (titanium or frostine) feeds the conduit. */
export function coolantAnnex(mixRecipe: number): (local: Ctx, spot: Tile, size: number) => PlanSpec[] | null {
  return annexOf([
    { kind: 'ground-pump', a: 6, p: -1, size: 2, power: true },
    { kind: 'ground-pump', a: 6, p: 1, size: 2, power: true },
    { kind: 'tank', a: 3, p: -1, size: 3 },
    { kind: 'coolant-mixer', a: 1, p: 0, size: 2, config: mixRecipe, power: true },
  ]);
}
