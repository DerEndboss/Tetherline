import { planComb, type Comb, type CombOptions } from './bot-field';
import { patchesOf, route, Space, type BeltStep, type Patch, type RouteGoal, type Tile } from './bot-space';
import type { PlanSpec } from './commands';
import { DX, DY, edgeTiles, gapBetween, opposite, touches } from './grid';
import type { Building, Dir } from './state';
import type { World } from './world';

/**
 * Planners: each turns a wish ("a copper line into the core", "a smelter fed by iron ore") into a batch of ghosts,
 * or null when the map has no room. They only read the world and claim tiles in the Space they are given.
 */

/** Bot memory the planners share. */
export interface Line {
  /** Lines of one class may join: 'copper-ore', 'raw' (other ores), 'products' or 'hubout'. */
  cls: string;
  /** The ore a mining line carries ('' for product lines). */
  item: string;
  tiles: number[];
  /** The drills of a mining line (the ore valve takes them down and puts them back). */
  drills?: PlanSpec[];
  /** The ore valve took this line's drills down. */
  idle?: boolean;
}

/** A lane from an unloader: the belt tiles in order, so later crafters can branch off it with a router. */
export interface Lane {
  item: number;
  tiles: number[];
}

export interface Memory {
  /** Tiles nothing may use (the core's upgrade footprint and ring). */
  reserved: Set<number>;
  /** The hub zone: only the hub planners may build here. */
  hub: Set<number>;
  lines: Line[];
  lanes: Lane[];
  /** Steps that failed (name -> tick until they may be tried again). */
  bad: Map<string, number>;
  /** What each step's last plan cost when it could not be paid (it is planned again once that is free). */
  needs: Map<string, Map<string, number>>;
  /** Mega buildings and the stage they were marked for (a new stage waits until the core holds all of it). */
  stage: Map<number, number>;
  /** When the supply marks were last sorted by urgency (tick). */
  reordered: number;
  /** Crafters the surplus valve took down (one recipe, nothing to switch to) and the product that decides. */
  downed: { plan: PlanSpec; product: string }[];
  /** Crafters the surplus valve paused (id -> their own recipe). */
  paused: Map<number, number>;
  /** Failures in a row per step (the rest doubles with each). */
  fails: Map<string, number>;
  /** Tiles (y * W + x) of machines the drones should supply once they stand. */
  feed: Set<number>;
  /** Watchdog: the last progress score and when it rose. */
  progress: { at: number; score: number };
  /** How often the watchdog fired: each time the planners look wider. */
  stalls: number;
  /** The stall the rescue step last answered. */
  rescued: number;
  /** Tiles kept clear around the liquid parts of an annex (re-added whenever `reserved` is rebuilt). */
  keep: Set<number>;
  /** Liquid parts taken down because their network held the wrong liquid; placed again once they are gone. */
  refit: PlanSpec[];
  /**
   * Tiles held for the particle accelerator, its coolant plant and its output belt since the late chain began
   * (undefined: not planned yet, empty: built or given up); `siteTry` is when the last search ran.
   */
  site?: number[];
  siteTry: number;
  /** The ore the bot told the drones to mine (null: their own choice); kept here, the worker sees no drone orders. */
  mining?: string | null;
  /** The plan the site was held for: used as it stands when a new plan finds no way out of the grown base. */
  siteBatch?: Batch;
  /** When the trunk upgrade last looked (tick). */
  trunkAt?: number;
  /** When the bot last changed the accelerator's recipe (tick). */
  accelAt?: number;
  /** Items a holding step lacks, and the tick it last said so: the drones make them first. */
  wanting?: Map<string, number>;
}

export interface Batch {
  plans: PlanSpec[];
  lines: Line[];
  lanes?: Lane[];
  /** Machines of the batch the drones should keep supplied (their top-left tiles). */
  feed?: Tile[];
  note: string;
}

export interface Ctx {
  world: World;
  space: Space;
  mem: Memory;
  /** Lines may hop over things with bridges (they cost iron bars, so not in the opening). */
  bridges?: boolean;
  /** Why planners gave up (counts per reason), for the trace. */
  why?: Map<string, number>;
}

export function because(ctx: Ctx, reason: string): null {
  ctx.why?.set(reason, (ctx.why.get(reason) ?? 0) + 1);
  return null;
}

export const tileKey = (x: number, y: number, W: number): number => y * W + x;

/* ---------- Belts as plans ---------- */

/** Ghosts for a routed line (junctions where it crosses another belt). */
export function beltPlans(steps: readonly BeltStep[], belt = 'conveyor'): PlanSpec[] {
  return steps.map((s) => ({ kind: s.bridge ? 'bridge-conveyor' : s.cross ? 'junction' : belt, x: s.x, y: s.y, rot: s.rot }));
}

