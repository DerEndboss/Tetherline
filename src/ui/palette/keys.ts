import { useEffect, useSyncExternalStore } from 'react';
import type { BuildCategory } from '../../content/types';
import { isTextEntry } from '../../game/hotkeys';
import { useServices } from '../context';
import { NO_SETTING, slotLabel, slotOf, slotOfKey, visibleSlots } from './hotbar-logic';
import { categoryList, nextCoreId } from './categories';
import { heldTool, type Tool } from './setting';
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

/** The window's inner height, live. */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribeSize, () => window.innerHeight, () => 800);
}

/** The key cap of a palette entry: its hotbar slot's key while the hotbar is on (the plain building's slot first), else 1-9 by position in the tab. */
export function keyLabel(ps: PaletteState, width: number, height: number, id: string, index: number): string | null {
  if (!ps.hotbar) return index < 9 ? String(index + 1) : null;
  const slots = { ids: ps.assigned, configs: ps.configs };
  const plain = slotOf(slots, id, NO_SETTING);
  const slot = plain >= 0 ? plain : ps.assigned.indexOf(id);
  return slot >= 0 && slot < visibleSlots(ps.slots, width, height) ? slotLabel(slot) : null;
}

type Interaction = ReturnType<typeof useServices>['interaction'];
type Game = ReturnType<typeof useServices>['game'];

/** The building a number key stands for: a hotbar slot (with its setting), or the n-th entry of the open tab while the hotbar is off. */
function buildingForSlot(game: Game, ps: PaletteState, tab: BuildCategory, slot: number): Tool | undefined {
  if (ps.hotbar) {
    const id = slot < visibleSlots(ps.slots, window.innerWidth, window.innerHeight) ? ps.assigned[slot] : undefined;
    return id ? { id, config: ps.configs[slot] ?? NO_SETTING } : undefined;
  }
  const id = slot < 9 ? categoryList(game.content.buildings.list, tab, nextCoreId(game.world))[slot]?.id : undefined;
  return id ? { id, config: NO_SETTING } : undefined;
}

/** Shift + number: the building in your hand, with its setting, goes into that slot. Returns whether it did. */
function assignHand(ps: PaletteState, hand: Tool | null, slot: number, shift: boolean): boolean {
  if (!ps.hotbar || !shift || !hand || slot >= visibleSlots(ps.slots, window.innerWidth, window.innerHeight)) return false;
  paletteStore.assign(slot, hand.id, hand.config);
  return true;
}

/** Handles one number key; returns whether it did something (so the event can be stopped). */
function pressSlot(game: Game, interaction: Interaction, tab: BuildCategory, e: KeyboardEvent): boolean {
  const slot = slotOfKey(e.code);
  if (slot === null) return false;
  const ps = paletteStore.get();
  const hand = heldTool(game.content, interaction);
  if (assignHand(ps, hand, slot, e.shiftKey)) return true;
  const pick = buildingForSlot(game, ps, tab, slot);
  const def = pick ? game.content.buildings.find(pick.id) : undefined;
  if (!pick || !def || !isUnlocked(game.world, def)) return false;
  if (hand && hand.id === def.id && hand.config === pick.config) interaction.cancel();
  else interaction.startPlacing(def.id, pick.config);
  return true;
}

/**
 * Number keys: 1-9 and 0 pick the hotbar slot (Shift + number puts the building in your hand into that slot).
 * With the hotbar off, 1-9 pick the n-th entry of the open palette tab. Pressing the key of the building in your
 * hand puts it away. A slot gives the building back with the setting it was filled with (a recipe, a sorter's item).
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
