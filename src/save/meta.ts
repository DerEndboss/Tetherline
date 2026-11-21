import type { ContentRegistry } from '../content/registry';
import type { Id } from '../content/types';
import { setOwnedMeta } from '../sim/progression';
import { readKey, writeKey } from './slots';

/**
 * The meta tree across runs: Blueprints earned from orders, the nodes bought, a few
 * counters. Its own IndexedDB key; a run only ever sees the owned node ids (setOwnedMeta).
 */
const KEY = 'v2-meta';

export interface MetaSave {
  v: 1;
  /** Unspent Blueprints. */
  points: number;
  /** Blueprints ever earned (for the screen). */
  lifetime: number;
  owned: Id[];
  rounds: number;
  wins: number;
  /** Fastest win in sim seconds, 0 = none yet. */
  best: number;
  /** The guided first round is done or skipped. */
  tutorialDone: boolean;
}

export const emptyMeta = (): MetaSave => ({ v: 1, points: 0, lifetime: 0, owned: [], rounds: 0, wins: 0, best: 0, tutorialDone: false });

/** Reads what a stored value really holds; anything odd falls back to an empty tree. */
export function parseMeta(raw: unknown): MetaSave {
  if (!raw || typeof raw !== 'object') return emptyMeta();
  const r = raw as Partial<MetaSave>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    v: 1,
    points: num(r.points),
    lifetime: num(r.lifetime),
    owned: Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === 'string') : [],
    rounds: num(r.rounds),
    wins: num(r.wins),
    best: num(r.best),
    tutorialDone: r.tutorialDone === true,
  };
}

/** Buying a node: pays its cost when it is not owned, its requirements are owned and the points are there. */
export function buyNode(content: ContentRegistry, meta: MetaSave, id: Id): MetaSave | null {
  const node = content.meta.find(id);
  if (!node || meta.owned.includes(id) || meta.points < node.cost) return null;
  if (!node.requires.every((r) => meta.owned.includes(r))) return null;
  return { ...meta, points: meta.points - node.cost, owned: [...meta.owned, id] };
}

/* ---------- The store: one object per page, kept in memory and written through ---------- */

type Listener = () => void;

class MetaStore {
  private value: MetaSave = emptyMeta();
  private listeners = new Set<Listener>();
  private loading: Promise<void> | null = null;

  constructor() {
    setOwnedMeta(() => this.value.owned);
  }

  /** Loads the saved tree once (later calls wait for the same load). */
  load(): Promise<void> {
    this.loading ??= readKey(KEY).then(
      (raw) => {
        this.value = parseMeta(raw);
        this.emit();
      },
      () => undefined,
    );
    return this.loading;
  }

  readonly get = (): MetaSave => this.value;

  readonly subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private async set(next: MetaSave): Promise<void> {
    this.value = next;
    this.emit();
    await writeKey(KEY, next).catch((e: unknown) => console.warn('Saving the meta tree failed', e));
  }

  /** Pays out Blueprints earned in a run. */
  async earn(n: number): Promise<void> {
    if (n <= 0) return;
    await this.load();
    await this.set({ ...this.value, points: this.value.points + n, lifetime: this.value.lifetime + n });
  }

  async buy(content: ContentRegistry, id: Id): Promise<boolean> {
    await this.load();
    const next = buyNode(content, this.value, id);
    if (!next) return false;
    await this.set(next);
    return true;
  }

  /** A round started (counter) or ended in a win with this many sim seconds. */
  async round(win?: number): Promise<void> {
    await this.load();
    const v = this.value;
    if (win === undefined) return this.set({ ...v, rounds: v.rounds + 1 });
    return this.set({ ...v, wins: v.wins + 1, best: v.best === 0 ? win : Math.min(v.best, win) });
  }

  async finishTutorial(): Promise<void> {
    await this.load();
    if (!this.value.tutorialDone) await this.set({ ...this.value, tutorialDone: true });
  }
}

/** The page's meta store. */
export const metaStore = new MetaStore();
