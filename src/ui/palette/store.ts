import { useSyncExternalStore } from 'react';
import { DEFAULT_SLOTS, MAX_SLOTS, NO_SETTING, assignSlot, clampSlots, padConfigs, swapSlots } from './hotbar-logic';

/** Per-device palette choices (hotbar on/off, slots, what is in them, the core window folded). Own small store. */
export interface PaletteState {
  hotbar: boolean;
  /** Most hotbar slots (5..10); the screen width may show fewer. */
  slots: number;
  /** Building id per slot, up to 10. */
  assigned: (string | null)[];
  /** The setting each slot's building carries (the sim's `config`: a recipe, a sorter's item), -1 = none. Same length. */
  configs: number[];
  /** Core window shows every resource instead of the first rows. */
  coreOpen: boolean;
}

export const DEFAULT_PALETTE: PaletteState = {
  hotbar: true,
  slots: DEFAULT_SLOTS,
  assigned: ['conveyor', 'mechanical-drill', 'junction', 'router', 'smelter', 'power-node', 'wire-mill', 'container', null, null],
  configs: Array.from({ length: MAX_SLOTS }, () => NO_SETTING),
  coreOpen: false,
};

const KEY = 'groundbreak.palette';

function padSlots(list: unknown[]): (string | null)[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => (typeof list[i] === 'string' ? (list[i] as string) : null));
}

/** Reads stored state; anything broken falls back to the defaults. Exported for tests. */
export function parsePalette(raw: string | null): PaletteState {
  const base: PaletteState = { ...DEFAULT_PALETTE, assigned: [...DEFAULT_PALETTE.assigned], configs: [...DEFAULT_PALETTE.configs] };
  if (!raw) return base;
  try {
    const d = JSON.parse(raw) as Partial<Record<keyof PaletteState, unknown>>;
    if (typeof d.hotbar === 'boolean') base.hotbar = d.hotbar;
    if (typeof d.coreOpen === 'boolean') base.coreOpen = d.coreOpen;
    if (typeof d.slots === 'number') base.slots = clampSlots(d.slots);
    if (Array.isArray(d.assigned)) {
      base.assigned = padSlots(d.assigned);
      // settings belong to the slots read above; an old save without them means plain buildings
      base.configs = padConfigs(Array.isArray(d.configs) ? d.configs : []).map((c, i) => (base.assigned[i] ? c : NO_SETTING));
    }
  } catch {
    // broken entry: defaults
  }
  return base;
}

function read(): PaletteState {
  try {
    return parsePalette(window.localStorage.getItem(KEY));
  } catch {
    return parsePalette(null);
  }
}

function write(s: PaletteState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the choice holds for this session
  }
}

class PaletteStore {
  private value: PaletteState | null = null;
  private readonly listeners = new Set<() => void>();

  get = (): PaletteState => (this.value ??= read());

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(next: PaletteState): void {
    this.value = next;
    write(next);
    for (const l of this.listeners) l();
  }

  setHotbar(on: boolean): void {
    this.set({ ...this.get(), hotbar: on });
  }

  setSlots(n: number): void {
    this.set({ ...this.get(), slots: clampSlots(n) });
  }

  setCoreOpen(open: boolean): void {
    this.set({ ...this.get(), coreOpen: open });
  }

  /** Puts a building (with the setting it was picked up with, if any) into a slot; null empties it. */
  assign(i: number, id: string | null, config = NO_SETTING): void {
    const s = this.get();
    const next = assignSlot({ ids: s.assigned, configs: s.configs }, i, id, config);
    this.set({ ...s, assigned: [...next.ids], configs: [...next.configs] });
  }

  swap(a: number, b: number): void {
    const s = this.get();
    const next = swapSlots({ ids: s.assigned, configs: s.configs }, a, b);
    this.set({ ...s, assigned: [...next.ids], configs: [...next.configs] });
  }
}

export const paletteStore = new PaletteStore();

export function usePaletteState(): PaletteState {
  return useSyncExternalStore(paletteStore.subscribe, paletteStore.get);
}
