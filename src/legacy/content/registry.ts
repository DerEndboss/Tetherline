import type {
  AlloyDef,
  BeltDef,
  BuildingDef,
  CurrencyDef,
  DroneDef,
  FreighterDef,
  Id,
  MaterialDef,
  ObstacleDef,
  RawContent,
  RecipeDef,
  RelicDef,
  RulesDef,
  SkillBranchDef,
  SkillDef,
  StatDef,
  TechDef,
  UpgradeDef,
  WorldDef,
} from './types';

/** Read-only id -> entry lookup for one content kind, keeping the source order in `list`. */
export class Table<T extends { id: Id }> {
  readonly list: readonly T[];
  private readonly byId: ReadonlyMap<Id, T>;

  constructor(
    readonly kind: string,
    entries: readonly T[],
  ) {
    this.list = entries;
    this.byId = new Map(entries.map((e) => [e.id, e]));
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

  /** Position of an entry in `list`, for compact numeric storage in typed arrays. */
  indexOf(id: Id): number {
    return this.list.findIndex((e) => e.id === id);
  }
}

export interface ContentRegistry {
  materials: Table<MaterialDef>;
  currencies: Table<CurrencyDef>;
  stats: Table<StatDef>;
  recipes: Table<RecipeDef>;
  alloys: Table<AlloyDef>;
  buildings: Table<BuildingDef>;
  belts: Table<BeltDef>;
  freighters: Table<FreighterDef>;
  upgrades: Table<UpgradeDef>;
  obstacles: Table<ObstacleDef>;
  drones: Table<DroneDef>;
  techs: Table<TechDef>;
  skillBranches: Table<SkillBranchDef>;
  skills: Table<SkillDef>;
  relics: Table<RelicDef>;
  worlds: Table<WorldDef>;
  /** The single rules entry. */
  rules: RulesDef;
  /** Display name of a material or currency id; singular for a currency when `amount` is 1. */
  resourceName(id: Id, amount?: number): string;
}

export function createRegistry(raw: RawContent): ContentRegistry {
  const rules = raw.rules[0];
  if (!rules) throw new Error('Content needs exactly one rules entry');
  const materials = new Table('material', raw.materials);
  const currencies = new Table('currency', raw.currencies);
  return {
    materials,
    currencies,
    stats: new Table('stat', raw.stats),
    recipes: new Table('recipe', raw.recipes),
    alloys: new Table('alloy', raw.alloys),
    buildings: new Table('building', raw.buildings),
    belts: new Table('belt', raw.belts),
    freighters: new Table('freighter', raw.freighters),
    upgrades: new Table('upgrade', raw.upgrades),
    obstacles: new Table('obstacle', raw.obstacles),
    drones: new Table('drone', raw.drones),
    techs: new Table('tech', raw.techs),
    skillBranches: new Table('skill branch', raw.skillBranches),
    skills: new Table('skill', raw.skills),
    relics: new Table('relic', raw.relics),
    worlds: new Table('world', raw.worlds),
    rules,
    resourceName: (id, amount) => {
      const currency = currencies.find(id);
      if (currency) return amount === 1 ? currency.singular : currency.name;
      return materials.find(id)?.name ?? id;
    },
  };
}