function claimSteps(space: Space, steps: readonly BeltStep[]): void {
  for (const s of steps) space.claim(s.x, s.y, 1, s.bridge ? 'bridge' : s.cross ? 'junction' : 'conveyor');
}

/* ---------- Where lines may end ---------- */

/** Goals around a footprint: a free tile on each side with the way into it. */
export function ringGoals(space: Space, b: { x: number; y: number; size: number }, maxEmit = 0, cost = 0, store = false): RouteGoal[] {
  return space.inBandMode(() => {
    const out: RouteGoal[] = [];
    for (const [x, y, side] of edgeTiles(b)) {
      if (space.free(x, y) && space.emitters(x, y) <= maxEmit) out.push({ x, y, dir: opposite(side), cost, store });
    }
    return out;
  });
}

/** Goals beside existing lines of a class: join from the side or the back. */
export function mergeGoals(ctx: Ctx, cls: string): RouteGoal[] {
  return ctx.space.inBandMode(() => mergeGoalsIn(ctx, cls));
}

function mergeGoalsIn(ctx: Ctx, cls: string): RouteGoal[] {
  const { world, space } = ctx;
  const out: RouteGoal[] = [];
  for (const line of ctx.mem.lines) {
    if (line.cls !== cls) continue;
    for (const t of line.tiles) {
      const x = t % space.W;
      const y = Math.floor(t / space.W);
      const b = world.at(x, y);
      if (!b || world.def(b).behaviour !== 'conveyor') continue;
      for (let d = 0; d < 4; d++) {
        if (d === b.rot) continue;
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (space.free(nx, ny) && !space.nearEmitter(nx, ny)) out.push({ x: nx, y: ny, dir: opposite(d as Dir) });
      }
    }
  }
  return out;
}

/* ---------- Patch choice ---------- */

/** Patches that hold an ore, nearest first to `near`, with enough free ore to be worth a comb. */
export function patchesFor(world: World, item: number, tier: number, near: Tile, space: Space, min = 6): Patch[] {
  return patchesOf(world)
    .filter((p) => p.item === item && p.hardness <= tier && p.tiles.filter((t) => space.free(t % space.W, Math.floor(t / space.W))).length >= min)
    .sort((a, b) => Math.hypot(a.cx - near.x, a.cy - near.y) - Math.hypot(b.cx - near.x, b.cy - near.y));
}

/** Extra cost for belts: stay off ore and out of the way of the core ring (heavier the closer to the core). */
export function beltCost(ctx: Ctx): (x: number, y: number) => number {
  const { space, world } = ctx;
  const core = world.core;
  const size = core ? world.def(core).size : 0;
  const near = (x: number, y: number, r: number): boolean => core !== undefined && x >= core.x - r && x <= core.x + size - 1 + r && y >= core.y - r && y <= core.y + size - 1 + r;
  return (x, y) => (space.floorAt(x, y) > 0 ? 0.6 : 0) + (near(x, y, 1) ? 6 : near(x, y, 2) ? 3 : 0);
}

/* ---------- Mining line: comb + belt to a goal ---------- */

export interface LineSpec {
  item: number;
  drill: string;
  size: number;
  tier: number;
  maxDrills: number;
  /** Where the ore ends up: goals of the final belt. */
  goals: RouteGoal[];
  near: Tile;
  /** Lines of one class may join each other ('products', 'copper-ore' or 'raw'). */
  cls: string;
  /** The ore id, kept for counting lines. */
  itemId?: string;
}

export interface Laid {
  comb: Comb;
  path: BeltStep[];
  total: number;
}

function laidOn(ctx: Ctx, spec: LineSpec, patch: Patch, opts: CombOptions): Laid | null {
  const comb = planComb(ctx.space, patch, opts);
  if (!comb) return null;
  const last = comb.trunk[comb.trunk.length - 1]!;
  const start = { x: last.x + DX[comb.exitDir]!, y: last.y + DY[comb.exitDir]! };
  const scratch = ctx.space.clone();
  for (const d of comb.drills) scratch.claim(d.x, d.y, spec.size, 'drill');
  claimSteps(scratch, comb.trunk);
  const path = route(scratch, { starts: [start], goals: spec.goals, cost: beltCost({ ...ctx, space: scratch }), allow: new Set([scratch.idx(start.x, start.y), ...spec.goals.map((g) => scratch.idx(g.x, g.y))]), cross: true, bridges: ctx.bridges === true });
  return path ? { comb, path, total: path.length * 1.2 - comb.ore * 2 } : null;
}

