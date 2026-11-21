import { content } from '../../src/legacy/content';
import type { BuildingArt } from '../../src/legacy/content/types';
import { BUILD_STAGES, buildingId, buildingStageId, growthId, siteMarkId } from '../../src/legacy/art/buildings';
import { DRONE_FRAMES, droneId } from '../../src/legacy/art/drone';
import { FX, MIST_VARIANTS, SHARD_VARIANTS } from '../../src/legacy/art/fx';
import { DECAL_VARIANTS, decalId } from '../../src/legacy/art/ground';
import { iconId } from '../../src/legacy/art/icons';
import { obstacleGlowId, obstacleId, OBSTACLE_VARIANTS } from '../../src/legacy/art/obstacles';
import { PRINT_BRIDGE, PRINT_HEAD, PRINT_STAGES, printables, printId, SWIRL_FRAMES, swirlId, VAT_SHAFT, VAT_SURFACE } from '../../src/legacy/art/printing';
import { relicId } from '../../src/legacy/art/relics';
import { content as v2 } from '../../src/content';
import type { BuildCategory } from '../../src/content/types';
import type { Category } from './registry';

/**
 * Who owns which sprite id: the file ownership map of docs/art.md as code. Every list is derived from the
 * content, so a new building, material or relic shows up in its category's plan automatically. A test checks
 * that every sprite the game bakes is owned by exactly one category (or kept as SVG on purpose).
 */

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Building art kinds per category. */
const ART_OWNER: Record<BuildingArt, Category> = {
  lander: 'base',
  storage: 'base',
  pad: 'base',
  block: 'base',
  mine: 'production',
  smelter: 'production',
  mixer: 'production',
  fabricator: 'production',
  pole: 'power',
  generator: 'power',
  solar: 'power',
  lab: 'power',
  skyforge: 'power',
};

/** Every sprite of one building kind: its levels, construction stages and (for growing art) growth stages. */
export function buildingIds(kind: string): string[] {
  const def = content.buildings.get(kind);
  const levels = range(def.maxLevel).map((i) => buildingId(kind, i + 1));
  const stages = range(BUILD_STAGES).map((s) => buildingStageId(kind, s));
  const grow = def.megastructure ? range(def.maxLevel - 1).flatMap((i) => range(BUILD_STAGES).map((s) => growthId(kind, i + 2, s))) : [];
  const site = content.worlds.list.some((w) => w.sites.some((s) => s.building === kind)) ? [siteMarkId(kind)] : [];
  return [...levels, ...stages, ...grow, ...site];
}

function buildingsOf(category: Category): string[] {
  return content.buildings.list.filter((b) => ART_OWNER[b.art] === category).flatMap((b) => buildingIds(b.id));
}

function obstacleIds(): string[] {
  return content.obstacles.list.flatMap((o) =>
    range(OBSTACLE_VARIANTS).flatMap((v) => [obstacleId(o.id, v), ...(o.glow ? [obstacleGlowId(o.id, v)] : [])]),
  );
}

function printIds(): string[] {
  const parts = printables(content).flatMap((id) => range(PRINT_STAGES).map((s) => printId(id, s)));
  return [...parts, PRINT_BRIDGE, PRINT_HEAD, VAT_SURFACE, VAT_SHAFT, ...range(SWIRL_FRAMES).map(swirlId)];
}

/** UI icon ids that are not world sprites: techs, skill branches and (optional) single skills. */
export const techIconId = (id: string): string => `tech-${id}`;
export const branchIconId = (id: string): string => `skill-branch-${id}`;
export const skillIconId = (id: string): string => `skill-${id}`;

function iconIds(): string[] {
  return [
    ...content.currencies.list.map((c) => iconId(c.id)),
    ...content.materials.list.map((m) => iconId(m.id)),
    ...content.relics.list.map((r) => relicId(r.id)),
    ...content.techs.list.map((t) => techIconId(t.id)),
    ...content.skillBranches.list.map((b) => branchIconId(b.id)),
    ...content.skills.list.map((s) => skillIconId(s.id)),
    FX.noPower,
  ];
}

/**
 * v2 (docs/architecture.md): a building's sprite is `building-<id>`, owned by the art category of its palette
 * category; every material's `icon` belongs to icons. Rotations (`-r0..3`) and other extra ids of a model are
 * planned by the category itself.
 */
const V2_OWNER: Record<BuildCategory, Category> = {
  core: 'base',
  mining: 'mining',
  logistics: 'logistics',
  power: 'power',
  factories: 'factories',
  liquids: 'liquids',
  mega: 'mega',
};

export function v2BuildingIds(category: Category): string[] {
  return v2.buildings.list.filter((b) => V2_OWNER[b.category] === category).map((b) => `building-${b.id}`);
}

function v2Icons(): string[] {
  return v2.materials.list.map((m) => m.icon);
}

const OWNED: Record<Category, () => string[]> = {
  // v2: the core stages, container and vault; the v1 depot stays as a placeholder until no content names it
  base: () => [...v2BuildingIds('base'), buildingId('storage', 1)],
  production: () => [...buildingsOf('production'), ...printIds()],
  power: () => v2BuildingIds('power'),
  logistics: () => v2BuildingIds('logistics'),
  liquids: () => v2BuildingIds('liquids'),
  mining: () => v2BuildingIds('mining'),
  factories: () => v2BuildingIds('factories'),
  mega: () => v2BuildingIds('mega'),
  // v2 has one drone kind (the build drone, two rotor frames); freighters and crates are gone
  units: () => range(DRONE_FRAMES).map((f) => droneId('build-drone', f)),
  nature: () => [...obstacleIds(), ...range(SHARD_VARIANTS).map(FX.shard), FX.leaf],
  icons: () => [...new Set([...iconIds(), ...v2Icons()])],
  terrain: () => [...range(DECAL_VARIANTS).map(decalId), FX.planet, FX.moon, ...range(MIST_VARIANTS).map(FX.mist)],
};

/** The sprite ids a category owns, from the content. */
export function ownedIds(category: Category): string[] {
  return OWNED[category]();
}

/** Effect textures that stay procedural SVG on purpose (tinted white shapes; nothing to model). */
export const KEEP_SVG: readonly string[] = [FX.glow, FX.spark, FX.puff, FX.ring, FX.star, FX.mote, FX.arrow, FX.beam];
