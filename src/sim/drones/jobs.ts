import type { BuildingDef } from '../../content/types';
import type { Building, DroneState, Plan } from '../state';
import type { World } from '../world';
import { centre } from './fly';
import { opsOf } from './tech';

/** One unit of build work. Sites and removals are buildings; a plan is a ghost not yet started; a boulder is a tile. */
export interface Job {
  kind: 'site' | 'remove' | 'plan' | 'clear';
  x: number;
  y: number;
  building?: Building;
  plan?: Plan;
  tile?: number;
  /** Footprint size in tiles (1 for a boulder). */
  size: number;
  /** A small cheap piece (belt, pipe, pole): laid in a chain, only from close by (builder.ts). */
  quick: boolean;
  /** Unique within a tick, to see what another drone already took. */
  key: string;
}

/** Build time up to which a piece counts as quick: belts, pipes, junctions, bridges and poles. */
export const QUICK_SECONDS = 0.5;

export function isQuick(def: BuildingDef): boolean {
  return def.buildSeconds <= QUICK_SECONDS;
}

/** Sites short of materials wait until this tick before a drone tries them again (others go first). */
const retry = new WeakMap<World, Map<number, { until: number; item: string }>>();
const RETRY_TICKS = 40;
/** A short wait for a quick piece: the line should go on as soon as the core has the copper again. */
const QUICK_RETRY_TICKS = 8;

/** Marks a site as short of `item`: drones skip it for a moment and the panel can say what is missing. */
export function waitOn(w: World, b: Building, item: string): void {
  if (!retry.has(w)) retry.set(w, new Map());
  retry.get(w)!.set(b.id, { until: w.state.tick + (isQuick(w.def(b)) ? QUICK_RETRY_TICKS : RETRY_TICKS), item });
}

function waiting(w: World, b: Building): boolean {
  return (retry.get(w)?.get(b.id)?.until ?? -1) > w.state.tick;
}

/** The material a waiting site is short of ('' when no site waits): idle drones show it as `waiting`. */
export function waitingFor(w: World): string {
  for (const r of retry.get(w)?.values() ?? []) if (r.until > w.state.tick) return r.item;
  return '';
}

export function isOpenSite(w: World, b: Building): boolean {
  return !b.removing && (b.build < 1 || Boolean(b.upgrade)) && !waiting(w, b);
}

export function siteJob(w: World, b: Building): Job {
  const def = w.def(b);
  return { kind: 'site', ...centre(w, b), building: b, size: def.size, quick: isQuick(def), key: `s${b.id}` };
}

export function removeJob(w: World, b: Building): Job {
  const def = w.def(b);
  return { kind: 'remove', ...centre(w, b), building: b, size: def.size, quick: isQuick(def), key: `r${b.id}` };
}

export function clearJob(w: World, tile: number): Job {
  const { w: mw } = w.state.map;
  return { kind: 'clear', x: (tile % mw) + 0.5, y: Math.floor(tile / mw) + 0.5, tile, size: 1, quick: false, key: `c${tile}` };
}

/** Whether a boulder is still standing on this tile. */
export function boulderAt(w: World, tile: number): boolean {
  return (w.state.map.boulder[tile] ?? 0) > 0;
}

/**
 * Open work in priority order: unfinished sites (skipping ones short of materials), removals, ghosts in queue
 * order, then dust boulders. At most `count` of each kind (one per drone is all anyone can take).
 */
export function gatherJobs(w: World, count: number): Job[] {
  const jobs: Job[] = [];
  let n = 0;
  for (const b of w.state.buildings) {
    if (n >= count) break;
    if (isOpenSite(w, b)) {
      jobs.push(siteJob(w, b));
      n++;
    }
  }
  n = 0;
  for (const b of w.state.buildings) {
    if (n >= count) break;
    if (b.removing) {
      jobs.push(removeJob(w, b));
      n++;
    }
  }
  w.state.plans.slice(0, count).forEach((plan, i) => {
    const def = w.defs[plan.kind]!;
    jobs.push({ kind: 'plan', x: plan.x + def.size / 2, y: plan.y + def.size / 2, plan, size: def.size, quick: isQuick(def), key: `p${i}` });
  });
  const queue = opsOf(w).boulders;
  for (let i = 0, found = 0; i < queue.length && found < count; i++) {
    if (!boulderAt(w, queue[i]!)) continue;
    jobs.push(clearJob(w, queue[i]!));
    found++;
  }
  return jobs;
}

/** The job a drone is already on, if it still stands. */
export function stickyJob(w: World, d: DroneState): Job | null {
  if (d.act === 'clear') return stickyBoulder(w, d);
  const b = d.target >= 0 ? w.byId.get(d.target) : undefined;
  if (!b) return null;
  if (d.act === 'remove' && b.removing) return removeJob(w, b);
  if (d.act === 'build' && isOpenSite(w, b)) return siteJob(w, b);
  return null;
}

function stickyBoulder(w: World, d: DroneState): Job | null {
  if (d.tx === undefined || d.ty === undefined) return null;
  const tile = d.ty * w.state.map.w + d.tx;
  return boulderAt(w, tile) && opsOf(w).boulders.includes(tile) ? clearJob(w, tile) : null;
}

/** The next thing the first drone would do (kept for callers that ask; the fleet uses `gatherJobs`). */
export function nextJob(w: World): Job | null {
  return gatherJobs(w, 1)[0] ?? null;
}
