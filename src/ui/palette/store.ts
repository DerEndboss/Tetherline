import { useSyncExternalStore } from 'react';
import { DEFAULT_SLOTS, MAX_SLOTS, assignSlot, clampSlots, swapSlots } from './hotbar-logic';

/** Per-device palette choices (hotbar on/off, slots, what is in them, the core window folded). Own small store. */
export interface PaletteState {
  hotbar: boolean;
  /** Most hotbar slots (5..10); the screen width may show fewer. */
  slots: number;
  /** Building id per slot, up to 10. */
  assigned: (string | null)[];
  /** Core window shows every resource instead of the first rows. */
  coreOpen: boolean;
}

export const DEFAULT_PALETTE: PaletteState = {
  hotbar: true,
  slots: DEFAULT_SLOTS,
  assigned: ['conveyor', 'mechanical-drill', 'junction', 'router', 'smelter', 'power-node', 'wire-mill', 'container', null, null],
  coreOpen: false,
};

const KEY = 'groundbreak.palette';

function padSlots(list: unknown[]): (string | null)[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => (typeof list[i] === 'string' ? (list[i] as string) : null));
}

/** Reads stored state; anything broken falls back to the defaults. Exported for tests. */
export function parsePalette(raw: string | null): PaletteState {
  const base: PaletteState = { ...DEFAULT_PALETTE, assigned: [...DEFAULT_PALETTE.assigned] };
  if (!raw) return base;
  try {
    const d = JSON.parse(raw) as Partial<Record<keyof PaletteState, unknown>>;
    if (typeof d.hotbar === 'boolean') base.hotbar = d.hotbar;
    if (typeof d.coreOpen === 'boolean') base.coreOpen = d.coreOpen;
    if (typeof d.slots === 'number') base.slots = clampSlots(d.slots);
    if (Array.isArray(d.assigned)) base.assigned = padSlots(d.assigned);
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

  assign(i: number, id: string | null): void {
    this.set({ ...this.get(), assigned: assignSlot(this.get().assigned, i, id) });
  }

  swap(a: number, b: number): void {
    this.set({ ...this.get(), assigned: swapSlots(this.get().assigned, a, b) });
  }
}

export const paletteStore = new PaletteStore();

export function usePaletteState(): PaletteState {
  return useSyncExternalStore(paletteStore.subscribe, paletteStore.get);
}
