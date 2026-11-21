import { because, beltCost, type Lane, beltPlans, claimBatch, mergeGoals, ringGoals, spots, tileKey, type Batch, type Ctx } from './bot-build';
import { route, type BeltStep, type RouteGoal, type Tile } from './bot-space';
import type { PlanSpec } from './commands';
import { DX, DY, edgeTiles, gapBetween, opposite } from './grid';
import { powerGraph } from './power';
import type { Dir } from './state';
import { storageInfo } from './storage';
import type { World } from './world';

/**
 * The hub around the core. Crafters stand a little way off; each input arrives on its own belt from an unloader on
 * the ring (a tile next to the core or a docked container), the product rides a belt back into the core. A lane
 * carries one item, so when a crafter is full its lane just waits.
 */

export interface Station {
  crafter: string;
  config: number;
  inputs: string[];
  /** Product line class ('products'), or null when the crafter keeps what it makes (the elevator). */
  output: string | null;
  /**
   * No input lanes: the drones bring the inputs from the core (the bot marks it for supply). Used where lanes
   * find no way through a crowded hub, and for late machines with three or four inputs.
   */
  supplied?: boolean;
  /** Buildings that must stand beside the crafter (a gas condenser, a coolant plant); claimed before the belts. */
  annex?: (local: Ctx, spot: Tile, size: number) => PlanSpec[] | null;
}

interface Rect {
  x: number;
  y: number;
  size: number;
}

/** The core and every container docked to it: all of them are the core's store. */
export function storesOf(world: World): Rect[] {
  const core = world.core;
  if (!core) return [];
  const out: Rect[] = [{ x: core.x, y: core.y, size: world.def(core).size }];
  for (const id of storageInfo(world).docked) {
    const b = world.byId.get(id);
    if (b) out.push({ x: b.x, y: b.y, size: world.def(b).size });
  }
  return out;
}

interface Site {
  /** The unloader to build, null when it already stands (or is planned). */
  unloader: PlanSpec | null;
  starts: Tile[];
}

/** Free tiles beside a ring tile, other than the one it starts from. */
function lateral(world: World, r: Tile, side: Dir): Tile[] {
  const d1 = ((side + 1) & 3) as Dir;
  const d3 = ((side + 3) & 3) as Dir;
  void world;
  return [
    { x: r.x + DX[d1]!, y: r.y + DY[d1]! },
    { x: r.x + DX[d3]!, y: r.y + DY[d3]! },
  ];
}

/** A ring tile can hold an unloader when its sides carry no belt that would be fed by mistake. */
export function ringOk(ctx: Ctx, r: Tile, side: Dir): boolean {
  return ctx.space.inBandMode(() => ringOkIn(ctx, r, side));
}

function ringOkIn(ctx: Ctx, r: Tile, side: Dir): boolean {
  const { world, space } = ctx;
  const out = { x: r.x + DX[side]!, y: r.y + DY[side]! };
  if (!space.free(out.x, out.y) || space.nearEmitter(out.x, out.y)) return false;
  return lateral(world, r, side).every((t) => !space.isBelt(t.x, t.y));
}

function existingUnloaders(ctx: Ctx, item: number): { x: number; y: number }[] {
  const { world } = ctx;
  const k = world.content.buildings.indexOf('unloader');
  const out: { x: number; y: number }[] = [];
  for (const b of world.state.buildings) if (b.kind === k && b.config === item && !b.removing) out.push(b);
  for (const p of world.state.plans) if (p.kind === k && p.config === item) out.push(p);
  return out;
}

function isRouterAt(ctx: Ctx, x: number, y: number): boolean {
  const { world } = ctx;
  const b = world.at(x, y);
  if (b) return world.def(b).behaviour === 'router';
  return world.state.plans.some((p) => p.x === x && p.y === y && world.defs[p.kind]!.behaviour === 'router');
}

/**
 * Start tiles of belts that begin at an existing unloader of an item. The first lane of an unloader starts with a
 * router, so its free sides are starts too; the unloader's own free sides count as well.
 */
export function reuseSite(ctx: Ctx, item: number): Site | null {
  return ctx.space.inBandMode(() => reuseSiteIn(ctx, item));
}

