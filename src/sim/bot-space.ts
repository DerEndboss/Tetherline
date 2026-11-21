import { DX, DY, opposite } from './grid';
import { storageInfo } from './storage';
import type { Dir } from './state';
import type { World } from './world';

/**
 * Autopilot geometry: which tiles a new building may take, ore patches, and the belt router. Everything here
 * only reads the world; the bot turns the results into ghosts (plan / place-many commands).
 */

export interface Tile {
  x: number;
  y: number;
}

/** One conveyor (or a junction where `cross` is set) of a routed line; `rot` is the way it moves items. */
export interface BeltStep extends Tile {
  rot: Dir;
  cross?: boolean;
  /** A bridge conveyor (its partner is the next bridge along `rot`, linked when it is built). */
  bridge?: boolean;
}

/** An ore patch: tiles of one ore floor, grouped (flecks within 2 tiles belong together). */
export interface Patch {
  floor: number;
  item: number;
  hardness: number;
  tiles: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
}

const patchCache = new WeakMap<Uint8Array, Patch[]>();

function neighboursOf(tile: number, w: number, h: number): number[] {
  const x = tile % w;
  const y = Math.floor(tile / w);
  const out: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  }
  return out;
}

function flood(world: World, start: number, floor: number, seen: Uint8Array): number[] {
  const { map } = world.state;
  const tiles: number[] = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const t = stack.pop()!;
    tiles.push(t);
    for (const n of neighboursOf(t, map.w, map.h)) {
      if (seen[n] || map.floor[n] !== floor) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return tiles;
}

function makePatch(world: World, floor: number, tiles: number[]): Patch | null {
  const def = world.content.floors.list[floor - 1];
  if (!def?.ore) return null;
  const { w } = world.state.map;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let sx = 0;
  let sy = 0;
  for (const t of tiles) {
    const x = t % w;
    const y = Math.floor(t / w);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
    sx += x;
    sy += y;
  }
  const item = world.content.materials.indexOf(def.ore);
  return { floor, item, hardness: def.hardness ?? 1, tiles, x0, y0, x1, y1, cx: sx / tiles.length, cy: sy / tiles.length };
}

/** Every ore patch of the map (cached: ore floors never change). Liquids are not patches. */
export function patchesOf(world: World): Patch[] {
  const { map } = world.state;
  const hit = patchCache.get(map.floor);
  if (hit) return hit;
  const seen = new Uint8Array(map.floor.length);
  const out: Patch[] = [];
  for (let i = 0; i < map.floor.length; i++) {
    const f = map.floor[i]!;
    if (!f || seen[i]) continue;
    const p = makePatch(world, f, flood(world, i, f, seen));
    if (p) out.push(p);
  }
  patchCache.set(map.floor, out);
  return out;
}

const rareCache = new WeakMap<object, Set<number>>();

/** Floor bytes of the ores the order chain cannot do without (the spawn table's `needed` groups). */
function rareFloors(world: World): Set<number> {
  const hit = rareCache.get(world.content);
  if (hit) return hit;
  const out = new Set<number>();
  for (const s of world.content.spawns) if (s.needed && world.content.floors.has(s.floor)) out.add(world.content.floors.indexOf(s.floor) + 1);
  rareCache.set(world.content, out);
  return out;
}

/** The map and everything the bot may not build on right now (buildings, ghosts, its own reservations). */
export class Space {
  readonly W: number;
  readonly H: number;
  /** Tiles taken by ghosts or reserved by the bot (1 = ghost, 2 = reserved). */
  private readonly taken: Uint8Array;
  /** Per tile: how many item pushers (drills, crafters, unloaders ...) stand beside it; belts there would pick items up. */
  private readonly emit: Uint8Array;
  /** Tiles holding a belt, junction or router (or a ghost of one). */
  private readonly belt: Uint8Array;
  /** Tiles in line with a bridge, within its range: a new bridge there could link to it by mistake. */
  private readonly bridged: Uint8Array;

  /** Hub planners (stations, plant, nodes) may use the hub zone; belts to the core may not. */
  allowHub = false;
  /** The ring around the core and its docked containers: only unloaders and entries may use it. */
  private readonly band: Uint8Array;
  allowBand = false;

  constructor(
    readonly world: World,
    reserved: ReadonlySet<number>,
    hub: ReadonlySet<number> = new Set(),
    from?: Space,
  ) {
    const { map } = world.state;
    this.W = map.w;
    this.H = map.h;
    if (from) {
      this.taken = from.taken.slice();
      this.emit = from.emit.slice();
      this.belt = from.belt.slice();
      this.bridged = from.bridged.slice();
      this.band = from.band;
      this.allowHub = from.allowHub;
      this.allowBand = from.allowBand;
      return;
    }
    this.taken = new Uint8Array(this.W * this.H);
    this.emit = new Uint8Array(this.W * this.H);
    this.belt = new Uint8Array(this.W * this.H);
    this.bridged = new Uint8Array(this.W * this.H);
    this.band = new Uint8Array(this.W * this.H);
    this.markBand();
    for (const r of hub) this.taken[r] = 3;
    for (const r of reserved) this.taken[r] = 2;
    for (const p of world.state.plans) this.stamp(p.x, p.y, world.defs[p.kind]!.size, 1, world.defs[p.kind]!.behaviour);
    for (const b of world.state.buildings) this.markEmit(b.x, b.y, world.defs[b.kind]!.size, world.defs[b.kind]!.behaviour);
  }

  private markBand(): void {
    const { world } = this;
    const core = world.core;
    if (!core) return;
    const rects = [core, ...[...storageInfo(world).docked].map((id) => world.byId.get(id)).filter((b) => b !== undefined)];
    for (const b of rects) {
      const size = world.def(b).size;
      for (let i = 0; i < size; i++) {
        for (const [x, y] of [[b.x + i, b.y - 1], [b.x + i, b.y + size], [b.x - 1, b.y + i], [b.x + size, b.y + i]] as const) {
          if (this.in(x, y)) this.band[y * this.W + x] = 1;
        }
      }
    }
  }

  /** Whether a tile lies in the band around the core and its docked containers. */
  inBand(x: number, y: number): boolean {
    return this.band[y * this.W + x] === 1;
  }

  /** A copy to try things in without disturbing this one. */
  clone(): Space {
    return new Space(this.world, new Set(), new Set(), this);
  }

  private stamp(x: number, y: number, size: number, value: number, behaviour: string): void {
    for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) if (this.in(tx, ty)) this.taken[ty * this.W + tx] = value;
    this.markEmit(x, y, size, behaviour);
  }

  /** Whether a conveyor (built or ghost) stands on a tile. A junction does not count: nothing can pollute it. */
  isBelt(x: number, y: number): boolean {
    return this.in(x, y) && this.belt[y * this.W + x] === 1;
  }

  /** Whether any of the four tiles beside this one holds a belt, junction or bridge (a bridge end would feed it). */
  touchesBelt(x: number, y: number): boolean {
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (this.in(nx, ny) && this.belt[ny * this.W + nx]! > 0) return true;
    }
    return false;
  }

  /** Whether a bridge placed here could link to another bridge in line with it. */
  bridgeNear(x: number, y: number): boolean {
    return this.bridged[y * this.W + x] === 1;
  }

  private markBridge(x: number, y: number): void {
    for (let i = -BRIDGE_REACH; i <= BRIDGE_REACH; i++) {
      if (this.in(x + i, y)) this.bridged[y * this.W + x + i] = 1;
      if (this.in(x, y + i)) this.bridged[(y + i) * this.W + x] = 1;
    }
  }

  private markEmit(x: number, y: number, size: number, behaviour: string): void {
    if (behaviour === 'bridge') this.markBridge(x, y);
    if (BELTS.has(behaviour) && this.in(x, y)) this.belt[y * this.W + x] = behaviour === 'junction' ? 2 : 1;
    if (!EMITTERS.has(behaviour)) return;
    for (let i = 0; i < size; i++) {
      this.bump(x + size, y + i);
      this.bump(x - 1, y + i);
      this.bump(x + i, y + size);
      this.bump(x + i, y - 1);
    }
  }

  private bump(x: number, y: number): void {
    if (this.in(x, y)) this.emit[y * this.W + x]!++;
  }

  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }

  idx(x: number, y: number): number {
    return y * this.W + x;
  }

  /** Land that can be built on at all (no void, rock or deep water). */
  terrain(x: number, y: number): boolean {
    if (!this.in(x, y)) return false;
    const { map } = this.world.state;
    const i = y * this.W + x;
    if (!map.ground[i] || map.ridge[i]) return false;
    const f = map.floor[i]!;
    return !(f > 0 && this.world.content.floors.list[f - 1]?.deep);
  }

  /** Whether a tile is empty: buildable land with no building, ghost or reservation. */
  free(x: number, y: number): boolean {
    if (!this.terrain(x, y) || this.world.occ[y * this.W + x] !== 0) return false;
    if (!this.allowBand && this.band[y * this.W + x] === 1) return false;
    const t = this.taken[y * this.W + x]!;
    return t === 0 || (t === 3 && this.allowHub);
  }

  /** Runs `fn` with the band rule off (unloader sites, entries and docking look at the band itself). */
  inBandMode<T>(fn: () => T): T {
    const saved = this.allowBand;
    this.allowBand = true;
    try {
      return fn();
    } finally {
      this.allowBand = saved;
    }
  }

  freeRect(x: number, y: number, size: number): boolean {
    for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) if (!this.free(tx, ty)) return false;
    return true;
  }

  /**
   * Whether a square covers ore the round mines late and cannot do without (titanium, tungsten, lead or tin, the
   * world ore: the spawn table's `needed` groups). S5 ice: a printer and a foundry stood on the map's only tungsten
   * patch, no electric drill fitted any more, and the run stopped at "carbide".
   */
  coversRareOre(x: number, y: number, size: number): boolean {
    const rare = rareFloors(this.world);
    const { floor } = this.world.state.map;
    for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) if (this.in(tx, ty) && rare.has(floor[ty * this.W + tx]!)) return true;
    return false;
  }

  /** Whether something that pushes items out stands next to this tile. */
  nearEmitter(x: number, y: number): boolean {
    return this.emit[y * this.W + x]! > 0;
  }

  /** How many pushers stand beside a tile. */
  emitters(x: number, y: number): number {
    return this.emit[y * this.W + x]!;
  }

  /** Marks a footprint as taken for the rest of this planning pass (so the next piece avoids it). */
  claim(x: number, y: number, size: number, behaviour = 'none'): void {
    this.stamp(x, y, size, 1, behaviour);
  }

  floorAt(x: number, y: number): number {
    return this.in(x, y) ? (this.world.state.map.floor[y * this.W + x] ?? 0) : 0;
  }
}