/** A comb on the best of the nearest patches plus the belt from its exit to the goals. */
export function layLine(ctx: Ctx, spec: LineSpec, tries = 3): Laid | null {
  const opts: CombOptions = { drill: spec.drill, size: spec.size, tier: spec.tier, maxDrills: spec.maxDrills, minOre: Math.max(2, Math.ceil(spec.size * spec.size * 0.4)), near: spec.near };
  let best: Laid | null = null;
  for (const patch of patchesFor(ctx.world, spec.item, spec.tier, spec.near, ctx.space).slice(0, tries)) {
    const laid = laidOn(ctx, spec, patch, opts);
    if (laid && (!best || laid.total < best.total)) best = laid;
  }
  return best;
}

/** Commits a laid line into the shared space and returns its ghosts (belts first, drills last). */
export function lineBatch(ctx: Ctx, spec: LineSpec, laid: Laid, note: string): Batch {
  const belts = [...laid.path.slice().reverse(), ...laid.comb.trunk.slice().reverse()];
  for (const d of laid.comb.drills) ctx.space.claim(d.x, d.y, spec.size, 'drill');
  claimSteps(ctx.space, laid.comb.trunk);
  claimSteps(ctx.space, laid.path);
  const tiles = [...laid.comb.trunk, ...laid.path].map((s) => tileKey(s.x, s.y, ctx.space.W));
  return { plans: [...beltPlans(belts), ...laid.comb.drills], lines: [{ cls: spec.cls, item: spec.itemId ?? '', tiles, drills: laid.comb.drills }], note };
}

/** Marks every ghost of a batch as taken in a space. */
export function claimBatch(space: Space, world: World, batch: Batch): void {
  for (const p of batch.plans) {
    const def = world.content.buildings.get(p.kind);
    space.claim(p.x, p.y, def.size, def.behaviour);
  }
}

/** Total cost of ghosts, per material id. */
export function costOf(world: World, plans: readonly PlanSpec[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of plans) for (const c of world.content.buildings.get(p.kind).cost) out.set(c.item, (out.get(c.item) ?? 0) + c.n);
  return out;
}

/* ---------- Terminal crafter near the core: a mining line ends in each input ---------- */

export interface Feeder {
  item: number;
  drill: string;
  size: number;
  tier: number;
  maxDrills: number;
  /** A crafter between the ore line and the terminal (a smelter making bars for a foundry): it touches the
   * terminal and hands its product straight over. */
  via?: { crafter: string; config: number; size: number };
}

export interface Terminal {
  crafter: string;
  size: number;
  config: number;
  feeders: Feeder[];
  /** Stand near this tile (an ore patch) instead of near the core. */
  around?: Tile;
}

/**
 * Crafter positions around a point, nearest first (by the gap to the core, so a crafter two tiles off the ring
 * comes first), each with a free tile all around it. `min`/`max` bound that gap in tiles.
 */
/** The first `count` tiles of a list that are not next to an earlier pick. */
function apart(tiles: Tile[], count: number): Tile[] {
  const picked: Tile[] = [];
  for (const t of tiles) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(p.x - t.x) + Math.abs(p.y - t.y) >= 2)) picked.push(t);
  }
  return picked;
}