function reuseSiteIn(ctx: Ctx, item: number): Site | null {
  const { space } = ctx;
  const starts: Tile[] = [];
  const add = (t: Tile): void => {
    if (space.free(t.x, t.y) && space.emitters(t.x, t.y) <= 1 && !starts.some((o) => o.x === t.x && o.y === t.y)) starts.push(t);
  };
  for (const u of existingUnloaders(ctx, item)) {
    for (let d = 0; d < 4; d++) {
      const t = { x: u.x + DX[d]!, y: u.y + DY[d]! };
      if (isRouterAt(ctx, t.x, t.y)) for (let e = 0; e < 4; e++) add({ x: t.x + DX[e]!, y: t.y + DY[e]! });
      else add(t);
    }
  }
  return starts.length ? { unloader: null, starts } : null;
}

interface Branch {
  /** The lane tile that becomes a router. */
  router: Tile;
  start: Tile;
}

/** Whether `t` is a straight piece of a lane (a belt tile between two belt tiles in line) nothing pushes into. */
function straightPiece(ctx: Ctx, a: Tile, t: Tile, c: Tile): boolean {
  const unit = (p: Tile, q: Tile): boolean => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1;
  if (!unit(a, t) || !unit(t, c) || c.x - t.x !== t.x - a.x || c.y - t.y !== t.y - a.y) return false;
  const b = ctx.world.at(t.x, t.y);
  return ctx.space.emitters(t.x, t.y) === 0 && !(b && ctx.world.def(b).behaviour !== 'conveyor');
}

/** Spots where a lane of an item can be tapped: a straight piece of it whose side tile is free. */
export function branchSites(ctx: Ctx, item: number): Branch[] {
  const { space } = ctx;
  const out: Branch[] = [];
  for (const lane of ctx.mem.lanes) {
    if (lane.item !== item) continue;
    const at = (i: number): Tile => ({ x: lane.tiles[i]! % space.W, y: Math.floor(lane.tiles[i]! / space.W) });
    for (let i = 1; i + 1 < lane.tiles.length; i++) {
      const t = at(i);
      if (!straightPiece(ctx, at(i - 1), t, at(i + 1))) continue;
      for (const d of at(i - 1).x === t.x ? [0, 2] : [1, 3]) {
        const l = { x: t.x + DX[d]!, y: t.y + DY[d]! };
        const other = { x: t.x - DX[d]!, y: t.y - DY[d]! };
        if (space.free(l.x, l.y) && space.emitters(l.x, l.y) === 0 && !space.isBelt(other.x, other.y)) out.push({ router: t, start: l });
      }
    }
  }
  return out;
}

/** Candidate new unloaders: every free ring tile, each with the tile outward as the belt start. */
export function ringSites(ctx: Ctx, item: number): (Site & { at: Tile })[] {
  return ctx.space.inBandMode(() => ringSitesIn(ctx, item));
}

function ringSitesIn(ctx: Ctx, item: number): (Site & { at: Tile })[] {
  const out: (Site & { at: Tile })[] = [];
  const seen = new Set<number>();
  for (const store of storesOf(ctx.world)) {
    for (const [x, y, side] of edgeTiles(store)) {
      const key = tileKey(x, y, ctx.space.W);
      if (seen.has(key) || !ctx.space.free(x, y) || !ringOk(ctx, { x, y }, side)) continue;
      seen.add(key);
      const start = { x: x + DX[side]!, y: y + DY[side]! };
      out.push({ at: { x, y }, unloader: { kind: 'unloader', x, y, rot: side, config: item }, starts: [start] });
    }
  }
  return out;
}

/** Lane cost: ring tiles are for unloaders and entries only, so a lane may not run over them (but may end on a goal). */
export function laneCost(ctx: Ctx, goals: readonly Tile[] = []): (x: number, y: number) => number {
  const base = beltCost(ctx);
  const rings = new Set<number>();
  for (const store of storesOf(ctx.world)) for (const [x, y] of edgeTiles(store)) rings.add(tileKey(x, y, ctx.space.W));
  const exempt = new Set(goals.map((g) => tileKey(g.x, g.y, ctx.space.W)));
  return (x, y) => {
    const k = tileKey(x, y, ctx.space.W);
    return rings.has(k) && !exempt.has(k) ? Infinity : base(x, y);
  };
}

