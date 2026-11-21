import type { ContentRegistry } from '../content/registry';
import type { BuildingDef } from '../content/types';
import { allocSlot, freeSlot, refreeSlots } from './belts';
import { edgeTiles, type Rect } from './grid';
import type { Building, Dir, SimState } from './state';

/**
 * The simulation's working view of a SimState: the saved state plus indices derived from it (tile occupancy,
 * id lookup, neighbour lists, the power and liquid graphs). Derived data is rebuilt on load and invalidated on
 * every layout change (`touch`), never saved. Every system takes a World; the UI and renderer read it
 * (read-only) through `Game`.
 */
export class World {
  /** Tile -> building id + 1 (0 = free). */
  readonly occ: Int32Array;
  readonly byId = new Map<number, Building>();
  /** content.buildings.list, for `def(b)` without a lookup. */
  readonly defs: readonly BuildingDef[];
  /** Bumps on every change of buildings (placed, finished, removed, rotated, linked). Caches key on it. */
  layout = 0;
  private readonly neighbourCache = new Map<number, Building[]>();
  /** Graph caches set by power.ts / liquids.ts, dropped on `touch`. */
  cache: { power?: unknown; liquid?: unknown; storage?: unknown } = {};

  constructor(
    readonly content: ContentRegistry,
    readonly state: SimState,
  ) {
    this.defs = content.buildings.list;
    this.occ = new Int32Array(state.map.w * state.map.h);
    const slots = new Set<number>();
    for (const b of state.buildings) {
      this.byId.set(b.id, b);
      this.mark(b, b.id + 1);
      if (b.slot >= 0) slots.add(b.slot);
    }
    refreeSlots(state.belts, slots);
  }

  def(b: Building): BuildingDef {
    return this.defs[b.kind]!;
  }

  rect(b: Building): Rect {
    return { x: b.x, y: b.y, size: this.defs[b.kind]!.size };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.state.map.w && y < this.state.map.h;
  }

  /** The building covering a tile, or undefined. */
  at(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.occ[y * this.state.map.w + x]! - 1;
    return id >= 0 ? this.byId.get(id) : undefined;
  }

  get core(): Building | undefined {
    return this.byId.get(this.state.core);
  }

  /** Adds a building (site or finished) and marks its tiles. Conveyors get a belt slot. */
  add(b: Building): void {
    this.state.buildings.push(b);
    this.byId.set(b.id, b);
    this.mark(b, b.id + 1);
    if (this.def(b).behaviour === 'conveyor' && b.slot < 0) b.slot = allocSlot(this.state.belts);
    this.touch();
  }

  remove(b: Building): void {
    const i = this.state.buildings.indexOf(b);
    if (i >= 0) this.state.buildings.splice(i, 1);
    this.byId.delete(b.id);
    this.mark(b, 0);
    freeSlot(this.state.belts, b.slot);
    b.slot = -1;
    this.touch();
  }

  /** Moves or resizes a building in place (a core upgrade): unmark, change, mark. */
  reshape(b: Building, change: () => void): void {
    this.mark(b, 0);
    change();
    this.mark(b, b.id + 1);
    this.touch();
  }

  /** Invalidates everything derived from the layout. */
  touch(): void {
    this.layout++;
    this.neighbourCache.clear();
    this.cache = {};
  }

  private mark(b: Building, value: number): void {
    const { size } = this.defs[b.kind]!;
    const w = this.state.map.w;
    for (let y = b.y; y < b.y + size; y++) for (let x = b.x; x < b.x + size; x++) if (this.inBounds(x, y)) this.occ[y * w + x] = value;
  }

  /** Distinct buildings touching `b`'s footprint, clockwise from its east side (deterministic order). */
  neighbours(b: Building): Building[] {
    const hit = this.neighbourCache.get(b.id);
    if (hit) return hit;
    const out: Building[] = [];
    for (const [x, y] of edgeTiles(this.rect(b))) {
      const n = this.at(x, y);
      if (n && !out.includes(n)) out.push(n);
    }
    this.neighbourCache.set(b.id, out);
    return out;
  }

  /** The building on side `d` of a 1x1 building (or the middle of a bigger one's side). */
  facing(b: Building, d: Dir): Building | undefined {
    const size = this.def(b).size;
    const mid = Math.floor((size - 1) / 2);
    const x = d === 0 ? b.x + size : d === 2 ? b.x - 1 : b.x + mid;
    const y = d === 1 ? b.y + size : d === 3 ? b.y - 1 : b.y + mid;
    return this.at(x, y);
  }

  /** Finished (not under construction or removal). */
  ready(b: Building): boolean {
    return b.build >= 1 && !b.removing;
  }
}

/** A fresh building record with every field at its default. */
export function newBuilding(w: World, kind: number, x: number, y: number, rot: Dir, config = -1): Building {
  const def = w.defs[kind]!;
  const hasItems = (def.items ?? 0) > 0 || def.storage !== undefined || def.behaviour === 'crafter' || def.behaviour === 'generator';
  return {
    id: w.state.nextId++,
    kind,
    x,
    y,
    rot,
    build: 0,
    spent: def.cost.map(() => 0),
    items: hasItems && def.behaviour !== 'core' ? w.content.materials.list.map(() => 0) : [],
    liquid: 0,
    liquidId: -1,
    work: 0,
    charge: 0,
    config,
    link: -1,
    links: [],
    rr: 0,
    queue: [],
    slot: -1,
    removing: false,
    upgrade: null,
  };
}
