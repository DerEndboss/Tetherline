/**
 * Per-device preferences: the three volumes, reduced motion and the autopilot. They are not game state (a save file moves a
 * run to another device, the volumes stay with the device), so they live in localStorage. Every read and write
 * is guarded: in a private window or with blocked storage the defaults simply apply for the session.
 */
export type Channel = 'music' | 'effects' | 'ambience';
/** `system` follows the browser's prefers-reduced-motion; `reduce` and `full` override it. */
export type MotionPreference = 'system' | 'reduce' | 'full';
/** Camera view: `iso` (oblique, the default), `steep` (50 degrees) or `top` (straight down, like Mindustry). See render/iso.ts. */
export type ViewPreference = 'iso' | 'steep' | 'top';

export interface Preferences {
  /** Volume per channel, 0..1 (a slider position; the engine maps it to gain). */
  volume: Record<Channel, number>;
  motion: MotionPreference;
  /** The autopilot plays the run (the balance bot's plan), launches at the Skyforge and learns skills. */
  autopilot: boolean;
  /** Game speed (time scale), one of SPEEDS. Per device like the rest; the dev menu may override it for a session. */
  speed: number;
  /** Camera view; per device. Switching it reloads the world with the other sprite set. */
  view: ViewPreference;
}

export const CHANNELS: readonly Channel[] = ['music', 'effects', 'ambience'];

/** Speeds the settings offer; 10x keeps the 20 Hz sim at 200 ticks a second, light enough for the bot. */
export const SPEEDS: readonly number[] = [1, 2, 3, 5, 10];

export const DEFAULT_PREFERENCES: Preferences = {
  volume: { music: 0.6, effects: 0.8, ambience: 0.7 },
  motion: 'system',
  autopilot: false,
  speed: 1,
  view: 'iso',
};

const KEY = 'groundbreak.preferences';

/** Reads stored preferences; anything missing or broken falls back to the defaults, values are clamped. */
export function parsePreferences(raw: string | null): Preferences {
  const base: Preferences = { volume: { ...DEFAULT_PREFERENCES.volume }, motion: DEFAULT_PREFERENCES.motion, autopilot: false, speed: 1, view: 'iso' };
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<{ volume: Partial<Record<Channel, unknown>>; motion: unknown; autopilot: unknown; speed: unknown; view: unknown }>;
    for (const ch of CHANNELS) {
      const v = Number(data.volume?.[ch]);
      if (Number.isFinite(v)) base.volume[ch] = Math.min(1, Math.max(0, v));
    }
    readChoices(data, base);
  } catch {
    // a broken entry: defaults
  }
  return base;
}

/** The non-volume choices of stored data, each only when valid. */
function readChoices(data: Partial<Record<'motion' | 'autopilot' | 'speed' | 'view', unknown>>, base: Preferences): void {
  if (data.motion === 'reduce' || data.motion === 'full' || data.motion === 'system') base.motion = data.motion;
  base.autopilot = data.autopilot === true;
  if (SPEEDS.includes(Number(data.speed))) base.speed = Number(data.speed);
  if (data.view === 'top' || data.view === 'steep' || data.view === 'iso') base.view = data.view;
}

/** Slider position (0..1) to a gain factor: squared, so the slider feels even to the ear. */
export function volumeGain(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x * x;
}

function read(): Preferences {
  try {
    return parsePreferences(window.localStorage.getItem(KEY));
  } catch {
    return parsePreferences(null);
  }
}

function write(p: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage blocked: the change holds for this session
  }
}

/** Whether the browser asks for reduced motion (false outside a browser). */
function systemReduces(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** A tiny external store for the preferences: React reads it with useSyncExternalStore, the engine subscribes. */
export class PreferenceStore {
  private value: Preferences;
  private readonly listeners = new Set<() => void>();

  constructor(initial?: Preferences) {
    this.value = initial ?? read();
    if (typeof window !== 'undefined' && window.matchMedia) {
      // The system setting can change while the game runs; only matters while motion follows it.
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.emit());
    }
  }

  get = (): Preferences => this.value;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  setVolume(channel: Channel, v: number): void {
    this.update({ ...this.value, volume: { ...this.value.volume, [channel]: Math.min(1, Math.max(0, v)) } });
  }

  setMotion(motion: MotionPreference): void {
    this.update({ ...this.value, motion });
  }

  setAutopilot(on: boolean): void {
    this.update({ ...this.value, autopilot: on });
  }

  setSpeed(speed: number): void {
    if (SPEEDS.includes(speed)) this.update({ ...this.value, speed });
  }

  setView(view: ViewPreference): void {
    this.update({ ...this.value, view });
  }

  /** Whether motion is reduced right now: the player's choice, or the system's when it follows the system. */
  reducedMotion(): boolean {
    return this.value.motion === 'reduce' || (this.value.motion === 'system' && systemReduces());
  }

  private update(next: Preferences): void {
    this.value = next;
    write(next);
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