/** The shortest lane for one input into a crafter: tap a lane or unloader of the item, else a new unloader. */
export function laneFor(ctx: Ctx, item: number, goals: RouteGoal[]): { steps: BeltStep[]; unloader: PlanSpec | null; router: Tile | null; fan?: boolean } | null {
  const cost = laneCost(ctx, goals);
  const allow = new Set(goals.map((g) => ctx.space.idx(g.x, g.y)));
  const reuse = reuseSite(ctx, item)?.starts ?? [];
  const branches = branchSites(ctx, item);
  const starts = [...reuse, ...branches.map((b) => b.start)];
  if (starts.length) {
    starts.forEach((s) => allow.add(ctx.space.idx(s.x, s.y)));
    const steps = route(ctx.space, { starts, goals, cost, allow, cross: true, bridges: ctx.bridges === true });
    if (steps) {
      const first = steps[0]!;
      const br = branches.find((b) => b.start.x === first.x && b.start.y === first.y);
      return { steps, unloader: null, router: br?.router ?? null };
    }
  }
  const sites = ringSites(ctx, item);
  const fresh = sites.flatMap((s) => s.starts);
  fresh.forEach((s) => allow.add(ctx.space.idx(s.x, s.y)));
  const steps = route(ctx.space, { starts: fresh, goals, cost, allow, cross: true, bridges: ctx.bridges === true });
  if (!steps) return null;
  const first = steps[0]!;
  const site = sites.find((s) => s.starts[0]!.x === first.x && s.starts[0]!.y === first.y)!;
  return { steps, unloader: site.unloader, router: null };
}

export function adjacentGoals(ctx: Ctx, spot: Tile, size: number): RouteGoal[] {
  return ctx.space.inBandMode(() => {
    const out: RouteGoal[] = [];
    for (const [x, y, side] of edgeTiles({ x: spot.x, y: spot.y, size })) {
      if (ctx.space.free(x, y) && ctx.space.emitters(x, y) <= 1) out.push({ x, y, dir: opposite(side) });
    }
    return out;
  });
}

interface Attempt {
  plans: PlanSpec[];
  length: number;
  lines: Batch['lines'];
  lanes: Lane[];
}

export function claimLane(ctx: Ctx, steps: BeltStep[], unloader: PlanSpec | null, router: Tile | null = null, fan = false): PlanSpec[] {
  const plans: PlanSpec[] = [];
  if (fan && steps.length > 1) {
    // the first tile after a new unloader is a router: later lanes of the item start from its free sides
    const first = steps[0]!;
    plans.push({ kind: 'router', x: first.x, y: first.y, rot: 0 });
    ctx.space.claim(first.x, first.y, 1, 'router');
    steps = steps.slice(1);
  }
  if (unloader) {
    plans.push(unloader);
    ctx.space.claim(unloader.x, unloader.y, 1, 'unloader');
  }
  if (router) {
    plans.push({ kind: 'router', x: router.x, y: router.y, rot: 0 });
    ctx.space.claim(router.x, router.y, 1, 'router');
  }
  for (const s of steps) ctx.space.claim(s.x, s.y, 1, s.bridge ? 'bridge' : s.cross ? 'junction' : 'conveyor');
  plans.push(...beltPlans(steps.slice().reverse()));
  return plans;
}

function tryAt(ctx: Ctx, st: Station, spot: Tile, size: number, items: number[]): Attempt | null {
  const local: Ctx = { ...ctx, space: ctx.space.clone() };
  local.space.claim(spot.x, spot.y, size, 'crafter');
  const plans: PlanSpec[] = [{ kind: st.crafter, x: spot.x, y: spot.y, rot: 0, config: st.config }];
  const extra = st.annex ? st.annex(local, spot, size) : [];
  if (!extra) return because(ctx, 'annex');
  plans.push(...extra);
  let length = 0;
  const lanes: Lane[] = [];
  for (const item of st.supplied ? [] : items) {
    const goals = adjacentGoals(local, spot, size);
    const lane = laneFor(local, item, goals);
    if (!lane) return because(ctx, `lane ${ctx.world.content.materials.list[item]?.id} (goals ${goals.length}, ring ${ringSites(local, item).length})`);
    plans.push(...claimLane(local, lane.steps, lane.unloader, lane.router, lane.fan === true));
    lanes.push({ item, tiles: lane.steps.filter((t) => !t.bridge && !t.cross).map((t) => tileKey(t.x, t.y, local.space.W)) });
    length += lane.steps.length;
  }
  const lines: Batch['lines'] = [];
  if (st.output) {
    const goals = [...mergeGoals(local, 'hubout'), ...(st.supplied ? mergeGoals(local, 'products') : []), ...ringGoalsOf(local)];
    const starts = adjacentGoals(local, spot, size).map((g) => ({ x: g.x, y: g.y }));
    const allow = new Set([...starts, ...goals].map((g) => local.space.idx(g.x, g.y)));
    const steps = route(local.space, { starts, goals, cost: laneCost(local, goals), allow, cross: true, bridges: ctx.bridges === true });
    if (!steps) return because(ctx, `output (starts ${starts.length}, goals ${goals.length})`);
    plans.push(...claimLane(local, steps, null));
    lines.push({ cls: 'hubout', item: '', tiles: steps.map((s) => tileKey(s.x, s.y, local.space.W)) });
    length += steps.length;
  }
  return { plans, length, lines, lanes };
}

