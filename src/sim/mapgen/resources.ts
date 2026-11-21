import type { ContentRegistry } from '../../content/registry';
import type { FloorDef, ResourceSpawnDef } from '../../content/types';
import { nextFloat, nextInt, type RngState } from '../rng';
import type { MapState } from '../state';
import { dist, eachInDisc, isLand, type Point } from './grid';
import { fbm, hash2 } from './noise';

/** Everything the resource steps share. */
export interface Ctx {
  content: ContentRegistry;
  map: MapState;
  rng: RngState;
  seed: number;
  /** The map centre (the start core's middle). */
  centre: Point;
  /** Map property ids rolled for this run. */
  props: string[];
  /** Largest distance from the centre that still holds land. */
  reach: number;
}

/** Plain ground around the core that no resource patch may touch. */
export const CORE_CLEAR = 7;

type Group = 'start' | 'world' | 'rare' | 'standard';

function groupOf(s: ResourceSpawnDef): Group {
  if (s.nearStart) return 'start';
  if (s.themes) return 'world';
  if (s.minDistance && s.minDistance >= 40) return 'rare';
  return 'standard';
}

const between = (rng: RngState, lo: number, hi: number): number => lo + nextFloat(rng) * (hi - lo);

/** Whether a disc of `radius` (plus a one-tile margin) is plain land: nothing else may overlap a patch. */
function roomFor(map: MapState, centre: Point, cx: number, cy: number, radius: number): boolean {
  if (dist(cx, cy, centre.x, centre.y) < CORE_CLEAR + radius) return false;
  let ok = true;
  eachInDisc(map, cx, cy, radius + 1.5, (x, y) => {
    const i = y * map.w + x;
    if (!map.ground[i] || map.floor[i] || map.ridge[i]) ok = false;
  });
  return ok;
}

