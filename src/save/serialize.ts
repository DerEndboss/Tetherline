import type { ContentRegistry } from '../content/registry';
import { SAVE_VERSION } from '../sim/constants';
import type { SimState } from '../sim/state';
import { World } from '../sim/world';

/** One save slot as stored in IndexedDB (typed arrays are kept as they are by structured clone). */
export interface SaveRecord {
  version: number;
  savedAt: number;
  /** Shown in the slot list without loading the world. */
  summary: SlotSummary;
  state: SimState;
}

export interface SlotSummary {
  theme: string;
  size: string;
  seed: number;
  /** Sim seconds played. */
  seconds: number;
  ordersDone: number;
  buildings: number;
}

export function summaryOf(w: World): SlotSummary {
  const s = w.state;
  return { theme: s.map.theme, size: s.map.size, seed: s.seed, seconds: Math.floor(s.tick / 20), ordersDone: s.progress.done.length, buildings: s.buildings.length };
}

export function toSaveRecord(w: World, now: number): SaveRecord {
  return { version: SAVE_VERSION, savedAt: now, summary: summaryOf(w), state: w.state };
}

/** What a stored value is: a run of the current format, a save of another format version, or nothing usable. */
export type SaveKind = 'current' | 'old' | 'none';

export function saveKind(raw: unknown): SaveKind {
  if (!raw || typeof raw !== 'object') return 'none';
  const v = (raw as { version?: unknown }).version;
  if (v === SAVE_VERSION && (raw as { state?: unknown }).state) return 'current';
  return typeof v === 'number' ? 'old' : 'none';
}

/** The world of a record in the current format; null for anything else (older formats are not migrated). */
export function fromSaveRecord(raw: unknown, content: ContentRegistry): World | null {
  if (saveKind(raw) !== 'current') return null;
  try {
    return new World(content, (raw as SaveRecord).state);
  } catch {
    return null;
  }
}

/* ---------- Files: JSON with typed arrays as base64 ---------- */

const TYPED = { Uint8Array, Int16Array, Int32Array } as const;
type TypedName = keyof typeof TYPED;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encodeTyped(v: unknown): unknown {
  for (const name of Object.keys(TYPED) as TypedName[]) {
    if (v instanceof TYPED[name]) return { $typed: name, b64: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  return v;
}

/** A save record as JSON text (typed arrays encoded). */
export function recordToText(record: SaveRecord): string {
  return JSON.stringify(record, (_k, v: unknown) => encodeTyped(v));
}

export function textToRecord(text: string): unknown {
  return JSON.parse(text, (_k, v: unknown) => {
    const t = v as { $typed?: TypedName; b64?: string } | null;
    if (!t || typeof t !== 'object' || !t.$typed || !t.b64 || !(t.$typed in TYPED)) return v;
    const bytes = fromBase64(t.b64);
    const Ctor = TYPED[t.$typed];
    return new Ctor(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
  });
}