function ringGoalsOf(ctx: Ctx): RouteGoal[] {
  return storesOf(ctx.world).flatMap((store) => ringGoals(ctx.space, store, 9, 25, true));
}

/** Spots that worked after which the search stops (they come nearest first; looking further cost seconds). */
const GOOD_ENOUGH = 3;

/** The best spot for a station: the shortest lanes and output belt. */
function bestStation(ctx: Ctx, st: Station, size: number): Attempt | null {
  const { world } = ctx;
  const core = world.core!;
  const items = st.inputs.map((id) => world.content.materials.indexOf(id));
  const centre = { x: core.x + Math.floor(world.def(core).size / 2), y: core.y + Math.floor(world.def(core).size / 2) };
  let best: Attempt | null = null;
  // a big base fills the near ring: supplied stations look farther out, and farther after each watchdog stall
  // a station with an annex (the accelerator's coolant plant) needs a big free corner: it searches the whole range
  // at once (S2 ice found no room in 12 spots near the core and never built the accelerator)
  const [near, far, count] = st.annex ? [3, 60, 48] : st.supplied ? [3, Math.min(60, 26 + ctx.mem.stalls * 8), 18] : [2, 16, 14];
  let found = 0;
  for (const spot of spots(ctx, size, centre, near, far, count)) {
    const a = tryAt(ctx, st, spot, size, items);
    if (a && (!best || a.length < best.length)) best = a;
    if (a && ++found >= GOOD_ENOUGH) break;
  }
  return best;
}

/** Machines the drones can supply. Only those of supplied stations are marked: a marked machine is served in mark
 * order, so marking every crafter let the first ones (fed by their own lanes anyway) keep the drone busy. */
export const SUPPLY = new Set(['crafter', 'mega']);

/** A crafter with lanes from the core's unloaders (or drone supply) and a belt for its product. */
export function layStation(ctx: Ctx, st: Station): Batch | null {
  ctx.space.allowHub = true;
  const { world } = ctx;
  if (!world.core) return null;
  const def = world.content.buildings.get(st.crafter);
  const best = bestStation(ctx, st, def.size);
  if (!best) return null;
  const feed = st.supplied ? best.plans.filter((p) => SUPPLY.has(world.content.buildings.get(p.kind).behaviour)) : [];
  const batch: Batch = { plans: best.plans, lines: best.lines, lanes: best.lanes, feed, note: st.crafter };
  claimBatch(ctx.space, world, batch);
  const first = best.plans[0]!;
  const power = def.power?.use ? ensurePower(ctx, { x: first.x, y: first.y, size: def.size }) : [];
  if (!power) return null;
  batch.plans.push(...power);
  return batch;
}

/* ---------- Power plant: coal lane into a router chain with generators on both sides ---------- */

interface PlantShape {
  /** Routers in a row from `first` going `dir`. */
  routers: Tile[];
  gens: Tile[];
  /** Where the lane's last conveyor stands, facing `dir`. */
  entry: Tile;
  dir: Dir;
}

function plantShape(at: Tile, dir: Dir, n: number): PlantShape {
  const left = ((dir + 3) & 3) as Dir;
  const right = ((dir + 1) & 3) as Dir;
  const routers: Tile[] = [];
  const gens: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const r = { x: at.x + DX[dir]! * i, y: at.y + DY[dir]! * i };
    routers.push(r);
    gens.push({ x: r.x + DX[left]!, y: r.y + DY[left]! }, { x: r.x + DX[right]!, y: r.y + DY[right]! });
  }
  return { routers, gens, entry: { x: at.x - DX[dir]!, y: at.y - DY[dir]! }, dir };
}

