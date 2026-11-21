/**
 * Content schema. Every game entity that a designer could add more of is a data entry of one of these
 * kinds, lives in `src/content/<kind>/`, and refers to other entries only by `id`.
 * `validate.ts` checks every reference; `registry.ts` turns the raw lists into lookup tables.
 */

/** Kebab-case id, unique within its kind. */
export type Id = string;

/** A quantity of a material or a currency. `id` resolves against materials or currencies. */
export interface Amount {
  id: Id;
  amount: number;
}

export type MaterialTier = 1 | 2 | 3 | 4;

/**
 * Icon silhouette a resource is drawn with (loot that flies to the base, HUD chips, the codex). The colours
 * come from the entry, so a new material reuses a silhouette; a new silhouette is art code
 * (`render/art/icons.ts`). Grouped by tier: raw, refined, mixed, parts, then the currencies.
 */
export type ResourceIcon =
  | 'nugget'
  | 'sand'
  | 'lump'
  | 'bar'
  | 'wafer'
  | 'rods'
  | 'ingot'
  | 'plate'
  | 'block'
  | 'blob'
  | 'truss'
  | 'coil'
  | 'board'
  | 'orb'
  | 'chip'
  | 'flask'
  | 'prism';

/** A small stamp on an icon, so materials of one silhouette differ by more than colour (metal bars). */
export type IconMark = 'line' | 'ring' | 'dot' | 'cross';

export interface MaterialDef {
  id: Id;
  name: string;
  /** 1 raw, 2 refined, 3 mixed, 4 parts. */
  tier: MaterialTier;
  /** Sell value in credits per unit. */
  value: number;
  /** Item colour in the world (hex): loot icons, items on belts, HUD icon. */
  color: string;
  icon: ResourceIcon;
  /** Second colour (hex) of the icon: flecks in an ore, grains in sand. Alloys show their inputs instead. */
  accent?: string;
  mark?: IconMark;
  /**
   * Tech that unlocks making it: recipes and alloys that output it stay closed until it is researched.
   * Omitted means it can be made from the start (raw materials come from veins and rubble anyway).
   */
  unlockedBy?: Id;
}

export interface CurrencyDef {
  id: Id;
  /** Plural display name ("Credits"). */
  name: string;
  /** Display name for exactly one ("Credit"). */
  singular: string;
  /** Survives a prestige reset. */
  keepsOnPrestige: boolean;
  /** Icon colour (hex) for loot and the HUD. */
  color: string;
  icon: ResourceIcon;
}

/** A numeric game stat that effects (skills, relics) modify. The simulation reads stats by id. */
export interface StatDef {
  id: Id;
  name: string;
  base: number;
  /**
   * Read once when a run starts (head start skills: drones, cleared ground, a mine, credits, vein size), so a
   * change shows from the next run on. Omitted: read live.
   */
  runStart?: boolean;
}

export interface Effect {
  stat: Id;
  op: 'add' | 'mul';
  value: number;
}

/**
 * Fixed-ratio transformation run by a building (smelter, fabricator, lab). Outputs that are currencies
 * (research) go straight to the player's resources instead of the output buffer.
 */
export interface RecipeDef {
  id: Id;
  building: Id;
  inputs: Amount[];
  outputs: Amount[];
  seconds: number;
}

/**
 * Mixer alloy. The mixer takes its inputs in a player-set ratio and makes the alloy whose `ratio` is
 * nearest, if it lies within `tolerance` (max absolute share difference); otherwise it makes `rules.slag`.
 */
export interface AlloyDef {
  id: Id;
  inputs: Id[];
  /** Shares per input, same order as `inputs`, summing to 1. */
  ratio: number[];
  tolerance: number;
  output: Id;
}

/**
 * Where a building may stand: anywhere free, on an ore vein, or only on a fixed site of the world
 * (`WorldDef.sites`, the megastructure at the map edge).
 */
export type Placement = 'free' | 'deposit' | 'site';

