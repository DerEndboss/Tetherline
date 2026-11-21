/**
 * The content schema (content is data). Every kind is a typed list in its own file;
 * `index.ts` gathers them, `registry.ts` makes lookups, `validate.ts` checks every reference. Code reads
 * behaviour from `BuildingDef.behaviour` (a fixed set of code paths) and every number from data: never switch
 * on a building or material id.
 */
import type { MachineSound, SoundKey } from '../audio/types';

export type Id = string;

/** An amount of an item (material). */
export interface Stack {
  item: Id;
  n: number;
}

/** An amount of a liquid, in liquid units (per craft, or per second for continuous use). */
export interface LiquidStack {
  liquid: Id;
  n: number;
  /** Outputs only: a by-product. Whatever no pipe takes is vented instead of stalling the machine. */
  vent?: boolean;
}

/* ---------- Materials and liquids ---------- */

export type MaterialKind = 'raw' | 'processed' | 'part';

export interface MaterialDef {
  id: Id;
  name: string;
  kind: MaterialKind;
  /** 1 = raw ore ... 4 = top parts; orders, the meta tree and UI sorting use it. */
  tier: number;
  /** Main colour (#rrggbb): belt item fallback, UI chips. */
  color: string;
  /** Second colour for stamps, stripes and flecks. */
  accent?: string;
  /** Sprite id of its icon (pre-rendered 3D art); the UI falls back to a coloured chip. */
  icon: string;
  /** Burn value: seconds of a combustion generator per item (only fuels have it). */
  fuel?: number;
}

export interface LiquidDef {
  id: Id;
  name: string;
  /** Pumped from the map (water, oil, slag) or made by a machine (coolant, fuel). */
  natural: boolean;
  color: string;
  /** Flame value: seconds of an oil/fuel generator per 10 units (only fuels have it). */
  fuel?: number;
  /** Hot liquids (slag) glow in pipes. */
  hot?: boolean;
}

/* ---------- Map ---------- */

/**
 * A floor kind under the ground layer: ore tiles (drills mine them), liquid tiles (pumps draw from them, nothing
 * else may stand there), slag fields, plain decorative floors. One byte per tile in `MapState.floor`.
 */
export interface FloorDef {
  id: Id;
  name: string;
  /** Material a drill mines here. */
  ore?: Id;
  /** Liquid a pump draws here. */
  liquid?: Id;
  /** Deep liquid: only pumps (and bridges over it) may be placed. */
  deep?: boolean;
  /** Drill tier needed to mine it (1 = mechanical drill). */
  hardness?: number;
  color: string;
}

/** Colours of a world theme (the painted ground, sky, slab, light). Buildings look the same on every theme. */
export interface ThemePalette {
  void: string;
  sky: { top: string; mid: string; horizon: string; haze: string };
  light: string;
  shadow: string;
  /** Lighter dusty tone painted around the core. */
  dust: string;
  /** Ground tones, picked per tile (MapState.ground holds an index into this list). */
  ground: string[];
  groundEdge: string;
  groundSide: string;
  /** Technology accent (lights, selection). */
  tech: string;
  /** Liquid floor tints (water/oil/slag look per theme), by liquid id; missing ones use the liquid's colour. */
  liquids?: Record<Id, string>;
  /** Ridge (unbuildable rock) tone. */
  ridge: string;
}

/** A world theme: Rust Desert, Green Meadow, Ice & Snow. */
export interface ThemeDef {
  id: Id;
  name: string;
  palette: ThemePalette;
  /** Sprite ids of the dust boulders on this theme (variants), drawn on the boulder layer. */
  boulders: Id[];
  sound: SoundKey;
}

/** A map size choice: S/M/L. */
export interface MapSizeDef {
  id: Id;
  name: string;
  /** Landmass diameter in tiles (the map array is a little bigger). */
  diameter: number;
  /** Number of land pieces the generator joins (organic shape). */
  pieces: number;
  /** Narrowest land bridge in tiles (playable: drones and belts get through). */
  minWidth: number;
}

/** Effects a map property applies to the whole run. Multipliers default to 1. */
export interface MapEffects {
  solar?: number;
  wind?: number;
  /** Drill speed multiplier. */
  drill?: number;
  /** Extra slag fields (0..1 density boost). */
  slagFields?: number;
}

/** Seeded map properties (Dusty, Windy, Geothermal ...): a run rolls a few. */
export interface MapPropertyDef {
  id: Id;
  name: string;
  description: string;
  /** Relative chance to be rolled. */
  weight: number;
  effects: MapEffects;
}