function plantFree(ctx: Ctx, p: PlantShape): boolean {
  const { space } = ctx;
  return [...p.routers, ...p.gens, p.entry].every((t) => space.free(t.x, t.y) && space.emitters(t.x, t.y) === 0);
}

interface PlantPlan {
  lane: BeltStep[];
  unloader: PlanSpec | null;
  router: Tile | null;
  shape: PlantShape;
}

/** The shortest coal lane to any free place for the plant (several shapes around the core). */
function bestPlant(ctx: Ctx, n: number, item: number): PlantPlan | null {
  const core = ctx.world.core!;
  const centre = { x: core.x + 1, y: core.y + 1 };
  let best: PlantPlan | null = null;
  for (const at of spots(ctx, 3, centre, 8, 20)) {
    for (const dir of [0, 1, 2, 3] as Dir[]) {
      const shape = plantShape({ x: at.x + 1, y: at.y + 1 }, dir, n);
      if (!plantFree(ctx, shape)) continue;
      const local: Ctx = { ...ctx, space: ctx.space.clone() };
      for (const t of [...shape.routers, ...shape.gens]) local.space.claim(t.x, t.y, 1, 'router');
      const lane = laneFor(local, item, [{ x: shape.entry.x, y: shape.entry.y, dir }]);
      if (lane && (!best || lane.steps.length < best.lane.length)) best = { lane: lane.steps, unloader: lane.unloader, router: lane.router, shape };
    }
  }
  return best;
}

/** A row of `n` routers with `2n` combustion generators around it, fed with coal from the core. */
export function layPlant(ctx: Ctx, n: number, fuel: string): Batch | null {
  ctx.space.allowHub = true;
  if (!ctx.world.core) return null;
  const item = ctx.world.content.materials.indexOf(fuel);
  const best = bestPlant(ctx, n, item);
  if (!best) return null;
  const plans: PlanSpec[] = [];
  if (best.unloader) plans.push(best.unloader);
  if (best.router) plans.push({ kind: 'router', x: best.router.x, y: best.router.y, rot: 0 });
  plans.push(...beltPlans(best.lane.slice().reverse()));
  for (const r of best.shape.routers) plans.push({ kind: 'router', x: r.x, y: r.y, rot: 0 });
  for (const g of best.shape.gens) plans.push({ kind: 'combustion-generator', x: g.x, y: g.y, rot: 0 });
  const tiles = best.lane.filter((t) => !t.bridge && !t.cross).map((t) => tileKey(t.x, t.y, ctx.space.W));
  const batch: Batch = { plans, lines: [], lanes: [{ item, tiles }], note: 'plant' };
  claimBatch(ctx.space, ctx.world, batch);
  return batch;
}

/* ---------- Power nodes ---------- */

const NODE_REACH = 5.5;

/**
 * Power networks that can carry what hangs on them: something makes power there, and it makes at least half of
 * what the network's users take (by their ratings, which the worker's snapshot knows), or it is the network that
 * makes the most. A node on an island of nodes powers nothing: seed 6's particle accelerator and coolant pumps hung
 * on such an island, and the crown never came. An island with one small solar panel is no better:
 * S2 rust's two plate rollers ran at 4 % for 40 minutes while the accelerator waited for 40 plates.
 */
export function livePowerNets(world: World): Set<number> {
  const out = new Set<number>();
  const rated = powerGraph(world).nets.map((net) => {
    let make = 0;
    let use = 0;
    for (const m of net.members) {
      make += world.def(m).power?.make ?? 0;
      use += world.def(m).power?.use ?? 0;
    }
    return { make, use };
  });
  const most = rated.reduce((best, r, i) => (r.make > (rated[best]?.make ?? 0) ? i : best), 0);
  rated.forEach((r, i) => {
    if (r.make > 0 && (r.make * 2 >= r.use || i === most)) out.add(i);
  });
  return out;
}

function powerRects(ctx: Ctx): Rect[] {
  const { world } = ctx;
  const out: Rect[] = [];
  const core = world.core;
  if (core) out.push({ x: core.x, y: core.y, size: world.def(core).size });
  const live = livePowerNets(world);
  for (const b of world.state.buildings) {
    if (world.def(b).behaviour !== 'power-node' || b.removing) continue;
    const net = powerGraph(world).netOf.get(b.id);
    if (net === undefined || live.has(net)) out.push({ x: b.x, y: b.y, size: world.def(b).size });
  }
  for (const p of world.state.plans) if (world.defs[p.kind]!.behaviour === 'power-node') out.push({ x: p.x, y: p.y, size: world.defs[p.kind]!.size });
  return out;
}