/** Behaviours that hand items to whatever conveyor stands beside them. */
/** Bridge conveyors link along their line up to this many tiles. */
export const BRIDGE_REACH = 4;
const BELTS = new Set(['conveyor', 'junction', 'router', 'sorter', 'overflow', 'bridge']);
const EMITTERS = new Set(['drill', 'crafter', 'mega', 'unloader', 'router', 'bridge']);

/* ---------- Belt router ---------- */

export interface RouteGoal extends Tile {
  /** The way the last belt tile faces (into the target). */
  dir: Dir;
  /** Extra cost of ending here (a dear goal is taken only when nothing cheaper is near). */
  cost?: number;
  /** The goal is a store: the last belt becomes a junction, which no unloader beside it can fill by mistake. */
  store?: boolean;
}

export interface RouteRequest {
  starts: Tile[];
  goals: RouteGoal[];
  /** Extra cost of stepping on a tile (>= 0). */
  cost?: (x: number, y: number) => number;
  /** Tiles exempt from the "next to an emitter" ban (the start beside its own source, the goal beside its crafter). */
  allow?: ReadonlySet<number>;
  /** Lets a line cross an existing straight belt with a junction. */
  cross?: boolean;
  /** Lets a line hop over anything with bridge conveyors (up to BRIDGE_REACH tiles in a straight line). */
  bridges?: boolean;
  limit?: number;
}

