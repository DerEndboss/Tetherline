import type {
  BuildingDef,
  FloorDef,
  Id,
  LiquidDef,
  MapPropertyDef,
  MapSizeDef,
  MaterialDef,
  MetaNodeDef,
  OrderDef,
  RawContent,
  RecipeDef,
  ResourceSpawnDef,
  RulesDef,
  ThemeDef,
} from './types';

/**
 * Read-only id -> entry lookup for one content kind. `list` keeps the source order; `indexOf` is the compact
 * number the simulation stores in typed arrays (item ids on belts, floor bytes, building kinds), O(1).
 */
export class Table<T extends { id: Id }> {
  readonly list: readonly T[];
  private readonly byId: ReadonlyMap<Id, T>;
  private readonly index: ReadonlyMap<Id, number>;

  constructor(
    readonly kind: string,
    entries: readonly T[],
  ) {
    this.list = entries;
    this.byId = new Map(entries.map((e) => [e.id, e]));
    this.index = new Map(entries.map((e, i) => [e.id, i]));
  }

  has(id: Id): boolean {
    return this.byId.has(id);
  }

  /** Throws on an unknown id: content is validated by test, so a miss is a programming error. */
  get(id: Id): T {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`Unknown ${this.kind} id "${id}"`);
    return entry;
  }

  find(id: Id): T | undefined {
    return this.byId.get(id);
  }

  /** Position in `list` (the number stored in typed arrays); -1 for an unknown id. */
  indexOf(id: Id): number {
    return this.index.get(id) ?? -1;
  }

  /** Entry at a stored number; throws when out of range. */
  at(i: number): T {
    const entry = this.list[i];
    if (!entry) throw new Error(`No ${this.kind} at index ${i}`);
    return entry;
  }
}

export interface ContentRegistry {
  materials: Table<MaterialDef>;
  liquids: Table<LiquidDef>;
  floors: Table<FloorDef>;
  buildings: Table<BuildingDef>;
  recipes: Table<RecipeDef>;
  orders: Table<OrderDef>;
  meta: Table<MetaNodeDef>;
  themes: Table<ThemeDef>;
  sizes: Table<MapSizeDef>;
  mapProperties: Table<MapPropertyDef>;
  spawns: readonly ResourceSpawnDef[];
  rules: RulesDef;
}

export function createRegistry(raw: RawContent): ContentRegistry {
  return {
    materials: new Table('material', raw.materials),
    liquids: new Table('liquid', raw.liquids),
    floors: new Table('floor', raw.floors),
    buildings: new Table('building', raw.buildings),
    recipes: new Table('recipe', raw.recipes),
    orders: new Table('order', raw.orders),
    meta: new Table('meta node', raw.meta),
    themes: new Table('theme', raw.themes),
    sizes: new Table('map size', raw.sizes),
    mapProperties: new Table('map property', raw.mapProperties),
    spawns: raw.spawns,
    rules: raw.rules,
  };
}
