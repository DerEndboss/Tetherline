import { BELT_LEN, BELT_SLOTS, TICK_HZ } from '../constants';
import { DX, DY, opposite, sideOf, turnLeft, turnRight } from '../grid';
import { offer } from '../items';
import type { Building, Dir } from '../state';
import type { World } from '../world';
import type { BlockBehaviour } from './types';

/** Distance between two items on a belt, in belt units. */
export function beltGap(w: World): number {
  return Math.floor(BELT_LEN / w.content.rules.beltSlots);
}

/** Where a side item enters a straight belt: the middle of the tile (Mindustry). */
export const SIDE_ENTRY = BELT_LEN / 2;
/** A side item needs the back of the belt clear up to here (Mindustry: no item behind 0.7 of the tile). */
const SIDE_CLEAR = Math.round(BELT_LEN * 0.7);

/** Item origins in `BeltStore.from`. */
export const FROM_BACK = 0;
export const FROM_LEFT = 1;
export const FROM_RIGHT = 2;

/** Whether `n` is a conveyor whose front is the tile of `b`. */
function beltInto(w: World, n: Building | undefined, b: Building): boolean {
  if (!n || w.def(n).behaviour !== 'conveyor') return false;
  return n.x + DX[n.rot]! === b.x && n.y + DY[n.rot]! === b.y;
}

/** Whether something feeds `b` from behind: a belt pointing in, or any other building (as the renderer draws it). */
function fedFromBehind(w: World, b: Building): boolean {
  const n = w.facing(b, opposite(b.rot));
  return !!n && (w.def(n).behaviour !== 'conveyor' || beltInto(w, n, b));
}

/**
 * How an item from `source` comes onto belt `b`: from behind (also around a bend: a single side feed with
 * nothing behind or on the other side) it starts at the back edge; from a side onto a straight belt it enters
 * mid-tile from that side.
 */
function entryOf(w: World, b: Building, source: Building): number {
  const side = sideOf(w.rect(b), w.rect(source));
  if (side === opposite(b.rot)) return FROM_BACK;
  const left = side === turnLeft(b.rot);
  const other = w.facing(b, left ? turnRight(b.rot) : turnLeft(b.rot));
  if (!fedFromBehind(w, b) && !beltInto(w, other, b)) return FROM_BACK;
  return left ? FROM_LEFT : FROM_RIGHT;
}

/**
 * Where a new item lands on belt `b`: the back edge, or for a side item the middle of the tile, but never closer
 * than a gap to the rearmost item (a side item may enter while that one is only 0.7 along, which is 0.2 tile
 * short of a gap, so it lands a little before the middle instead of on top of it).
 */
function entryPos(w: World, b: Building, entry: number): number {
  if (entry === FROM_BACK) return 0;
  const n = w.state.belts.count[b.slot] ?? 0;
  if (n === 0) return SIDE_ENTRY;
  return Math.min(SIDE_ENTRY, w.state.belts.pos[b.slot * BELT_SLOTS + n - 1]! - beltGap(w));
}

function hasRoom(w: World, b: Building, entry: number): boolean {
  const s = w.state.belts;
  const n = s.count[b.slot] ?? 0;
  if (n >= Math.min(BELT_SLOTS, w.content.rules.beltSlots)) return false;
  if (n === 0) return true;
  const rear = s.pos[b.slot * BELT_SLOTS + n - 1]!;
  return rear >= (entry === FROM_BACK ? beltGap(w) : Math.max(SIDE_CLEAR, beltGap(w)));
}

/**
 * How far the front item may ride: to the end of the tile, or less while the belt ahead still has an item
 * within one gap of its start. So a jam closes up evenly across tiles and items never overlap at a seam.
 */
export function frontLimit(w: World, ahead: Building | undefined): number {
  if (!ahead || ahead.slot < 0 || !w.ready(ahead)) return BELT_LEN;
  const s = w.state.belts;
  const n = s.count[ahead.slot] ?? 0;
  if (n === 0) return BELT_LEN;
  return Math.min(BELT_LEN, BELT_LEN + s.pos[ahead.slot * BELT_SLOTS + n - 1]! - beltGap(w));
}

/** Moves every item forward (keeping the gap) and hands the front one to the building ahead. */
function move(w: World, b: Building): void {
  const s = w.state.belts;
  const base = b.slot * BELT_SLOTS;
  const n = s.count[b.slot] ?? 0;
  if (n === 0) return;
  const step = Math.round(((w.def(b).conveyor?.speed ?? 1) * w.state.bonus.belt * BELT_LEN) / TICK_HZ);
  const gap = beltGap(w);
  const ahead = w.facing(b, b.rot);
  let limit = frontLimit(w, ahead);
  for (let i = 0; i < n; i++) {
    const p = s.pos[base + i]!;
    const next = Math.max(p, Math.min(p + step, limit));
    s.pos[base + i] = next;
    limit = next - gap;
  }
  if (s.pos[base]! < BELT_LEN) return;
  if (!ahead || !offer(w, b, ahead, s.item[base]!)) return;
  s.item.copyWithin(base, base + 1, base + n);
  s.pos.copyWithin(base, base + 1, base + n);
  s.from.copyWithin(base, base + 1, base + n);
  s.item[base + n - 1] = -1;
  s.from[base + n - 1] = FROM_BACK;
  s.count[b.slot] = n - 1;
}

/**
 * Conveyor: items ride in visible slots (rules.beltSlots per tile) and pass to whatever stands in front.
 * It takes items from behind and from the sides, never from the tile it faces. Like Mindustry, an item from a
 * side lands in the middle of a straight belt (it needs the back 70 % clear), one from behind at the back edge.
 */
export const conveyor: BlockBehaviour = {
  accept: (w, b, _item, source) => b.slot >= 0 && sideOf(w.rect(b), w.rect(source)) !== b.rot && hasRoom(w, b, entryOf(w, b, source)),
  handle: (w, b, item, source) => {
    const s = w.state.belts;
    const n = s.count[b.slot]!;
    const entry = entryOf(w, b, source);
    const i = b.slot * BELT_SLOTS + n;
    s.item[i] = item;
    s.pos[i] = entryPos(w, b, entry);
    s.from[i] = entry;
    s.count[b.slot] = n + 1;
  },
  update: (w, b) => {
    if (b.slot >= 0) move(w, b);
  },
};

/**
 * Where along the belt an item is drawn: a side item that landed before the middle (it was only a little past
 * 0.7 away from the item ahead, so it lands up to 0.17 tile short of the middle) shows at the middle until the
 * sim position catches up, one tick at most. Else it would jump back along the belt edge from the end of the side
 * belt, whose lane meets this belt at the middle, and slide forward again.
 */
export function shownPos(from: number, pos: number): number {
  return from === FROM_BACK ? pos : Math.max(pos, SIDE_ENTRY);
}

/** Sideways offset of an item (tiles, towards the side it came from) at `pos` along a straight belt. */
export function sideOffset(from: number, pos: number): number {
  if (from === FROM_BACK) return 0;
  return 0.5 * Math.max(0, Math.min(1, (BELT_LEN - pos) / (BELT_LEN - SIDE_ENTRY)));
}

/** The heading an item's side offset points to on a belt heading `rot`. */
export const sideDir = (from: number, rot: Dir): Dir => (from === FROM_LEFT ? turnLeft(rot) : turnRight(rot));