/** Walking on an allowed tile costs this much: such tiles sit beside a pusher, so a line may only end there. */
const ALLOW_COST = 50;

class MinHeap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const ks = this.keys;
    const vs = this.vals;
    let i = ks.length;
    ks.push(key);
    vs.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p]! <= key) break;
      ks[i] = ks[p]!;
      vs[i] = vs[p]!;
      i = p;
    }
    ks[i] = key;
    vs[i] = val;
  }
  pop(): number {
    const ks = this.keys;
    const vs = this.vals;
    const top = vs[0]!;
    const lastK = ks.pop()!;
    const lastV = vs.pop()!;
    const n = ks.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && ks[c + 1]! < ks[c]!) c++;
        if (ks[c]! >= lastK) break;
        ks[i] = ks[c]!;
        vs[i] = vs[c]!;
        i = c;
      }
      ks[i] = lastK;
      vs[i] = lastV;
    }
    return top;
  }
}

/** An existing conveyor that a new line may cross: straight section, running across `dir`. */
function crossable(space: Space, x: number, y: number, dir: Dir): boolean {
  const w = space.world;
  const b = w.at(x, y);
  if (!b || w.def(b).behaviour !== 'conveyor' || b.rot === dir || b.rot === opposite(dir)) return false;
  const back = w.at(x - DX[b.rot]!, y - DY[b.rot]!);
  const front = w.at(x + DX[b.rot]!, y + DY[b.rot]!);
  const straight = (o: typeof b | undefined) => o !== undefined && w.def(o).behaviour === 'conveyor' && o.rot === b.rot;
  return straight(back) && straight(front);
}

