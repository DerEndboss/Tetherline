import { metaStore } from '../../save/meta';
import type { SlotInfo } from '../../save/slots';
import type { RunOptions } from '../../sim/newgame';
import type { GameServices } from '../context';
import { setLoading, withLoading } from './loading';

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/** A readable seed for the Customize field: eight base-36 characters. */
export const seedText = (n: number): string => n.toString(36).toUpperCase().padStart(8, '0').slice(-8);

/** Whether a run on this theme makes the page reload (sky and boulders are baked per theme). */
export function reloadsFor(services: GameServices, theme: string | undefined): boolean {
  const t = theme ?? services.game.content.rules.defaultTheme;
  return t !== services.game.world.state.map.theme;
}

/** Starts a new round in a slot behind the loading screen; the meta tree is loaded first so its bonuses apply. */
export async function startRound(services: GameServices, opts: RunOptions, slot: number): Promise<void> {
  const reloads = reloadsFor(services, opts.theme);
  await withLoading(
    'Shaping the land',
    async () => {
      await metaStore.load();
      await metaStore.round();
      setLoading('Landing', 0.8);
      await services.newRun(opts, slot);
    },
    { reloads },
  );
}

/** Loads a slot behind the loading screen. */
export async function continueSlot(services: GameServices, slot: number, theme: string): Promise<void> {
  await withLoading('Loading your round', () => services.loadSlot(slot), { reloads: reloadsFor(services, theme) && slot !== services.game.slot });
}

/** The first empty slot, else the one saved longest ago; never `playing` (the round in play, saved or not). */
export function freeSlot(slots: readonly { slot: number; summary: unknown; savedAt: number }[], playing = 0): number {
  const empty = slots.find((s) => !s.summary && s.slot !== playing);
  if (empty) return empty.slot;
  return [...slots].filter((s) => s.slot !== playing).sort((a, b) => a.savedAt - b.savedAt)[0]?.slot ?? 1;
}

/** Where a new round lands, and the saved round it would wipe there (null while the slot is free). */
export interface Landing {
  slot: number;
  replaces: SlotInfo | null;
}

/** The landing of a new round: the first empty slot, else the one saved longest ago. `playing` is never touched. */
export function landing(slots: readonly SlotInfo[], playing = 0): Landing {
  const slot = freeSlot(slots, playing);
  const at = slots.find((s) => s.slot === slot);
  return { slot, replaces: at?.summary ? at : null };
}

/** The saves a new round could replace when every slot is taken: all but the one in play, the oldest first. */
export function replaceable(slots: readonly SlotInfo[], playing = 0): SlotInfo[] {
  return slots.filter((s) => s.summary && s.slot !== playing).sort((a, b) => a.savedAt - b.savedAt || a.slot - b.slot);
}
