import type { BuildingDef } from '../../content/types';
import { nextFloat, nextInt, type RngState } from '../rng';
import { dist, eachInDisc, type Point } from './grid';
import { fbm, hash2 } from './noise';
import { CORE_CLEAR, type Ctx } from './resources';

/** Rock ridges keep this far from the coast (in minWidths) so bridges and shores stay open. */
const RIDGE_COAST = 0.9;

/**
 * Rock ridges: long curved walls with gaps (thin bands of noise, broken up by a second noise), plus a few
 * rock clumps. Never on resources, the start area or thin land.
 */
export function placeRidges(ctx: Ctx, coast: Float32Array, minWidth: number, amount: number): void {
  const { map, seed, centre } = ctx;
  const band = 0.04 * amount;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!map.ground[i] || map.floor[i] || coast[i]! < minWidth * RIDGE_COAST) continue;
      if (dist(x, y, centre.x, centre.y) < CORE_CLEAR + 5) continue;
      const wall = Math.abs(fbm(x / 20, y / 20, seed + 9) - 0.5) < band;
      const broken = fbm(x / 6.5, y / 6.5, seed + 21) > 0.4;
      const clump = fbm(x / 5, y / 5, seed + 33) > 0.85 + (1 - amount) * 0.1;
      if ((wall && broken) || clump) map.ridge[i] = 1;
    }
  }
}

/** Dust boulders: decoration in loose clusters on plain ground. */
export function placeBoulders(ctx: Ctx, variants: number, amount: number): void {
  const { map, seed, centre } = ctx;
  if (variants < 1) return;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!map.ground[i] || map.floor[i] || map.ridge[i] || dist(x, y, centre.x, centre.y) < CORE_CLEAR) continue;
      const cluster = fbm(x / 10, y / 10, seed + 11);
      const chance = (cluster > 0.6 ? 0.09 : 0.003) * amount;
      if (hash2(x, y, seed + 12) < chance) map.boulder[i] = 1 + Math.floor(hash2(y, x, seed + 13) * variants);
    }
  }
}

/** Buildings a wreck may hold: blueprints for this run only (content marks them `unlock: 'wreck'`). */
function wreckPool(ctx: Ctx): BuildingDef[] {
  const all = ctx.content.buildings.list;
  const marked = all.filter((b) => b.unlock === 'wreck');
  return marked.length ? [...marked] : all.filter((b) => b.unlock === 'meta' && b.category !== 'core');
}

const WRECK_ROOM = 2;

function wreckSpot(ctx: Ctx, taken: Point[], min: number): Point | null {
  const { map, rng, centre } = ctx;
  for (let attempt = 0; attempt < 200; attempt++) {
    const angle = nextFloat(rng) * Math.PI * 2;
    const d = min + nextFloat(rng) * Math.max(1, ctx.reach - min - 4);
    const x = Math.floor(centre.x + Math.cos(angle) * d);
    const y = Math.floor(centre.y + Math.sin(angle) * d);
    if (taken.some((t) => dist(x, y, t.x, t.y) < 22)) continue;
    let ok = true;
    eachInDisc(map, x + 0.5, y + 0.5, WRECK_ROOM + 1.5, (tx, ty) => {
      const i = ty * map.w + tx;
      if (!map.ground[i] || map.floor[i] || map.ridge[i]) ok = false;
    });
    if (ok) return { x, y };
  }
  return null;
}

/** Wrecks with blueprints: one more than a third of the sizes' piece count, spread out, each a different building. */
export function placeWrecks(ctx: Ctx, count: number): void {
  const { map, rng } = ctx;
  const pool = wreckPool(ctx);
  const spots: Point[] = [];
  for (let n = 0; n < count && pool.length; n++) {
    const far = Math.max(26, ctx.reach * 0.3);
    const at = wreckSpot(ctx, spots, far) ?? wreckSpot(ctx, spots, far * 0.6) ?? wreckSpot(ctx, spots, 14);
    if (!at) break;
    spots.push(at);
    const building = pool.splice(nextInt(rng, 0, pool.length - 1), 1)[0]!;
    map.wrecks.push({ x: at.x, y: at.y, building: building.id, taken: false });
    // a few boulders of wreckage around it
    eachInDisc(map, at.x + 0.5, at.y + 0.5, WRECK_ROOM + 1, (tx, ty, d) => {
      const i = ty * map.w + tx;
      if (d > WRECK_ROOM - 0.2 && !map.boulder[i] && hash2(tx, ty, ctx.seed + 51) < 0.35) map.boulder[i] = 1 + Math.floor(hash2(ty, tx, ctx.seed) * 3);
    });
  }
}
