import { BELT_SLOTS } from './constants';
import type { BeltStore } from './state';

/** An empty belt store with room for `cap` conveyors (it grows on demand). */
export function createBeltStore(cap = 64): BeltStore {
  const free: number[] = [];
  for (let i = cap - 1; i >= 0; i--) free.push(i);
  return { cap, item: new Int16Array(cap * BELT_SLOTS).fill(-1), pos: new Int16Array(cap * BELT_SLOTS), count: new Uint8Array(cap), from: new Uint8Array(cap * BELT_SLOTS), free };
}

function grow(s: BeltStore): void {
  const cap = s.cap * 2;
  const item = new Int16Array(cap * BELT_SLOTS).fill(-1);
  item.set(s.item);
  const pos = new Int16Array(cap * BELT_SLOTS);
  pos.set(s.pos);
  const count = new Uint8Array(cap);
  count.set(s.count);
  const from = new Uint8Array(cap * BELT_SLOTS);
  from.set(s.from);
  for (let i = cap - 1; i >= s.cap; i--) s.free.push(i);
  Object.assign(s, { cap, item, pos, count, from });
}

/** Takes a free slot (all items cleared); grows the store when full. */
export function allocSlot(s: BeltStore): number {
  if (!s.free.length) grow(s);
  const slot = s.free.pop()!;
  s.count[slot] = 0;
  s.item.fill(-1, slot * BELT_SLOTS, slot * BELT_SLOTS + BELT_SLOTS);
  s.from.fill(0, slot * BELT_SLOTS, slot * BELT_SLOTS + BELT_SLOTS);
  return slot;
}

export function freeSlot(s: BeltStore, slot: number): void {
  if (slot < 0) return;
  s.count[slot] = 0;
  s.free.push(slot);
}

/** Items on one conveyor as [item, pos] pairs, front first (for the renderer and tests). */
export function beltItems(s: BeltStore, slot: number): [number, number][] {
  const out: [number, number][] = [];
  const n = s.count[slot] ?? 0;
  for (let i = 0; i < n; i++) out.push([s.item[slot * BELT_SLOTS + i]!, s.pos[slot * BELT_SLOTS + i]!]);
  return out;
}

/** Rebuilds the free list from the slots in use (after loading a save); older saves get an empty `from`. */
export function refreeSlots(s: BeltStore, used: ReadonlySet<number>): void {
  if (!(s.from instanceof Uint8Array) || s.from.length !== s.cap * BELT_SLOTS) s.from = new Uint8Array(s.cap * BELT_SLOTS);
  s.free = [];
  for (let i = s.cap - 1; i >= 0; i--) if (!used.has(i)) s.free.push(i);
}
