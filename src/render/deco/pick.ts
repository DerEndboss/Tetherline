import { gridToWorld, type Rect } from '../iso';
import type { PropKind } from './ids';

/**
 * Picking decoration (render-world's hook for the tools and the hover card): which prop or junction box stands on a
 * tile, which one is under a screen point, and a tap hook for later easter eggs. The deco layer registers itself
 * here; nothing in it touches game state.
 *
 * Picking is by what the player SEES: every piece has a box (the sprite's body, without its shadow, moved to the
 * tile's grid point), so a tall rack or mast is hit on its upper body too, not only on the ground tile under it
 * (which in the iso and steep views lies behind the body). The tile of the hit piece is then what hover, click
 * and removal work with. To remove one: `game.enqueue({ type: 'remove-deco', x, y })` (Backspace or right click).
 */
export type DecoKind = PropKind | 'junction';

export interface DecoHit {
  x: number;
  y: number;
  kind: DecoKind;
  variant: number;
  /** Display name for the hover card ("Server rack"). */
  name: string;
}

export const DECO_NAMES: Record<string, string> = {
  rack: 'Server rack',
  terminal: 'Terminal',
  antenna: 'Antenna',
  dish: 'Dish',
  transformer: 'Transformer',
  lamp: 'Lamp',
  ram: 'Memory bank',
  motherboard: 'Motherboard',
  chip: 'Processor',
  board: 'Circuit board',
  junction: 'Junction box',
};

export const decoName = (kind: string): string => DECO_NAMES[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** A sprite's body as the art manifest stores it: world px relative to the sprite's anchor. */
export interface BodyBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The body box of a piece with no art entry: about a tile's worth around and above its anchor. */
export const FALLBACK_BODY: BodyBox = { x: -22, y: -40, w: 44, h: 48 };

/** The picking box of a piece standing on tile (x, y), in world px of the current view (call after `setViewMode`). */
export function pickBox(x: number, y: number, body: BodyBox): Rect {
  const c = gridToWorld(x + 0.5, y + 0.5);
  return { left: c.x + body.x, top: c.y + body.y, right: c.x + body.x + body.w, bottom: c.y + body.y + body.h };
}

/** What the picker needs of a placed piece. */
export interface PickItem {
  x: number;
  y: number;
  kind: DecoKind;
  variant: number;
  /** From `pickBox`. */
  box: Rect;
}

/** Sort key of a tile: larger is nearer the viewer (the same as the sprite layer's depth). */
export type DepthOf = (x: number, y: number) => number;

/**
 * The piece whose box holds the world point (wx, wy), grown by `pad` world px; of several the one in front (largest
 * depth, then the nearest box centre). `skip` drops pieces that are not there to hit (shrinking out, hidden);
 * `covered(depth)` says whether something solid stands in front of a piece at that depth, so a building (or belt)
 * nearer the viewer keeps the click.
 */
export function pickDeco<T extends PickItem>(
  items: Iterable<T>,
  wx: number,
  wy: number,
  depthOf: DepthOf,
  pad = 0,
  skip?: (item: T) => boolean,
  covered?: (depth: number) => boolean,
): T | null {
  let best: T | null = null;
  let bestDepth = -Infinity;
  let bestDist = Infinity;
  const hit = (it: T): boolean => holds(it.box, wx, wy, pad) && !skip?.(it);
  for (const it of items) {
    if (!hit(it)) continue;
    const depth = depthOf(it.x, it.y);
    if (covered?.(depth)) continue;
    const dist = Math.hypot(wx - (it.box.left + it.box.right) / 2, wy - (it.box.top + it.box.bottom) / 2);
    if (depth < bestDepth || (depth === bestDepth && dist >= bestDist)) continue;
    best = it;
    bestDepth = depth;
    bestDist = dist;
  }
  return best;
}

/** Whether a world point lies in a box grown by `pad`. */
function holds(b: Rect, wx: number, wy: number, pad: number): boolean {
  return wx >= b.left - pad && wx <= b.right + pad && wy >= b.top - pad && wy <= b.bottom + pad;
}

/** What the deco layer answers (it registers one). */
export interface DecoPicking {
  /** The piece standing on a tile. */
  at(x: number, y: number): DecoHit | null;
  /** The piece under a world point; `covered(depth)`: something nearer the viewer than `depth` owns the point. */
  atPoint(wx: number, wy: number, covered?: (depth: number) => boolean): DecoHit | null;
}

type TapHandler = (hit: DecoHit) => void;

const none: DecoPicking = { at: () => null, atPoint: () => null };
let picking: DecoPicking = none;
const handlers = new Set<TapHandler>();

/** The deco layer calls this once; the last registered layer answers. */
export function registerDecoPicking(p: DecoPicking): void {
  picking = p;
}

/** The decoration on a tile, or null. */
export function decoAt(x: number, y: number): DecoHit | null {
  return picking.at(x, y);
}

/** The decoration under a world point (px), or null. See `DecoPicking.atPoint`. */
export function decoAtPoint(wx: number, wy: number, covered?: (depth: number) => boolean): DecoHit | null {
  return picking.atPoint(wx, wy, covered);
}

/** Easter-egg hook: runs when `tapDeco` hits a piece. Returns an unsubscribe function. */
export function onDecoTap(handler: TapHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Call for a plain click on a tile: tells the handlers and returns the hit (null when there is no deco). */
export function tapDeco(x: number, y: number): DecoHit | null {
  const hit = picking.at(x, y);
  if (hit) for (const h of handlers) h(hit);
  return hit;
}
