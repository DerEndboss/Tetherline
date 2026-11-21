import type { FloorDef } from '../../content/types';

/**
 * Ore field art (docs/art.md, category `ores`): every ore floor (a floor with `ore`, sand and the scrap heap
 * included) has ORE_VARIANTS pre-rendered tile sprites `field-<floor id>-<v>`, a cluster of low-poly ore chunks
 * that fills one tile. Pure ids, shared by the 3D models (art3d/ores/) and the ore layer (ores-layer.ts).
 */

export const ORE_VARIANTS = 4;

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
 * Ridge rock (unbuildable `map.ridge` tiles): RIDGE_VARIANTS tile-filling rock blocks `ridge-<v>` in the same
 * category, rendered in a light neutral grey; the ore layer tints them with the theme's ridge colour.
 */
export const RIDGE_VARIANTS = 4;

export const ridgeId = (variant: number): string => `ridge-${variant}`;

export const ridgeIds = (): string[] => Array.from({ length: RIDGE_VARIANTS }, (_, v) => ridgeId(v));