/** Art a building is drawn with. New buildings reuse one; a new one is art code (`render/art/buildings.ts`). */
export type BuildingArt =
  | 'lander'
  | 'mine'
  | 'smelter'
  | 'storage'
  | 'pad'
  | 'mixer'
  | 'fabricator'
  | 'pole'
  | 'generator'
  | 'solar'
  | 'lab'
  | 'skyforge'
  | 'block';

/**
 * Power runs over poles with a reach. A building with `reach` is a node of the grid
 * (base, poles, generators): it powers every consumer whose footprint comes within `reach` tiles of its own
 * (Chebyshev), and wires itself to other nodes within `link` tiles. A network shares what its generators
 * make among what its consumers use; short supply slows every consumer on it, no network stops them.
 * `use` and `make` are level-1 values and grow with the level like the working speed.
 */
export interface PowerSpec {
  /** Power units it draws once finished. */
  use?: number;
  /** Power units it makes (while it has fuel, if it needs fuel). */
  make?: number;
  /** Tiles around its footprint it powers; omitted: not a node. */
  reach?: number;
  /** Wire range in tiles: two nodes link when the gap between their footprints is at most the larger link. */
  link?: number;
  /** A fuel it burns at full load (units per second); it makes power only while it holds some. */
  fuel?: { id: Id; perSecond: number };
}

/**
 * A mixing building: one batch takes `input` units of its two inputs in the ratio the player set and makes
 * `output` units of the alloy that ratio lands on (`AlloyDef`), or slag.
 */
export interface MixSpec {
  input: number;
  output: number;
  seconds: number;
}

/** From `level` on, each level also costs these parts, times (level - from + 1). */
export interface PartsCost {
  level: number;
  cost: Amount[];
}

/** One stage of a megastructure: parts fed into it (by drones or belts), then build drones raise it. */
export interface MegaStage {
  name: string;
  /** One sentence: what rises in this stage. */
  description: string;
  /** What it consumes, delivered into the building like a machine's input. */
  needs: Amount[];
  /** Seconds one build drone needs to raise it once it is fed. */
  seconds: number;
}

/**
 * A megastructure at the map edge, fed with parts. Level 1 is its foundation,
 * built like any building; each further level is one stage, fed with `needs` and then welded. When the last
 * stage stands, prestige opens (the player may keep building).
 */
export interface MegaSpec {
  stages: MegaStage[];
}

export interface AdjacencyBonus {
  /** Neighbouring building id (any tile of it touching the footprint ring, diagonals included). */
  building: Id;
  /** Speed bonus per neighbour as a fraction, 0.1 = +10 %. */
  bonus: number;
  /** How many such neighbours count at most. */
  max: number;
}

export interface BuildingDef {
  id: Id;
  name: string;
  /** One sentence for the build menu. */
  description: string;
  footprint: { w: number; h: number };
  maxLevel: number;
  /** Cost of level 1; level L costs `cost * costGrowth^(L-1)`, each further building of the kind `countGrowth` more. */
  cost: Amount[];
  costGrowth: number;
  countGrowth: number;
  placement: Placement;
  adjacency: AdjacencyBonus[];
  /** Tech that unlocks it; omitted means available from the start. */
  unlockedBy?: Id;
  art: BuildingArt;
  /** Seconds one build drone needs for level 1; level L takes `buildSeconds * (1 + 0.5 * (L - 1))`. */
  buildSeconds: number;
  /** Speed added per level above 1: 0.25 = level 3 works at 1.5x. */
  levelBonus: number;
  /** Units per material its input and output buffers hold at level 1 (times the level). */
  buffer: number;
  /** Mines: units per second pulled from the vein under it. */
  extract?: number;
  /** Stock (base, storage): units of every material it adds to the stock capacity per level. */
  stock?: number;
  /** Landing pads: the freighter that serves it. */
  freighter?: Id;
  /** Mixers: batch size and time; what comes out is decided by the alloys data and the set ratio. */
  mix?: MixSpec;
  /** What its menu says while it works ("Smelting"); crafting buildings only. */
  verb?: string;
  /** What it sounds like while it runs, heard when the camera is near (audio/machines.ts). */
  ambience?: MachineSound;
  /** Higher levels also cost tier-4 parts (buildings cost parts). */
  partsFrom?: PartsCost;
  /** What it does with power: uses it, makes it, carries it (see PowerSpec). */
  power?: PowerSpec;
  /** A megastructure: stages fed with parts; finishing it opens prestige. `maxLevel` is stages + 1. */
  megastructure?: MegaSpec;
}