interface Node {
  x: number;
  y: number;
  d: number;
  /** Cost when it was queued; a node whose tile was reached cheaper since is stale and skipped. */
  g?: number;
  /** A finished line waiting for its goal cost to be paid: the way the last belt faces, and its parent node. */
  end?: { dir: Dir; parent: number; store: boolean };
}

/**
 * Cost and parent per (tile, direction), shared by every search: a search marks the entries it wrote with its own
 * stamp, so starting one costs nothing (allocating and filling 2 x 9 x W x H numbers per search was a third of
 * the bot's time). Only a cache: no search sees another's entries.
 */
const table = { cost: new Float32Array(0), from: new Int32Array(0), stamp: new Uint32Array(0), gen: 0 };

function claimTable(n: number): number {
  if (table.cost.length < n) {
    table.cost = new Float32Array(n);
    table.from = new Int32Array(n);
    table.stamp = new Uint32Array(n);
    table.gen = 0;
  }
  return ++table.gen;
}

/** How far a line may wander outside the box around its starts and goals. */
const ROAM = 24;

/** Search state of one route call: best cost per (tile, direction), parents, and the open list. */
class Search {
  private readonly gen: number;
  /** Tiles a line may use: the box around starts and goals, grown by ROAM. */
  private readonly area = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  readonly heap = new MinHeap();
  readonly nodes: Node[] = [];
  private readonly goalAt = new Map<number, RouteGoal[]>();
  /** Band tiles a line may use: its starts, its goals and the tile in front of each store goal. */
  private readonly bandOk = new Set<number>();
  private readonly field: Float32Array;

