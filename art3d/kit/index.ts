/**
 * The 3D art kit: everything a category file needs. Read docs/art.md first.
 *
 *   import { at, bevelBox, frames, MAT, plan, sprite } from '../kit';
 *   plan(ownedIds('production'));
 *   sprite({ id: 'building-mine-1', build: (k) => mine(k, 1) });
 */
export * from './iso';
export * from './palette';
export * from './shapes';
export { CATEGORIES, frames, Kit, plan, sprite, type Category, type FixedBox, type SpriteSpec } from './registry';
export * from './v2';
export { ownedIds, buildingIds, branchIconId, skillIconId, techIconId } from './ownership';
export { KEY_DIR, RIM_DIR } from './rig';
export { building, clipAt, scaffoldModel, scaffoldSprite, STAGE_CUTS, topOf, type BuildingModel, type BuildingParts } from './building';
export { WORLD_SCALE, ICON_SCALE } from './render';
export { breathe, LOOP_FPS, loopIds, loopT, stamp, workBaseId, workFrameId, workLoop, type LoopRef } from './loop';
export { rand, range as between, hash2 } from '../../src/legacy/art/rand';