/** A conveyor belt kind. Belts are laid tile by tile; items ride on them from building to building. */
export interface BeltDef {
  id: Id;
  name: string;
  description: string;
  /** Cost per tile. */
  cost: Amount[];
  /** Tiles per second an item travels. */
  speed: number;
  /** Gap between two items in tiles (0.25 = four items per tile). */
  spacing: number;
}

/** A cargo ship that lands at a landing pad, loads the goods on it and pays for them in the primary currency. */
export interface FreighterDef {
  id: Id;
  name: string;
  /** Units one visit takes at pad level 1. */
  capacity: number;
  /** Seconds between a departure and the next approach (shorter with pad level). */
  awaySeconds: number;
  approachSeconds: number;
  /** Seconds on the pad while goods are loaded. */
  loadSeconds: number;
  departSeconds: number;
  /** Hull, accent stripe and engine glow (hex). */
  colors: { hull: string; accent: string; engine: string };
}

/** A run upgrade bought with resources: its effects apply once per level and are lost on prestige. */
export interface UpgradeDef {
  id: Id;
  name: string;
  description: string;
  maxLevel: number;
  /** Cost of level 1; level L costs `cost * costGrowth^(L-1)`. */
  cost: Amount[];
  costGrowth: number;
  /** Per level: adds are multiplied by the level, multipliers raised to it. */
  effects: Effect[];
}

/** Art shape an obstacle is drawn with. New obstacles reuse a shape with their own colours. */
export type ObstacleShape = 'boulder' | 'crystal' | 'wreck' | 'scrub' | 'monolith';

/** Sound family of an obstacle: the timbre of its plop when hit and cleared (`audio/sfx.ts`). */
export type ObstacleSound = 'stone' | 'crystal' | 'metal' | 'plant';
/** A running machine's sound: mines thump, smelters hiss, mixers and fabricators whirr, labs hum, generators burn. */
export type MachineSound = 'thump' | 'hiss' | 'whirr' | 'hum' | 'burn';

export interface LootDef {
  id: Id;
  min: number;
  max: number;
}

export interface ObstacleDef {
  id: Id;
  name: string;
  shape: ObstacleShape;
  /** Hit points; one tap deals `tap-damage`. */
  hardness: number;
  loot: LootDef[];
  /** Chance (0..1) to drop a relic when cleared. */
  relicChance: number;
  /** Main and shade colour (hex) for the art. */
  colors: [string, string];
  /** Emissive colour (hex): crystal glow, rune lines, beacon light, glowing tips. Omitted: no glow. */
  glow?: string;
  sound: ObstacleSound;
}

/** What a drone does: clear rubble (laser), build and upgrade buildings (welding), or carry crates. */
export type DroneRole = 'clearing' | 'build' | 'transport';

export interface DroneDef {
  id: Id;
  name: string;
  /** One sentence for the build menu. */
  description: string;
  role: DroneRole;
  /** Cost of the first one; each further one of this kind costs `costGrowth` times more. */
  cost: Amount[];
  costGrowth: number;
  /** Flight speed in tiles per second (times the drone-speed stat). */
  speed: number;
  /** Clearing: damage per laser pulse. Build: seconds of build work per second of welding. */
  damage: number;
  /** Seconds between laser pulses (clearing) or weld sparks (build). */
  pulseSeconds: number;
  /** Transport: units one crate holds. */
  capacity?: number;
  /** Seconds from the purchase until the drone is out of the hatch (hatch opens, lights, lift-off). */
  launchSeconds: number;
  /** How far from the target's tile centre the drone hovers while lasering, in tiles. */
  standoff: number;
  /** Body, accent stripe, and the eye/laser colour (hex). */
  colors: { body: string; accent: string; beam: string };
  /** Tech that unlocks buying it; omitted means it can be bought from the start. */
  unlockedBy?: Id;
}

