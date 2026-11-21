import { accepts, offer } from '../items';
import { coreRoom, storeInCore } from '../storage';
import type { TickContext } from '../blocks/types';
import type { Building, DroneState } from '../state';
import type { World } from '../world';
import { approach, centre, spread } from './fly';
import { fleetStats, opsOf, type FleetStats } from './tech';

/**
 * What a drone does when there is nothing to build: finish a delivery, keep marked machines supplied from the
 * core, (helpers) mine ore into the core, or wait. All of it is deterministic and works from the core stock.
 */

/** Behaviours the player may mark for supply: machines that eat items. */
const SUPPLYABLE = new Set(['crafter', 'generator', 'mega']);
const NEAR = 0.6;
/** Idle drones look for new work this often (ticks) instead of every tick. */
const SEARCH_EVERY = 10;
const PARK_SLACK = 2.5;

export function canSupply(w: World, b: Building): boolean {
  return SUPPLYABLE.has(w.def(b).behaviour);
}

function setAct(d: DroneState, act: DroneState['act']): void {
  d.act = act;
  d.task = 'idle';
  d.target = act === 'fetch' || act === 'deliver' ? d.target : -1;
  d.waiting = '';
}

/** How many of `item` the machine would take right now, probed up to `max` (without changing it). */
function roomFor(w: World, core: Building, b: Building, item: number, max: number): number {
  const had = b.items[item];
  let room = 0;
  while (room < max) {
    b.items[item] = (had ?? 0) + room;
    if (!accepts(w, core, b, item)) break;
    room++;
  }
  b.items[item] = had ?? 0;
  return room;
}

interface Delivery {
  item: number;
  n: number;
}

/** The best delivery to a marked machine: the item it holds least of, as much as fits (and the hold carries). */
function needOf(w: World, core: Building, b: Building, cargo: number): Delivery | null {
  let best: Delivery | null = null;
  let held = Infinity;
  for (let item = 0; item < w.state.stock.length; item++) {
    const have = w.state.stock[item] ?? 0;
    if (have <= 0 || (b.items[item] ?? 0) >= held) continue;
    const n = roomFor(w, core, b, item, Math.min(cargo, have));
    if (n >= Math.min(cargo, 4, have)) {
      best = { item, n };
      held = b.items[item] ?? 0;
    }
  }
  return best;
}

/** Marked machines nobody is already bringing items to, in mark order. */
function unattended(w: World, self: DroneState): Building[] {
  const taken = new Set(w.state.drones.filter((o) => o !== self && (o.act === 'fetch' || o.act === 'deliver')).map((o) => o.target));
  const out: Building[] = [];
  for (const id of opsOf(w).supply) {
    const b = w.byId.get(id);
    if (b && w.ready(b) && !taken.has(id)) out.push(b);
  }
  return out;
}

function startSupply(w: World, d: DroneState, stats: FleetStats): boolean {
  const core = w.core;
  if (!core) return false;
  for (const b of unattended(w, d)) {
    const need = needOf(w, core, b, stats.cargo);
    if (!need) continue;
    d.carry = { item: need.item, n: 0 };
    d.hold = need.n;
    d.target = b.id;
    setAct(d, 'fetch');
    return true;
  }
  return false;
}

function fetch(w: World, d: DroneState, ctx: TickContext, stats: FleetStats): void {
  const core = w.core;
  const target = w.byId.get(d.target);
  if (!core || !target || !d.carry) return stopHaul(d);
  const c = centre(w, core);
  if (!approach(d, c.x, c.y, ctx.dt, stats, 1.5)) return;
  const take = Math.min(d.hold ?? 0, w.state.stock[d.carry.item] ?? 0);
  w.state.stock[d.carry.item]! -= take;
  d.carry.n = take;
  d.hold = 0;
  setAct(d, take > 0 ? 'deliver' : 'idle');
  if (take <= 0) stopHaul(d);
}

function deliver(w: World, d: DroneState, ctx: TickContext, stats: FleetStats): void {
  const core = w.core;
  const target = w.byId.get(d.target);
  if (!core || !d.carry) return stopHaul(d);
  if (!target) return setAct(d, 'return');
  const c = centre(w, target);
  if (!approach(d, c.x, c.y, ctx.dt, stats, w.def(target).size / 2 + NEAR)) return;
  while (d.carry.n > 0 && offer(w, core, target, d.carry.item)) d.carry.n--;
  setAct(d, 'return');
}

function giveBack(w: World, d: DroneState, ctx: TickContext, stats: FleetStats): void {
  const core = w.core;
  if (!core) return;
  const c = centre(w, core);
  if (!approach(d, c.x, c.y, ctx.dt, stats, 1.5)) return;
  if (d.carry && d.carry.n > 0) storeInCore(w, d.carry.item, d.carry.n);
  stopHaul(d);
}

function stopHaul(d: DroneState): void {
  delete d.carry;
  d.hold = 0;
  setAct(d, 'idle');
}

/* ---------- Mining (helpers) ---------- */

