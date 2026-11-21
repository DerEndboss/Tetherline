import { SPEEDS } from '../../settings/preferences';

/** One step through the speeds: faster or slower. */
export type SpeedStep = 1 | -1;

/** Where `current` sits in the list; a speed that is not in it counts as the fastest one below it. */
function slotOf(current: number, list: readonly number[]): number {
  const exact = list.indexOf(current);
  if (exact >= 0) return exact;
  let at = 0;
  list.forEach((s, i) => {
    if (s <= current) at = i;
  });
  return at;
}

/**
 * The speed after `current`. A click on the button wraps round (10x goes back to 1x); the keys stop at the ends, so a
 * second tap on "faster" at 10x does not drop the game back to 1x by accident.
 */
export function stepSpeed(current: number, dir: SpeedStep, wrap: boolean, list: readonly number[] = SPEEDS): number {
  const next = slotOf(current, list) + dir;
  const first = list[0] ?? current;
  const last = list[list.length - 1] ?? current;
  if (next >= list.length) return wrap ? first : last;
  if (next < 0) return wrap ? last : first;
  return list[next] ?? current;
}

/**
 * Which way a key changes the speed: the period key (">") is faster, the comma key ("<") slower. The plus and minus keys
 * are the camera's zoom keys (render/camera-motion.ts), so they stay out of it. By physical key, so every layout works.
 */
export function speedKey(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): SpeedStep | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code === 'Period') return 1;
  if (e.code === 'Comma') return -1;
  return null;
}

/** "2x". */
export const speedLabel = (speed: number): string => `${speed}x`;