/** How often a resource appears on a map: the generator rolls these per seed (not everything everywhere). */
export interface ResourceSpawnDef {
  /** Floor id (ore or liquid floor). */
  floor: Id;
  /** Chance (0..1) that a map has it at all; 1 = always (start resources). */
  chance: number;
  /** Patches per 10,000 land tiles. */
  density: number;
  /** Patch radius range in tiles. */
  radius: [number, number];
  /** Guaranteed within this many tiles of the core (start resources). */
  nearStart?: number;
  /** Only on these world themes (world ores: Emberite, Verdite, Frostine); all themes when absent. */
  themes?: Id[];
  /** Patches keep at least this many tiles away from the core (rare ores far away). */
  minDistance?: number;
  /**
   * A round cannot be won without it: every map gets at least one patch of each group named here (when none of
   * the group was rolled, its most common member). Lead and tin share a group: circuits take either.
   */
  needed?: string;
}

/* ---------- Buildings ---------- */

export type BuildCategory = 'core' | 'mining' | 'logistics' | 'power' | 'factories' | 'liquids' | 'mega';

/**
 * The code path a building runs. Adding a behaviour is a code change in `src/sim/blocks/`; adding a building
 * of an existing behaviour is data only.
 */
export type Behaviour =
  | 'core'
  | 'storage'
  | 'drill'
  | 'pump'
  | 'conveyor'
  | 'junction'
  | 'router'
  | 'sorter'
  | 'overflow'
  | 'bridge'
  | 'unloader'
  | 'mass-driver'
  | 'crafter'
  | 'generator'
  | 'solar'
  | 'battery'
  | 'power-node'
  | 'conduit'
  | 'liquid-junction'
  | 'liquid-router'
  | 'tank'
  | 'liquid-bridge'
  | 'mega';

export interface PowerSpec {
  /** Units used per second while working (consumers). */
  use?: number;
  /** Units made per second (generators at full burn, solar at 100 % light, the core). */
  make?: number;
  /** Units stored (batteries). */
  store?: number;
  /** Laser link range in tiles (power nodes), from footprint edge to footprint edge. */
  laserRange?: number;
  /** Most laser links a node holds. */
  maxLinks?: number;
}

export interface DrillSpec {
  /** Highest floor hardness it can mine. */
  tier: number;
  /** Seconds per item when every tile under it is ore. */
  seconds: number;
  /** Optional liquid boost (water): speed multiplier while supplied. */
  boost?: { liquid: Id; perSecond: number; factor: number };
}

export interface PumpSpec {
  /** Liquid units per second per liquid tile under it. */
  perTile: number;
  /** Ground pump: draws `liquid` from any ground (no liquid floor needed). */
  anywhere?: Id;
}

export interface ConveyorSpec {
  /** Tiles per second an item moves. */
  speed: number;
}

export interface BridgeSpec {
  /** Furthest partner in tiles along a straight line. */
  range: number;
  /** Items (or liquid units) per second it moves. */
  rate: number;
}

export interface StorageSpec {
  /** Items per material it holds (the core's per-material capacity; containers add theirs when docked). */
  capacity: number;
}

export interface CoreSpec {
  /** Next stage of the core (upgraded in place, costs come from that building's cost). */
  next?: Id;
  /** Build speed multiplier of the player's drone near this core. */
  buildSpeed: number;
}

export interface GeneratorSpec {
  /** Burns items with a `fuel` value (combustion) ... */
  items?: boolean;
  /** ... or a liquid with a `fuel` value (oil generator) ... */
  liquid?: Id;
  /** ... and these further liquids with a `fuel` value (fuel, gas). */
  liquids?: Id[];
  /** Burn seconds per item for this generator only (overrides `MaterialDef.fuel`; only listed items burn). */
  burn?: Record<Id, number>;
  /** Needs a liquid while burning (fusion reactor); without it the burn stops and the fuel in the fire is lost. */
  coolant?: { liquid: Id; perSecond: number };
  /** Wind turbine: makes power scaled by the map's wind. */
  wind?: boolean;
}

/** Liquid handling of a building: buffer size, and what it pulls or pushes. */
export interface LiquidSpec {
  /** Units it holds. */
  capacity: number;
  /** Units per second it can move (conduits). */
  flow?: number;
}

/**
 * Art of a building (docs/art.md). The real sprite id is always `building-<id>` (see `buildingSpriteId`), with
 * construction handled by the renderer (holographic, bottom-up) and rotations as `building-<id>-r<0..3>` when the
 * art has them. Until it exists, `placeholder` (an existing sprite id) is drawn scaled to the
 * footprint, and without one a plain block.
 */