/** Whether a tile touches the core or a docked container (those tiles are for unloaders and entries). */
function onRing(ctx: Ctx, x: number, y: number): boolean {
  return storesOf(ctx.world).some((s) => x >= s.x - 2 && x < s.x + s.size + 2 && y >= s.y - 2 && y < s.y + s.size + 2);
}

/** How many ring tiles could take a new unloader right now. */
export function ringRoom(ctx: Ctx): number {
  ctx.space.allowHub = true;
  const n = ringSites(ctx, 0).length;
  ctx.space.allowHub = false;
  return n;
}

/** The best free tile for a node within reach of `from` that gets closest to the grid; null when none is free. */
function nodeToward(ctx: Ctx, from: Rect, grid: Rect[]): { t: Tile; toGrid: number } | null {
  let best: { t: Tile; toGrid: number; score: number } | null = null;
  for (let y = from.y - 6; y <= from.y + from.size + 5; y++) {
    for (let x = from.x - 6; x <= from.x + from.size + 5; x++) {
      if (!ctx.space.free(x, y) || ctx.space.nearEmitter(x, y) || ctx.space.isBelt(x, y) || onRing(ctx, x, y)) continue;
      const here = { x, y, size: 1 };
      if (gapBetween(here, from) > NODE_REACH) continue;
      const toGrid = Math.min(...grid.map((s) => gapBetween(here, s)));
      const score = toGrid + gapBetween(here, from) * 0.1;
      if (!best || score < best.score) best = { t: { x, y }, toGrid, score };
    }
  }
  return best;
}

/**
 * Power nodes so a consumer at `rect` joins the grid: none when a node already reaches it, else a short chain of
 * plain nodes towards the core (each new node links to what is in its range when it is built). Null when the
 * chain does not fit. `relink` lays at least one node: for a finished building whose network went dark.
 */
export function ensurePower(ctx: Ctx, rect: Rect, hops = 5, extra: readonly Rect[] = [], relink = false): PlanSpec[] | null {
  const grid = [...powerRects(ctx), ...extra];
  if (!relink && grid.slice(1).some((n) => gapBetween(n, rect) <= NODE_REACH)) return [];
  const plans: PlanSpec[] = [];
  let at = rect;
  for (let hop = 0; hop < hops; hop++) {
    const next = nodeToward(ctx, at, grid);
    if (!next) return null;
    ctx.space.claim(next.t.x, next.t.y, 1, 'power-node');
    plans.push({ kind: 'power-node', x: next.t.x, y: next.t.y, rot: 0 });
    at = { x: next.t.x, y: next.t.y, size: 1 };
    if (grid.some((g) => gapBetween(g, at) <= NODE_REACH)) return plans;
  }
  return null;
}

/* ---------- Containers docked to the core ---------- */

/** A container touching the core with as few ring tiles as it can (a corner), preferring the hub side. */
export function layDock(ctx: Ctx, kind: string): Batch | null {
  ctx.space.allowHub = true;
  ctx.space.allowBand = true;
  const { world } = ctx;
  const core = world.core;
  if (!core) return null;
  const cs = world.def(core).size;
  const size = world.content.buildings.get(kind).size;
  const found: { t: Tile; touch: number; far: number }[] = [];
  for (let k = -(size - 1); k < cs; k++) {
    const options: [Tile, number][] = [
      [{ x: core.x + cs, y: core.y + k }, 0],
      [{ x: core.x + k, y: core.y + cs }, 1],
      [{ x: core.x - size, y: core.y + k }, 2],
      [{ x: core.x + k, y: core.y - size }, 3],
    ];
    for (const [t, side] of options) {
      if (!ctx.space.freeRect(t.x, t.y, size)) continue;
      const lo = side % 2 === 0 ? core.y : core.x;
      const at = side % 2 === 0 ? t.y : t.x;
      const touch = Math.min(at + size, lo + cs) - Math.max(at, lo);
      found.push({ t, touch, far: side < 2 ? 0 : 1 });
    }
  }
  found.sort((a, b) => a.far - b.far || a.touch - b.touch);
  const best = found[0];
  if (!best) return null;
  const batch: Batch = { plans: [{ kind, x: best.t.x, y: best.t.y, rot: 0 }], lines: [], note: kind };
  claimBatch(ctx.space, world, batch);
  return batch;
}
