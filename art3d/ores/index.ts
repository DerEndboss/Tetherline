import { PointLight, type Object3D } from 'three';
import { content } from '../../src/content';
import { ORE_VARIANTS, oreFieldId, oreFloors } from '../../src/render/world/ore-art';
import { at, group, lightPool, plan, rand, rock, sprite, turn } from '../kit';
import { isOutcrop, layout, OUTCROP_REACH, SCATTER_REACH, type Part } from './layout';
import { lookOf, type Look } from './looks';
import { activeStyle } from './style';
import './ridges';

/**
 * Ore fields (docs/art.md, category `ores`): for every ore floor ORE_VARIANTS pieces `field-<floor id>-<v>`,
 * each a small cluster of the ore's own low-poly chunks (a few lumps, crystals and grit; sand adds a rippled
 * sheet). A piece is about a third of a tile wide: the ore layer (src/render/world/ores-layer.ts) lays up to
 * three per tile at hashed spots, so pieces overlap across tile borders and a field is a mat of clusters with
 * no tile grid in it. Not in the start atlas: the layer loads public/art/ores/manifest.json itself and bakes
 * only the ores a map has. Never mirrored (light from the left); variety comes from the variants, the spots
 * and a scale per piece in the game.
 */

/** Output px per world px: ground detail, under the buildings' 5 (a field is a lot of small pieces; keeps the repo small). */
const ORE_SCALE = 3;

const seedOf = (id: string): number => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function partOf(look: Look, rnd: () => number, p: Part): Object3D {
  if (p.kind === 'spike') return at(look.spike(rnd, p), p.x, -0.012, p.z);
  if (p.kind === 'chunk') return at(turn(look.chunk(rnd, p), p.turn), p.x, -p.h * 0.14, p.z);
  return at(rock(rnd, p.r, p.h, look.grit, 8, 0.4), p.x, -0.008, p.z);
}

/** One piece (a cluster of the ore's parts, plus a sheet for sand); the ore layer lays up to three per tile. */
function piece(look: Look, floor: string, variant: number): Object3D {
  const seed = seedOf(floor);
  const rnd = rand(seed + variant * 7919);
  // on a sheet (sand) a few pebbles are enough: the sheet is the field
  const laid = layout(activeStyle(), variant, seed).filter((p, i) => !look.sheet || (p.kind !== 'spike' && (p.kind !== 'grit' || i % 3 === 0)));
  const parts = laid.map((p) => partOf(look, rnd, p));
  const bed = look.sheet ? [look.sheet(rnd)] : [];
  if (!look.spill) return group(...bed, ...parts);
  // glowing ores light the ground and their neighbours a little
  const spill = new PointLight(look.spill, 0.7, 0.7, 1.6);
  spill.position.set(0.05, 0.22, 0.1);
  const reach = isOutcrop(variant) ? OUTCROP_REACH : SCATTER_REACH;
  return group(lightPool(reach * 1.1, look.spill, 0.14), ...bed, ...parts, spill);
}

const floors = oreFloors(content.floors.list);
const ids: string[] = [];
for (const f of floors) {
  const m = content.materials.get(f.ore!);
  const look = lookOf(f.ore!, { color: m.color, accent: m.accent ?? m.color });
  for (let v = 0; v < ORE_VARIANTS; v++) {
    const id = oreFieldId(f.id, v);
    ids.push(id);
    sprite({ id, build: () => piece(look, f.id, v), scale: ORE_SCALE, shadow: 0.42, bloom: look.spill ? 0.3 : 0 });
  }
}
plan(ids);