export function spots(ctx: Ctx, size: number, around: Tile, min: number, max: number, count = 12, ring = true): Tile[] {
  const core = ctx.world.core;
  const rect = core ? { x: core.x, y: core.y, size: ctx.world.def(core).size } : { x: around.x, y: around.y, size: 1 };
  const edge = (x: number, y: number): boolean => (ring ? ctx.space.inBandMode(() => ctx.space.freeRect(x - 1, y - 1, size + 2)) : quiet(ctx, x, y, size));
  // stations and loose buildings keep off the late ores (they are scarce; the lines come later)
  const room = (x: number, y: number): boolean => ctx.space.freeRect(x, y, size) && !ctx.space.coversRareOre(x, y, size) && edge(x, y);
  const out: { t: Tile; d: number }[] = [];
  for (let y = around.y - max - 6; y <= around.y + max + 6; y += 1) {
    for (let x = around.x - max - 6; x <= around.x + max + 6; x += 1) {
      const gap = gapBetween(rect, { x, y, size });
      if (gap >= min && gap <= max && room(x, y)) out.push({ t: { x, y }, d: gap + ((x * 7 + y * 13) % 5) * 0.1 });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return apart(out.map((o) => o.t), count);
}

/** Whether nothing that pushes items out stands beside a footprint (a loose spot without a free ring). */
function quiet(ctx: Ctx, x: number, y: number, size: number): boolean {
  for (let i = 0; i < size; i++) {
    if (ctx.space.nearEmitter(x + i, y) || ctx.space.nearEmitter(x + i, y + size - 1) || ctx.space.nearEmitter(x, y + i) || ctx.space.nearEmitter(x + size - 1, y + i)) return false;
  }
  return true;
}

/** Free spots (with a free ring) within `radius` of a tile (an ore patch), about six tiles off it first, so the
 * drills keep the ore. */
function spotsNear(ctx: Ctx, size: number, at: Tile, radius: number): Tile[] {
  const out: { t: Tile; d: number }[] = [];
  for (let y = Math.round(at.y) - radius; y <= at.y + radius; y++) {
    for (let x = Math.round(at.x) - radius; x <= at.x + radius; x++) {
      if (ctx.space.freeRect(x, y, size) && !ctx.space.coversRareOre(x, y, size) && ctx.space.inBandMode(() => ctx.space.freeRect(x - 1, y - 1, size + 2))) out.push({ t: { x, y }, d: Math.abs(Math.hypot(x - at.x, y - at.y) - 6) });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return apart(out.map((o) => o.t), 6);
}

function terminalAt(ctx: Ctx, t: Terminal, spot: Tile): { batch: Batch; score: number } | null {
  const local: Ctx = { ...ctx, space: ctx.space.clone() };
  const starts = ringGoals(local.space, { x: spot.x, y: spot.y, size: t.size }).map((g) => ({ x: g.x, y: g.y }));
  local.space.claim(spot.x, spot.y, t.size, 'crafter');
  const plans: PlanSpec[] = [{ kind: t.crafter, x: spot.x, y: spot.y, rot: 0, config: t.config }];
  let length = 0;
  for (const f of t.feeders) {
    let into = { x: spot.x, y: spot.y, size: t.size };
    if (f.via) {
      const at = viaSpot(local, f, into);
      if (!at) return because(ctx, `via ${f.via.crafter}`);
      local.space.claim(at.x, at.y, f.via.size, 'crafter');
      plans.push({ kind: f.via.crafter, x: at.x, y: at.y, rot: 0, config: f.via.config });
      into = { x: at.x, y: at.y, size: f.via.size };
    }
    const goals = ringGoals(local.space, into, 1);
    const spec: LineSpec = { ...f, goals, near: { x: into.x, y: into.y }, cls: 'feed' };
    const laid = layLine(local, spec, 5);
    if (!laid) return because(ctx, `feeder ${ctx.world.content.materials.list[f.item]?.id}`);
    plans.push(...lineBatch(local, spec, laid, 'feeder').plans);
    length += laid.path.length;
  }
  const out = route(local.space, { starts, goals: productGoals(local), cost: beltCost(local), allow: new Set([...starts, ...productGoals(local)].map((g) => local.space.idx(g.x, g.y))), cross: true, bridges: ctx.bridges === true });
  if (!out) return because(ctx, 'output');
  claimSteps(local.space, out);
  plans.push(...beltPlans(out.slice().reverse()));
  return { batch: { plans, lines: [{ cls: 'products', item: '', tiles: out.map((s) => tileKey(s.x, s.y, local.space.W)) }], note: t.crafter }, score: length + out.length };
}

/** A free spot for a via crafter touching the terminal, on the side nearest the via's ore. */
function viaSpot(local: Ctx, f: Feeder, main: { x: number; y: number; size: number }): Tile | null {
  const v = f.via!.size;
  const patch = patchesFor(local.world, f.item, f.tier, { x: main.x, y: main.y }, local.space)[0];
  const aim = patch ? { x: patch.cx, y: patch.cy } : { x: main.x, y: main.y };
  const options: Tile[] = [];
  for (let y = main.y - v; y <= main.y + main.size; y++) {
    for (let x = main.x - v; x <= main.x + main.size; x++) if (touches(main, { x, y, size: v }) && local.space.freeRect(x, y, v)) options.push({ x, y });
  }
  options.sort((a, b) => Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y));
  return options[0] ?? null;
}

/** Where product belts may end: beside other product lines, else a ring tile of the core. */
export function productGoals(ctx: Ctx): RouteGoal[] {
  const core = ctx.world.core;
  const ring = core ? ringGoals(ctx.space, { x: core.x, y: core.y, size: ctx.world.def(core).size }, 9, 60, true) : [];
  return [...mergeGoals(ctx, 'products'), ...ring];
}

/**
 * A crafter near the core with a dedicated ore line into each input and a belt for its product. The inputs are
 * dead-end lines: when the crafter is full they just wait, nothing else is blocked.
 */
export function layTerminal(ctx: Ctx, t: Terminal): Batch | null {
  const core = ctx.world.core;
  if (!core) return null;
  const half = Math.floor(ctx.world.def(core).size / 2);
  let best: { batch: Batch; score: number } | null = null;
  const where = t.around ? spotsNear(ctx, t.size, t.around, 10).slice(0, 3) : spots(ctx, t.size, { x: core.x + half, y: core.y + half }, 4, 12).slice(0, 5);
  for (const spot of where) {
    const attempt = terminalAt(ctx, t, spot);
    if (attempt && (!best || attempt.score < best.score)) best = attempt;
  }
  if (best) claimBatch(ctx.space, ctx.world, best.batch);
  return best?.batch ?? null;
}

/* ---------- Pod: comb whose trunk ends in a crafter, the crafter's product rides a belt on ---------- */

export interface PodSpec {
  crafter: string;
  size: number;
  config: number;
  item: number;
  drill: string;
  dsize: number;
  tier: number;
  maxDrills: number;
  goals: RouteGoal[];
  cls: string;
  near: Tile;
}

interface PodTry {
  plans: PlanSpec[];
  path: BeltStep[];
  trunk: BeltStep[];
  score: number;
}

function podAt(ctx: Ctx, spec: PodSpec, comb: Comb, at: Tile): PodTry | null {
  const scratch = ctx.space.clone();
  for (const d of comb.drills) scratch.claim(d.x, d.y, spec.dsize, 'drill');
  claimSteps(scratch, comb.trunk);
  // a crafter dumps its product onto any belt beside it: not onto a line that stands already
  if (!scratch.freeRect(at.x, at.y, spec.size) || edgeTiles({ x: at.x, y: at.y, size: spec.size }).some(([x, y]) => ctx.space.isBelt(x, y))) return null;
  const starts = ringGoals(scratch, { x: at.x, y: at.y, size: spec.size }).filter((g) => !scratch.nearEmitter(g.x, g.y));
  scratch.claim(at.x, at.y, spec.size, 'crafter');
  const allow = new Set(starts.map((s) => scratch.idx(s.x, s.y)));
  const path = route(scratch, { starts, goals: spec.goals, cost: beltCost({ ...ctx, space: scratch }), allow, cross: true, bridges: ctx.bridges === true });
  if (!path) return null;
  const plans: PlanSpec[] = [{ kind: spec.crafter, x: at.x, y: at.y, rot: 0, config: spec.config }];
  return { plans, path, trunk: comb.trunk, score: path.length - comb.ore * 2 };
}

function podOnPatch(ctx: Ctx, spec: PodSpec, patch: Patch): (PodTry & { comb: Comb }) | null {
  const opts: CombOptions = { drill: spec.drill, size: spec.dsize, tier: spec.tier, maxDrills: spec.maxDrills, minOre: Math.max(2, Math.ceil(spec.dsize * spec.dsize * 0.4)), near: spec.near };
  const comb = planComb(ctx.space, patch, opts);
  if (!comb) return null;
  const last = comb.trunk[comb.trunk.length - 1]!;
  const next = { x: last.x + DX[comb.exitDir]!, y: last.y + DY[comb.exitDir]! };
  let best: (PodTry & { comb: Comb }) | null = null;
  for (let ox = 0; ox < spec.size; ox++) {
    for (let oy = 0; oy < spec.size; oy++) {
      const t = podAt(ctx, spec, comb, { x: next.x - ox, y: next.y - oy });
      if (t && (!best || t.score < best.score)) best = { ...t, comb };
    }
  }
  return best;
}

/** A crafter at the end of a mining trunk; its product goes by belt to the goals. */
export function layPod(ctx: Ctx, spec: PodSpec): Batch | null {
  let best: (PodTry & { comb: Comb }) | null = null;
  for (const patch of patchesFor(ctx.world, spec.item, spec.tier, spec.near, ctx.space, 8).slice(0, 3)) {
    const t = podOnPatch(ctx, spec, patch);
    if (t && (!best || t.score < best.score)) best = t;
  }
  if (!best) return null;
  const belts = [...best.path.slice().reverse(), ...best.trunk.slice().reverse()];
  const batch: Batch = {
    plans: [...beltPlans(belts), ...best.plans, ...best.comb.drills],
    lines: [{ cls: spec.cls, item: '', tiles: best.path.map((s) => tileKey(s.x, s.y, ctx.space.W)) }],
    note: spec.crafter,
  };
  claimBatch(ctx.space, ctx.world, batch);
  return batch;
}
