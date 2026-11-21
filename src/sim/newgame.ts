import type { ContentRegistry } from '../content/registry';
import { createBeltStore } from './belts';
import { finishSite } from './construction';
import { SAVE_VERSION } from './constants';
import { generateMap } from './mapgen';
import { startOrders } from './progression';
import { createRng } from './rng';
import type { SimState } from './state';
import { newBuilding, World } from './world';

export interface RunOptions {
  seed: number;
  size?: string;
  theme?: string;
}

/** Short forms a URL or an old link may use for map sizes and worlds. */
const ALIASES: Record<string, string> = {
  s: 'small', m: 'medium', l: 'large', desert: 'rust-desert', rust: 'rust-desert', meadow: 'green-meadow', green: 'green-meadow', ice: 'ice-snow', snow: 'ice-snow',
};

/** A size or theme id as asked (any case, short forms allowed); unknown or missing values fall back to `fallback`. */
export function resolveId(table: { has(id: string): boolean }, wanted: string | undefined, fallback: string): string {
  const id = (wanted ?? '').trim().toLowerCase();
  const full = ALIASES[id] ?? id;
  return table.has(full) ? full : fallback;
}

/** A new run: generated map, the start core (finished), start items, the player drone, the first orders. */
export function createRun(content: ContentRegistry, opts: RunOptions): World {
  const { rules } = content;
  const size = resolveId(content.sizes, opts.size, rules.defaultSize);
  const theme = resolveId(content.themes, opts.theme, rules.defaultTheme);
  const { map, core } = generateMap(content, { seed: opts.seed, size, theme });
  const zeros = () => content.materials.list.map(() => 0);
  const state: SimState = {
    version: SAVE_VERSION,
    seed: opts.seed,
    rng: createRng(opts.seed),
    tick: 0,
    map,
    buildings: [],
    nextId: 1,
    core: -1,
    stock: zeros(),
    belts: createBeltStore(),
    plans: [],
    drones: [{ id: 0, x: core.x - 1.5, y: core.y + 1.5, task: 'idle', target: -1, waiting: '' }],
    stats: { delivered: zeros(), made: zeros(), built: content.buildings.list.map(() => 0) },
    progress: { done: [], active: [], unlocked: [], won: false },
    deco: { removed: [] },
    bonus: { build: 1, drill: 1, capacity: 1, belt: 1, power: 1 },
  };
  const w = new World(content, state);
  const b = newBuilding(w, content.buildings.indexOf(rules.startCore), core.x, core.y, 0);
  w.add(b);
  state.core = b.id;
  finishSite(w, b, { dt: 0, tick: 0, events: [], power: () => 1 });
  state.stats.built[b.kind] = 0;
  for (const s of rules.startItems) state.stock[content.materials.indexOf(s.item)] = s.n;
  startOrders(w);
  return w;
}
