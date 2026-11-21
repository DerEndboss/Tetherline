/** Pure bookkeeping for usePresenceList (Presence.tsx): which removed items are still on their way out. */
export type Key = string | number;

export interface Leaving<T> {
  key: Key;
  item: T;
  /** Where it stood in the list, so it leaves from its own place. */
  at: number;
}

export interface Entry<T> {
  key: Key;
  item: T;
  leaving: boolean;
}

/** The items of `prev` that are gone from `next`, plus those already leaving that did not come back. */
export function nextLeaving<T>(prev: readonly T[], next: readonly T[], leaving: readonly Leaving<T>[], keyOf: (t: T) => Key): Leaving<T>[] {
  const keys = new Set(next.map(keyOf));
  const kept = leaving.filter((l) => !keys.has(l.key));
  const known = new Set(kept.map((l) => l.key));
  prev.forEach((item, at) => {
    const key = keyOf(item);
    if (!keys.has(key) && !known.has(key)) kept.push({ key, item, at });
  });
  return kept;
}

/** The list as drawn: the current items in order, each leaving one back at its old place. */
export function mergeLeaving<T>(items: readonly T[], leaving: readonly Leaving<T>[], keyOf: (t: T) => Key): Entry<T>[] {
  const out: Entry<T>[] = items.map((item) => ({ key: keyOf(item), item, leaving: false }));
  const byPlace = [...leaving].sort((a, b) => a.at - b.at);
  for (const l of byPlace) out.splice(Math.min(l.at, out.length), 0, { key: l.key, item: l.item, leaving: true });
  return out;
}
