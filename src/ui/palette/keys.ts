import { useEffect, useSyncExternalStore } from 'react';
import type { BuildCategory } from '../../content/types';
import { isTextEntry } from '../../game/hotkeys';
import { useServices } from '../context';
import { slotLabel, slotOfKey, visibleSlots } from './hotbar-logic';
import { categoryList, nextCoreId } from './categories';
import { paletteStore, type PaletteState } from './store';
import { isUnlocked } from './unlock';

function subscribeSize(l: () => void): () => void {
  window.addEventListener('resize', l);
  return () => window.removeEventListener('resize', l);
}

/** The window's inner width, live. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribeSize, () => window.innerWidth, () => 1280);
}

/** The key cap of a palette entry: its hotbar slot's key while the hotbar is on, else 1-9 by position in the tab. */
export function keyLabel(ps: PaletteState, width: number, id: string, index: number): string | null {
  if (!ps.hotbar) return index < 9 ? String(index + 1) : null;
  const slot = ps.assigned.indexOf(id);
  return slot >= 0 && slot < visibleSlots(ps.slots, width) ? slotLabel(slot) : null;
}

type Interaction = ReturnType<typeof useServices>['interaction'];
type Game = ReturnType<typeof useServices>['game'];

/** The building a number key stands for: a hotbar slot, or the n-th entry of the open tab while the hotbar is off. */
function buildingForSlot(game: Game, ps: PaletteState, tab: BuildCategory, slot: number): string | undefined {
  if (ps.hotbar) return slot < visibleSlots(ps.slots, window.innerWidth) ? (ps.assigned[slot] ?? undefined) : undefined;
  return slot < 9 ? categoryList(game.content.buildings.list, tab, nextCoreId(game.world))[slot]?.id : undefined;
}

/** Shift + number: the building in your hand goes into that slot. Returns whether it did. */
function assignHand(ps: PaletteState, hand: string | null, slot: number, shift: boolean): boolean {
  if (!ps.hotbar || !shift || !hand || slot >= visibleSlots(ps.slots, window.innerWidth)) return false;
  paletteStore.assign(slot, hand);
  return true;
}

/** Handles one number key; returns whether it did something (so the event can be stopped). */
function pressSlot(game: Game, interaction: Interaction, tab: BuildCategory, e: KeyboardEvent): boolean {
  const slot = slotOfKey(e.code);
  if (slot === null) return false;
  const ps = paletteStore.get();
  const hand = interaction.mode.kind === 'place' ? interaction.mode.building : null;
  if (assignHand(ps, hand, slot, e.shiftKey)) return true;
  const id = buildingForSlot(game, ps, tab, slot);
  const def = id ? game.content.buildings.find(id) : undefined;
  if (!def || !isUnlocked(game.world, def)) return false;
  if (hand === def.id) interaction.cancel();
  else interaction.startPlacing(def.id);
  return true;
}

/**
 * Number keys: 1-9 and 0 pick the hotbar slot (Shift + number puts the building in your hand into that slot).
 * With the hotbar off, 1-9 pick the n-th entry of the open palette tab. Pressing the key of the building in your
 * hand puts it away.
 */
export function usePaletteKeys(tab: BuildCategory): void {
  const { game, interaction } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (pressSlot(game, interaction, tab, e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, interaction, tab]);
}