/**
 * A glyph for a tech whose only effect is a stat change (techs that unlock something show that thing's own
 * art instead). Drawn in `ui/components/Icon.tsx`.
 */
export type TechGlyph = 'gear' | 'bolt' | 'rotor' | 'beam' | 'survey' | 'pick' | 'flame' | 'lander';

/**
 * A node of the research tree. What it unlocks is not listed here: buildings, drones, materials and
 * regions name the tech that opens them (`unlockedBy`), so each unlock has exactly one source of truth.
 */
export interface TechDef {
  id: Id;
  name: string;
  /** One sentence for the tree's detail view. */
  description: string;
  /** Cost in research points. */
  cost: number;
  requires: Id[];
  /** Stat changes that apply once it is researched. */
  effects?: Effect[];
  /** Icon when it unlocks nothing (effects only). */
  glyph?: TechGlyph;
}

/** A branch of the skill tree (Mining, Drones, Crafting, Power, Clearing, Start). */
export interface SkillBranchDef {
  id: Id;
  name: string;
  /** One sentence for the branch's tab. */
  description: string;
  glyph: TechGlyph;
}

/** A permanent skill bought with the prestige currency; it survives every prestige. */
export interface SkillDef {
  id: Id;
  name: string;
  branch: Id;
  /** One sentence for the detail view. */
  description: string;
  /** Cost in the prestige currency. */
  cost: number;
  requires: Id[];
  effects: Effect[];
}

export type Rarity = 'common' | 'rare' | 'legendary';

/** Relic art: one silhouette per shape, coloured per relic (`render/art/relics.ts`). */
export type RelicShape = 'lens' | 'shard' | 'beacon' | 'seed' | 'tablet' | 'cog';

/** A rare find from clearing rubble: kept forever (through every prestige), each one a permanent bonus. */
export interface RelicDef {
  id: Id;
  name: string;
  description: string;
  rarity: Rarity;
  effects: Effect[];
  shape: RelicShape;
  /** Main colour (hex) of its art. */
  color: string;
}

export interface WeightedId {
  id: Id;
  weight: number;
}

export interface DepositSpec {
  material: Id;
  weight: number;
  /** Units per vein, inclusive range. */
  richness: [number, number];
  /** Start area only: veins of this kind every run gets for sure (default 1), before the weighted picks. */
  guaranteed?: number;
}

/** A tile rectangle (inclusive of x..x+w-1, y..y+h-1). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A part of the map under fog at the start of a run (the areas beyond the start lie in fog). Nothing in it
 * can be cleared, built on or seen clearly until it opens: by paying `cost`, or by researching
 * `unlockedBy`. Its own deposits (new kinds of ore) are placed only inside it.
 */
export interface RegionDef {
  id: Id;
  name: string;
  /** One sentence for its card. */
  description: string;
  rects: TileRect[];
  /** Opens for this price (exactly one of cost and unlockedBy). */
  cost?: Amount[];
  /** Opens when this tech is researched. */
  unlockedBy?: Id;
  depositCount: number;
  deposits: DepositSpec[];
}

export interface WorldPalette {
  /** Canvas clear colour behind the map. */
  void: string;
  /** Sky gradient from the zenith to the horizon glow, and the haze where the ground meets it. */
  sky: { top: string; mid: string; horizon: string; haze: string };
  /** Warm key light (rim lights, sparks, dust motes). */
  light: string;
  /** Cool shadow tint (contact shadows, shaded faces). */
  shadow: string;
  /** Lighter dusty tone painted around the landing base. */
  dust: string;
  /** Ground tile tones, picked per tile. */
  ground: string[];
  /** Lit edge on the top faces of tiles. */
  groundEdge: string;
  /** Side faces of the map slab. */
  groundSide: string;
  /** Technology accent (base lights, selection). */
  tech: string;
  /** Fog over regions not yet opened: the veil on the ground and the mist banks over it. */
  fog: { veil: string; mist: string };
}

/** Musical key of a world: every plop and chime is a note of this scale. */
export interface SoundKey {
  /** Frequency of the scale's root note in Hz. */
  rootHz: number;
  /** Scale steps in semitones above the root, ascending, within one octave. */
  scale: number[];
}

