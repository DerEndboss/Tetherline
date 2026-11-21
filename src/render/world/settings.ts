/**
 * render-world's per-device switches: decoration (the generated cables and props) and lighting. Plain data in
 * localStorage (every access guarded), read by the renderer each frame, written by the settings UI
 * (src/ui/world/settings.tsx). Not game state: a save moves a run, these stay with the device.
 */
export interface WorldSettings {
  /** Generate decoration (cables, props). Off: the deco layer is empty. */
  decoration: boolean;
  /** Warm light around the player's base, a little darker elsewhere. */
  lighting: boolean;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = { decoration: true, lighting: true };

const KEY = 'groundbreak.world';

/** Parses a stored value; anything missing or broken falls back to the defaults. */
export function parseWorldSettings(raw: string | null): WorldSettings {
  const out = { ...DEFAULT_WORLD_SETTINGS };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof WorldSettings, unknown>>;
    if (typeof data.decoration === 'boolean') out.decoration = data.decoration;
    if (typeof data.lighting === 'boolean') out.lighting = data.lighting;
  } catch {
    // a broken entry: defaults
  }
  return out;
}

let current: WorldSettings | null = null;
const listeners = new Set<() => void>();

function load(): WorldSettings {
  try {
    return parseWorldSettings(window.localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_WORLD_SETTINGS };
  }
}

/** The settings now (a stable object until something changes: safe for useSyncExternalStore). */
export function worldSettings(): WorldSettings {
  return (current ??= load());
}

export function setWorldSetting<K extends keyof WorldSettings>(key: K, value: WorldSettings[K]): void {
  current = { ...worldSettings(), [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // blocked storage: the choice lasts for the session
  }
  for (const l of listeners) l();
}

export function subscribeWorldSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
