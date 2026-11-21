import { useSyncExternalStore } from 'react';
import type { BuildCategory } from '../../content/types';

/**
 * The palette's open tab. It lives outside the HUD, which leaves the page while the main menu is open: a tab held in the
 * HUD's own state sent the player back to Mining after every visit to the menu.
 */
let tab: BuildCategory = 'mining';
const listeners = new Set<() => void>();

export const getPaletteTab = (): BuildCategory => tab;

export function setPaletteTab(next: BuildCategory): void {
  if (next === tab) return;
  tab = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePaletteTab(): BuildCategory {
  return useSyncExternalStore(subscribe, getPaletteTab, () => 'mining');
}
