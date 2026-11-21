import type { ContentRegistry } from '../content/registry';
import type { WorldDef } from '../content/types';
import { buildingStartSprites, hatchSprite, scaffoldSprite, siteMarkSprite } from './buildings';
import { crateSprite, freighterShadowSprite, freighterSprite } from './cargo';
import { droneShadowSprite, droneSprites } from './drone';
import { fxSprites } from './fx';
import { decalSprites, depositSprite, veinSprite } from './ground';
import { resourceIcon } from './icons';
import { obstacleSprites } from './obstacles';
import { craftingSprites } from './printing';
import type { SpriteArt } from './svg';

export { BUILD_STAGES, buildingId, buildingSprite, buildingStageId, buildingStageSprite, growthId, growthSprite, grows, hatchId, scaffoldId, scaffoldSprite, siteMarkId } from './buildings';
export { CRATE, FREIGHTER_SHADOW, freighterId } from './cargo';
export { DRONE_FRAMES, DRONE_SHADOW, droneId } from './drone';
export { FX, MIST_VARIANTS, SHARD_VARIANTS } from './fx';
export { DECAL_VARIANTS, decalId, depositId, veinId } from './ground';
export { ICON_SIZE, iconId, iconLook, iconSprite, resourceIcon } from './icons';
export { obstacleGlowId, obstacleId, OBSTACLE_VARIANTS, SHAPE_REACH } from './obstacles';
export { FAB, VAT, HOPPERS } from './crafting';
export { HEAD_LIFT, PRINT_BRIDGE, PRINT_HEAD, PRINT_STAGES, printId, printSprites, printStageSprite, SWIRL_FRAMES, swirlId, VAT_SHAFT, VAT_SURFACE } from './printing';
export type { Pt, SpriteArt, SpriteLight, SpriteMeta } from './svg';

/** Every resource (material or currency) as an icon sprite, from content. */
export function resourceIcons(content: ContentRegistry): SpriteArt[] {
  return [
    ...content.currencies.list.map((c) => resourceIcon(content, c.id)),
    ...content.materials.list.map((m) => resourceIcon(content, m.id)),
  ];
}

/** Height of the upgrade scaffold around a footprint (world px). */
export const scaffoldHeight = (fp: { w: number; h: number }): number => 64 + (fp.w + fp.h) * 6;

/** One upgrade scaffold per footprint size in use. */
function scaffolds(content: ContentRegistry, palette: WorldDef['palette']): SpriteArt[] {
  const sizes = new Map<string, { w: number; h: number }>();
  for (const b of content.buildings.list) sizes.set(`${b.footprint.w}x${b.footprint.h}`, b.footprint);
  return [...sizes.values()].map((fp) => scaffoldSprite(fp, palette, scaffoldHeight(fp)));
}

/** Sprites the renderer bakes on first use instead of at start: construction stages and upgrade scaffolds. */
export const isLazySprite = (id: string): boolean => id.startsWith('scaffold-') || /^building-.+-stage-\d+$/.test(id);

/** The sprites baked at start: every world sprite except the ones baked on first use (`isLazySprite`). */
export function startSprites(content: ContentRegistry, world: WorldDef): SpriteArt[] {
  return worldSprites(content, world).filter((s) => !isLazySprite(s.id));
}

/** Every sprite one world needs, generated from content. New content entries get sprites automatically. */
export function worldSprites(content: ContentRegistry, world: WorldDef): SpriteArt[] {
  const { palette } = world;
  const kinds = [...world.deposits, ...world.regions.flatMap((r) => r.deposits)].map((d) => d.material);
  const veins = [...new Set(kinds)].flatMap((m) => {
    const color = content.materials.get(m).color;
    return [depositSprite(m, color, palette), veinSprite(m, color, palette)];
  });
  return [
    ...decalSprites(palette),
    ...veins,
    ...content.obstacles.list.flatMap((o) => obstacleSprites(o, palette)),
    ...content.buildings.list.flatMap((b) => buildingStartSprites(b, palette)),
    ...scaffolds(content, palette),
    ...world.sites.map((s) => siteMarkSprite(content.buildings.get(s.building), palette)),
    crateSprite(palette),
    ...content.freighters.list.map((f) => freighterSprite(f, palette).sprite),
    freighterShadowSprite(palette),
    hatchSprite('l', palette),
    hatchSprite('r', palette),
    ...content.drones.list.flatMap((d) => droneSprites(d, palette)),
    droneShadowSprite(palette),
    ...fxSprites(palette),
    ...craftingSprites(palette),
    ...resourceIcons(content),
  ];
}