const oreCache = new WeakMap<Uint8Array, Map<string, number[]>>();
const ORE_TILES = 160;

/** The ore tiles of one material nearest the core (cached per map: ore floors never change). */
function oreTiles(w: World, item: number, hardness: number): number[] {
  const { map } = w.state;
  const key = `${item}:${hardness}`;
  let cache = oreCache.get(map.floor);
  if (!cache) oreCache.set(map.floor, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const floors = w.content.floors.list.map((f) => (f.ore && w.content.materials.indexOf(f.ore) === item && (f.hardness ?? 1) <= hardness ? 1 : 0));
  const core = w.core ? centre(w, w.core) : { x: map.w / 2, y: map.h / 2 };
  const found: { tile: number; dist: number }[] = [];
  for (let i = 0; i < map.floor.length; i++) {
    const f = map.floor[i]!;
    if (f === 0 || !floors[f - 1]) continue;
    const dx = (i % map.w) + 0.5 - core.x;
    const dy = Math.floor(i / map.w) + 0.5 - core.y;
    found.push({ tile: i, dist: dx * dx + dy * dy });
  }
  found.sort((a, b) => a.dist - b.dist || a.tile - b.tile);
  const tiles = found.slice(0, ORE_TILES).map((f) => f.tile);
  cache.set(key, tiles);
  return tiles;
}

/** The free ore tile to mine for a material, or -1. Tiles under buildings are skipped. */
function freeOre(w: World, item: number, hardness: number, index: number): number {
  const free = oreTiles(w, item, hardness).filter((t) => w.occ[t] === 0);
  return free.length ? free[index % Math.min(free.length, 6)]! : -1;
}

/** The material to mine: the player's choice, or the scarcest raw material with ore in reach and room in the core. */
function mineTarget(w: World, stats: FleetStats): number {
  const { mine } = opsOf(w);
  if (mine === -2) return -1;
  if (mine >= 0) return coreRoom(w, mine) > 0 ? mine : -1;
  let best = -1;
  w.content.materials.list.forEach((m, i) => {
    if (m.kind !== 'raw' || coreRoom(w, i) < 20 || oreTiles(w, i, stats.hardness).length === 0) return;
    if (best < 0 || (w.state.stock[i] ?? 0) < (w.state.stock[best] ?? 0)) best = i;
  });
  return best;
}

function startMining(w: World, d: DroneState, index: number, stats: FleetStats): boolean {
  const item = mineTarget(w, stats);
  if (item < 0) return false;
  const tile = freeOre(w, item, stats.hardness, index);
  if (tile < 0) return false;
  d.carry = { item, n: 0 };
  d.tx = tile % w.state.map.w;
  d.ty = Math.floor(tile / w.state.map.w);
  d.hold = 0;
  setAct(d, 'mine');
  return true;
}

function mine(w: World, d: DroneState, index: number, ctx: TickContext, stats: FleetStats): void {
  if (!d.carry || d.tx === undefined || d.ty === undefined) return stopHaul(d);
  const s = spread(index);
  if (!approach(d, d.tx + 0.5 + s.x, d.ty + 0.5 + s.y, ctx.dt, stats, NEAR)) return;
  d.hold = (d.hold ?? 0) + stats.mineRate * ctx.dt;
  if (d.hold >= 1) {
    d.hold -= 1;
    d.carry.n++;
  }
  if (d.carry.n >= stats.cargo || (opsOf(w).mine !== -1 && opsOf(w).mine !== d.carry.item)) setAct(d, 'return');
}

/* ---------- Waiting ---------- */

function park(w: World, d: DroneState, index: number, ctx: TickContext, stats: FleetStats): void {
  const ops = opsOf(w);
  const core = w.core;
  const home = index === 0 ? ops.focus : core ? centre(w, core) : null;
  if (!home) return;
  const s = spread(index);
  const x = home.x + (index === 0 ? 0 : s.x * 2.5 + 2);
  const y = home.y + (index === 0 ? 0 : s.y * 2.5 + 2);
  if (Math.hypot(x - d.x, y - d.y) > (index === 0 ? 0.3 : PARK_SLACK)) approach(d, x, y, ctx.dt, stats, 0.2);
}

/** One tick of a drone with no build job. `index` is its place in the fleet (0 = the player's drone). */
export function idleWork(w: World, d: DroneState, index: number, ctx: TickContext): void {
  const stats = fleetStats(w);
  switch (d.act) {
    case 'fetch':
      return fetch(w, d, ctx, stats);
    case 'deliver':
      return deliver(w, d, ctx, stats);
    case 'return':
      return giveBack(w, d, ctx, stats);
    case 'mine':
      return mine(w, d, index, ctx, stats);
    default:
  }
  setAct(d, 'idle');
  if (d.carry) return setAct(d, 'return');
  if ((ctx.tick + d.id) % SEARCH_EVERY === 0 && (startSupply(w, d, stats) || (index > 0 && startMining(w, d, index, stats)))) return;
  park(w, d, index, ctx, stats);
}
