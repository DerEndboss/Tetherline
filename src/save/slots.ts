import type { SaveRecord, SlotSummary } from './serialize';
import { saveKind } from './serialize';

/**
 * Three save slots in IndexedDB. The database keeps the codename the game started under, so existing saves stay readable.
 */
const DB_NAME = 'groundbreak';
const STORE = 'saves';
export const SLOTS = [1, 2, 3] as const;

const keyOf = (slot: number): string => `v2-slot-${slot}`;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return request(run(db.transaction(STORE, mode).objectStore(STORE)));
}

/** Raw access to the same store for the other save files of this folder (the meta tree). */
export async function readKey(key: string): Promise<unknown> {
  return withStore('readonly', (s) => s.get(key));
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  await withStore('readwrite', (s) => s.put(value, key));
}

export async function writeSlot(slot: number, record: SaveRecord): Promise<void> {
  await withStore('readwrite', (s) => s.put(record, keyOf(slot)));
}

export async function readSlot(slot: number): Promise<unknown> {
  return withStore('readonly', (s) => s.get(keyOf(slot)));
}

export async function deleteSlot(slot: number): Promise<void> {
  await withStore('readwrite', (s) => s.delete(keyOf(slot)));
}

export interface SlotInfo {
  slot: number;
  /** null = empty slot. */
  summary: SlotSummary | null;
  savedAt: number;
}

/** What every slot holds (for the menu). */
export async function listSlots(): Promise<SlotInfo[]> {
  return Promise.all(
    SLOTS.map(async (slot) => {
      const raw = await readSlot(slot).catch(() => undefined);
      if (saveKind(raw) !== 'current') return { slot, summary: null, savedAt: 0 };
      const r = raw as SaveRecord;
      return { slot, summary: r.summary, savedAt: r.savedAt };
    }),
  );
}
