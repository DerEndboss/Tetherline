import { BLOCKS } from '../../sim/blocks';
import { frontLimit } from '../../sim/blocks/conveyor';
import { BELT_LEN, BELT_SLOTS } from '../../sim/constants';
import { DX, DY, sideOf } from '../../sim/grid';
import type { Building } from '../../sim/state';
import type { World } from '../../sim/world';

/** What is wrong at the front of a belt: nothing there, a building that never takes its items, or a jam. */
export type BeltFront = { kind: 'open' } | { kind: 'end' } | { kind: 'deaf'; name: string } | { kind: 'jam' };

/** How far a jam is followed down a line of full belts. */
const MAX_CHAIN = 128;

/** Whether a queued ghost covers a tile (the line is still being built). */
function plannedAt(w: World, x: number, y: number): boolean {
  return w.state.plans.some((p) => {
    const size = w.defs[p.kind]?.size ?? 1;
    return x >= p.x && y >= p.y && x < p.x + size && y < p.y + size;
  });
}

/** Whether `ahead` can never take an item from the belt `b`: a building with no input at all, or a belt facing it head-on. */
function deaf(w: World, b: Building, ahead: Building): boolean {
  const beh = w.def(ahead).behaviour;
  if (beh === 'conveyor') return sideOf(w.rect(ahead), w.rect(b)) === ahead.rot;
  return !BLOCKS[beh]?.accept;
}

/** The finished belt that `b` hands its items to, if what lies ahead is one. */
function beltAhead(w: World, b: Building): Building | undefined {
  const ahead = w.facing(b, b.rot);
  return ahead && ahead.slot >= 0 && w.def(ahead).behaviour === 'conveyor' && w.ready(ahead) ? ahead : undefined;
}

/**
 * Whether the items on `b` are stuck: its front item sits at the end of the tile (it was offered to what lies ahead
 * on the last tick and refused), or it lies packed up against a belt that is stuck itself. A moving belt never
 * rests at the end of its tile (the item is handed on in the same tick), so this does not flag a busy line.
 */
export function jammed(w: World, b: Building): boolean {
  const s = w.state.belts;
  let cur: Building | undefined = b;
  for (let i = 0; cur && i < MAX_CHAIN; i++) {
    const front: number = (s.count[cur.slot] ?? 0) > 0 ? s.pos[cur.slot * BELT_SLOTS]! : -1;
    if (front < 0) return false;
    if (front >= BELT_LEN) return true;
    const ahead: Building | undefined = beltAhead(w, cur);
    cur = ahead && front >= frontLimit(w, ahead) ? ahead : undefined;
  }
  return false;
}

/** What a finished belt faces: open (fine), nothing, a building that takes nothing, or a jam. */
export function beltFront(w: World, b: Building): BeltFront {
  const ahead = w.facing(b, b.rot);
  if (!ahead) return plannedAt(w, b.x + DX[b.rot]!, b.y + DY[b.rot]!) ? { kind: 'open' } : { kind: 'end' };
  if (deaf(w, b, ahead)) return { kind: 'deaf', name: w.def(ahead).name };
  return jammed(w, b) ? { kind: 'jam' } : { kind: 'open' };
}
