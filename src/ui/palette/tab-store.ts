import { useSyncExternalStore } from 'react';
import type { BuildCategory } from '../../content/types';

/**
 * The palette's open tab. It lives outside the HUD, which leaves the page while the main menu is open: a tab held in the
 * HUD's own state sent the player back to Mining after every visit to the menu.
 */
let tab: BuildCategory = 'mining';
/** Phones: the buildings of the tab are folded away and only the row of tabs is left (the map gets the room). */
let folded = false;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const l of listeners) l();
};

export const getPaletteTab = (): BuildCategory => tab;
export const getTrayFolded = (): boolean => folded;

export function setPaletteTab(next: BuildCategory): void {
  if (next === tab) return;
  tab = next;
  notify();
}

export function setTrayFolded(next: boolean): void {
  if (next === folded) return;
  folded = next;
  notify();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePaletteTab(): BuildCategory {
  return useSyncExternalStore(subscribe, getPaletteTab, () => 'mining');
}

export function useTrayFolded(): boolean {
  return useSyncExternalStore(subscribe, getTrayFolded, () => false);
}

/** Whether the screen is a phone (hud-stack.css lays the palette out as a tray there; hud/hudStack.ts sets the attribute). */
export function isPhoneStack(): boolean {
  const mode = document.documentElement.dataset.hudStack;
  return mode === 'phone' || mode === 'landscape';
}

function watchGuide(l: () => void): () => void {
  const watch = new MutationObserver(l);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tutorial'] });
  return () => watch.disconnect();
}

/** Whether the guided tutorial is showing a step (TutorialGuide sets html[data-tutorial]). It needs the buildings in sight, so the tray stays open. */
export function useGuideOn(): boolean {
  return useSyncExternalStore(watchGuide, () => 'tutorial' in document.documentElement.dataset, () => false);
}