/** A random land spot with room for `radius`, `min..max` tiles from the centre; null after many tries. */
function findSpot(ctx: Ctx, radius: number, min: number, max: number, aim?: number): Point | null {
  const { map, rng, centre } = ctx;
  for (let attempt = 0; attempt < 140; attempt++) {
    const angle = aim === undefined ? nextFloat(rng) * Math.PI * 2 : aim + between(rng, -0.45, 0.45);
    const d = Math.sqrt(between(rng, min * min, Math.max(min * min + 1, max * max)));
    const x = Math.floor(centre.x + Math.cos(angle) * d);
    const y = Math.floor(centre.y + Math.sin(angle) * d);
    if (isLand(map, x, y) && roomFor(map, centre, x + 0.5, y + 0.5, radius)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

/** Stamps one patch. Ores are thinned at the edge (flecks, not a disc); liquids are solid; lakes get a shallow rim. */
function stamp(ctx: Ctx, def: FloorDef, floor: number, at: Point, radius: number, salt: number): void {
  const { map, content, seed } = ctx;
  const shallow = content.floors.list.findIndex((f) => f.liquid === def.liquid && !f.deep) + 1;
  const ax = between(ctx.rng, 0.75, 1.3);
  const ay = between(ctx.rng, 0.75, 1.3);
  const turn = between(ctx.rng, 0, Math.PI);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const inkAt = (x: number, y: number, d: number): number => {
    if (def.deep) return d < 0.62 || !shallow ? floor : shallow;
    if (def.liquid || d < 0.55 || hash2(x, y, seed + salt) > (d - 0.55) * 1.6) return floor;
    return 0;
  };
  eachInDisc(map, at.x, at.y, radius * 1.5, (x, y) => {
    const i = y * map.w + x;
    if (!map.ground[i] || map.floor[i] || map.ridge[i]) return;
    const dx = x + 0.5 - at.x;
    const dy = y + 0.5 - at.y;
    const u = (dx * cos + dy * sin) / (radius * ax);
    const v = (-dx * sin + dy * cos) / (radius * ay);
    const d = Math.sqrt(u * u + v * v) + (fbm(x / 3.5, y / 3.5, seed + salt) - 0.5) * 0.7;
    if (d < 1) map.floor[i] = inkAt(x, y, d);
  });
}

interface Plan {
  spawn: ResourceSpawnDef;
  def: FloorDef;
  floor: number;
  group: Group;
}

/** Which resources this seed has: start ones always, the rest rolled (at least four standard ores). */
function roll(ctx: Ctx, landTiles: number): Plan[] {
  const { content, rng, map } = ctx;
  const all: Plan[] = [];
  for (const spawn of content.spawns) {
    if (!content.floors.has(spawn.floor) || (spawn.themes && !spawn.themes.includes(map.theme))) continue;
    all.push({ spawn, def: content.floors.get(spawn.floor), floor: content.floors.indexOf(spawn.floor) + 1, group: groupOf(spawn) });
  }
  const geothermal = ctx.props.includes('geothermal');
  // small maps carry fewer kinds so they stay mostly empty too
  const room = Math.min(1, Math.max(0.55, landTiles / 12000));
  const chance = (p: Plan): number => (geothermal && p.def.liquid === 'slag') || p.spawn.chance >= 1 ? 1 : p.spawn.chance * room;
  const chosen = all.filter((p) => nextFloat(rng) <= chance(p));
  const standard = all.filter((p) => p.group === 'standard' && p.def.ore);
  const have = () => chosen.filter((p) => p.group === 'standard' && p.def.ore).length;
  for (const p of [...standard].sort((a, b) => b.spawn.chance - a.spawn.chance)) {
    if (have() >= Math.min(4, standard.length)) break;
    if (!chosen.includes(p)) chosen.push(p);
  }
  addNeeded(all, chosen);
  return chosen;
}

/** Every `needed` group gets a member: the most common one when the roll gave none (a map must be winnable). */
function addNeeded(all: Plan[], chosen: Plan[]): void {
  const groups = new Set(all.map((p) => p.spawn.needed).filter((g) => g !== undefined));
  for (const g of groups) {
    if (chosen.some((p) => p.spawn.needed === g)) continue;
    const best = all.filter((p) => p.spawn.needed === g).sort((a, b) => b.spawn.chance - a.spawn.chance)[0];
    if (best) chosen.push(best);
  }
}

function patchCount(ctx: Ctx, p: Plan, landTiles: number): number {
  let density = p.spawn.density * between(ctx.rng, 0.75, 1.3);
  if (p.def.deep) density *= ctx.content.themes.get(ctx.map.theme).terrain?.gen.lakes ?? 1;
  if (p.def.liquid === 'slag' && ctx.props.includes('geothermal')) density *= 2.5;
  const n = Math.round((density * landTiles) / 10000);
  return p.group === 'start' ? Math.max(0, n - 1) : Math.max(1, n);
}

/** The start patch of a resource: somewhere in its ring around the core, aimed at its own direction. */
function startPatch(ctx: Ctx, p: Plan, aim: number): void {
  const radius = Math.round(p.spawn.radius[0] + (p.spawn.radius[1] - p.spawn.radius[0]) * 0.4);
  const min = CORE_CLEAR + radius + 1;
  const max = p.spawn.nearStart!;
  const at = findSpot(ctx, radius, min, max, aim) ?? findSpot(ctx, radius, min, max + 6) ?? findSpot(ctx, radius - 1, min, max + 12);
  if (at) stamp(ctx, p.def, p.floor, at, radius, p.floor * 17);
  if (p.def.ore && tilesOf(ctx.map, p.floor) < START_TILES) {
    const more = findSpot(ctx, radius, min, max + 12);
    if (more) stamp(ctx, p.def, p.floor, more, radius, p.floor * 23);
  }
}

/**
 * One more start patch of a start ore whose opening fell short (`openingShort` in opening.ts): middle size, within
 * the opening radius, anywhere around the core. Placed after ridges and boulders, so the room it finds is real.
 */
export function openingPatch(ctx: Ctx, floorId: string, within: number): void {
  const spawn = ctx.content.spawns.find((s) => s.floor === floorId && s.nearStart);
  if (!spawn) return;
  const def = ctx.content.floors.get(floorId);
  const radius = Math.ceil((spawn.radius[0] + spawn.radius[1]) / 2);
  for (const r of [radius, radius - 1, spawn.radius[0]]) {
    const at = findSpot(ctx, r, CORE_CLEAR + r + 1, within - r);
    if (at) return stamp(ctx, def, ctx.content.floors.indexOf(floorId) + 1, at, r, 331);
  }
}

/** Tiles a needed ore must have on the map: a small map rolled one 6-tile tungsten patch, too thin for a drill. */
const NEEDED_TILES = 16;

/** Tiles a start ore must have near the core: a small map had a single 11-tile coal patch, and silicon never got going. */
const START_TILES = 30;

function tilesOf(map: MapState, floor: number): number {
  let n = 0;
  for (const f of map.floor) if (f === floor) n++;
  return n;
}

/** Resource patches: the start set around the core, then the rolled ones across the map. */
export function placeResources(ctx: Ctx, landTiles: number): void {
  const plans = roll(ctx, landTiles);
  const starts = plans.filter((p) => p.group === 'start');
  const turn = nextFloat(ctx.rng) * Math.PI * 2;
  starts.forEach((p, i) => startPatch(ctx, p, turn + (i / starts.length) * Math.PI * 2));
  for (const p of plans) {
    const range = [p.spawn.radius[0], p.spawn.radius[1]] as const;
    const min = Math.max(CORE_CLEAR + range[1] + 1, p.spawn.minDistance ?? 0, p.group === 'start' ? p.spawn.nearStart! : 0);
    for (let i = patchCount(ctx, p, landTiles); i > 0; i--) {
      const radius = nextInt(ctx.rng, range[0], range[1]);
      const at = findSpot(ctx, radius, min, ctx.reach) ?? findSpot(ctx, radius, min * 0.6, ctx.reach);
      if (at) stamp(ctx, p.def, p.floor, at, radius, i * 31 + p.floor);
    }
    if (p.spawn.needed && tilesOf(ctx.map, p.floor) < NEEDED_TILES) neededPatch(ctx, p, min);
  }
}

/**
 * A needed ore that found no room, or only a thin patch: one more of middle size anywhere past the start ring,
 * then smaller and nearer, so even a crowded small map has it. A middle-sized patch keeps enough tiles under a 3x3 drill.
 */
function neededPatch(ctx: Ctx, p: Plan, min: number): void {
  const [lo, hi] = p.spawn.radius;
  const mid = Math.ceil((lo + hi) / 2);
  for (const [radius, from] of [[mid, min], [mid, CORE_CLEAR + mid + 2], [lo, CORE_CLEAR + lo + 2]] as const) {
    const at = findSpot(ctx, radius, from, ctx.reach);
    if (at) return stamp(ctx, p.def, p.floor, at, radius, 977 + p.floor);
  }
}
