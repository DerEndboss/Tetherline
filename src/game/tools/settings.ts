/**
 * The tools' own small settings store (per device, localStorage, every access guarded like
 * settings/preferences.ts). The UI (ui/tools/settings.tsx) edits it, the input and the tools read it.
 */
export interface ToolSettings {
  /** Wheel zoom glides to its target (frame-rate independent) instead of jumping per notch. */
  smoothZoom: boolean;
  /** The placing tool stays in hand after a placement (otherwise it drops unless Shift is held). */
  keepTool: boolean;
  /** Pushing the mouse to the window edge scrolls the map. */
  edgePan: boolean;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = { smoothZoom: true, keepTool: true, edgePan: false };

const KEY = 'groundbreak.tools';

/** Reads stored settings; anything missing or broken falls back to the defaults. */
export function parseToolSettings(raw: string | null): ToolSettings {
  const out = { ...DEFAULT_TOOL_SETTINGS };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof ToolSettings, unknown>>;
    for (const k of Object.keys(out) as (keyof ToolSettings)[]) if (typeof data[k] === 'boolean') out[k] = data[k];
  } catch {
    /* corrupt: defaults */
  }
  return out;
}

type Listener = () => void;

class ToolSettingsStore {
  private value: ToolSettings = { ...DEFAULT_TOOL_SETTINGS };
  private readonly listeners = new Set<Listener>();

  constructor() {
    try {
      this.value = parseToolSettings(globalThis.localStorage?.getItem(KEY) ?? null);
    } catch {
      /* blocked storage: defaults for this session */
    }
  }

  readonly get = (): ToolSettings => this.value;

  set<K extends keyof ToolSettings>(key: K, v: ToolSettings[K]): void {
    this.value = { ...this.value, [key]: v };
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l();
  }

  readonly subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const toolSettings = new ToolSettingsStore();