/** A fixed spot on a world for a building with `placement: 'site'`: its footprint's top-left tile. */
export interface SiteDef {
  building: Id;
  x: number;
  y: number;
}

export interface WorldDef {
  id: Id;
  name: string;
  size: { w: number; h: number };
  /** Tiles around the base (Chebyshev radius) that start clear. */
  startClearRadius: number;
  /** Chance (0..1) that a tile outside the clearing holds an obstacle. */
  obstacleDensity: number;
  /** Kinds and weights; `scatter` kinds ignore the patches (single landmarks such as monoliths). */
  obstacles: (WeightedId & { scatter?: boolean })[];
  /**
   * Patch size of obstacle kinds in tiles: kinds grow in fields (a crystal field, a scrub patch) instead of
   * salt-and-pepper. 0 picks each tile independently.
   */
  obstacleClusters: number;
  /** Obstacles placed in the first two rings around the clearing, so the first view shows each of them. */
  showcase: Id[];
  /** Veins in the open start area; the first one of each kind in `deposits` is always placed. */
  depositCount: number;
  deposits: DepositSpec[];
  /** Fogged parts of the map, opened during a run. Tiles outside every region are the start area. */
  regions: RegionDef[];
  /** Fixed building spots (the megastructure's foundation ring); kept free of rubble and veins. */
  sites: SiteDef[];
  palette: WorldPalette;
  sound: SoundKey;
}

/** Global numbers that are data, not code. Exactly one entry. */
export interface RulesDef {
  id: Id;
  startWorld: Id;
  /** Building placed at the map centre at run start. */
  baseBuilding: Id;
  /** Material made when a mix misses every alloy. */
  slag: Id;
  prestigeCurrency: Id;
  /** Yield bonus per prestige, multiplicative: 0.2 = +20 % per prestige (clearing loot and mines). */
  prestigeYieldBonus: number;
  /**
   * Prestige currency a launch pays: `base` for the finished megastructure plus one per `creditsPerPrism`
   * credits freighters paid this run, all times the prism-yield stat.
   */
  prestigeReward: { base: number; creditsPerPrism: number };
  startResources: Amount[];
  /** The currency the resource bar always shows. */
  primaryCurrency: Id;
  /** Relative weights when a relic drops. */
  relicRarityWeights: Record<Rarity, number>;
  /** The menu dock appears once the player owns this many drones; before that only resources show. */
  menuAfterDrones: number;
  /** Drones that start parked in the base (they wait in the hatch until there is work). */
  startDrones: Amount[];
  /** Materials of this tier and up are on the freighter sell list at the start of a run. */
  sellFromTier: MaterialTier;
  /** Transport drones leave this many units of each material up to `stockReserveUpToTier` in stock (for building costs). */
  stockReserve: number;
  /** Materials above this tier (parts) have no flat reserve: they go on to machines and the megastructure. */
  stockReserveUpToTier: MaterialTier;
  /**
   * Drones also keep enough of each material for the next building of every kind the player can place (its
   * price grows with each one built), but never more than this share of the stock's capacity.
   */
  stockReserveCap: number;
  /**
   * The HUD's next-step suggestion: the first of these buildings the player has none of yet (and has a
   * spot for) shows over the world with a Place button, once the menu is open.
   */
  guide: Id[];
}

/** Everything in `src/content/`, as raw lists. */
export interface RawContent {
  materials: MaterialDef[];
  currencies: CurrencyDef[];
  stats: StatDef[];
  recipes: RecipeDef[];
  alloys: AlloyDef[];
  buildings: BuildingDef[];
  belts: BeltDef[];
  freighters: FreighterDef[];
  upgrades: UpgradeDef[];
  obstacles: ObstacleDef[];
  drones: DroneDef[];
  techs: TechDef[];
  skillBranches: SkillBranchDef[];
  skills: SkillDef[];
  relics: RelicDef[];
  worlds: WorldDef[];
  rules: RulesDef[];
}

export type ContentKind = keyof RawContent;
