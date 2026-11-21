/** Pure rules of the hotbar: slot count by width, key mapping, assignment. */

export const MIN_SLOTS = 5;
export const MAX_SLOTS = 10;
export const DEFAULT_SLOTS = 8;

/** Widest layout where the hotbar sits centred at the bottom; below it, it stacks above the palette. */
export const WIDE_BAR = 1500;

/** A phone on its side is this short (CSS px) or less: the palette takes the right of the screen, the bar gets less room. */
export const SHORT_SCREEN = 520;

/** The setting of a plain building (no recipe, no sorter item): what the sim calls `config -1`. */
export const NO_SETTING = -1;

/**
 * What the slots hold. A slot keeps the building AND the setting it was picked up with (a Smelter on its Steel recipe,
 * a Sorter on Copper): `configs[i]` is the sim's `config` for the building in `ids[i]`, -1 = none.
 */
export interface Slots {
  ids: readonly (string | null)[];
  configs: readonly number[];
}

/** Most slots the screen has room for: phone 5, tablet and small windows 8, wide PC 10, a phone on its side 6. */
export function slotCap(width: number, height = Infinity): number {
  if (width < 560) return MIN_SLOTS;
  if (height <= SHORT_SCREEN && width < 960) return 6;
  return width < WIDE_BAR ? 8 : MAX_SLOTS;
}

/** Slots shown: the player's maximum, but never more than the screen fits. */
export function visibleSlots(setting: number, width: number, height = Infinity): number {
  return Math.min(clampSlots(setting), slotCap(width, height));
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

/** A list of exactly MAX_SLOTS settings: what is missing or not a whole number >= 0 means "none". */
export function padConfigs(list: readonly unknown[]): number[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => {
    const c = list[i];
    return typeof c === 'number' && Number.isInteger(c) && c >= 0 ? c : NO_SETTING;
  });
}

function padded(slots: Slots): { ids: (string | null)[]; configs: number[] } {
  const ids = [...slots.ids];
  while (ids.length < MAX_SLOTS) ids.push(null);
  return { ids, configs: padConfigs(slots.configs) };
}

/** The slot that holds this building with this setting, or -1. */
export function slotOf(slots: Slots, id: string, config = NO_SETTING): number {
  return slots.ids.findIndex((s, i) => s === id && (slots.configs[i] ?? NO_SETTING) === config);
}

/**
 * Puts `id` with its setting into slot `i`. A building with a setting has one slot (it leaves any other slot that holds
 * the same pair), but a Smelter on Steel and a Smelter on Lead are two things and may sit side by side.
 * Null empties the slot.
 */
export function assignSlot(slots: Slots, i: number, id: string | null, config = NO_SETTING): Slots {
  const next = padded(slots);
  if (id !== null) {
    for (let k = 0; k < next.ids.length; k++) {
      if (next.ids[k] === id && next.configs[k] === config) {
        next.ids[k] = null;
        next.configs[k] = NO_SETTING;
      }
    }
  }
  next.ids[i] = id;
  next.configs[i] = id === null ? NO_SETTING : config;
  return next;
}

/** Swaps two slots (dragging one slot onto another), settings with them. */
export function swapSlots(slots: Slots, a: number, b: number): Slots {
  const next = padded(slots);
  [next.ids[a], next.ids[b]] = [next.ids[b] ?? null, next.ids[a] ?? null];
  [next.configs[a], next.configs[b]] = [next.configs[b] ?? NO_SETTING, next.configs[a] ?? NO_SETTING];
  return next;
}

/** Where a picked building goes (Q): its own slot if it has one, else the first empty visible slot, else the active one. */
export function slotForPick(slots: Slots, id: string, config: number, visible: number, active: number): number {
  const own = slotOf(slots, id, config);
  if (own >= 0 && own < visible) return own;
  for (let i = 0; i < visible; i++) if (!slots.ids[i]) return i;
  return Math.min(Math.max(active, 0), visible - 1);
}
