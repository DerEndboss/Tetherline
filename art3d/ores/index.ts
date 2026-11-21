import { PointLight, type Object3D } from 'three';
import { content } from '../../src/content';
import { ORE_VARIANTS, oreFieldId, oreFloors } from '../../src/render/world/ore-art';
import { at, group, lightPool, plan, rand, rock, sprite, turn } from '../kit';
import { layout, type Part } from './layout';
import { lookOf, type Look } from './looks';
import { activeStyle } from './style';
import './ridges';

/**
 * Ore fields (docs/art.md, category `ores`): for every ore floor ORE_VARIANTS tile sprites
 * `field-<floor id>-<v>`, a cluster of the ore's own low-poly chunks spread over the whole tile, so a field
 * of them joins up. Not in the start atlas: the ore layer (src/render/world/ores-layer.ts) loads
 * public/art/ores/manifest.json itself and bakes only the ores a map has. Never mirrored (light from the left);
 * variety comes from the variants and a small offset per tile in the game.
 */

/** Output px per world px: ground detail, a little under the buildings' 5 (keeps the repo small). */
const ORE_SCALE = 4;

const seedOf = (id: string): number => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function partOf(look: Look, rnd: () => number, p: Part): Object3D {
  if (p.kind === 'spike') return at(look.spike(rnd, p), p.x, -0.012, p.z);
  if (p.kind === 'chunk') return at(turn(look.chunk(rnd, p), p.turn), p.x, -p.h * 0.14, p.z);
  return at(rock(rnd, p.r, p.h, look.grit, 8, 0.4), p.x, -0.008, p.z);
}

function tile(look: Look, floor: string, variant: number): Object3D {
  const seed = seedOf(floor);
  const rnd = rand(seed + variant * 7919);
  const parts = layout(activeStyle(), variant, seed).map((p) => partOf(look, rnd, p));
  if (!look.spill) return group(...parts);
  // glowing ores light the ground and their neighbours a little
  const spill = new PointLight(look.spill, 0.7, 0.7, 1.6);
  spill.position.set(0.05, 0.22, 0.1);
  return group(lightPool(0.48, look.spill, 0.16), ...parts, spill);
}

const floors = oreFloors(content.floors.list);
const ids: string[] = [];
for (const f of floors) {
  const m = content.materials.get(f.ore!);
  const look = lookOf(f.ore!, { color: m.color, accent: m.accent ?? m.color });
  for (let v = 0; v < ORE_VARIANTS; v++) {
    const id = oreFieldId(f.id, v);
    ids.push(id);
    sprite({ id, build: () => tile(look, f.id, v), scale: ORE_SCALE, shadow: 0.42, bloom: look.spill ? 0.3 : 0 });
  }
}
plan(ids);
