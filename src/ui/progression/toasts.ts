/** A tiny external store for the small notices on top of the world (order done, Blueprints paid, saved, a warning). */
export interface Toast {
  key: number;
  kind: 'order' | 'points' | 'saved' | 'warn' | 'error';
  text: string;
}

const LIFE_MS = 4200;
const SAVED_MS = 1400;
/** How long a notice that waited behind a panel stays once the panel is gone: long enough to read it. */
const RELEASED_MS = 2400;

let list: Toast[] = [];
let n = 0;
let held = false;
const timers = new Map<number, number>();
const listeners = new Set<() => void>();

function set(next: Toast[]): void {
  list = next;
  for (const l of listeners) l();
}

/** Takes a notice away after `ms`, unless it is held behind a panel (then it waits for `holdToasts(false)`). */
function arm(key: number, ms: number): void {
  window.clearTimeout(timers.get(key));
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      if (!held) set(list.filter((x) => x.key !== key));
    }, ms),
  );
}

export function pushToast(t: Omit<Toast, 'key'>): void {
  const key = ++n;
  // one "Saved" and one payout at a time, up to four order notices
  set([...list.filter((x) => x.kind !== t.kind || t.kind === 'order').slice(-3), { ...t, key }]);
  arm(key, t.kind === 'saved' ? SAVED_MS : LIFE_MS);
}

/**
 * While a notice would lie on an open panel (the drone sheet on a phone, the recipe window) it waits unseen, and its
 * time does not run. Once the panel is gone every waiting notice shows again for a moment. Calling it with the state
 * it has already does nothing.
 */
export function holdToasts(on: boolean): void {
  if (held === on) return;
  held = on;
  if (on) return;
  for (const t of list) arm(t.key, t.kind === 'saved' ? SAVED_MS : RELEASED_MS);
}

export const toastStore = {
  get: (): readonly Toast[] => list,
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
