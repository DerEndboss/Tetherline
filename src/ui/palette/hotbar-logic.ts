/** Pure rules of the hotbar: slot count by width, key mapping, assignment. */

export const MIN_SLOTS = 5;
export const MAX_SLOTS = 10;
export const DEFAULT_SLOTS = 8;

/** Widest layout where the hotbar sits centred at the bottom; below it, it stacks above the palette. */
export const WIDE_BAR = 1500;

/** Most slots the screen width has room for: phone 5, tablet and small windows 8, wide PC 10. */
export function slotCap(width: number): number {
  if (width < 560) return MIN_SLOTS;
  return width < WIDE_BAR ? 8 : MAX_SLOTS;
}

/** Slots shown: the player's maximum, but never more than the screen fits. */
export function visibleSlots(setting: number, width: number): number {
  return Math.min(clampSlots(setting), slotCap(width));
}

export function clampSlots(n: number): number {
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Math.round(Number.isFinite(n) ? n : DEFAULT_SLOTS)));
}

/** `Digit1`..`Digit9` are slots 0..8, `Digit0` is slot 9 (like Minecraft); null for any other key. */
export function slotOfKey(code: string): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (!m) return null;
  const d = Number(m[1]);
  return d === 0 ? 9 : d - 1;
}

/** The label on a slot's key cap: 1..9, then 0. */
export function slotLabel(i: number): string {
  return i === 9 ? '0' : String(i + 1);
}

/** Puts `id` into slot `i` (it leaves any other slot, so a building has one slot); null empties the slot. */
export function assignSlot(slots: readonly (string | null)[], i: number, id: string | null): (string | null)[] {
  const next = [...slots];
  while (next.length < MAX_SLOTS) next.push(null);
  if (id !== null) for (let k = 0; k < next.length; k++) if (next[k] === id) next[k] = null;
  next[i] = id;
  return next;
}

/** Swaps two slots (dragging one slot onto another). */
export function swapSlots(slots: readonly (string | null)[], a: number, b: number): (string | null)[] {
  const next = [...slots];
  while (next.length < MAX_SLOTS) next.push(null);
  [next[a], next[b]] = [next[b] ?? null, next[a] ?? null];
  return next;
}

/** Where a picked building goes (Q): its own slot if it has one, else the first empty visible slot, else the active one. */
export function slotForPick(slots: readonly (string | null)[], id: string, visible: number, active: number): number {
  const own = slots.indexOf(id);
  if (own >= 0 && own < visible) return own;
  for (let i = 0; i < visible; i++) if (!slots[i]) return i;
  return Math.min(Math.max(active, 0), visible - 1);
}
