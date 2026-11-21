import type { FloorDef } from '../../content/types';

/**
 * Ore field art (docs/art.md, category `ores`): every ore floor (a floor with `ore`, sand and the scrap heap
 * included) has ORE_VARIANTS pre-rendered pieces `field-<floor id>-<v>`. A piece is a small cluster of the ore's
 * low-poly chunks, NOT a tile: the ore layer lays up to three of them per tile at hashed spots, so a field is a
 * mat of overlapping clusters with no tile grid in it (v < ORE_SCATTER are the everyday clusters, the last is
 * the big outcrop of a rich middle). Pure ids, shared by the 3D models (art3d/ores/) and the ore layer
 * (ores-layer.ts).
 */

export const ORE_SCATTER = 6;
export const ORE_OUTCROPS = 1;
export const ORE_VARIANTS = ORE_SCATTER + ORE_OUTCROPS;

export const oreFieldId = (floor: string, variant: number): string => `field-${floor}-${variant}`;

/** The floors that are ore fields. */
export function oreFloors(floors: readonly FloorDef[]): FloorDef[] {
  return floors.filter((f) => !!f.ore);
}

/** Every sprite id of the category. */
export function oreFieldIds(floors: readonly FloorDef[]): string[] {
  return oreFloors(floors).flatMap((f) => Array.from({ length: ORE_VARIANTS }, (_, v) => oreFieldId(f.id, v)));
}

/**
 * Ridge rock (unbuildable `map.ridge` tiles) is built from two kinds of piece, rendered in a light neutral grey
 * that the ore layer tints with the theme's ridge colour. A massif has no seams because no piece is a block:
 *  - `ridge-top-<mask>-<v>`: one tile as a faceted sheet whose edge height is the same in every variant, so any
 *    two neighbours join without a gap. `mask` says which edges face open ground, and only east (1) and south (2)
 *    are ever seen by a camera: 0 none, 1 east, 2 south, 3 both. Those carry the cliff, rubble at its foot and
 *    stones on its rim (RIDGE_TOPS variants per mask);
 *  - `ridge-rock-<v>`: boulders that sit on top and cross tile borders, small to large, slabs and spires, and the
 *    two low mounds (RIDGE_ROCKS).
 */
export const RIDGE_MASKS = 4;
export const RIDGE_TOPS = 5;
export const RIDGE_ROCKS = 10;

/** The cliff bits of a tile's `mask`. */
export const CLIFF_EAST = 1;
export const CLIFF_SOUTH = 2;

export const ridgeTopId = (mask: number, variant: number): string => `ridge-top-${mask}-${variant}`;
export const ridgeRockId = (variant: number): string => `ridge-rock-${variant}`;

const count = (n: number): number[] => Array.from({ length: n }, (_, v) => v);

/** Every ridge sprite id. */
export function ridgeIds(): string[] {
  return [...count(RIDGE_MASKS).flatMap((m) => count(RIDGE_TOPS).map((v) => ridgeTopId(m, v))), ...count(RIDGE_ROCKS).map(ridgeRockId)];
}

/** Height of the ridge's top above the ground, in tile units (the models and the layer agree on it). */
export const RIDGE_HEIGHT = 0.28;