export interface BuildingArt {
  placeholder?: Id;
  /** A running machine's sound. */
  sound?: MachineSound;
  /** Glow colour of the work light while running (#rrggbb); default the theme's tech colour. */
  glow?: string;
}

export interface BuildingDef {
  id: Id;
  name: string;
  description: string;
  category: BuildCategory;
  behaviour: Behaviour;
  /** Square footprint edge in tiles (1..6). */
  size: number;
  /** Materials consumed while the drone builds it. */
  cost: Stack[];
  /** Seconds of building at drone speed 1. */
  buildSeconds: number;
  /** Order in the palette tab. */
  order: number;
  /** Placeable rotations matter (outputs face a side). */
  rotates?: boolean;
  /** How it becomes available: from the start, from the meta tree, from an order, or from a wreck blueprint. */
  unlock: 'start' | 'meta' | 'order' | 'wreck';
  power?: PowerSpec;
  liquid?: LiquidSpec;
  /** Items it holds per material (crafter buffers, storage). */
  items?: number;
  drill?: DrillSpec;
  pump?: PumpSpec;
  conveyor?: ConveyorSpec;
  bridge?: BridgeSpec;
  storage?: StorageSpec;
  core?: CoreSpec;
  generator?: GeneratorSpec;
  /** Items per second it moves on its own (unloader). */
  throughput?: number;
  /** Crafters: recipe ids it can run (the first is the default; the player picks among them). */
  recipes?: Id[];
  /** Mega builds in stages: the recipes run once each, in order (`config` counts the finished ones). */
  stages?: boolean;
  art: BuildingArt;
}

/** A fixed recipe of a crafter. */
export interface RecipeDef {
  id: Id;
  name: string;
  inputs: Stack[];
  outputs: Stack[];
  /** Liquids used per craft. */
  liquidIn?: LiquidStack[];
  /** Liquids made per craft. */
  liquidOut?: LiquidStack[];
  seconds: number;
}

/* ---------- Progression ---------- */

export type OrderGoal =
  | { kind: 'deliver'; item: Id; n: number }
  | { kind: 'rate'; item: Id; perMinute: number; minutes: number }
  | { kind: 'build'; building: Id; n: number }
  /** `n` made in this run in all (a staged megastructure's segments). */
  | { kind: 'make'; item: Id; n: number };

/** One order of the story chain (Chill mode). */
export interface OrderDef {
  id: Id;
  title: string;
  /** Short radio line shown when it starts. */
  radio: string;
  goal: OrderGoal;
  /** Orders that must be done first (the chain). */
  after: Id[];
  /** Buildings it unlocks for this run when done. */
  unlocks?: Id[];
  /** Part of the tutorial: the UI points at the thing to do. */
  tutorial?: { hint: string; highlight?: Id };
}

export type MetaEffect = { kind: 'unlock'; building: Id } | { kind: 'start-items'; items: Stack[] } | { kind: 'bonus'; stat: MetaStat; value: number };

/** Run-wide bonuses the meta tree can grant. */
export type MetaStat = 'build-speed' | 'drill-speed' | 'core-capacity' | 'belt-speed' | 'power';

export interface MetaNodeDef {
  id: Id;
  name: string;
  description: string;
  cost: number;
  requires: Id[];
  effect: MetaEffect;
  icon?: Id;
}

/* ---------- Rules ---------- */

export interface RulesDef {
  /** The core placed at the start. */
  startCore: Id;
  startItems: Stack[];
  defaultTheme: Id;
  defaultSize: Id;
  /** Player drone: tiles per second, build range in tiles, build speed multiplier. */
  drone: { speed: number; range: number; buildSpeed: number };
  /** Items per belt tile (visible slots; items are big). */
  beltSlots: number;
  /** Map properties rolled per run. */
  mapProperties: [number, number];
  /** Meta currency name (UI). */
  metaCurrency: string;
}

export interface RawContent {
  materials: MaterialDef[];
  liquids: LiquidDef[];
  floors: FloorDef[];
  buildings: BuildingDef[];
  recipes: RecipeDef[];
  orders: OrderDef[];
  meta: MetaNodeDef[];
  themes: ThemeDef[];
  sizes: MapSizeDef[];
  mapProperties: MapPropertyDef[];
  spawns: ResourceSpawnDef[];
  rules: RulesDef;
}
