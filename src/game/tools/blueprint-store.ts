import type { Id } from '../../content/types';
import { parseBlueprint, type Blueprint } from './blueprint';

const KEY = 'groundbreak.blueprints';
const MAX_SAVED = 120;

type Listener = () => void;

/**
 * Named blueprints saved on this device (localStorage, every access guarded). The palette may show them
 * in a tab: `blueprintLibrary.list()`, `subscribe`, and `Interaction.pasteBlueprint(bp)` to put one in hand.
 */
export class BlueprintLibrary {
  private items: Blueprint[] = [];
  private readonly listeners = new Set<Listener>();
  /** Bumps on every change (a cheap snapshot for useSyncExternalStore). */
  version = 0;

  constructor(
    private readonly sizeOf: (id: Id) => number,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
  ) {
    this.load();
  }

  list(): readonly Blueprint[] {
    return this.items;
  }

  get(name: string): Blueprint | undefined {
    return this.items.find((b) => b.name === name);
  }

  /** Saves under `name` (an existing one with that name is replaced); returns the stored blueprint. */
  save(bp: Blueprint, name: string): Blueprint {
    const clean = name.trim().slice(0, 40) || 'Blueprint';
    const stored = { ...bp, name: clean };
    this.items = [stored, ...this.items.filter((b) => b.name !== clean)].slice(0, MAX_SAVED);
    this.commit();
    return stored;
  }

  remove(name: string): void {
    this.items = this.items.filter((b) => b.name !== name);
    this.commit();
  }

  rename(name: string, to: string): void {
    const bp = this.get(name);
    const clean = to.trim().slice(0, 40);
    if (!bp || !clean || clean === name) return;
    this.items = [{ ...bp, name: clean }, ...this.items.filter((b) => b.name !== name && b.name !== clean)];
    this.commit();
  }

  /** A free default name: "Blueprint 1", "Blueprint 2" ... */
  suggestName(): string {
    for (let i = 1; ; i++) if (!this.get(`Blueprint ${i}`)) return `Blueprint ${i}`;
  }

  readonly subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  readonly getVersion = (): number => this.version;

  private commit(): void {
    this.version++;
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* storage full or blocked: the session keeps them */
    }
    for (const l of this.listeners) l();
  }

  private load(): void {
    try {
      const raw = JSON.parse(this.storage?.getItem(KEY) ?? '[]') as unknown;
      if (!Array.isArray(raw)) return;
      this.items = raw.map((r) => parseBlueprint(r, this.sizeOf)).filter((b): b is Blueprint => b !== null);
    } catch {
      this.items = [];
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
