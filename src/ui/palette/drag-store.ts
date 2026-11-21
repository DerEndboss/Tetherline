import { useSyncExternalStore } from 'react';

/**
 * Whether a building (from the palette) or a quick bar slot is being dragged right now: the quick bar lights its
 * slots as drop targets while it is. Tiny own store; the browser's drag events do the rest.
 */
let dragging = false;
const listeners = new Set<() => void>();

export function setDragging(on: boolean): void {
  if (dragging === on) return;
  dragging = on;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDragging(): boolean {
  return useSyncExternalStore(subscribe, () => dragging, () => false);
}
