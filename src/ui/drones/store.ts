import { useSyncExternalStore } from 'react';

/** Per-device drone panel settings (own tiny store, like the other parts': every storage access is guarded). */
export interface DroneUi {
  open: boolean;
  /** An idle player drone hovers where the mouse points. */
  follow: boolean;
}

const KEY = 'groundbreak.drones.ui';
const DEFAULTS: DroneUi = { open: false, follow: true };
const listeners = new Set<() => void>();

function read(): DroneUi {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<DroneUi>) : {};
    return { open: v.open === true, follow: v.follow !== false };
  } catch {
    return DEFAULTS;
  }
}

let state: DroneUi = read();

export function setDroneUi(patch: Partial<DroneUi>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode: the setting lasts until reload */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDroneUi(): DroneUi {
  return useSyncExternalStore(subscribe, () => state, () => DEFAULTS);
}