  constructor(
    readonly space: Space,
    readonly req: RouteRequest,
  ) {
    this.gen = claimTable(space.W * space.H * 9);
    for (const t of req.starts) {
      this.bandOk.add(space.idx(t.x, t.y));
      this.widen(t);
    }
    for (const g of req.goals) {
      const k = space.idx(g.x, g.y);
      this.bandOk.add(k);
      if (g.store) this.bandOk.add(space.idx(g.x - DX[g.dir]!, g.y - DY[g.dir]!));
      this.goalAt.set(k, [...(this.goalAt.get(k) ?? []), g]);
      this.widen(g);
    }
    this.clampArea();
    this.field = this.buildField();
  }

  private clampArea(): void {
    const a = this.area;
    a.x0 = Math.max(0, a.x0);
    a.y0 = Math.max(0, a.y0);
    a.x1 = Math.min(this.space.W - 1, Math.max(a.x0, a.x1));
    a.y1 = Math.min(this.space.H - 1, Math.max(a.y0, a.y1));
  }

  private widen(t: Tile): void {
    const a = this.area;
    a.x0 = Math.min(a.x0, t.x - ROAM);
    a.y0 = Math.min(a.y0, t.y - ROAM);
    a.x1 = Math.max(a.x1, t.x + ROAM);
    a.y1 = Math.max(a.y1, t.y + ROAM);
  }

  private inArea(x: number, y: number): boolean {
    const a = this.area;
    return x >= a.x0 && y >= a.y0 && x <= a.x1 && y <= a.y1;
  }

  costAt(k: number): number {
    return table.stamp[k] === this.gen ? table.cost[k]! : Infinity;
  }

  fromAt(k: number): number {
    return table.stamp[k] === this.gen ? table.from[k]! : -1;
  }

  key(x: number, y: number, d: number): number {
    return (y * this.space.W + x) * 9 + d;
  }

  /**
   * The cheapest way to any goal on an empty map: steps plus the goal's own cost. Never too high, and it knows
   * that a dear goal (a core ring tile) costs its price, so the search does not flood everything cheaper first.
   */
  heur(x: number, y: number): number {
    const a = this.area;
    return this.field[(y - a.y0) * (a.x1 - a.x0 + 1) + (x - a.x0)]!;
  }

  /** The L1 distance transform from the goals (seeded with their costs) over the search area: two passes. */
  private buildField(): Float32Array {
    const a = this.area;
    const w = a.x1 - a.x0 + 1;
    const h = a.y1 - a.y0 + 1;
    const f = new Float32Array(w * h).fill(Infinity);
    for (const g of this.req.goals) {
      const i = (g.y - a.y0) * w + (g.x - a.x0);
      // stepping onto a goal pays its tile cost too (the extra for a tile beside a pusher, the request's own)
      f[i] = Math.min(f[i]!, (g.cost ?? 0) + tileCost(this, g.x, g.y));
    }
    for (let i = 0; i < w * h; i++) f[i] = Math.min(f[i]!, i % w > 0 ? f[i - 1]! + 1 : Infinity, i >= w ? f[i - w]! + 1 : Infinity);
    for (let i = w * h - 1; i >= 0; i--) f[i] = Math.min(f[i]!, i % w < w - 1 ? f[i + 1]! + 1 : Infinity, i + w < w * h ? f[i + w]! + 1 : Infinity);
    return f;
  }

  usable(x: number, y: number): boolean {
    const { space, req } = this;
    if (!this.inArea(x, y)) return false;
    const k = y * space.W + x;
    const open = space.free(x, y) || (space.inBand(x, y) && this.bandOk.has(k) && this.freeInBand(x, y));
    return open && (!space.nearEmitter(x, y) || (req.allow?.has(k) ?? false));
  }

  /** Free apart from the band rule. */
  private freeInBand(x: number, y: number): boolean {
    const saved = this.space.allowBand;
    this.space.allowBand = true;
    const ok = this.space.free(x, y);
    this.space.allowBand = saved;
    return ok;
  }

