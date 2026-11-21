import { useSyncExternalStore } from 'react';

/** Touch screens and narrow windows: the tools and the drone window use the left edge and bottom sheets there. */
export const COMPACT_QUERY = '(hover: none), (max-width: 760px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const list = window.matchMedia(COMPACT_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

const read = (): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(COMPACT_QUERY).matches;

/** Whether the compact layout applies (re-renders when the device or window changes). */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