  push(n: Node, g: number, prev: number): void {
    const k = this.key(n.x, n.y, n.d);
    if (g >= this.costAt(k)) return;
    table.stamp[k] = this.gen;
    table.cost[k] = g;
    table.from[k] = prev;
    n.g = g;
    this.nodes.push(n);
    this.heap.push(g + this.heur(n.x, n.y), this.nodes.length - 1);
  }

  /** The goal this node completes, if it faces a legal way. */
  finish(n: Node): RouteGoal | undefined {
    if (n.d >= 5) return undefined; // a line may not end on a bridge: only a conveyor can face the crafter
    // a junction passes items straight on, so a store entry must be approached head-on
    return (this.goalAt.get(this.space.idx(n.x, n.y)) ?? []).find((o) => n.d === 4 || (o.store ? n.d === o.dir : o.dir !== opposite(n.d as Dir)));
  }
}

/** Pops one node: finishes the line, queues a dear goal, or expands the neighbours. Returns the line when done. */
function visit(s: Search): BeltStep[] | null {
  const index = s.heap.pop();
  const n = s.nodes[index]!;
  if (n.end) return once(build(s, s.nodes[n.end.parent]!, n.end.dir, n.end.store));
  if (n.g !== undefined && n.g > s.costAt(s.key(n.x, n.y, n.d))) return null;
  const line = arrive(s, n, index);
  if (line) return line;
  const g = s.costAt(s.key(n.x, n.y, n.d));
  for (let nd = 0; nd < 4; nd++) {
    if (n.d === 4 || nd !== opposite(heading(n.d))) expand(s, n, nd as Dir, g, index);
  }
  return null;
}

/** At a goal: the line when it is free, else the goal queued at its price (null while the search goes on). */
function arrive(s: Search, n: Node, index: number): BeltStep[] | null {
  const end = s.finish(n);
  if (!end) return null;
  if (!end.cost) return once(build(s, n, end.dir, end.store === true));
  s.nodes.push({ ...n, end: { dir: end.dir, parent: index, store: end.store === true } });
  s.heap.push(s.costAt(s.key(n.x, n.y, n.d)) + end.cost, s.nodes.length - 1);
  return null;
}

/** The line, or null when it crosses itself (a tile twice makes a ring that holds its items for good). */
function once(steps: BeltStep[]): BeltStep[] | null {
  const seen = new Set(steps.map((t) => t.y * 65536 + t.x));
  return seen.size === steps.length ? steps : null;
}

/** Shortest belt (few turns, no pickup from emitters) from any start to any goal; null when none exists. */
export function route(space: Space, req: RouteRequest): BeltStep[] | null {
  const s = new Search(space, req);
  for (const t of req.starts) if (s.usable(t.x, t.y)) s.push({ x: t.x, y: t.y, d: 4 }, 0, -1);
  const limit = req.limit ?? 60000;
  for (let steps = 0; s.heap.size && steps < limit; steps++) {
    const done = visit(s);
    if (done) return done;
  }
  return null;
}

/** The way a node was entered (hop nodes are stored as 5 + way). */
function heading(d: number): Dir {
  return (d >= 5 ? d - 5 : d) as Dir;
}

/** Whether a hop may start at a node: bridges allowed, and a hop in progress keeps its way. */
function canHop(s: Search, n: Node, nd: Dir): boolean {
  if (!s.req.bridges) return false;
  return n.d >= 5 ? n.d - 5 === nd : !s.space.bridgeNear(n.x, n.y);
}

/** A hop over anything with two bridge conveyors, `k` tiles apart. */
function hop(s: Search, n: Node, nd: Dir, g: number, prev: number): void {
  if (!canHop(s, n, nd)) return;
  for (let k = 2; k <= BRIDGE_REACH; k++) {
    const ux = n.x + DX[nd]! * k;
    const uy = n.y + DY[nd]! * k;
    if (!s.usable(ux, uy) || s.space.bridgeNear(ux, uy) || s.space.touchesBelt(ux, uy)) continue;
    const extra = tileCost(s, ux, uy);
    if (Number.isFinite(extra)) s.push({ x: ux, y: uy, d: 5 + nd }, g + 7 + extra, prev);
  }
}

/** Extra cost of putting a belt on a tile (the request's own cost, plus the price of walking a pusher's side). */
function tileCost(s: Search, x: number, y: number): number {
  return (s.req.cost ? s.req.cost(x, y) : 0) + (s.req.allow?.has(y * s.space.W + x) ? ALLOW_COST : 0);
}

/**
 * Crossing a belt that runs across the line: a junction, then on to the tile beyond. The belt before the junction
 * may turn into it (a belt faces the next tile, however it was entered); only a bridge end cannot turn. When it had
 * to arrive straight, the search looped round a 2x2 square to enter that tile heading the right way, and the line
 * crossed itself: a ring of four belts that three product lines fed and that never let go (S5 rust, plastic stood
 * at 0 for 90 minutes).
 */
function crossStep(s: Search, n: Node, nd: Dir, g: number, prev: number): void {
  const nx = n.x + DX[nd]!;
  const ny = n.y + DY[nd]!;
  if (!s.req.cross || n.d === 4 || (n.d >= 5 && heading(n.d) !== nd) || !crossable(s.space, nx, ny, nd)) return;
  const bx = nx + DX[nd]!;
  const by = ny + DY[nd]!;
  const turn = heading(n.d) !== nd ? 0.5 : 0;
  if (s.usable(bx, by)) s.push({ x: bx, y: by, d: nd }, g + 6 + turn, prev);
}

function expand(s: Search, n: Node, nd: Dir, g: number, prev: number): void {
  hop(s, n, nd, g, prev);
  const nx = n.x + DX[nd]!;
  const ny = n.y + DY[nd]!;
  if (!s.usable(nx, ny)) {
    crossStep(s, n, nd, g, prev);
    return;
  }
  const extra = tileCost(s, nx, ny);
  const turn = n.d !== 4 && heading(n.d) !== nd ? 0.5 : 0;
  if (Number.isFinite(extra)) s.push({ x: nx, y: ny, d: nd }, g + 1 + turn + extra, prev);
}

/** Walks the parent chain back and turns tiles into belt steps (rot = way to the next tile; last = goal dir). */
function build(s: Search, last: Node, goalDir: Dir, store: boolean): BeltStep[] {
  const chain: Node[] = [];
  let cur: Node | undefined = last;
  while (cur) {
    chain.push(cur);
    const parent: number = s.fromAt(s.key(cur.x, cur.y, cur.d));
    cur = parent >= 0 ? s.nodes[parent] : undefined;
  }
  chain.reverse();
  return chain.flatMap((n, i) => stepsOf(n, chain[i + 1], goalDir, store));
}

/** The way a belt tile at `n` faces: along the hop it starts or ends, else towards the next tile (or the goal). */
function facing(n: Node, nxt: Node | undefined, goalDir: Dir): Dir {
  if (nxt && nxt.d >= 5) return heading(nxt.d);
  if (n.d >= 5) return heading(n.d);
  return nxt ? heading(nxt.d) : goalDir;
}

/** The belt steps of one node: the tile itself, and the junction it hops over when the next tile is two away. */
function stepsOf(n: Node, nxt: Node | undefined, goalDir: Dir, store: boolean): BeltStep[] {
  const rot = facing(n, nxt, goalDir);
  const bridge = n.d >= 5 || (nxt !== undefined && nxt.d >= 5);
  const out: BeltStep[] = [{ x: n.x, y: n.y, rot, bridge: bridge ? true : undefined, cross: !nxt && store ? true : undefined }];
  if (nxt && nxt.d < 5 && Math.abs(nxt.x - n.x) + Math.abs(nxt.y - n.y) === 2) out.push({ x: n.x + DX[rot]!, y: n.y + DY[rot]!, rot, cross: true });
  return out;
}
